/**
 * ECHO — Feature extraction & inverse document frequency.
 *
 * A "feature" is a normalized key: `genre:<slug>`, `tag:<slug>`,
 * `creator:<name>`, `studio:<name>`, `type:<mediaType>`.
 * IDF prevents generic values (e.g. the genre "Drama") from connecting
 * almost everything (spec 7.3).
 */

import type { MediaItem } from "../types";

export interface SimilarityWeights {
  genre: number;
  tag: number;
  format: number;
  creator: number; // creators + studios
  era: number;
  language: number; // languages + countries
  cast: number;
  userTag: number;
}

/** Spec 7.3 starting point — configurable, covered by tests. */
export const DEFAULT_WEIGHTS: SimilarityWeights = {
  genre: 0.3,
  tag: 0.25,
  format: 0.1,
  creator: 0.1,
  era: 0.05,
  language: 0.05,
  cast: 0.05,
  userTag: 0.1,
};

export type FeatureKind = "genre" | "tag" | "creator" | "studio" | "type";

export function featureKey(kind: FeatureKind, value: string): string {
  return `${kind}:${value}`;
}

export function parseFeatureKey(key: string): { kind: FeatureKind; value: string } {
  const i = key.indexOf(":");
  return { kind: key.slice(0, i) as FeatureKind, value: key.slice(i + 1) };
}

export function* itemFeatures(item: MediaItem): Iterable<[string, number]> {
  // weight multipliers keep kinds comparable when a title has many values
  const gw = 1 / Math.sqrt(Math.max(1, item.genres.length));
  for (const g of item.genres) yield [featureKey("genre", g), gw];
  const tw = 1 / Math.sqrt(Math.max(1, item.tags.length));
  for (const t of item.tags) yield [featureKey("tag", t), tw];
  for (const c of item.creators ?? []) yield [featureKey("creator", c), 1];
  for (const s of item.studios ?? []) yield [featureKey("studio", s), 1];
  yield [featureKey("type", item.mediaType), 1];
}

export function itemFeatureSet(item: MediaItem): Set<string> {
  const s = new Set<string>();
  for (const [k] of itemFeatures(item)) s.add(k);
  return s;
}

/**
 * Document frequency over the union of the user library and the candidate
 * catalogue; returns normalized idf in (0,1]. Rare features → ~1.
 */
export function computeIdf(items: MediaItem[]): Map<string, number> {
  const df = new Map<string, number>();
  const N = Math.max(1, items.length);
  for (const item of items) {
    for (const key of itemFeatureSet(item)) {
      df.set(key, (df.get(key) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  const maxRaw = Math.log(N); // df=1 → raw = ln(N)
  for (const [key, count] of df) {
    const raw = Math.log(N / count);
    idf.set(key, maxRaw <= 0 ? 1 : Math.max(0.08, Math.min(1, raw / maxRaw)));
  }
  return idf;
}

/** Weighted Jaccard over two value lists, weighted by IDF. */
export function weightedOverlap(
  a: string[] | undefined,
  b: string[] | undefined,
  idfOf: (value: string) => number,
): number | null {
  if (!a || !b || a.length === 0 || b.length === 0) return null; // missing → renormalize
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  let union = 0;
  const seen = new Set<string>();
  for (const v of new Set([...a, ...b])) {
    const w = idfOf(v);
    union += w;
    seen.add(v);
    if (setA.has(v) && setB.has(v)) inter += w;
  }
  void seen;
  if (union <= 0) return null;
  return inter / union;
}

/** Plain Jaccard (no IDF) for small sets like creators. */
export function jaccard(
  a: string[] | undefined,
  b: string[] | undefined,
): number | null {
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const v of setA) if (setB.has(v)) inter++;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

/** Release-period proximity score (0..1). */
export function eraScore(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  const d = Math.abs(a - b);
  if (d <= 2) return 1;
  if (d <= 5) return 0.85;
  if (d <= 10) return 0.6;
  if (d <= 20) return 0.3;
  return 0.1;
}
