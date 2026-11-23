/**
 * ECHO — Trakt adapter (movies + series) via the Next.js server proxy.
 *
 * Real source: the Trakt API (api.trakt.tv).
 *
 * LICENSING (verified 2026-11-23, https://developer.trakt.tv/docs/api-use-policy):
 *  - Standard API access is free for commercial AND non-commercial use.
 *  - Explicitly permitted: apps that "display public discovery information"
 *    and search results, title details, ratings — no sign-in required.
 *  - Prohibited: bulk harvesting, catalog mirroring, selling/redistributing
 *    datasets. ECHO shows transient, attributed search results only.
 *  - Auth: every request needs a client_id from a registered Trakt app.
 *    ECHO does NOT ship one — deployments set TRAKT_CLIENT_ID (server-side
 *    env). CORS on api.trakt.tv is origin-whitelisted per app, so ECHO calls
 *    it through its own /api/echo/providers/trakt proxy route instead.
 *
 * Rate limits (Trakt docs, Oct 2026): ~500 GET calls / 5 min per client_id,
 * X-Ratelimit headers, Retry-After on 429. The proxy is itself rate-limited
 * per IP (server/ratelimit.ts) so one browser cannot burn the quota.
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import { formatForType } from "../types";
import {
  ProviderError,
  fetchJson,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { stampCatalogProvenance } from "./provenance";
import { providerCacheTtlMs } from "./registry";

const PROXY = "/api/echo/providers/trakt";

/** One raw Trakt search row (shared shape for /search/movie and /search/show). */
export interface TraktSearchRow {
  score?: number;
  type?: string;
  movie?: TraktMediaObject;
  show?: TraktMediaObject;
}

export interface TraktMediaObject {
  title?: string;
  year?: number;
  overview?: string;
  ids?: { trakt?: number; slug?: string; imdb?: string; tmdb?: number };
}

/** Pure normalization of a raw Trakt search response → MediaItems.
 *  Shared by the server proxy route, the client adapter and the tests. */
export function normalizeTraktResults(
  rows: TraktSearchRow[],
  mediaType: "movie" | "series",
  limit: number,
): MediaItem[] {
  const key = mediaType === "movie" ? "movie" : "show";
  const out: MediaItem[] = [];
  for (const row of rows) {
    const obj = row[key];
    const traktId = obj?.ids?.trakt;
    const title = obj?.title;
    if (!obj || !traktId || !title) continue;
    const slug = obj.ids?.slug;
    const item = stampCatalogProvenance({
      localId: `trakt:${mediaType}/${traktId}`,
      provider: "trakt",
      providerId: `${mediaType}/${traktId}`,
      canonicalUrl: `https://trakt.tv/${mediaType === "movie" ? "movies" : "shows"}/${slug ?? traktId}`,
      mediaType,
      format: formatForType(mediaType) as MediaFormat,
      title,
      synopsis: obj.overview,
      releaseYear: obj.year && obj.year > 1800 && obj.year < 2200 ? obj.year : undefined,
      genres: [],
      tags: [],
      sourceAttribution: "Data from Trakt",
      metadataFetchedAt: new Date().toISOString(),
      externalIds: {
        trakt: String(traktId),
        ...(obj.ids?.imdb ? { imdb: obj.ids.imdb } : {}),
      },
    });
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Proxy response envelope. */
interface ProxyEnvelope {
  configured?: boolean;
  results?: MediaItem[];
  error?: string;
  retryAfterMs?: number;
}

/** Client-side adapter: asks ECHO's server proxy (which holds the client_id). */
export class TraktProvider implements CatalogueProvider {
  id = "trakt";
  label = "Trakt";

  capabilities = {
    anime: false,
    movies: true,
    series: true,
    games: false,
    books: false,
    manga: false,
    comics: false,
    contentRatings: false,
    relatedTitles: false,
  };

  /** Session memory: once the proxy reports "not configured", stop asking. */
  private unconfigured = false;

  isConfigured(): boolean {
    return !this.unconfigured;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q || this.unconfigured) return [];
    const types = (filters?.mediaTypes ?? []).filter((t) => t === "movie" || t === "series");
    if (!types.length) return [];
    const limit = filters?.limit ?? 8;
    const jobs: Promise<MediaItem[]>[] = [];
    if (types.includes("movie")) jobs.push(this.viaProxy(q, "movie", limit));
    if (types.includes("series")) jobs.push(this.viaProxy(q, "series", limit));
    const settled = await Promise.allSettled(jobs);
    const items: MediaItem[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") items.push(...r.value);
    }
    if (settled.every((r) => r.status === "rejected")) {
      const first = settled[0];
      if (first.status === "rejected") throw first.reason;
    }
    return items.slice(0, limit * 2).map((item) => ({ item, sourceLabel: "Trakt" }));
  }

  private async viaProxy(q: string, type: "movie" | "series", limit: number): Promise<MediaItem[]> {
    const url = `${PROXY}?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`;
    let env: ProxyEnvelope;
    try {
      env = await fetchJson<ProxyEnvelope>(url);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("network");
    }
    if (env.configured === false) {
      this.unconfigured = true; // no TRAKT_CLIENT_ID on this deployment
      throw new ProviderError("missing_key");
    }
    if (env.error === "rate_limited") {
      throw new ProviderError("rate_limited", undefined, env.retryAfterMs);
    }
    if (env.error) throw new ProviderError("unavailable");
    return env.results ?? [];
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    // providerId is "movie/123" or "series/456"
    const m = providerId.match(/^(movie|series)\/(\d+)$/);
    if (!m || this.unconfigured) return null;
    try {
      const env = await fetchJson<ProxyEnvelope>(
        `${PROXY}?id=${encodeURIComponent(providerId)}`,
      );
      if (env.configured === false) {
        this.unconfigured = true;
        return null;
      }
      return env.results?.[0] ?? null;
    } catch {
      return null;
    }
  }

  getAttribution() {
    return {
      name: "Trakt",
      notice: "Data from Trakt — used under the Trakt API Use Policy.",
      canonical: "https://trakt.tv/",
    };
  }
}

/* ---------------------- server-side helpers (proxy route) ---------------------- */

/** Search upstream Trakt with a deployment-provided client_id.
 *  Server-only: the key never reaches client JavaScript. */
export async function traktUpstreamSearch(
  query: string,
  type: "movie" | "series",
  limit: number,
  clientId: string,
): Promise<TraktSearchRow[]> {
  const endpoint = type === "movie" ? "movie" : "show";
  const res = await fetch(
    `https://api.trakt.tv/search/${endpoint}?query=${encodeURIComponent(query)}&limit=${Math.min(20, limit)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (res.status === 401 || res.status === 403) throw new ProviderError("unauthorized");
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable");
  return (await res.json()) as TraktSearchRow[];
}

/** Registry-capped session cache TTL for the proxy (server instance memory). */
export const TRAKT_CACHE_TTL_MS = providerCacheTtlMs("trakt") || 10 * 60_000;
