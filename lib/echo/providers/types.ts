/**
 * ECHO — Catalogue provider abstraction.
 * The rest of the app depends only on the normalized MediaItem model,
 * never on a provider's raw response shapes.
 *
 * Real sources (all fetched client-side, all attributed):
 *  - AniList (graphql.anilist.co)  → anime
 *  - TVMaze (api.tvmaze.com)       → series
 *  - IMDb suggestions + Cinemeta   → movies (and genre catalogues)
 *  - RAWG (api.rawg.io)            → games   (built-in key; personal key optional)
 *  - Open Library (openlibrary.org)→ books   (keyless)
 * The labelled demo catalogue stays as an offline fallback only.
 */

import type { MediaItem, MediaType } from "../types";

export interface SearchFilters {
  mediaTypes?: MediaType[];
  limit?: number;
  /** abort signal — the federated engine cancels in-flight provider calls
   *  when the user changes the query. Adapters that accept it pass it on to
   *  their fetches; those that don't are simply abandoned (results ignored). */
  signal?: AbortSignal;
}

export interface ProviderSearchResult {
  item: MediaItem;
  /** short chip label shown next to the result, e.g. "AniList" */
  sourceLabel: string;
}

export interface ProviderAttribution {
  name: string;
  notice?: string;
  logoUrl?: string;
  canonical?: string;
}

export interface CatalogueProvider {
  id: string;
  label: string;
  capabilities: {
    anime: boolean;
    movies: boolean;
    series: boolean;
    games: boolean;
    books: boolean;
    /** v3 categories — optional so existing adapters keep compiling */
    manga?: boolean;
    comics?: boolean;
    contentRatings: boolean;
    relatedTitles: boolean;
  };
  isConfigured(): boolean;
  search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]>;
  getTitle(providerId: string): Promise<MediaItem | null>;
  getAttribution(): ProviderAttribution;
}

export type ProviderErrorCode =
  | "missing_key"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "network"
  | "not_found";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  /** parsed Retry-After hint (ms) when the upstream returned 429 + a hint */
  retryAfterMs?: number;
  constructor(code: ProviderErrorCode, message?: string, retryAfterMs?: number) {
    super(message ?? code);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.name = "ProviderError";
  }
}

/** Default upstream timeout — no provider call may hang the UI or a route. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Parse a Retry-After header (seconds or HTTP-date) into milliseconds. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 15 * 60_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 15 * 60_000);
  return undefined;
}

/** Fetch JSON with the shared error mapping used by every adapter. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      // callers may pass their own signal; otherwise clamp to the default
      signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    // an abort IS a cancellation, not a provider failure
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "TimeoutError") throw new ProviderError("unavailable");
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ProviderError("network");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("unauthorized");
  if (res.status === 404) throw new ProviderError("not_found");
  if (res.status === 429) {
    throw new ProviderError(
      "rate_limited",
      undefined,
      parseRetryAfterMs(res.headers.get("Retry-After") ?? res.headers.get("retry-after")),
    );
  }
  if (res.status >= 500) throw new ProviderError("unavailable");
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError("invalid_response");
  }
}

/** Fetch text (XML/SRU endpoints) with the same shared error mapping. */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "TimeoutError") throw new ProviderError("unavailable");
    throw new ProviderError("network");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("unauthorized");
  if (res.status === 404) throw new ProviderError("not_found");
  if (res.status === 429) {
    throw new ProviderError(
      "rate_limited",
      undefined,
      parseRetryAfterMs(res.headers.get("Retry-After") ?? res.headers.get("retry-after")),
    );
  }
  if (res.status >= 500) throw new ProviderError("unavailable");
  return res.text();
}

/* ---------------- slug normalization (shared vocabulary) ---------------- */

/** genre display-name → canonical slug aliases across providers */
const GENRE_ALIASES: Record<string, string> = {
  "science-fiction": "sci-fi",
  "film-noir": "noir",
  "reality-tv": "reality",
  "game-show": "game-show",
  "talk-show": "talk-show",
  "award-winning": "award-winning",
  "avant-garde": "avant-garde",
  "mahou-shoujo": "mahou-shoujo",
  "slice-of-life": "slice-of-life",
  "boys-love": "boys-love",
  "girls-love": "girls-love",
  "erotica": "erotica",
  "ecchi": "ecchi",
  // games (RAWG)
  "role-playing-games-rpg": "rpg",
  "massively-multiplayer": "mmo",
};

export function slugifyText(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize a provider genre name to the canonical ECHO slug. */
export function normalizeGenre(raw: string): string {
  const s = slugifyText(raw);
  return GENRE_ALIASES[s] ?? s;
}

/** Slug → provider display name (for catalogue genre queries). */
const GENRE_DISPLAY_OVERRIDES: Record<string, string> = {
  "sci-fi": "Sci-Fi",
  historical: "History",
  sports: "Sport",
  noir: "Film-Noir",
  reality: "Reality-TV",
};

export function genreDisplay(slug: string, fallback: string): string {
  return GENRE_DISPLAY_OVERRIDES[slug] ?? fallback;
}
