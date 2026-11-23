/**
 * ECHO — Deterministic "island surveyor" layout.
 *
 * Engineering goals (why this replaced the naive force pass):
 *  1. Islands first: clusters are laid out as non-overlapping landmasses
 *     (circle-packed centroids), so related groups are visibly separated.
 *  2. Honest collision: poster tiles are 2r × 3r — collisions resolve in
 *     ellipse space, not circle space (no more clipped labels).
 *  3. Adaptive spacing: same-island pairs sit closer than cross-island pairs.
 *  4. Deterministic: same data → same map; existing nodes keep their island
 *     shape (rigid offsets preserved, small freeze factor).
 */

import type { Cluster, MediaItem, SimEdge } from "../types";
import { mulberry32, seededUnit } from "../ids";

export interface Position {
  x: number;
  y: number;
}

export type Positions = Record<string, Position>;

export interface LayoutOptions {
  existing?: Positions | null;
  /** max coordinate extent before collision resolve */
  worldSize?: number;
  iterations?: number;
  nodeRadius?: number;
  /** per-item radius (rating-sized nodes). Overrides nodeRadius when given. */
  radiusOf?: (item: MediaItem) => number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** tile half-extents multiplier: tiles are ~2.3r wide, 3.2r tall incl. ring */
const A_K = 1.32;
const B_K = 1.88;
/** padding added to footprints so labels and rings have room */
const PAD_X = 34;
const PAD_Y = 46;

interface Node {
  id: string;
  r: number; // base radius
  a: number; // horizontal half-extent
  b: number; // vertical half-extent
  cluster: number;
  fresh: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Island {
  index: number;
  members: Node[];
  R: number; // landmass radius
  cx: number;
  cy: number;
  oldCx?: number;
  oldCy?: number;
}

export function computeLayout(
  items: MediaItem[],
  edges: SimEdge[],
  clusters: Cluster[],
  opts: LayoutOptions = {},
): Positions {
  const sorted = [...items].sort((a, b) => (a.localId < b.localId ? -1 : 1));
  if (!sorted.length) return {};
  const n = sorted.length;

  const defaultRadius = opts.nodeRadius ?? 26;
  const radiusOf = opts.radiusOf ?? (() => defaultRadius);

  // ---- clusters: real islands + singletons ----
  const clusterOf = new Map<string, number>();
  clusters.forEach((c, ci) => c.members.forEach((m) => clusterOf.set(m, ci)));
  let singletonCounter = clusters.length;
  const indexOf = new Map(sorted.map((m, i) => [m.localId, i]));

  // ---- nodes ----
  const nodes: Node[] = sorted.map((item) => {
    const r = radiusOf(item);
    const ci = clusterOf.get(item.localId);
    return {
      id: item.localId,
      r,
      a: r * A_K + PAD_X,
      b: r * B_K + PAD_Y,
      cluster: ci !== undefined ? ci : singletonCounter++,
      fresh: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    };
  });
  const nodeById = new Map(nodes.map((nd) => [nd.id, nd]));

  const existing = opts.existing ?? null;

  // ---- islands (groups sharing a cluster id) ----
  const islandByCluster = new Map<number, Island>();
  for (const nd of nodes) {
    let isl = islandByCluster.get(nd.cluster);
    if (!isl) {
      isl = {
        index: islandByCluster.size,
        members: [],
        R: 90,
        cx: 0,
        cy: 0,
      };
      islandByCluster.set(nd.cluster, isl);
    }
    isl.members.push(nd);
  }
  const islands = [...islandByCluster.values()];
  for (const isl of islands) {
    // landmass radius from member footprints (area-based), with breathing room
    let area = 0;
    for (const m of isl.members) area += Math.PI * m.a * m.b;
    isl.R = Math.max(140, Math.sqrt(area / Math.PI) * 1.62 + 52);
  }

  // ---- old centroids (for rigid shape preservation) ----
  if (existing) {
    for (const nd of nodes) {
      const prev = existing[nd.id];
      if (prev) {
        nd.fresh = false;
        nd.x = prev.x;
        nd.y = prev.y;
      }
    }
    for (const isl of islands) {
      const olds = isl.members.filter((m) => !m.fresh);
      if (olds.length) {
        let sx = 0;
        let sy = 0;
        for (const o of olds) {
          sx += o.x;
          sy += o.y;
        }
        isl.oldCx = sx / olds.length;
        isl.oldCy = sy / olds.length;
      }
    }
  }

  // ---- place island centroids: golden spiral + circle packing ----
  const R = opts.worldSize ?? Math.max(300, 105 * Math.sqrt(n));
  const ordered = [...islands].sort(
    (a, b) => b.members.length - a.members.length || a.index - b.index,
  );
  const rng = mulberry32(0x5eed017);
  const placedIslands: Island[] = [];
  const INTER_GAP = 110;
  ordered.forEach((isl, k) => {
    // start position: old centroid if the island existed, else spiral slot
    if (isl.oldCx !== undefined) {
      isl.cx = isl.oldCx;
      isl.cy = isl.oldCy!;
    } else {
      const t = k + rng() * 0.35;
      const rad = R * 0.62 * Math.sqrt((k + 1) / ordered.length) + isl.R * 0.4;
      const ang = t * GOLDEN_ANGLE;
      isl.cx = Math.cos(ang) * rad;
      isl.cy = Math.sin(ang) * rad;
    }
    placedIslands.push(isl);
  });
  // packing relaxation between island centroids
  for (let pass = 0; pass < 90; pass++) {
    let moved = false;
    for (let i = 0; i < placedIslands.length; i++) {
      for (let j = i + 1; j < placedIslands.length; j++) {
        const A = placedIslands[i];
        const B = placedIslands[j];
        let dx = B.cx - A.cx;
        let dy = B.cy - A.cy;
        let d = Math.hypot(dx, dy);
        const min = A.R + B.R + INTER_GAP;
        if (d >= min) continue;
        if (d < 1e-3) {
          dx = 0.5;
          dy = 0.5;
          d = Math.hypot(dx, dy);
        }
        const push = (min - d) / 2;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        // islands with an old centroid move less (stability)
        const wa = A.oldCx !== undefined ? 0.22 : 1;
        const wb = B.oldCx !== undefined ? 0.22 : 1;
        A.cx -= ux * wa;
        A.cy -= uy * wa;
        B.cx += ux * wb;
        B.cy += uy * wb;
        moved = true;
      }
      // gentle centering of everything
      const A = placedIslands[i];
      A.cx -= A.cx * 0.0016;
      A.cy -= A.cy * 0.0016;
    }
    if (!moved) break;
  }

  // ---- clamp old-island centroid drift (shape stability on additions) ----
  // The packing above may push a grown island a long way; existing nodes
  // follow their centroid rigidly, so cap that shift and let the final
  // separation pass resolve any resulting overlap gently.
  for (const isl of islands) {
    if (isl.oldCx === undefined) continue;
    const dx = isl.cx - isl.oldCx;
    const dy = isl.cy - (isl.oldCy ?? isl.cy);
    const d = Math.hypot(dx, dy);
    const MAX_SHIFT = 26;
    if (d > MAX_SHIFT) {
      isl.cx = isl.oldCx + (dx / d) * MAX_SHIFT;
      isl.cy = (isl.oldCy ?? isl.cy) + (dy / d) * MAX_SHIFT;
    }
  }

  // ---- place nodes within islands ----
  const edgeSet = new Set(edges.map((e) => `${e.a}|${e.b}`));
  for (const isl of islands) {
    // 1. existing nodes keep their offset from the old centroid (rigid shape)
    for (const nd of isl.members) {
      if (!nd.fresh && isl.oldCx !== undefined && isl.oldCy !== undefined) {
        const ox = nd.x - isl.oldCx;
        const oy = nd.y - isl.oldCy;
        nd.x = isl.cx + ox;
        nd.y = isl.cy + oy;
      }
    }
    // 2. fresh nodes: near strongest settled neighbour, else sunflower slot
    const settled = isl.members.filter((m) => !m.fresh);
    let si = 0;
    for (const nd of isl.members) {
      if (!nd.fresh) continue;
      let anchor: Position | null = null;
      for (const other of sorted) {
        if (other.localId === nd.id) continue;
        const k1 = `${nd.id}|${other.localId}`;
        const k2 = `${other.localId}|${nd.id}`;
        if (!edgeSet.has(k1) && !edgeSet.has(k2)) continue;
        const o = nodeById.get(other.localId);
        if (o && !o.fresh) {
          anchor = { x: o.x, y: o.y };
          break;
        }
      }
      if (anchor) {
        const ang = seededUnit(nd.id, "orbit") * Math.PI * 2;
        const dist = 96 + seededUnit(nd.id, "dist") * 46;
        nd.x = anchor.x + Math.cos(ang) * dist;
        nd.y = anchor.y + Math.sin(ang) * dist;
      } else if (settled.length) {
        const host = settled[si % settled.length];
        const ang = seededUnit(nd.id, "orbit") * Math.PI * 2;
        nd.x = host.x + Math.cos(ang) * 88;
        nd.y = host.y + Math.sin(ang) * 88;
      } else {
        const t = si + seededUnit(nd.id, "slot");
        const rad = isl.R * 0.74 * Math.sqrt((si + 1) / Math.max(1, isl.members.length));
        const a = t * GOLDEN_ANGLE;
        nd.x = isl.cx + Math.cos(a) * rad;
        nd.y = isl.cy + Math.sin(a) * rad;
      }
      si++;
    }
    void settled;
  }

  // ---- adjacency ----
  const adj = new Map<string, { other: string; score: number }[]>();
  for (const e of edges) {
    for (const [me, other] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      const list = adj.get(me) ?? [];
      list.push({ other, score: e.score });
      adj.set(me, list);
    }
  }
  const islandIndexOf = (nd: Node) => islandByCluster.get(nd.cluster) ?? null;

  // ---- global relaxation ----
  const iterations =
    opts.iterations ?? (n <= 15 ? 150 : n <= 60 ? 120 : n <= 150 ? 90 : 65);
  const nodesArr = nodes;
  const freeze = (nd: Node) => (nd.fresh ? 1 : 0.11);

  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;

    // pair repulsion (ellipse-normalized, island-aware)
    for (let i = 0; i < nodesArr.length; i++) {
      for (let j = i + 1; j < nodesArr.length; j++) {
        const A = nodesArr[i];
        const B = nodesArr[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const sumA = A.a + B.a;
        const sumB = A.b + B.b;
        const nx = dx / sumA;
        const ny = dy / sumB;
        const D = Math.hypot(nx, ny);
        const reach = A.cluster === B.cluster ? 1.45 : 2.6;
        if (D > reach) continue;
        if (D < 1e-4) {
          A.x -= 0.5;
          A.y -= 0.3;
          B.x += 0.5;
          B.y += 0.3;
          continue;
        }
        const f = ((reach - D) / D) * (A.cluster === B.cluster ? 5.2 : 11);
        const fx = nx * f;
        const fy = ny * f;
        A.vx -= fx;
        A.vy -= fy;
        B.vx += fx;
        B.vy += fy;
      }
    }

    // springs + island gravity
    for (const nd of nodesArr) {
      const neighbors = adj.get(nd.id) ?? [];
      for (const { other, score } of neighbors) {
        const o = nodeById.get(other);
        if (!o) continue;
        const dx = o.x - nd.x;
        const dy = o.y - nd.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const rest = (nd.a + o.a + nd.b + o.b) / 2 + 58 - score * 34;
        const f = 0.026 * (d - rest) * (0.4 + score);
        nd.vx += (dx / d) * f;
        nd.vy += (dy / d) * f;
      }
      const isl = islandIndexOf(nd);
      if (isl) {
        const k = nd.fresh ? 0.02 : 0.0045;
        nd.vx += (isl.cx - nd.x) * k;
        nd.vy += (isl.cy - nd.y) * k;
      }
      nd.vx -= nd.x * 0.0016;
      nd.vy -= nd.y * 0.0016;
    }

    // island landmass separation (keeps hulls from kissing)
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const A = islands[i];
        const B = islands[j];
        const dx = B.cx - A.cx;
        const dy = B.cy - A.cy;
        const d = Math.max(1, Math.hypot(dx, dy));
        const min = A.R + B.R + INTER_GAP * 0.7;
        if (d >= min) continue;
        const push = (min - d) * 0.5 * 0.06;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        for (const m of A.members) {
          m.vx -= ux;
          m.vy -= uy;
        }
        for (const m of B.members) {
          m.vx += ux;
          m.vy += uy;
        }
      }
    }

