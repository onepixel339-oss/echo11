/**
 * ECHO — Manual-title identity resolution (Phase 1 rewrite).
 *
 * Manual entries have no artwork or rich metadata. This module matches them
 * against the catalogue providers so a manual title can carry its REAL
 * poster, genres and synopsis — but ONLY with reliable evidence.
 *
 * SUBSTRING MATCHING IS REMOVED: a title merely *containing* another title
 * ("Show" ⊂ "Show Season 2") is never automatic-link evidence again.
 *
 * Automatic linking requires ALL of:
 *  - a shared external identifier (strongest evidence), or a strong
 *    normalized title match (exact equality after normalization — never a
 *    substring or token-overlap "probably");
 *  - a compatible content type;
 *  - matching release year whenever both sides are known;
 *  - no conflicting season / edition / volume information.
 *
 * Ambiguous cases (several distinct works could be the same title) are NOT
 * linked: the entry stays on its own record and is flagged for review.
 */

import type { ExternalIdMap, MediaItem } from "../types";
import { searchCatalogue } from ".";

export interface ScoredMatch {
  item: MediaItem;
  score: number; // 0..1, for ranking the manual picker
  /** strongest evidence that produced this candidate */
  reason: "external-id" | "exact" | "tokens";
  /** full gate verdict for automatic linking */
  verdict: "auto-link" | "candidate" | "reject";
}

export type MatchOutcome =
  | { status: "linked"; item: MediaItem; score: number }
  | { status: "ambiguous"; candidates: ScoredMatch[] }
  | { status: "none" };

/* ------------------------------ normalization ------------------------------ */

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Leading articles carry no identity — "The Wire" ≡ "Wire". */
function stripLeadingArticle(s: string): string {
  return s.replace(/^(the|a|an|el|la|los|las|al|les|le|der|die|das)\s+/i, "");
}

/** Standalone English articles are semantically empty inside titles too:
 *  "Blade Runner: The Final Cut" ≡ "Blade Runner - Final Cut". */
function stripArticleTokens(s: string): string {
  return s
    .split(" ")
    .filter((w) => w.length > 0 && !(w === "the" || w === "a" || w === "an"))
    .join(" ");
}

/** Strong normalized title match: EXACT equality (articles ignored).
 *  Deliberately stricter than the old behaviour — substrings and token
 *  overlap do not qualify. */
export function strongTitleMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aa = stripArticleTokens(stripLeadingArticle(na));
  const ab = stripArticleTokens(stripLeadingArticle(nb));
  return aa !== "" && aa === ab;
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 1));
}

/* ----------------------- season / edition / volume ----------------------- */

export interface OrdinalMarkers {
  season?: number;
  volume?: number;
  edition?: string;
}

const SEASON_PATTERNS: RegExp[] = [
  /(?:^|[\s:.·\-–])(?:season|series|s)\s*(\d{1,2})(?=\D|$)/i,
  /(?:^|[\s:.·\-–])part\s+([ivxl]+)(?=\s|$)/i,
];
const VOLUME_PATTERNS: RegExp[] = [
  /(?:^|[\s:.·\-–])(?:vol(?:ume)?|v)\s*\.?\s*(\d{1,3})(?=\D|$)/i,
  /(?:^|[\s:.·\-–])book\s+(\d{1,2})(?=\D|$)/i,
  /(?:^|[\s:.·\-–])(?:tome|tom)\s+(\d{1,3})(?=\D|$)/i,
];
const EDITION_PATTERN =
  /\b(director'?s cut|extended cut|extended edition|uncut|remaster(?:ed)?|special edition|definitive edition|collector'?s edition|theatrical cut|final cut|10th anniversary|25th anniversary)\b/i;

function firstMatch(patterns: RegExp[], s: string): number | undefined {
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const digits = Number(m[1]);
      if (Number.isFinite(digits)) return digits;
      // roman numeral part markers
      const roman = m[1].toLowerCase();
      const romanValue = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 }[roman];
      if (romanValue) return romanValue;
    }
  }
  return undefined;
}

