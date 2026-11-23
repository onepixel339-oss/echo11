/**
 * ECHO — Clustering (islands) via deterministic label propagation.
 * Clusters are named from shared distinctive metadata; if no confident
 * label exists we use neutral "Cluster NN" (spec 6.1 — never invent themes).
 */

import type { Cluster, MediaItem, SimEdge } from "../types";
import { computeIdf } from "./features";

export const CLUSTER_MIN_MEMBERS = 2;

/**
 * @param items library media (sorted deterministically inside)
 * @param edges similarity edges above threshold
 */
export function computeClusters(items: MediaItem[], edges: SimEdge[]): Cluster[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => (a.localId < b.localId ? -1 : 1));
  const ids = sorted.map((i) => i.localId);
  const index = new Map(ids.map((id, i) => [id, i]));

  // adjacency with weights
  const adj: number[][] = ids.map(() => []);
  for (const e of edges) {
    const ia = index.get(e.a);
    const ib = index.get(e.b);
    if (ia === undefined || ib === undefined) continue;
    adj[ia][ib] = (adj[ia][ib] ?? 0) + e.score;
    adj[ib][ia] = (adj[ib][ia] ?? 0) + e.score;
  }

  // deterministic label propagation
  let labels = ids.map((_, i) => i);
  const order = ids
    .map((_, i) => i)
    .sort((a, b) => degree(adj[a]) - degree(adj[b]) || a - b); // low degree first (stable)

  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (const i of order) {
      const weightByLabel = new Map<number, number>();
      for (let j = 0; j < ids.length; j++) {
        const w = adj[i][j];
        if (!w) continue;
        weightByLabel.set(labels[j], (weightByLabel.get(labels[j]) ?? 0) + w);
      }
      if (!weightByLabel.size) continue;
      let bestLabel = labels[i];
      let bestWeight = -1;
      for (const [label, weight] of [...weightByLabel.entries()].sort((a, b) => a[0] - b[0])) {
        if (weight > bestWeight) {
          bestWeight = weight;
          bestLabel = label;
        }
      }
      if (bestLabel !== labels[i]) {
        labels[i] = bestLabel;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // group by label
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => {
    const list = groups.get(labels[i]) ?? [];
    list.push(id);
    groups.set(labels[i], list);
  });

  const byId = new Map(sorted.map((m) => [m.localId, m]));
  const idf = computeIdf(sorted);

  const clusters: Cluster[] = [];
  let neutralCounter = 1;
  const clusterList = [...groups.values()].sort(
    (a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1),
  );
  for (const members of clusterList) {
    const memberItems = members
      .map((id) => byId.get(id))
      .filter((m): m is MediaItem => m !== undefined);
    const labelKey =
      members.length >= CLUSTER_MIN_MEMBERS
        ? findSharedLabel(memberItems, idf)
        : null;
    clusters.push({
      id: members[0],
      labelKey,
      members: members.sort(),
    });
    if (members.length >= CLUSTER_MIN_MEMBERS) neutralCounter++;
  }
  void neutralCounter;
  return clusters;
}

function degree(row: number[]): number {
  let d = 0;
  for (const w of row) if (w) d++;
  return d;
}

/**
 * Most distinctive feature shared by ≥ max(2, 60%) of members.
 * Returns the slug (genre or tag) or null.
 */
function findSharedLabel(
  members: MediaItem[],
  idf: Map<string, number>,
): string | null {
  const threshold = Math.max(2, Math.ceil(members.length * 0.6));
  const count = new Map<string, number>();
  for (const m of members) {
    const seen = new Set([...m.genres.map((g) => `genre:${g}`), ...m.tags.map((t) => `tag:${t}`)]);
    for (const key of seen) count.set(key, (count.get(key) ?? 0) + 1);
  }
  let best: { key: string; score: number } | null = null;
  for (const [key, c] of count) {
    if (c < threshold) continue;
    const score = (idf.get(key) ?? 0.3) * c;
    if (!best || score > best.score) best = { key, score };
  }
  return best ? best.key : null;
}