    // integrate
    for (const nd of nodesArr) {
      const damp = 0.85 * freeze(nd) * (0.4 + 0.6 * cooling);
      nd.vx *= damp;
      nd.vy *= damp;
      nd.x += nd.vx;
      nd.y += nd.vy;
    }
  }

  // ---- strict ellipse collision resolve ----
  for (let pass = 0; pass < 46; pass++) {
    let moved = false;
    for (let i = 0; i < nodesArr.length; i++) {
      for (let j = i + 1; j < nodesArr.length; j++) {
        const A = nodesArr[i];
        const B = nodesArr[j];
        const sumA = A.a + B.a;
        const sumB = A.b + B.b;
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        const D = Math.hypot(dx / sumA, dy / sumB);
        if (D >= 1) continue;
        if (D < 1e-4) {
          const rr = mulberry32(i * 31 + j + pass);
          dx = rr() - 0.5;
          dy = rr() - 0.5;
        }
        const nx = (dx / sumA) / Math.max(1e-6, D);
        const ny = (dy / sumB) / Math.max(1e-6, D);
        const push = (1 - D) * 0.5;
        const wa = A.fresh ? 1 : 0.24;
        const wb = B.fresh ? 1 : 0.24;
        A.x -= nx * push * sumA * wa;
        A.y -= ny * push * sumB * wa;
        B.x += nx * push * sumA * wb;
        B.y += ny * push * sumB * wb;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // ---- final rigid island separation (bounding-circle check) ----
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const A = islands[i];
        const B = islands[j];
        const ca = centroidOf(A.members);
        const cb = centroidOf(B.members);
        const ra = maxRadiusOf(A.members) + 40;
        const rb = maxRadiusOf(B.members) + 40;
        let dx = cb.x - ca.x;
        let dy = cb.y - ca.y;
        let d = Math.hypot(dx, dy);
        const min = ra + rb + INTER_GAP * 0.55;
        if (d >= min) continue;
        if (d < 1e-3) {
          dx = 1;
          dy = 0.5;
          d = Math.hypot(dx, dy);
        }
        const push = (min - d) / 2;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        const wa = A.oldCx !== undefined ? 0.26 : 1;
        const wb = B.oldCx !== undefined ? 0.26 : 1;
        for (const m of A.members) {
          m.x -= ux * wa;
          m.y -= uy * wa;
        }
        for (const m of B.members) {
          m.x += ux * wb;
          m.y += uy * wb;
        }
        any = true;
      }
    }
    if (!any) break;
  }