/** Parse season / volume / edition markers out of a display title. */
export function parseOrdinalMarkers(title: string): OrdinalMarkers {
  const out: OrdinalMarkers = {};
  const season = firstMatch(SEASON_PATTERNS, title);
  if (season !== undefined) out.season = season;
  const volume = firstMatch(VOLUME_PATTERNS, title);
  if (volume !== undefined) out.volume = volume;
  const edition = title.match(EDITION_PATTERN);
  if (edition) out.edition = edition[1].toLowerCase();
  return out;
}

/** Conflict = both sides carry a value and the values differ. Missing on one
 *  side is NOT a conflict by itself (see evaluateMatch — it blocks
 *  auto-linking only when the title evidence is not exact). */
function ordinalConflict(a: OrdinalMarkers, b: OrdinalMarkers): boolean {
  if (a.season !== undefined && b.season !== undefined && a.season !== b.season) return true;
  if (a.volume !== undefined && b.volume !== undefined && a.volume !== b.volume) return true;
  if (a.edition !== undefined && b.edition !== undefined && a.edition !== b.edition) return true;
  return false;
}

/** One side carries ordinal markers the other lacks. */
function ordinalAsymmetry(a: OrdinalMarkers, b: OrdinalMarkers): boolean {
  const aHas = a.season !== undefined || a.volume !== undefined || a.edition !== undefined;
  const bHas = b.season !== undefined || b.volume !== undefined || b.edition !== undefined;
  return aHas !== bHas;
}

/* ---------------------------- external identity ---------------------------- */

/** provider string → externalIds key (the id namespace it lives in). */
const PROVIDER_ID_KEY: Record<string, keyof ExternalIdMap> = {
  imdb: "imdb",
  "imdb-series": "imdb",
  tvmaze: "tvmaze",
  anilist: "anilist",
  kitsu: "kitsu",
  rawg: "rawg",
  openlib: "openlib",
  wikidata: "wikidata",
};

/** True when two records share ANY external identifier (either direction —
 *  a record's own providerId counts as one of its external ids). */
export function shareExternalId(a: MediaItem, b: MediaItem): boolean {
  const aIds = { ...(a.externalIds ?? {}) };
  const bIds = { ...(b.externalIds ?? {}) };
  const aKey = PROVIDER_ID_KEY[a.provider];
  const bKey = PROVIDER_ID_KEY[b.provider];
  if (aKey && a.providerId) (aIds as Record<string, string>)[aKey] = a.providerId;
  if (bKey && b.providerId) (bIds as Record<string, string>)[bKey] = b.providerId;
  for (const [kind, value] of Object.entries(aIds)) {
    if (!value) continue;
    if ((bIds as Record<string, string>)[kind] === value) return true;
  }
  return false;
}

/* ------------------------------- evaluation ------------------------------- */

/** Heuristic ranking score (picker ordering only — never a linking rule). */
function rankingScore(manual: MediaItem, candidate: MediaItem): number {
  if (shareExternalId(manual, candidate)) return 1;
  if (strongTitleMatch(manual.title, candidate.title)) {
    const ym = manual.releaseYear;
    const yc = candidate.releaseYear;
    if (ym && yc) return ym === yc ? 0.95 : 0.5;
    return 0.9; // exact title, year unknown on one side
  }
  const ta = tokens(manual.title);
  const tb = tokens(candidate.title);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const overlap = shared / Math.min(ta.size, tb.size);
  return overlap >= 1 ? 0.75 : overlap * 0.5;
}

/**
 * Full identity evaluation of `candidate` as the same work as `manual`.
 *
 * verdict "auto-link": every requirement holds (external id, or exact
 *   normalized title + compatible type + compatible year + no ordinal
 *   conflict/asymmetry).
 * verdict "candidate": plausible enough for the manual picker, but the
 *   evidence is not strong enough to link automatically.
 * verdict "reject": not the same work (type mismatch, conflicting years or
 *   ordinals, unrelated titles).
 */
