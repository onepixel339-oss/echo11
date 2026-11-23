/**
 * ECHO — the map sheet renderer (canvas 2D).
 *
 * A cartographic rendering of the taste graph:
 *  - real provider poster art on nodes (async image cache, generated
 *    fallback), sized by rating, status ring shape+color
 *  - islands as padded convex-hull "landmasses" with letterpress labels
 *  - curved, strength-tapered connections drawn like survey lines
 *  - faint graticule + compass rose; label collision resolution
 *  - ENGINEERING: viewport culling, zoom-adaptive edge LOD (per-node top-K),
 *    corner minimap with drag navigation, animated fit/focus (reduced-motion
 *    aware), spatial-grid hit testing — smooth from 10 to 500+ titles
 *  - pan (drag), zoom (wheel + pinch), tap to select node/edge
 *  - deterministic scene supplied by the layout engine
 *  - respects prefers-reduced-motion
 */

"use client";

import React from "react";
import type { Cluster, MediaItem, SimEdge, UserMediaEntry } from "@/lib/echo/types";
import type { Position, Positions } from "@/lib/echo/engine/layout";
import { computeIslandOutline } from "@/lib/echo/engine/layout";
import { drawPosterTile } from "@/lib/echo/poster";
import { mapNodeRadius } from "./bits";
import { useI18n } from "@/lib/echo/i18n";
import { vocabLabel } from "@/lib/echo/data/vocab";

export interface MapFilters {
  types: Set<string>;
  statuses: Set<string>;
  favouritesOnly: boolean;
  genre: string | null;
}

interface MapCanvasProps {
  items: MediaItem[];
  entryByLocalId: Map<string, UserMediaEntry>;
  edges: SimEdge[];
  clusters: Cluster[];
  positions: Positions;
  filters: MapFilters;
  labelsOn: boolean;
  animate: boolean;
  themeKey: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  selectedEdge: { a: string; b: string } | null;
  onSelectEdge: (e: { a: string; b: string } | null) => void;
  focusId: string | null;
  fitSignal: number;
  revealKey: string;
}

interface MapPalette {
  ink: string;
  inkFaint: string;
  card: string;
  accent: string;
  accentDeep: string;
  island: string[];
  status: Record<string, string>;
  /** brand fonts resolved from the CSS custom properties */
  fontUi: string;
  fontAr: string;
  /** nebula tone behind the map (obsidian space) */
  mapGlow: string;
}

