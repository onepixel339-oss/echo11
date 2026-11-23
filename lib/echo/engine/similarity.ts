/**
 * ECHO — Explainable similarity engine (deterministic, no AI API).
 *
 * Weighted component overlap with per-field renormalization when metadata
 * is missing (missing ≠ mismatch, spec 7.3). Returns shared features as
 * human-readable reasons.
 */

import type { MediaItem, SimEdge, SimReason } from "../types";
import {
  DEFAULT_WEIGHTS,
  eraScore,
  jaccard,
  weightedOverlap,
  type SimilarityWeights,
} from "./features";

export interface SimilarityOptions {
  idf: Map<string, number>;
  weights?: SimilarityWeights;
  userTags?: Record<string, string[]>; // localId → user tags
}

export interface SimilarityResult {
  score: number; // 0..1
  reasons: SimReason[];
}

/** Minimum edge strength to appear on the map (tuned: small honest
 *  libraries still form constellations; per-node cap prevents hairballs). */
export const EDGE_THRESHOLD = 0.3;
export const MAX_EDGES_PER_NODE = 5;

function idfOf(idf: Map<string, number>, prefix: string, value: string): number {
  return idf.get(`${prefix}:${value}`) ?? 0.35;
}

export function similarity(
  a: MediaItem,
  b: MediaItem,
  opts: SimilarityOptions,
): SimilarityResult {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const idf = opts.idf;

  const components: { key: keyof SimilarityWeights; score: number | null; reason?: SimReason }[] = [];

  // genres (IDF-weighted)
  const gScore = weightedOverlap(a.genres, b.genres, (v) => idfOf(idf, "genre", v));
  const sharedGenres = a.genres.filter((g) => b.genres.includes(g));
  components.push({
    key: "genre",
    score: gScore,
    reason:
      gScore !== null && sharedGenres.length
        ? { kind: "genre", values: sharedGenres, weight: gScore }
        : undefined,
  });

  // tags (IDF-weighted)
  const tScore = weightedOverlap(a.tags, b.tags, (v) => idfOf(idf, "tag", v));
  const sharedTags = a.tags.filter((t) => b.tags.includes(t));
  components.push({
    key: "tag",
    score: tScore,
    reason:
      tScore !== null && sharedTags.length
        ? { kind: "tag", values: sharedTags, weight: tScore }
        : undefined,
  });

  // format
  let fScore: number;
  if (a.mediaType === b.mediaType && a.format === b.format) fScore = 1;
  else if (a.mediaType === b.mediaType) fScore = 0.75;
  else if (a.format === b.format) fScore = 0.55;
  else fScore = 0.12;
  components.push({
    key: "format",
    score: fScore,
    reason: { kind: "format", values: [a.mediaType], weight: fScore },
  });

  // creators + studios
  const cA = [...(a.creators ?? []), ...(a.studios ?? [])];
  const cB = [...(b.creators ?? []), ...(b.studios ?? [])];
  const cScore = jaccard(cA, cB);
  const sharedCreators = cA.filter((c) => cB.includes(c));
  components.push({
    key: "creator",
    score: cScore,
    reason:
      cScore !== null && sharedCreators.length
        ? { kind: "creator", values: sharedCreators.slice(0, 3), weight: cScore }
        : undefined,
  });

  // era
  const eScore = eraScore(a.releaseYear, b.releaseYear);
  components.push({
    key: "era",
    score: eScore,
    reason:
      eScore !== null && eScore >= 0.85
        ? { kind: "era", values: [String(a.releaseYear)], weight: eScore }
        : undefined,
  });

  // language + country
  const lA = [...(a.languages ?? []), ...(a.countries ?? [])];
  const lB = [...(b.languages ?? []), ...(b.countries ?? [])];
  const lScore = jaccard(lA, lB);
  const sharedLang = lA.filter((c) => lB.includes(c)).slice(0, 2);
  components.push({
    key: "language",
    score: lScore,
    reason:
      lScore !== null && lScore > 0
        ? { kind: "language", values: sharedLang, weight: lScore }
        : undefined,
  });

  // cast
  const castScore = jaccard(a.cast, b.cast);
  components.push({ key: "cast", score: castScore });

  // user tags
  const utA = opts.userTags?.[a.localId] ?? [];
  const utB = opts.userTags?.[b.localId] ?? [];
  const utScore = jaccard(utA, utB);
  const sharedUt = utA.filter((t) => utB.includes(t));
  components.push({
    key: "userTag",
    score: utScore,
    reason:
      utScore !== null && sharedUt.length
        ? { kind: "userTag", values: sharedUt.slice(0, 3), weight: utScore }
        : undefined,
  });

  // renormalize across available fields
  let wSum = 0;
  let acc = 0;
  for (const c of components) {
    if (c.score === null) continue; // missing field — do not treat as mismatch
    wSum += w[c.key];
    acc += w[c.key] * c.score;
  }
  const score = wSum > 0 ? acc / wSum : 0;

  // top reasons by contribution (weight × component score)
  const reasons = components
    .filter((c) => c.reason && c.score !== null && c.score > 0.2)
    .map((c) => ({
      reason: c.reason!,
      contribution: w[c.key] * (c.score ?? 0),
    }))
    .sort((x, y) => y.contribution - x.contribution)
    .slice(0, 3)
    .map((x) => x.reason);

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

/**
 * Build the similarity graph over the user's library:
 * edges above the threshold, capped per node (no hairball maps).
 */
export function buildSimilarityGraph(
  items: MediaItem[],
  opts: SimilarityOptions & { threshold?: number; maxPerNode?: number },
): SimEdge[] {
  const threshold = opts.threshold ?? EDGE_THRESHOLD;
  const maxPerNode = opts.maxPerNode ?? MAX_EDGES_PER_NODE;
  const sorted = [...items].sort((a, b) => (a.localId < b.localId ? -1 : 1));

  const candidateEdges: SimEdge[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const res = similarity(sorted[i], sorted[j], opts);
      if (res.score >= threshold) {
        candidateEdges.push({
          a: sorted[i].localId,
          b: sorted[j].localId,
          score: res.score,
          reasons: res.reasons,
        });
      }
    }
  }

  // deterministic per-node cap: an edge survives only if it is among the
  // strongest maxPerNode edges for BOTH endpoints (guarantees the cap)
  const byNode = new Map<string, SimEdge[]>();
  for (const e of candidateEdges) {
    for (const id of [e.a, e.b]) {
      const list = byNode.get(id) ?? [];
      list.push(e);
      byNode.set(id, list);
    }
  }
  const keepByNode = new Map<string, Set<string>>();
  for (const [id, list] of [...byNode.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const set = new Set<string>();
    list
      .sort((x, y) => y.score - x.score || (x.a + x.b < y.a + y.b ? -1 : 1))
      .slice(0, maxPerNode)
      .forEach((e) => set.add(`${e.a}|${e.b}`));
    keepByNode.set(id, set);
  }
  return candidateEdges
    .filter(
      (e) =>
        keepByNode.get(e.a)?.has(`${e.a}|${e.b}`) &&
        keepByNode.get(e.b)?.has(`${e.a}|${e.b}`),
    )
    .sort((x, y) => y.score - x.score);
}
