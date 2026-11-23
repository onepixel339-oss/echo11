/**
 * ECHO — Recommendation engine (deterministic, explainable, local).
 *
 * Modes (spec 7.5): closest match, because-you-liked, adjacent discovery,
 * explore something new, explore-island. Every recommendation carries the
 * features that actually produced the match (no fake precision).
 */

import type {
  ContentVisibility,
  MediaItem,
  RecMode,
  RecReasonData,
  Recommendation,
  TasteProfile,
  UserMediaEntry,
} from "../types";
import { featureKey } from "./features";
import { similarity, type SimilarityOptions } from "./similarity";
import { entryEvidence } from "./taste";

/** Maturity ceiling (spec 13). Unknown ratings are shown as unknown,
 *  never assumed suitable — but they are not blocked unless "safe". */
const RATING_LEVEL: Record<string, number> = {
  G: 0, "TV-G": 0, "TV-Y": 0,
  PG: 1, "TV-PG": 1, "TV-Y7": 1,
  "PG-13": 2, "TV-14": 2,
  R: 3, "TV-MA": 3,
  "NC-17": 4, X: 5,
};

/** Maturity ceiling (spec 13). Unknown ratings are shown as unknown,
 *  never assumed suitable — but they are not blocked unless "safe".
 *  Exported for the local-catalogue provider so sample pools obey the same
 *  visibility ceiling as live providers. */
export function allowedByVisibility(rating: string | undefined, vis: ContentVisibility): boolean {
  if (vis === "all") return true;
  const level = rating !== undefined ? (RATING_LEVEL[rating] ?? 3) : 3;
  return vis === "safe" ? level <= 2 : level <= 3;
}

export interface RecommendOptions {
  profile: TasteProfile;
  candidates: MediaItem[];
  /** user's library entries (to exclude + find anchors) */
  entries: UserMediaEntry[];
  mediaById: Map<string, MediaItem>;
  simOptions: SimilarityOptions;
  excludedGenres: string[];
  rejectedLocalIds: Set<string>; // "not for me" feedback
  visibility: ContentVisibility;
  maxShelf?: number;
}

interface ScoredItem {
  item: MediaItem;
  score: number; // raw
  reasonData: RecReasonData[];
}

function profileScoreOf(profile: TasteProfile, key: string): number {
  // features are sorted by |score| — linear scan is fine at this scale
  for (const f of profile.features) {
    if (f.key === key) return f.score;
  }
  return 0;
}

/** Closest-match score: sum of positive taste evidence on matching features,
 *  weighted by feature distinctiveness (IDF). */
function closestMatchScore(
  item: MediaItem,
  profile: TasteProfile,
  simOpts: SimilarityOptions,
): ScoredItem {
  const contributions: { key: string; kind: string; value: string; contribution: number }[] = [];
  let total = 0;

  const consider = (kind: "genre" | "tag" | "creator" | "studio" | "type", values: string[]) => {
    for (const v of values) {
      const key = featureKey(kind, v);
      const ps = profileScoreOf(profile, key);
      if (ps <= 0.05) continue;
      const idf = simOpts.idf.get(key) ?? 0.35;
      const contribution = ps * (0.5 + 0.5 * idf);
      total += contribution;
      contributions.push({ key, kind, value: v, contribution });
    }
  };
  consider("genre", item.genres);
  consider("tag", item.tags);
  consider("creator", item.creators ?? []);
  consider("studio", item.studios ?? []);

  contributions.sort((a, b) => b.contribution - a.contribution);
  const reasonData: RecReasonData[] = [];
  if (contributions.length) {
    reasonData.push({ key: "tasteMatch", values: contributions.slice(0, 2).map((c) => c.value) });
  }
  // count of highly-rated titles sharing a feature
  return { item, score: total, reasonData };
}

function dedupeAndCap(list: ScoredItem[], mode: RecMode, max: number): Recommendation[] {
  const seenFranchise = new Set<string>();
  const genreCount = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const s of list) {
    const franchise = s.item.provider === "echo-demo" ? franchiseOf(s.item) : s.item.providerId;
    if (seenFranchise.has(franchise)) continue;
    const g0 = s.item.genres[0];
    if (g0 && (genreCount.get(g0) ?? 0) >= 3) continue;
    seenFranchise.add(franchise);
    if (g0) genreCount.set(g0, (genreCount.get(g0) ?? 0) + 1);
    out.push({
      item: s.item,
      score: s.score,
      reasonData: s.reasonData,
      mode,
    });
    if (out.length >= max) break;
  }
  return out;
}