function readPalette(themeKey: string): MapPalette | null {
  if (typeof window === "undefined") return null;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const val = cs.getPropertyValue(name).trim();
    return val || fallback;
  };
  const ui = v("--font-latin", "system-ui, sans-serif");
  return {
    ink: v("--foreground", "#F2F5FA"),
    inkFaint: v("--border", "rgba(236,240,250,0.14)"),
    card: v("--card", "#10141B"),
    accent: v("--echo-accent", "#FF7E54"),
    accentDeep: v("--echo-accent-deep", "#C85A34"),
    island: [
      v("--echo-teal", "#52C7B0"),
      v("--echo-gold", "#E9C268"),
      v("--echo-plum", "#B58FC8"),
      v("--echo-pine", "#74D693"),
      v("--echo-accent", "#FF7E54"),
    ],
    status: {
      completed: v("--status-completed", "#74D693"),
      watching: v("--status-watching", "#52C7B0"),
      planned: v("--status-planned", "#E9C268"),
      dropped: v("--status-dropped", "#FF6E5E"),
      on_hold: v("--status-hold", "#8B96A8"),
    },
    fontUi: ui,
    fontAr: v("--font-arabic", ui),
    mapGlow: v("--echo-map-glow", "#16202F"),
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function MapCanvas(props: MapCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { t, lang } = useI18n();

  const sceneRef = React.useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    hoverId: null as string | null,
    revealT0: 0,
    revealDone: true,
    /** animated camera transition (fit / focus / minimap jump) */
    anim: null as {
      t0: number;
      dur: number;
      from: { scale: number; tx: number; ty: number };
      to: { scale: number; tx: number; ty: number };
    } | null,
    /** minimap geometry, refreshed each frame while visible */
    mini: null as {
      x: number;
      y: number;
      w: number;
      h: number;
      ox: number;
      oy: number;
      k: number;
    } | null,
    miniDrag: false,
  });
  const pointersRef = React.useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = React.useRef<{ lastDist: number | null; lastMid: Position | null }>({
    lastDist: null,
    lastMid: null,
  });
  const dragRef = React.useRef({ active: false, moved: 0, lastX: 0, lastY: 0 });
  const posterCacheRef = React.useRef(new Map<string, HTMLCanvasElement>());
  const imageCacheRef = React.useRef(new Map<string, HTMLImageElement | "loading" | "failed">());
  const paletteRef = React.useRef<{ key: string; pal: MapPalette | null }>({ key: "", pal: null });
  const rafRef = React.useRef(0);

  const { items, entryByLocalId, edges, clusters, positions, filters, labelsOn, animate, themeKey, selectedId, selectedEdge, focusId, fitSignal, revealKey } = props;

  // ---------- palette ----------
  if (paletteRef.current.key !== themeKey) {
    paletteRef.current = { key: themeKey, pal: readPalette(themeKey) };
  }
  const palette = paletteRef.current.pal;

  // ---------- derived scene ----------
  const visibleItems = React.useMemo(
    () =>
      items.filter((m) => {
        const e = entryByLocalId.get(m.localId);
        if (!e) return false;
        if (filters.types.size && !filters.types.has(m.mediaType)) return false;
        if (filters.statuses.size && !filters.statuses.has(e.status)) return false;
        if (filters.favouritesOnly && !e.isFavourite) return false;
        if (filters.genre && !m.genres.includes(filters.genre)) return false;
        return true;
      }),
    [items, entryByLocalId, filters],
  );

  const visibleIds = React.useMemo(() => new Set(visibleItems.map((m) => m.localId)), [visibleItems]);

  const visibleEdges = React.useMemo(
    () => edges.filter((e) => visibleIds.has(e.a) && visibleIds.has(e.b)),
    [edges, visibleIds],
  );

  /** node degree (label priority) — computed once per graph, not per frame */
  const degreeOf = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of visibleEdges) {
      m.set(e.a, (m.get(e.a) ?? 0) + 1);
      m.set(e.b, (m.get(e.b) ?? 0) + 1);
    }
    return m;
  }, [visibleEdges]);

  /**
   * Edge LOD budget: at low zoom only edges that are among the strongest 2
   * of BOTH endpoints survive — a map of 400 nodes never becomes hair soup.
   */
  const strongEdgeSet = React.useMemo(() => {
    const perNode = new Map<string, { idx: number; score: number }[]>();
    visibleEdges.forEach((e, idx) => {
      for (const id of [e.a, e.b] as const) {
        const list = perNode.get(id) ?? [];
        list.push({ idx, score: e.score });
        perNode.set(id, list);
      }
    });
    const counts = new Map<number, number>();
    for (const list of perNode.values()) {
      list.sort((x, y) => y.score - x.score || x.idx - y.idx);
      for (const { idx } of list.slice(0, 2)) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    const strong = new Set<number>();
    for (const [idx, c] of counts) if (c >= 2) strong.add(idx);
    return strong;
  }, [visibleEdges]);

  // ---------- islands ----------
  const islands = React.useMemo(() => {
    const out: { label: string; colorIndex: number; points: Position[]; labelAnchor: Position }[] = [];
    let neutral = 0;
    let colorIdx = 0;
    for (const c of clusters) {
      const members = c.members.filter((m) => visibleIds.has(m));
      if (members.length < 2) continue;
      const outline = computeIslandOutline(positions, members, 46);
      if (!outline) continue;
      let label: string;
      if (c.labelKey) {
        const [, slug] = c.labelKey.split(":");
        label = vocabLabel(slug, lang);
      } else {
        neutral += 1;
        label = lang === "ar" ? `مجموعة ${neutral}` : `Island ${neutral}`;
      }
      out.push({
        label,
        colorIndex: colorIdx++,
        points: outline.points,
        labelAnchor: outline.labelAnchor,
      });
    }
    return out;
  }, [clusters, visibleIds, positions, lang]);

  // stable refs for the draw/interaction closures
  const stateRef = React.useRef({ visibleItems, visibleEdges, islands, positions, labelsOn, selectedId, selectedEdge, focusId, lang, degreeOf, strongEdgeSet });
  stateRef.current = { visibleItems, visibleEdges, islands, positions, labelsOn, selectedId, selectedEdge, focusId, lang, degreeOf, strongEdgeSet };

  const nodeRadius = React.useCallback(
    (item: MediaItem): number => mapNodeRadius(item, entryByLocalId.get(item.localId)),
    [entryByLocalId],
  );
  const nodeRadiusRef = React.useRef(nodeRadius);
  nodeRadiusRef.current = nodeRadius;

  const worldToScreen = React.useCallback((p: Position, s = sceneRef.current): Position => {
    return { x: p.x * s.scale + s.tx, y: p.y * s.scale + s.ty };
  }, []);

  const posterFor = React.useCallback((item: MediaItem): HTMLCanvasElement => {
    const hit = posterCacheRef.current.get(item.localId);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 192;
    const ctx = c.getContext("2d");
    if (ctx) drawPosterTile(ctx, 0, 0, 128, 192, item);
    posterCacheRef.current.set(item.localId, c);
    return c;
  }, []);

  const requestDraw = React.useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  const drawRef = React.useRef<() => void>(() => {});

  /** async real-poster loading with generated fallback */
  const posterImage = React.useCallback(
    (item: MediaItem): HTMLImageElement | null => {
      if (!item.posterUrl) return null;
      const cache = imageCacheRef.current;
      const hit = cache.get(item.localId);
      if (hit instanceof HTMLImageElement) {
        return hit.complete && hit.naturalWidth > 0 ? hit : null;
      }
      if (hit === "failed") return null;
      if (hit === "loading") return null;
      cache.set(item.localId, "loading");
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        cache.set(item.localId, img);
        requestDraw();
      };
      img.onerror = () => {
        cache.set(item.localId, "failed");
      };
      img.src = item.posterUrl;
      return null;
    },
    [requestDraw],
  );

  /** animated camera transition; instant when reduced motion is preferred */
  const animateView = React.useCallback(
    (to: { scale: number; tx: number; ty: number }, dur = 520) => {
      const s = sceneRef.current;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || dur <= 0) {
        s.scale = to.scale;
        s.tx = to.tx;
        s.ty = to.ty;
        s.anim = null;
        requestDraw();
        return;
      }
      s.anim = {
        t0: performance.now(),
        dur,
        from: { scale: s.scale, tx: s.tx, ty: s.ty },
        to,
      };
      requestDraw();
    },
    [requestDraw],
  );
  const animateViewRef = React.useRef(animateView);
  animateViewRef.current = animateView;

  const fitAll = React.useCallback(
    (animate = true) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const st = stateRef.current;
      const list = st.visibleItems.length ? st.visibleItems : items;
      if (!list.length) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const item of list) {
        const p = st.positions[item.localId];
        if (!p) continue;
        const r = nodeRadiusRef.current(item) * 1.9 + 58;
        minX = Math.min(minX, p.x - r);
        minY = Math.min(minY, p.y - r);
        maxX = Math.max(maxX, p.x + r);
        maxY = Math.max(maxY, p.y + r);
      }
      if (!isFinite(minX)) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pad = 58;
      const sx = (w - pad * 2) / Math.max(1, maxX - minX);
      const sy = (h - pad * 2) / Math.max(1, maxY - minY);
      const scale = Math.min(2.4, Math.max(0.08, Math.min(sx, sy)));
      animateViewRef.current(
        {
          scale,
          tx: w / 2 - ((minX + maxX) / 2) * scale,
          ty: h / 2 - ((minY + maxY) / 2) * scale,
        },
        animate ? 560 : 0,
      );
    },
    [items],
  );

  // ---------- spatial hit grid (rebuilt when the scene changes) ----------
  const gridRef = React.useRef<{
    cell: number;
    map: Map<string, number[]>;
    order: string[];
  } | null>(null);

  React.useEffect(() => {
    const cell = 150;
    const map = new Map<string, number[]>();
    const order = visibleItems.map((m) => m.localId);
    order.forEach((id, i) => {
      const p = positions[id];
      if (!p) return;
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      const key = `${gx}:${gy}`;
      const list = map.get(key) ?? [];
      list.push(i);
      map.set(key, list);
    });
    gridRef.current = { cell, map, order };
  }, [visibleItems, positions]);

  // ---------- draw ----------
  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = paletteRef.current.pal;
    // deep-space base: a soft nebula hanging above the obsidian floor
    const space = ctx.createRadialGradient(
      W * 0.5, H * 0.24, 0,
      W * 0.5, H * 0.24, Math.max(W, H) * 0.85,
    );
    space.addColorStop(0, pal?.mapGlow ?? "#16202F");
    space.addColorStop(1, pal?.card ?? "#10141B");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, W, H);
    const F_UI = pal?.fontUi ?? "system-ui, sans-serif";
    const F_AR = pal?.fontAr ?? F_UI;

    const s = sceneRef.current;
    const st = stateRef.current;
    const tNow = performance.now();
    const revealP = s.revealDone ? 1 : Math.min(1, (tNow - s.revealT0) / 950);
    if (revealP >= 1) s.revealDone = true;

    // ---- animated camera (fit / focus / minimap jump) ----
    if (s.anim) {
      const ap = Math.min(1, (tNow - s.anim.t0) / s.anim.dur);
      const ae = easeOutCubic(ap);
      s.scale = s.anim.from.scale + (s.anim.to.scale - s.anim.from.scale) * ae;
      s.tx = s.anim.from.tx + (s.anim.to.tx - s.anim.from.tx) * ae;
      s.ty = s.anim.from.ty + (s.anim.to.ty - s.anim.from.ty) * ae;
      if (ap >= 1) s.anim = null;
    }

    // ---- viewport (world-space, +margin) for culling ----
    const cullM = 340 / s.scale;
    const cull = {
      x0: -s.tx / s.scale - cullM,
      x1: (W - s.tx) / s.scale + cullM,
      y0: -s.ty / s.scale - cullM,
      y1: (H - s.ty) / s.scale + cullM,
    };

    const itemsList = st.visibleItems;
    const n = itemsList.length;
    const ink = pal?.ink ?? "#F2F5FA";

    // ---- graticule (world-space survey grid) ----
    const gridStep = 180;
    const x0 = Math.floor(-s.tx / s.scale / gridStep) * gridStep;
    const x1 = (W - s.tx) / s.scale;
    const y0 = Math.floor(-s.ty / s.scale / gridStep) * gridStep;
    const y1 = (H - s.ty) / s.scale;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = x0; gx <= x1; gx += gridStep) {
      const sx = gx * s.scale + s.tx;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
    }
    for (let gy = y0; gy <= y1; gy += gridStep) {
      const sy = gy * s.scale + s.ty;
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ---- nodes + label layout (collision-aware) ----
    const placedRects: Rect[] = [];
    const tileRects: Rect[] = [];
    // first pass: tiles
    const drawList: {
      item: MediaItem;
      S: Position;
      r: number;
      w: number;
      h: number;
      appear: number;
      prio: number;
    }[] = [];
    itemsList.forEach((item, index) => {
      const p = st.positions[item.localId];
      if (!p) return;
      // viewport culling — off-screen tiles cost nothing to skip
      if (p.x < cull.x0 || p.x > cull.x1 || p.y < cull.y0 || p.y > cull.y1) return;
      const baseR = nodeRadiusRef.current(item);
      const appear = s.revealDone
        ? 1
        : easeOutCubic(clamp((revealP * (n + 6) - index) / 6, 0, 1));
      if (appear <= 0) return;
      const S = worldToScreen(p, s);
      const r = baseR * s.scale * appear;
      const w = r * 2;
      const h = r * 3;
      const entry = entryByLocalId.get(item.localId);
      const degree = st.degreeOf.get(item.localId) ?? 0;
      const prio =
        (st.selectedId === item.localId ? 100 : 0) +
        (s.hoverId === item.localId ? 80 : 0) +
        (entry?.rating ?? 0) * 6 +
        degree;
      drawList.push({ item, S, r, w, h, appear, prio });
      tileRects.push({ x: S.x - w / 2 - 4, y: S.y - h / 2 - 4, w: w + 8, h: h + 8 });
    });

    // sort by priority for label placement priority
    const labelOrder = [...drawList].sort((a, b) => b.prio - a.prio);
    const labelRectOf = new Map<string, Rect>();
    const nodeFs = clamp(12 * Math.sqrt(s.scale), 10, 13.5);
    ctx.font = `600 ${nodeFs}px ${st.lang === "ar" ? F_AR : F_UI}`;
    for (const d of labelOrder) {
      const show = (st.labelsOn && s.scale > 0.42) || st.selectedId === d.item.localId || s.hoverId === d.item.localId;
      if (!show) continue;
      const title = d.item.title;
      const text = truncateTo(ctx, title, 150);
      const tw = ctx.measureText(text).width;
      const ly = d.S.y + d.h / 2 + 5;
      const rect: Rect = { x: d.S.x - tw / 2 - 4, y: ly, w: tw + 8, h: nodeFs + 6 };
      if (rectsOverlapAny(rect, placedRects) || rectsOverlapAny(rect, tileRects)) {
        // try above the tile
        const above: Rect = { x: rect.x, y: d.S.y - d.h / 2 - rect.h - 5, w: rect.w, h: rect.h };
        if (!rectsOverlapAny(above, placedRects) && !rectsOverlapAny(above, tileRects)) {
          placedRects.push(above);
          labelRectOf.set(d.item.localId, above);
        }
        continue; // skip label on collision — tile stays clean
      }
      placedRects.push(rect);
      labelRectOf.set(d.item.localId, rect);
    }

    // ---- islands (padded hulls) ----
    st.islands.forEach((isl) => {
      const color = pal?.island[isl.colorIndex % (pal?.island.length ?? 5)] ?? "#52C7B0";
      if (isl.points.length < 3) return;
      ctx.beginPath();
      const pts = isl.points.map((p) => worldToScreen(p, s));
      // soft blob: quadratic through midpoints
      const mid = (a: Position, b: Position) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      let m0 = mid(pts[pts.length - 1], pts[0]);
      ctx.moveTo(m0.x, m0.y);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const next = pts[(i + 1) % pts.length];
        const m = mid(p, next);
        ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // island label — letterspaced caps at the top of the landmass,
      // lifted until it clears every tile and already-placed node label
      const fs = clamp(11.5 * Math.sqrt(s.scale), 10, 15);
      ctx.font = `700 ${fs}px ${st.lang === "ar" ? F_AR : F_UI}`;
      trySetLetterSpacing(ctx, st.lang === "ar" ? "0.02em" : "0.14em");
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const label = st.lang === "ar" ? isl.label : isl.label.toUpperCase();
      const tw = ctx.measureText(label).width;
      const anchor = worldToScreen(isl.labelAnchor, s);
      anchor.y -= 6 * Math.min(1.4, Math.max(0.7, s.scale));
      const labelW = tw + 14;
      const labelH = fs + 7;
      for (let lift = 0; lift < 5; lift++) {
        const rect: Rect = { x: anchor.x - labelW / 2, y: anchor.y - labelH, w: labelW, h: labelH };
        if (!rectsOverlapAny(rect, tileRects) && !rectsOverlapAny(rect, placedRects)) break;
        anchor.y -= labelH * 0.8;
      }
      // obsidian backing for legibility
      ctx.fillStyle = pal?.card ?? "#10141B";
      ctx.globalAlpha = 0.95;
      roundRect(ctx, anchor.x - tw / 2 - 6, anchor.y - fs - 5, tw + 12, fs + 6, 4);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = color;
      ctx.fillText(label, anchor.x, anchor.y - 2);
      trySetLetterSpacing(ctx, "0px");
      ctx.globalAlpha = 1;
    });

    // ---- edges (curved survey lines, zoom-adaptive LOD) ----
    const adaptiveMin =
      st.visibleEdges.length > 60 ? 0.4 : st.visibleEdges.length > 36 ? 0.34 : 0.3;
    const lowZoom = s.scale < 0.55 && st.visibleEdges.length > 24;
    const lodMin = adaptiveMin + (s.scale < 0.55 ? (0.55 - s.scale) * 0.3 : 0);
    st.visibleEdges.forEach((e, idx) => {
      const pa = st.positions[e.a];
      const pb = st.positions[e.b];
      if (!pa || !pb) return;
      // cull edges that cannot intersect the viewport
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const reachX = Math.abs(pa.x - pb.x) / 2 + cullM;
      const reachY = Math.abs(pa.y - pb.y) / 2 + cullM;
      if (mx + reachX < cull.x0 || mx - reachX > cull.x1) return;
      if (my + reachY < cull.y0 || my - reachY > cull.y1) return;
      const isSel =
        st.selectedEdge &&
        ((st.selectedEdge.a === e.a && st.selectedEdge.b === e.b) ||
          (st.selectedEdge.a === e.b && st.selectedEdge.b === e.a));
      const adjacentSel = st.selectedId && (e.a === st.selectedId || e.b === st.selectedId);
      // LOD budget (selections always stay visible)
      if (!isSel && !adjacentSel) {
        if (e.score < lodMin) return;
        if (lowZoom && !st.strongEdgeSet.has(idx)) return;
      }
      const A = worldToScreen(pa, s);
      const B = worldToScreen(pb, s);
      // curve control point: perpendicular offset, alternating to untangle knots
      const smx = (A.x + B.x) / 2;
      const smy = (A.y + B.y) / 2;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const bow = Math.min(26, len * 0.09) * (idx % 2 === 0 ? 1 : -1);
      const cx = smx + (-dy / len) * bow;
      const cy = smy + (dx / len) * bow;

      ctx.strokeStyle = isSel || adjacentSel ? pal?.accent ?? "#FF7E54" : ink;
      ctx.globalAlpha = isSel ? 0.95 : adjacentSel ? 0.65 : 0.22 + e.score * 0.36;
      ctx.lineWidth = isSel ? 2.4 : adjacentSel ? 1.8 : 0.8 + e.score * 1.2;
      if (isSel) ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(cx, cy, B.x, B.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    // second pass: draw tiles
    for (const d of drawList) {
      const item = d.item;
      const entry = entryByLocalId.get(item.localId);
      const { S, r, w, h, appear } = d;

      const isHover = s.hoverId === item.localId;
      const isSel = st.selectedId === item.localId;
      const isFocus = st.focusId === item.localId;

      // focus reticle (vermilion, pulsing)
      if (isFocus) {
        const pulse = 0.5 + 0.5 * Math.sin(tNow / 260);
        ctx.strokeStyle = pal?.accent ?? "#FF7E54";
        ctx.globalAlpha = 0.5 + 0.4 * pulse;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(S.x, S.y, Math.max(w, h) / 2 + 9 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // poster: real artwork, else generated atlas tile
      const img = posterImage(item);
      ctx.save();
      roundRect(ctx, S.x - w / 2, S.y - h / 2, w, h, Math.max(3, w * 0.09));
      ctx.clip();
      if (img) {
        // cover-fit crop
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const targetRatio = 2 / 3;
        let sw = iw;
        let sh = iw / targetRatio;
        if (sh > ih) {
          sh = ih;
          sw = ih * targetRatio;
        }
        ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, S.x - w / 2, S.y - h / 2, w, h);
      } else {
        ctx.drawImage(posterFor(item), S.x - w / 2, S.y - h / 2, w, h);
      }
      ctx.restore();

      // status ring: shape + color (never color alone)
      const stColor = pal?.status[entry?.status ?? "planned"] ?? "#A67C2E";
      const status = entry?.status ?? "planned";
      ctx.strokeStyle = stColor;
      ctx.lineWidth = Math.max(1.4, 2.6 * Math.sqrt(s.scale));
      const ringR = Math.max(w, h) / 2 + ctx.lineWidth * 0.9;
      ctx.beginPath();
      if (status === "completed") {
        ctx.arc(S.x, S.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
      } else if (status === "watching") {
        ctx.setLineDash([9, 5]);
        ctx.arc(S.x, S.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (status === "planned") {
        ctx.setLineDash([2.5, 5]);
        ctx.arc(S.x, S.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (status === "dropped") {
        ctx.arc(S.x, S.y, ringR, 0.4, Math.PI * 2 - 0.4); // broken arc
        ctx.stroke();
      } else {
        ctx.setLineDash([15, 6]);
        ctx.arc(S.x, S.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // favourite: small vermilion heart badge at the tile's shoulder
      if (entry?.isFavourite) {
        const bx = S.x + w / 2 - 1;
        const by = S.y - h / 2 + 1;
        ctx.fillStyle = "rgba(7, 9, 13, 0.88)";
        ctx.strokeStyle = stColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        drawHeart(ctx, bx, by, 4.2, pal?.accent ?? "#FF7E54");
      }

      // selection / hover: ember for the chosen, starlight for the hovered
      if (isSel || isHover) {
        ctx.strokeStyle = isSel ? pal?.accent ?? "#FF7E54" : ink;
        ctx.globalAlpha = isSel ? 0.95 : 0.45;
        ctx.lineWidth = isSel ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(S.x, S.y, ringR + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // label
      const labelRect = labelRectOf.get(item.localId);
      if (labelRect) {
        const title = item.title;
        const text = truncateTo(ctx, title, 150);
        ctx.fillStyle = "rgba(7, 9, 13, 0.82)";
        ctx.globalAlpha = 0.9 * appear;
        roundRect(ctx, labelRect.x, labelRect.y, labelRect.w, labelRect.h, 4);
        ctx.fill();
        ctx.globalAlpha = appear;
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(text, S.x, labelRect.y + 3);
        ctx.globalAlpha = 1;
      }
    }

    // ---- compass rose (screen corner) ----
    drawCompass(ctx, W - 34, 38, 17, ink, pal?.accent ?? "#FF7E54");

    // ---- minimap (corner inset, drag to navigate) ----
    s.mini = drawMinimap(ctx, s, st, W, H, pal);

    if (!s.revealDone || st.focusId || s.anim) {
      rafRef.current = requestAnimationFrame(() => drawRef.current());
    }
  }, [entryByLocalId, posterFor, posterImage, worldToScreen]);

  drawRef.current = draw;

  // ---------- hit testing (spatial grid) ----------
  const hitTest = React.useCallback((wx: number, wy: number): { node: string | null; edge: { a: string; b: string } | null } => {
    const st = stateRef.current;
    const s = sceneRef.current;

    const testIndex = (i: number): string | null => {
      const item = st.visibleItems[i];
      if (!item) return null;
      const p = st.positions[item.localId];
      if (!p) return null;
      const r = nodeRadiusRef.current(item);
      // ellipse footprint (tile is 2r × 3r)
      const dx = (wx - p.x) / (r * 1.35);
      const dy = (wy - p.y) / (r * 1.85);
      return dx * dx + dy * dy <= 1 ? item.localId : null;
    };

    // nearby cells only — O(few) instead of O(n) per pointer move
    const grid = gridRef.current;
    if (grid) {
      const R = 140; // a tile footprint never reaches further than this
      const gx0 = Math.floor((wx - R) / grid.cell);
      const gx1 = Math.floor((wx + R) / grid.cell);
      const gy0 = Math.floor((wy - R) / grid.cell);
      const gy1 = Math.floor((wy + R) / grid.cell);
      const candidates: number[] = [];
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const list = grid.map.get(`${gx}:${gy}`);
          if (list) for (const idx of list) candidates.push(idx);
        }
      }
      candidates.sort((a, b) => a - b); // draw order → topmost wins
      for (let ci = candidates.length - 1; ci >= 0; ci--) {
        const hit = testIndex(candidates[ci]);
        if (hit) return { node: hit, edge: null };
      }
    } else {
      for (let i = st.visibleItems.length - 1; i >= 0; i--) {
        const hit = testIndex(i);
        if (hit) return { node: hit, edge: null };
      }
    }

    const tolerance = 9 / s.scale;
    for (const e of st.visibleEdges) {
      const pa = st.positions[e.a];
      const pb = st.positions[e.b];
      if (!pa || !pb) continue;
      if (distToSegment(wx, wy, pa, pb) <= tolerance) {
        return { node: null, edge: { a: e.a, b: e.b } };
      }
    }
    return { node: null, edge: null };
  }, []);

  const zoomAt = React.useCallback(
    (cx: number, cy: number, factor: number) => {
      const s = sceneRef.current;
      const next = clamp(s.scale * factor, 0.08, 3.2);
      const k = next / s.scale;
      s.tx = cx - (cx - s.tx) * k;
      s.ty = cy - (cy - s.ty) * k;
      s.scale = next;
      requestDraw();
    },
    [requestDraw],
  );

  // ---------- interactions ----------
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const insideMini = (px: number, py: number) => {
      const m = sceneRef.current.mini;
      return !!m && px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h;
    };

    const minimapNavigate = (px: number, py: number, animate: boolean) => {
      const s = sceneRef.current;
      const m = s.mini;
      if (!m) return;
      const wx = (px - m.ox) / m.k;
      const wy = (py - m.oy) / m.k;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      animateViewRef.current(
        { scale: s.scale, tx: w / 2 - wx * s.scale, ty: h / 2 - wy * s.scale },
        animate ? 220 : 0,
      );
    };

    const onPointerDown = (ev: PointerEvent) => {
      const s = sceneRef.current;
      s.anim = null; // grabbing the sheet cancels any camera animation
      const rect0 = canvas.getBoundingClientRect();
      const px = ev.clientX - rect0.left;
      const py = ev.clientY - rect0.top;
      if (insideMini(px, py)) {
        s.miniDrag = true;
        canvas.setPointerCapture(ev.pointerId);
        minimapNavigate(px, py, true);
        return;
      }
      canvas.setPointerCapture(ev.pointerId);
      pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointersRef.current.size === 1) {
        dragRef.current = { active: true, moved: 0, lastX: ev.clientX, lastY: ev.clientY };
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (sceneRef.current.miniDrag) {
        minimapNavigate(ev.clientX - rect.left, ev.clientY - rect.top, false);
        return;
      }
      if (pointersRef.current.has(ev.pointerId)) {
        pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }
      const pointers = pointersRef.current;
      const s = sceneRef.current;

      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const midX = (p1.x + p2.x) / 2 - rect.left;
        const midY = (p1.y + p2.y) / 2 - rect.top;
        if (pinchRef.current.lastDist != null && pinchRef.current.lastDist > 0) {
          const factor = dist / pinchRef.current.lastDist;
          zoomAt(midX, midY, factor);
        }
        pinchRef.current.lastDist = dist;
        dragRef.current.moved += 3;
        return;
      }

      if (dragRef.current.active) {
        const dx = ev.clientX - dragRef.current.lastX;
        const dy = ev.clientY - dragRef.current.lastY;
        dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
        s.tx += dx;
        s.ty += dy;
        dragRef.current.lastX = ev.clientX;
        dragRef.current.lastY = ev.clientY;
        requestDraw();
      }

      // hover — suppressed over the minimap inset
      if (insideMini(ev.clientX - rect.left, ev.clientY - rect.top)) {
        if (s.hoverId !== null) {
          s.hoverId = null;
          canvas.style.cursor = "pointer";
          requestDraw();
        }
        return;
      }
      const wx = (ev.clientX - rect.left - s.tx) / s.scale;
      const wy = (ev.clientY - rect.top - s.ty) / s.scale;
      const hit = hitTest(wx, wy);
      if (s.hoverId !== (hit.node ?? null)) {
        s.hoverId = hit.node;
        canvas.style.cursor = hit.node ? "pointer" : dragRef.current.active ? "grabbing" : "grab";
        requestDraw();
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      const wasMiniDrag = sceneRef.current.miniDrag;
      sceneRef.current.miniDrag = false;
      pointersRef.current.delete(ev.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current.lastDist = null;
      if (wasMiniDrag) return; // minimap taps never select nodes
      const wasDrag = dragRef.current;
      dragRef.current = { active: false, moved: 0, lastX: 0, lastY: 0 };
      if (wasDrag.moved > 6) return;
      const rect = canvas.getBoundingClientRect();
      const s = sceneRef.current;
      const wx = (ev.clientX - rect.left - s.tx) / s.scale;
      const wy = (ev.clientY - rect.top - s.ty) / s.scale;
      const hit = hitTest(wx, wy);
      if (hit.node) {
        const already = stateRef.current.selectedId === hit.node;
        props.onSelect(already ? null : hit.node);
      } else if (hit.edge) {
        props.onSelectEdge(hit.edge);
        props.onSelect(null);
      } else {
        props.onSelect(null);
        props.onSelectEdge(null);
      }
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      sceneRef.current.anim = null; // wheel takes over the camera
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * 0.0012);
      zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, factor);
    };

    const onDouble = () => fitAll();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDouble);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDouble);
    };
  }, [hitTest, zoomAt, fitAll, requestDraw, props.onSelect, props.onSelectEdge]);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    const s = sceneRef.current;
    const c = canvasRef.current;
    if (!c) return;
    switch (ev.key) {
      case "+":
      case "=":
        zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1.2);
        break;
      case "-":
        zoomAt(c.clientWidth / 2, c.clientHeight / 2, 0.83);
        break;
      case "ArrowLeft":
        s.tx += 40;
        requestDraw();
        break;
      case "ArrowRight":
        s.tx -= 40;
        requestDraw();
        break;
      case "ArrowUp":
        s.ty += 40;
        requestDraw();
        break;
      case "ArrowDown":
        s.ty -= 40;
        requestDraw();
        break;
      case "0":
        fitAll();
        break;
      default:
        return;
    }
    ev.preventDefault();
  };

  // ---------- lifecycle ----------
  React.useEffect(() => {
    requestDraw();
  }, [themeKey, selectedId, selectedEdge, labelsOn, visibleItems, visibleEdges, islands, positions, requestDraw]);

  const firstRun = React.useRef(true);
  React.useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (firstRun.current) {
      firstRun.current = false;
      if (animate && !reduce && stateRef.current.visibleItems.length) {
        sceneRef.current.revealT0 = performance.now();
        sceneRef.current.revealDone = false;
      }
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => fitAll()));
      return () => cancelAnimationFrame(raf);
    }
    sceneRef.current.revealDone = true;
  }, [revealKey]);

  React.useEffect(() => {
    if (fitSignal > 0) fitAll();
  }, [fitSignal]);

  React.useEffect(() => {
    if (!focusId) return;
    const p = positions[focusId];
    const canvas = canvasRef.current;
    if (!p || !canvas) return;
    const s = sceneRef.current;
    const targetScale = Math.max(s.scale, 0.9);
    animateViewRef.current(
      {
        scale: targetScale,
        tx: canvas.clientWidth / 2 - p.x * targetScale,
        ty: canvas.clientHeight / 2 - p.y * targetScale,
      },
      480,
    );
  }, [focusId, positions]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // redraw on every resize, but re-fit the whole scene into view when the
    // canvas size changes significantly (orientation change, desktop→mobile),
    // so the map never ends up panned/zoomed off-screen on a small viewport.
    let lastW = canvas.clientWidth;
    let lastH = canvas.clientHeight;
    const ro = new ResizeObserver(() => {
      requestDraw();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (Math.abs(w - lastW) > 140 || Math.abs(h - lastH) > 140) {
        lastW = w;
        lastH = h;
        fitAll();
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [requestDraw, fitAll]);

  React.useEffect(() => cancelAnimationFrame(rafRef.current), []);

  const countLabel = t("map.nodes", { n: visibleItems.length });

  return (
    <div
      tabIndex={0}
      role="application"
      aria-label={`${t("map.title")} — ${countLabel}. ${t("map.viewList")}: ${t("map.listSub")}`}
      onKeyDown={onKeyDown}
      className="relative h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ cursor: "grab" }} />
    </div>
  );
}

// ---------- utils ----------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function trySetLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
  } catch {
    // not supported — fine
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectsOverlapAny(r: Rect, list: Rect[]): boolean {
  for (const q of list) if (rectsOverlap(r, q)) return true;
  return false;
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
  ctx.fill();
}

function drawCompass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ink: string,
  accent: string,
) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  // 8-point star
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = i % 2 === 0 ? r * 0.9 : r * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // north needle in vermilion
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.86);
  ctx.lineTo(x - 3.2, y - r * 0.2);
  ctx.lineTo(x + 3.2, y - r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------------- minimap inset ---------------- */

interface MiniScene {
  scale: number;
  tx: number;
  ty: number;
  mini: { x: number; y: number; w: number; h: number; ox: number; oy: number; k: number } | null;
}

interface MiniState {
  visibleItems: MediaItem[];
  positions: Positions;
  islands: { points: Position[] }[];
}

/**
 * Corner overview inset: islands, node dots, the current viewport rectangle
 * and a zoom readout. Returns its geometry so pointer events can navigate
 * by dragging. Hidden on tiny maps / tiny canvases.
 */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  s: MiniScene,
  st: MiniState,
  W: number,
  H: number,
  pal: MapPalette | null,
): MiniScene["mini"] {
  const n = st.visibleItems.length;
  if (n < 8 || W < 540 || H < 420) return null;

  const mw = Math.round(Math.min(200, Math.max(148, W * 0.17)));
  const mh = Math.round(mw * 0.74);
  const x = W - mw - 14;
  const y = H - mh - 14;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of st.visibleItems) {
    const p = st.positions[item.localId];
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return null;

  const pad = 14;
  const k = Math.min(
    (mw - pad * 2) / Math.max(1, maxX - minX),
    (mh - pad * 2) / Math.max(1, maxY - minY),
  );
  const ox = x + mw / 2 - ((minX + maxX) / 2) * k;
  const oy = y + mh / 2 - ((minY + maxY) / 2) * k;

  // card
  ctx.fillStyle = pal?.card ?? "#10141B";
  ctx.globalAlpha = 0.96;
  roundRect(ctx, x, y, mw, mh, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal?.inkFaint ?? "rgba(236,240,250,0.14)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, y, mw, mh, 10);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, x, y, mw, mh, 10);
  ctx.clip();

  // islands
  st.islands.forEach((isl, i) => {
    const color = pal?.island[i % (pal?.island.length ?? 5)] ?? "#52C7B0";
    if (isl.points.length < 3) return;
    ctx.beginPath();
    isl.points.forEach((p, j) => {
      const px = p.x * k + ox;
      const py = p.y * k + oy;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // node dots
  ctx.fillStyle = pal?.ink ?? "#F2F5FA";
  ctx.globalAlpha = 0.7;
  for (const item of st.visibleItems) {
    const p = st.positions[item.localId];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * k + ox, p.y * k + oy, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // current viewport rectangle
  const vx = (-s.tx / s.scale) * k + ox;
  const vy = (-s.ty / s.scale) * k + oy;
  const vw = (W / s.scale) * k;
  const vh = (H / s.scale) * k;
  ctx.strokeStyle = pal?.accent ?? "#FF7E54";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(vx, vy, vw, vh);
  ctx.setLineDash([]);
  ctx.restore();

  // zoom readout
  ctx.font = `650 9.5px ${pal?.fontUi ?? "system-ui, sans-serif"}`;
  trySetLetterSpacing(ctx, "0.08em");
  ctx.fillStyle = pal?.ink ?? "#F2F5FA";
  ctx.globalAlpha = 0.62;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`${Math.round(s.scale * 100)}%`, x + mw - 8, y + 6);
  trySetLetterSpacing(ctx, "0px");
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";

  return { x, y, w: mw, h: mh, ox, oy, k };
}

function distToSegment(px: number, py: number, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function truncateTo(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) {
    t = t.slice(0, -1);
  }
  return t + "…";
}