export function evaluateMatch(manual: MediaItem, candidate: MediaItem): ScoredMatch {
  const score = rankingScore(manual, candidate);
  const base = { item: candidate, score };

  // content type must be compatible — always
  if (manual.mediaType !== candidate.mediaType) {
    return { ...base, reason: "tokens", verdict: "reject" };
  }

  const idMatch = shareExternalId(manual, candidate);
  const titleMatch = strongTitleMatch(manual.title, candidate.title);

  // conflicting release years (both known) can never be the same edition
  const yearConflict =
    manual.releaseYear !== undefined &&
    candidate.releaseYear !== undefined &&
    manual.releaseYear !== candidate.releaseYear;

  const ordA = parseOrdinalMarkers(manual.title);
  const ordB = parseOrdinalMarkers(candidate.title);
  const conflict = ordinalConflict(ordA, ordB);
  const asymmetry = ordinalAsymmetry(ordA, ordB);

  if (idMatch && !conflict && !asymmetry) {
    // strongest evidence — a shared external id with agreeing ordinals
    return { ...base, reason: "external-id", verdict: "auto-link" };
  }

  if (titleMatch) {
    if (yearConflict || conflict) {
      // same title but a different edition/era of it (remakes, seasons) —
      // a different work for linking purposes
      return { ...base, reason: "exact", verdict: "reject" };
    }
    if (asymmetry) {
      // "Show" vs "Show Season 2" normalized equal is impossible, but e.g.
      // "Show: Part II" vs "Show" with article-stripped equality is not —
      // ordinal markers disagree in presence, keep them apart
      return { ...base, reason: "exact", verdict: "candidate" };
    }
    // years: matching when both known; unknown on a side is acceptable
    return { ...base, reason: "exact", verdict: "auto-link" };
  }

  if (idMatch && (conflict || asymmetry)) {
    return { ...base, reason: "external-id", verdict: "candidate" };
  }

  // weaker title similarity → picker only
  if (score >= 0.5) return { ...base, reason: "tokens", verdict: "candidate" };
  return { ...base, reason: "tokens", verdict: "reject" };
}

/** Candidates worth showing in the manual "link to source" picker. */
export function matchCandidates(
  manual: MediaItem,
  candidates: MediaItem[],
  min = 0.5,
): ScoredMatch[] {
  return candidates
    .map((item) => evaluateMatch(manual, item))
    .filter((m) => m.verdict !== "reject" && m.score >= min)
    .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1))
    .slice(0, 6);
}

/** Do two CANDIDATES represent the same work as each other? (used to collapse
 *  cross-provider duplicates before declaring ambiguity) */
function candidatesSameWork(a: MediaItem, b: MediaItem): boolean {
  if (a.localId === b.localId) return true;
  if (shareExternalId(a, b)) return true;
  if (a.workId && b.workId && a.workId === b.workId) return true;
  return false;
}

/**
 * Search the live catalogue for the best identity of a manual entry.
 *
 * Returns:
 *  - linked: exactly one confident match (or several that are all the same
 *    work, e.g. the same series on two providers)
 *  - ambiguous: several DISTINCT plausible works — the entry must stay
 *    separate and be flagged for review
 *  - none: no plausible match, nothing to do
 */
export async function findBestMatch(manual: MediaItem): Promise<MatchOutcome> {
  if (manual.provider !== "manual") return { status: "none" };
  try {
    const outcome = await searchCatalogue(manual.title, {
      mediaTypes: [manual.mediaType],
      limit: 6,
    });
    if (outcome.usedFallback || !outcome.results.length) return { status: "none" };

    const evaluated = outcome.results
      .map((r) => evaluateMatch(manual, r.item))
      .filter((m) => m.verdict !== "reject");
    const autoLinks = evaluated.filter((m) => m.verdict === "auto-link");
    if (!autoLinks.length) return { status: "none" };

    // collapse candidates that are the SAME work seen through providers
    const distinct: ScoredMatch[] = [];
    for (const m of autoLinks) {
      if (!distinct.some((d) => candidatesSameWork(d.item, m.item))) distinct.push(m);
    }

    if (distinct.length === 1) {
      return { status: "linked", item: distinct[0].item, score: distinct[0].score };
    }
    return { status: "ambiguous", candidates: distinct.slice(0, 6) };
  } catch {
    return { status: "none" };
  }
}
