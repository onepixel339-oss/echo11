/**
 * ECHO — Federated search deduplication (evidence-based).
 *
 * When several providers return the same work, ECHO presents ONE logical
 * result while preserving every contributing provider and its external ids.
 * Merge evidence, strongest first:
 *   1. a shared VERIFIED identifier (IMDb id, Wikidata Q-id, AniList id…)
 *   2. matching content type + subtype granularity, normalized title match
 *      (title / original title / Arabic title / alternative titles), and
 *      compatible dates (±1 year)
 *   3. title match with compatible creators when dates are absent
 *
 * Never merged, whatever the title similarity:
 *   - different content categories (a manga and its anime adaptation),
 *   - different granularity (a series vs a volume/issue/collected edition
 *     / bibliographic edition),
 *   - year conflicts beyond ±1 (a remake is a different work),
 *   - ambiguous many-to-many title matches — ambiguity stays separate.
 */

import type { MediaItem, MediaType } from "../types";
import type { FederatedHit, MergeConfidence, ResultContribution } from "./types";

/** Normalize a title for comparison: lowercase, letters+numbers only (unicode). */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Every title variant of an item (display, original, Arabic, alternatives). */
export function titleVariants(item: MediaItem): string[] {
  const variants = [item.title, item.originalTitle, item.titleAr, ...(item.altTitles ?? [])];
  const out: string[] = [];
  for (const v of variants) {
    if (!v) continue;
    const n = normalizeTitle(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Verified identifier keys of an item, namespaced so separate id spaces can
 * never collide (AniList anime #21 ≠ AniList manga #21; Trakt movie #7 ≠
 * show #7). Ids only count when the PROVIDER supplied them — never guessed.
 */
export function identifierKeys(item: MediaItem): string[] {
  const ids = item.externalIds ?? {};
  const keys: string[] = [];
  // IMDb ids are globally unique
  if (ids.imdb) keys.push(`imdb:${ids.imdb}`);
  // Wikidata Q-ids are globally unique
  if (ids.wikidata) keys.push(`wikidata:${ids.wikidata}`);
  // provider-scoped ids need their own namespace
  if (ids.anilist) keys.push(`anilist-${item.mediaType}:${ids.anilist}`);
  if (ids.mal) keys.push(`mal-${item.mediaType}:${ids.mal}`);
  if (ids.tvmaze) keys.push(`tvmaze:${ids.tvmaze}`);
  if (ids.trakt) keys.push(`trakt-${item.mediaType}:${ids.trakt}`);
  if (ids.rawg) keys.push(`rawg:${ids.rawg}`);
  if (ids.igdb) keys.push(`igdb:${ids.igdb}`);
  if (ids.openlib) keys.push(`openlib:${ids.openlib}`);
  if (ids.madb) keys.push(`madb:${ids.madb}`);
  if (ids.bnf) keys.push(`bnf:${ids.bnf}`);
  if (ids.inventaire) keys.push(`inventaire:${ids.inventaire}`);
  return keys;
}

/** Granularity buckets: a series must never merge with its parts. */
type Granularity = "work" | "part";
const PART_SUBTYPES = new Set([
  "volume",
  "edition",
  "comic-issue",
  "collected-edition",
  "issue",
]);

function granularityOf(item: MediaItem): Granularity {
  return item.subtype && PART_SUBTYPES.has(item.subtype) ? "part" : "work";
}

/** Is item B a plausible duplicate of item A (same type + granularity)? */
export function sameIdentityBucket(a: MediaItem, b: MediaItem): boolean {
  return a.mediaType === b.mediaType && granularityOf(a) === granularityOf(b);
}

/** Years count as compatible dates when they are EQUAL, or when either
 *  side lacks a year. A ±1 drift is deliberately NOT merge evidence on its
 *  own: near-year same-title works are often distinct (seasons, remakes,
 *  same-title shows) and ambiguity stays separate (spec §7). */
function yearsCompatible(a?: number, b?: number): boolean {
  if (a === undefined || b === undefined) return true;
  return a === b;
}

/** Conflicting verified ids in the SAME namespace are strong evidence of
 *  DISTINCT works (tt1 vs tt2, different AniList ids…): never merge. */
export function conflictingIdentifiers(a: MediaItem, b: MediaItem): boolean {
  const ea = a.externalIds ?? {};
  const eb = b.externalIds ?? {};
  const namespaces: (keyof typeof ea)[] = ["imdb", "wikidata", "anilist", "mal", "tvmaze", "trakt", "rawg", "igdb", "openlib", "madb"];
  for (const ns of namespaces) {
    const va = ea[ns];
    const vb = eb[ns];
    if (va && vb && va !== vb) return true;
  }
  return false;
}

function creatorsOverlap(a: MediaItem, b: MediaItem): boolean {
  const ca = a.creators ?? [];
  const cb = b.creators ?? [];
  if (!ca.length || !cb.length) return false;
  const na = new Set(ca.map((c) => normalizeTitle(c)));
  return cb.some((c) => na.has(normalizeTitle(c)));
}

export interface DedupInput {
  item: MediaItem;
  /** registry provider id that produced the record */
  providerId: string;
  providerLabel: string;
  /** routing priority (lower = more authoritative primary record) */
  priority: number;
  isLive: boolean;
}

/** Build the deduplicated, merged hits from provider results.
 *  Deterministic: same inputs always produce the same output order. */
export function dedupeAndMerge(inputs: DedupInput[]): FederatedHit[] {
  // index by (type, granularity) bucket — cross-bucket merges are impossible
  const buckets = new Map<string, DedupInput[]>();
  for (const input of inputs) {
    const key = `${input.item.mediaType}|${granularityOf(input.item)}`;
    const list = buckets.get(key) ?? [];
    list.push(input);
    buckets.set(key, list);
  }

  const hits: FederatedHit[] = [];
  for (const list of buckets.values()) {
    // union-find over records
    const parent = new Map<DedupInput, DedupInput>();
    const find = (x: DedupInput): DedupInput => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      return root;
    };
    const union = (a: DedupInput, b: DedupInput) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const input of list) parent.set(input, input);

    // pass 1 — shared verified identifiers
    const byId = new Map<string, DedupInput>();
    for (const input of list) {
      for (const key of identifierKeys(input.item)) {
        const owner = byId.get(key);
        if (owner && owner !== input) union(owner, input);
        else byId.set(key, input);
      }
    }

    // pass 2 — title evidence within the same bucket
    const byTitle = new Map<string, DedupInput[]>();
    for (const input of list) {
      for (const variant of titleVariants(input.item)) {
        const owners = byTitle.get(variant) ?? [];
        owners.push(input);
        byTitle.set(variant, owners);
      }
    }
    for (const [, owners] of byTitle) {
      const unique = [...new Set(owners)];
      // ambiguity guard: a title shared by 3+ distinct roots never merges —
      // distinct same-title works stay distinct
      const roots = new Set(unique.map((o) => find(o)));
      if (roots.size <= 2) {
        for (let i = 1; i < unique.length; i++) {
          const a = unique[0].item;
          const b = unique[i].item;
          // conflicting verified ids ⇒ distinct works, never merge
          if (conflictingIdentifiers(a, b)) continue;
          const datesOk = yearsCompatible(a.releaseYear, b.releaseYear);
          const creatorsOk = creatorsOverlap(a, b);
          // merge when the dates agree exactly, or when dates are absent but
          // the creators do agree
          if (datesOk && (a.releaseYear !== undefined || creatorsOk || b.releaseYear !== undefined)) {
            union(unique[0], unique[i]);
          }
        }
      }
    }

    // collect groups → hits
    const groups = new Map<DedupInput, DedupInput[]>();
    for (const input of list) {
      const root = find(input);
      const g = groups.get(root) ?? [];
      g.push(input);
      groups.set(root, g);
    }

    for (const group of groups.values()) {
      // primary record: live specialized providers first (lower priority
      // number), then local content; stable by localId as a tiebreaker
      const sorted = [...group].sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.item.localId.localeCompare(b.item.localId);
      });
      const primary = sorted[0];

      // merge confidence: identifier evidence > title+year > title
      let confidence: MergeConfidence | undefined;
      let matchedIds: string[] | undefined;
      if (group.length > 1) {
        const keySets = group.map((g) => new Set(identifierKeys(g.item)));
        const primaryKeys = keySets[0];
        const shared = [...primaryKeys].filter((k) => keySets.slice(1).some((s) => s.has(k)));
        if (shared.length) {
          confidence = "identifier";
          matchedIds = shared;
        } else if (
          group.every((g, i) =>
            i === 0
              ? true
              : yearsCompatible(primary.item.releaseYear, g.item.releaseYear) &&
                primary.item.releaseYear !== undefined,
          )
        ) {
          confidence = "strong";
        } else {
          confidence = "title";
        }
      }

      const contributions: ResultContribution[] = sorted.map((g) => ({
        providerId: g.providerId,
        providerLabel: g.providerLabel,
        externalId: g.item.externalIds?.[g.providerId as keyof typeof g.item.externalIds] ?? g.item.providerId,
        url: g.item.canonicalUrl,
        localId: g.item.localId,
      }));

      hits.push({
        item: primary.item,
        contributions,
        confidence: group.length > 1 ? confidence : undefined,
        matchedIds,
        isLive: primary.isLive,
      });
    }
  }

  // stable output order: live before local, then by localId
  hits.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return a.item.localId.localeCompare(b.item.localId);
  });
  return hits;
}