  const out: Positions = {};
  for (const nd of nodesArr) out[nd.id] = { x: nd.x, y: nd.y };
  return out;
}

function centroidOf(members: Node[]): Position {
  let sx = 0;
  let sy = 0;
  for (const m of members) {
    sx += m.x;
    sy += m.y;
  }
  return { x: sx / members.length, y: sy / members.length };
}

function maxRadiusOf(members: Node[]): number {
  let r = 0;
  for (const m of members) r = Math.max(r, m.a, m.b);
  return r;
}

/* ---------------- island outlines (for the canvas renderer) ---------------- */

export interface IslandOutline {
  /** hull points (world coords), already padded outward */
  points: Position[];
  centroid: Position;
  /** anchor above the top of the island for the label */
  labelAnchor: Position;
}

/**
 * Convex hull (monotone chain) of member positions padded outward by
 * `pad` — drawn as a soft blob by the map renderer.
 */
export function computeIslandOutline(
  positions: Positions,
  memberIds: string[],
  pad = 44,
): IslandOutline | null {
  const pts = memberIds
    .map((id) => positions[id])
    .filter((p): p is Position => Boolean(p));
  if (pts.length < 2) return null;

  // centroid
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const c = { x: sx / pts.length, y: sy / pts.length };

  // convex hull
  const P = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Position, a: Position, b: Position) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Position[] = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Position[] = [];
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) {
    // degenerate (collinear): pad the segment into a capsule
    const a = P[0];
    const b = P[P.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const ox = Math.cos(ang) * pad;
    const oy = Math.sin(ang) * pad;
    return {
      points: [
        { x: a.x - ox, y: a.y - oy },
        { x: b.x - ox, y: b.y - oy },
        { x: b.x + ox, y: b.y + oy },
        { x: a.x + ox, y: a.y + oy },
      ],
      centroid: c,
      labelAnchor: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - pad * 0.6 },
    };
  }

  // pad outward from centroid
  let topY = Infinity;
  let topX = 0;
  const padded = hull.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const q = { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
    if (q.y < topY) {
      topY = q.y;
      topX = q.x;
    }
    return q;
  });
  return {
    points: padded,
    centroid: c,
    labelAnchor: { x: topX, y: topY },
  };
}

/** Bounding box of positions (for fit-to-view). */
export function boundsOf(positions: Positions): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs = Object.values(positions).map((p) => p.x);
  const ys = Object.values(positions).map((p) => p.y);
  if (!xs.length) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
