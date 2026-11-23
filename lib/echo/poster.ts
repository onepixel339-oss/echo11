/**
 * ECHO — Generated placeholder artwork for titles without a provider image.
 *
 * We never bundle or re-host copyrighted posters. Demo/manual titles get a
 * deterministic obsidian tile: a deep tinted void, faint contour arcs, a
 * hairline frame and the title initials set like a lit stamp.
 */

import type { MediaItem } from "./types";
import { mulberry32, fnv1a } from "./ids";

/** Obsidian tint triples: [deep base, contour tone, lit accent]. */
const PALETTES: [string, string, string][] = [
  ["#1A100B", "#6B4530", "#FF9A6B"], // ember void
  ["#0E1614", "#2E5A52", "#52C7B0"], // signal void
  ["#161209", "#6B5A2E", "#E9C268"], // gold void
  ["#101708", "#44663F", "#74D693"], // pine void
  ["#151019", "#584566", "#B58FC8"], // plum void
  ["#12151B", "#3E4854", "#9AA5B8"], // slate void
];

export interface PosterColors {
  from: string;
  to: string;
  accent: string;
}

export function posterColors(seedKey: string): PosterColors {
  const h = fnv1a(seedKey);
  const p = PALETTES[h % PALETTES.length];
  return { from: p[0], to: p[1], accent: p[2] };
}

function initialsOf(item: MediaItem): string {
  const src = item.title.trim();
  const words = src.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

const SERIF = 'Georgia, "Times New Roman", serif';

/** Draw a poster tile into any canvas context (used by map + cards). */
export function drawPosterTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  item: MediaItem,
): void {
  const colors = posterColors(item.localId);
  const rng = mulberry32(fnv1a(item.localId + "|art"));

  ctx.save();
  // obsidian base
  ctx.fillStyle = colors.from;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.1);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }

  // soft color bloom from the upper third — the "lit" corner
  const bloom = ctx.createLinearGradient(x, y, x, y + h);
  bloom.addColorStop(0, "rgba(242,245,250,0.07)");
  bloom.addColorStop(0.55, "rgba(242,245,250,0)");
  ctx.fillStyle = bloom;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.1);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }

  // contour arcs — like signal ripples in the dark
  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(0.6, w * 0.014);
  const cx = x + w * (0.3 + rng() * 0.4);
  const cy = y + h * (0.25 + rng() * 0.5);
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (w * 0.22 * i) / 1.15, rng() * 6.28, rng() * 6.28 + 2.2 + rng() * 2.2);
    ctx.stroke();
  }

  // hairline inner frame
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = colors.to;
  ctx.lineWidth = Math.max(0.6, w * 0.012);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x + w * 0.09, y + w * 0.09, w * 0.82, h - w * 0.18, w * 0.05);
    ctx.stroke();
  }

  // initials, lit
  ctx.globalAlpha = 0.92;
  const fontSize = h * 0.24;
  ctx.font = `600 ${fontSize}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.accent;
  ctx.fillText(initialsOf(item), x + w / 2, y + h * 0.46);

  // small underline tick
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + w * 0.38, y + h * 0.58, w * 0.24, Math.max(1, h * 0.008));
  ctx.restore();
}

const dataUrlCache = new Map<string, string>();

/** Poster as a data URL for DOM usage (cards, drawers). Cached per title. */
export function posterDataUrl(item: MediaItem, w = 96, h = 144): string {
  const key = `${item.localId}@${w}x${h}`;
  const hit = dataUrlCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawPosterTile(ctx, 0, 0, w, h, item);
  const url = canvas.toDataURL("image/png");
  dataUrlCache.set(key, url);
  return url;
}
