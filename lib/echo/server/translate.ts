/**
 * ECHO — free synopsis translation (server-side only).
 *
 * Goal: Arabic-interface users see Arabic synopses even when the source
 * provider (IMDb, RAWG, Open Library, TVMaze) only ships English text —
 * at ZERO cost and with ZERO keys or accounts.
 *
 * Upstream chain (both free, keyless):
 *  1. Google Translate's public web endpoint (translate.googleapis.com,
 *     client=gtx) — auto-detects source language, fast, high quality.
 *  2. MyMemory's free API (api.mymemory.translated.net) — fallback with
 *     a smaller per-request budget; needs an explicit source language.
 *
 * Cost & abuse control:
 *  - translations are immutable → cached 24 h in the shared in-memory TTL
 *    cache (per process instance), so re-reads and popular titles never
 *    hit the upstream at all
 *  - inputs are clamped (synopses arrive ≤1200 chars) and the route is
 *    rate-limited like the AI routes (see app/api/echo/translate)
 *  - failures never throw: the caller gets the ORIGINAL text back with
 *    ok:false and the UI simply shows the original synopsis
 *
 * Swap note: same contract as the rate limiter — when growth demands
 * something stronger (a paid MT provider), only this file changes.
 */

import { TTLCache } from "@/lib/echo/providers/cache";

export const TRANSLATE_MAX_CHARS = 1200;
export const TRANSLATE_MAX_BATCH = 8;

const cache = new TTLCache<string>(24 * 60 * 60_000, 800);

const ARABIC_RE = /[\u0600-\u06FF]/;

/** True when the text still needs an Arabic pass (no Arabic letters at all). */
export function needsArabic(text: string): boolean {
  return text.length > 0 && !ARABIC_RE.test(text);
}

/** Compact stable key so huge strings don't bloat the cache map. */
function cacheKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${h.toString(36)}:${text.length}:${text.slice(0, 24)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/** Google Translate public endpoint (client=gtx). Auto source-language. */
async function viaGoogle(text: string): Promise<string | null> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t` +
    `&q=${encodeURIComponent(text)}`;
  try {
    const res = await withTimeout(
      fetch(url, { headers: { "user-agent": "EchoApp/1.0" } }),
      9_000,
    );
    if (!res.ok) return null;
    // shape: [[["ترجمة","source",null,null,...], ...], null, "en", ...]
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const parts = (data[0] as unknown[])
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
      .join("");
    const out = parts.replace(/\s+/g, " ").trim();
    return out && ARABIC_RE.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** MyMemory free API fallback — hard limit ~500 chars per request. */
async function viaMyMemory(text: string): Promise<string | null> {
  if (text.length > 500) return null;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=en|ar&de=echo-app@example.com`;
  try {
    const res = await withTimeout(fetch(url), 9_000);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText?.replace(/\s+/g, " ").trim() ?? "";
    if (!out || String(data.responseStatus) !== "200") return null;
    // MyMemory returns the source back when it cannot translate
    if (!ARABIC_RE.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Translate one text to Arabic. Never throws; returns the original with
 * ok:false when every upstream fails. Successful results are cached 24 h.
 */
export async function translateToArabic(text: string): Promise<{ text: string; ok: boolean }> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, TRANSLATE_MAX_CHARS);
  if (!clean) return { text: "", ok: false };
  if (!needsArabic(clean)) return { text: clean, ok: true };

  const key = cacheKey(clean);
  const hit = cache.get(key);
  if (hit) return { text: hit, ok: true };

  const translated = (await viaGoogle(clean)) ?? (await viaMyMemory(clean));
  if (!translated) return { text: clean, ok: false };
  cache.set(key, translated);
  return { text: translated, ok: true };
}