function franchiseOf(item: MediaItem): string {
  // demo catalogue tags franchise via id prefix groups; external/manual items
  // fall back to providerId so sequels from the same series are limited
  const m = item.localId.match(/^echo-demo:(.+)$/);
  return m ? `${m[1].split("-")[0]}-${item.title.split(":")[0]}` : item.localId;
}

/** Normalized cross-provider identity: same work on a different source
 *  (IMDb "Breaking Bad" vs TVMaze "Breaking Bad") must still be recognised
 *  as "already in your library" so it never gets recommended back. */
function crossProviderKeys(items: MediaItem[]): Set<string> {
  const keys = new Set<string>();
  for (const it of items) {
    const t = it.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    keys.add(`${it.mediaType}|${t}|${it.releaseYear ?? ""}`);
    // also cover the year-less case (providers occasionally disagree by ±1)
    if (it.releaseYear) keys.add(`${it.mediaType}|${t}`);
  }
  return keys;
}

/** Filter base: not in library (any provider), not rejected, not genre-excluded, allowed maturity. */
function baseEligible(
  opts: RecommendOptions,
  libraryLocalIds: Set<string>,
): MediaItem[] {
  const ownedItems = opts.entries
    .map((e) => opts.mediaById.get(e.mediaLocalId))
    .filter((x): x is MediaItem => Boolean(x));
  const ownedKeys = crossProviderKeys(ownedItems);
  return opts.candidates.filter((c) => {
    if (libraryLocalIds.has(c.localId)) return false;
    if (opts.rejectedLocalIds.has(c.localId)) return false;
    if (c.genres.some((g) => opts.excludedGenres.includes(g))) return false;
    if (!allowedByVisibility(c.contentRating, opts.visibility)) return false;
    // cross-provider duplicate of something already owned
    const normTitle = c.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (ownedKeys.has(`${c.mediaType}|${normTitle}|${c.releaseYear ?? ""}`)) return false;
    if (c.releaseYear && ownedKeys.has(`${c.mediaType}|${normTitle}`)) return false;
    return true;
  });
}

export function recommendClosest(opts: RecommendOptions, limit?: number): Recommendation[] {
  const max = limit ?? opts.maxShelf ?? 12;
  const libraryLocalIds = new Set(opts.entries.map((e) => e.mediaLocalId));
  const pool = baseEligible(opts, libraryLocalIds);
  const scored = pool
    .map((item) => closestMatchScore(item, opts.profile, opts.simOptions))
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
  const top = dedupeAndCap(scored, "closest", max);
  // normalize for display 0..1
  const topScore = top[0]?.score ?? 1;
  return top.map((r) => ({ ...r, score: r.score / topScore }));
}

export function recommendBecause(
  opts: RecommendOptions,
  anchorLocalId: string,
  limit?: number,
): Recommendation[] {
  const max = limit ?? opts.maxShelf ?? 12;
  const anchor = opts.mediaById.get(anchorLocalId);
  if (!anchor) return [];
  const libraryLocalIds = new Set(opts.entries.map((e) => e.mediaLocalId));
  const pool = baseEligible(opts, libraryLocalIds);
  const scored: ScoredItem[] = [];
  for (const item of pool) {
    const sim = similarity(anchor, item, opts.simOptions);
    if (sim.score < 0.3) continue;
    const reasonData: RecReasonData[] = sim.reasons
      .filter((r) => r.kind === "genre" || r.kind === "tag" || r.kind === "creator")
      .slice(0, 2)
      .map((r) => ({ key: `shared_${r.kind}`, values: r.values }));
    scored.push({ item, score: sim.score, reasonData });
  }
  scored.sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
  return dedupeAndCap(scored, "because", max);
}

/** Adjacent discovery: moderate overlap + at least one feature new to the user. */
export function recommendAdjacent(
  opts: RecommendOptions,
  limit?: number,
): Recommendation[] {
  const max = limit ?? opts.maxShelf ?? 12;
  const libraryLocalIds = new Set(opts.entries.map((e) => e.mediaLocalId));
  const pool = baseEligible(opts, libraryLocalIds);
  const known = new Set(opts.profile.features.filter((f) => f.score > 0.3).map((f) => f.key));
  const scored: (ScoredItem & { novelCount: number })[] = pool.map((item) => {
    const base = closestMatchScore(item, opts.profile, opts.simOptions);
    const features = [
      ...item.genres.map((g) => featureKey("genre", g)),
      ...item.tags.map((t) => featureKey("tag", t)),
    ];
    const novel = features.filter((f) => !known.has(f)).length;
    return { ...base, score: base.score * 0.6 + novel * 0.25, novelCount: novel };
  });
  const sorted = scored
    .filter((s) => s.novelCount >= 2 && s.score > 0.3)
    .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
  const withReasons: ScoredItem[] = sorted.map((s) => ({
    ...s,
    reasonData: [{ key: "adjacentNew", values: novelSlugs(s.item, known).slice(0, 2) }],
  }));
  const top = dedupeAndCap(withReasons, "adjacent", max);
  const topScore = top[0]?.score ?? 1;
  return top.map((r) => ({ ...r, score: r.score / topScore }));
}

function novelSlugs(item: MediaItem, known: Set<string>): string[] {
  const out: string[] = [];
  for (const g of item.genres) if (!known.has(featureKey("genre", g))) out.push(g);
  for (const t of item.tags) if (!known.has(featureKey("tag", t))) out.push(t);
  return out;
}

/** Explore something new: lowest taste overlap but ≥1 shared positive feature. */
export function recommendExplore(
  opts: RecommendOptions,
  limit?: number,
): Recommendation[] {
  const max = limit ?? opts.maxShelf ?? 12;
  const libraryLocalIds = new Set(opts.entries.map((e) => e.mediaLocalId));
  const pool = baseEligible(opts, libraryLocalIds);
  const positives = opts.profile.features.filter((f) => f.score > 0.4);
  const scored: ScoredItem[] = pool.map((item) => {
    let shared = 0;
    const sharedValues: string[] = [];
    for (const f of positives) {
      if (
        (f.kind === "genre" && item.genres.includes(f.slug)) ||
        (f.kind === "tag" && item.tags.includes(f.slug)) ||
        (f.kind === "creator" && (item.creators ?? []).includes(f.slug)) ||
        (f.kind === "studio" && (item.studios ?? []).includes(f.slug))
      ) {
        shared += 1;
        sharedValues.push(f.slug);
      }
    }
    return { item, score: shared, reasonData: shared ? [{ key: "sharedAnchor", values: sharedValues.slice(0, 2) }] : [] };
  });
  const sorted = scored
    .filter((s) => s.score >= 1)
    .sort((a, b) => a.score - b.score || (a.item.localId < b.item.localId ? -1 : 1)); // fewer shared = more novel
  return dedupeAndCap(sorted, "explore", max);
}

/** Explore this island: strongest similarity to any member of a cluster. */
export function recommendIsland(
  opts: RecommendOptions,
  memberLocalIds: string[],
  limit?: number,
): Recommendation[] {
  const max = limit ?? opts.maxShelf ?? 12;
  const members = memberLocalIds
    .map((id) => opts.mediaById.get(id))
    .filter((m): m is MediaItem => m !== undefined);
  if (!members.length) return [];
  const libraryLocalIds = new Set(opts.entries.map((e) => e.mediaLocalId));
  const pool = baseEligible(opts, libraryLocalIds);
  const scored: ScoredItem[] = pool.map((item) => {
    let best = 0;
    let reasons: RecReasonData[] = [];
    for (const member of members) {
      const sim = similarity(member, item, opts.simOptions);
      if (sim.score > best) {
        best = sim.score;
        reasons = sim.reasons
          .filter((r) => r.kind === "genre" || r.kind === "tag" || r.kind === "creator")
          .slice(0, 2)
          .map((r) => ({ key: `shared_${r.kind}`, values: r.values }));
      }
    }
    return { item, score: best, reasonData: reasons };
  });
  const sorted = scored
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
  return dedupeAndCap(sorted, "island", max);
}

/** The user's strongest anchor (highest rated & favourited) for "because" shelf. */
export function pickAnchorEntry(
  entries: UserMediaEntry[],
  mediaById: Map<string, MediaItem>,
  preferredTypes?: string[],
): UserMediaEntry | null {
  const pool = entries.filter(
    (e) =>
      e.rating !== undefined &&
      e.rating >= 4 &&
      (!preferredTypes?.length ||
        preferredTypes.includes(mediaById.get(e.mediaLocalId)?.mediaType ?? "")),
  );
  if (!pool.length) return null;
  const scored = pool.map((e) => {
    let s = e.rating!;
    if (e.isFavourite) s += 1;
    s += entryEvidence(e).value * 0.5;
    return { e, s };
  });
  scored.sort((a, b) => b.s - a.s || (a.e.id < b.e.id ? -1 : 1));
  return scored[0].e;
}
