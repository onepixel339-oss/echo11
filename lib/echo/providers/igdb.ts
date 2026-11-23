/**
 * ECHO — IGDB adapter (video games) via the Next.js server proxy.
 *
 * Real source: the IGDB.com API v4 (api.igdb.com), a Twitch service.
 *
 * LICENSING (verified 2026-11-23, https://api-docs.igdb.com/):
 *  - "The IGDB.com API is free for non-commercial usage under the terms of
 *    the Twitch Developer Service Agreement. We offer commercial partnership
 *    for users that would like to use the API commercially."
 *  - Auth: Twitch OAuth2 client-credentials (Client-ID + Client-Secret) —
 *    server-side only (browser-direct calls are not supported).
 *  - ECHO does NOT ship credentials: deployments set IGDB_CLIENT_ID +
 *    IGDB_CLIENT_SECRET. The proxy holds the token server-side.
 *
 * Rate limits: 4 requests per second per token (IGDB docs). The proxy
 * throttles itself below that and is per-IP rate limited as well.
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import { formatForType } from "../types";
import {
  ProviderError,
  fetchJson,
  normalizeGenre,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { stampCatalogProvenance } from "./provenance";
import { providerCacheTtlMs } from "./registry";

const PROXY = "/api/echo/providers/igdb";

/** Raw IGDB game row (subset of fields ECHO requests). */
export interface IgdbGame {
  id?: number;
  name?: string;
  slug?: string;
  summary?: string;
  first_release_date?: number; // unix seconds
  genres?: { name?: string }[];
  platforms?: { abbreviation?: string }[];
  involved_companies?: { developer?: boolean; publisher?: boolean; company?: { name?: string } }[];
  cover?: { image_id?: string };
}

/** Pure normalization of raw IGDB games → MediaItems.
 *  Shared by the server proxy route, the client adapter and the tests. */
export function normalizeIgdbResults(rows: IgdbGame[], limit: number): MediaItem[] {
  const out: MediaItem[] = [];
  for (const g of rows) {
    if (!g?.id || !g.name) continue;
    const year = g.first_release_date
      ? new Date(g.first_release_date * 1000).getUTCFullYear()
      : undefined;
    const developers = (g.involved_companies ?? [])
      .filter((c) => c.developer && c.company?.name)
      .map((c) => c.company!.name as string)
      .slice(0, 2);
    const publishers = (g.involved_companies ?? [])
      .filter((c) => c.publisher && c.company?.name)
      .map((c) => c.company!.name as string)
      .slice(0, 2);
    const item = stampCatalogProvenance({
      localId: `igdb:${g.id}`,
      provider: "igdb",
      providerId: String(g.id),
      canonicalUrl: `https://www.igdb.com/games/${g.slug ?? g.id}`,
      mediaType: "game",
      format: formatForType("game") as MediaFormat,
      title: g.name,
      synopsis: g.summary,
      releaseYear: year && year > 1960 && year < 2200 ? year : undefined,
      creators: developers.length ? developers : undefined,
      studios: publishers.length ? publishers : undefined,
      genres: (g.genres ?? [])
        .map((x) => x.name)
        .filter((n): n is string => Boolean(n))
        .map(normalizeGenre)
        .slice(0, 4),
      tags: (g.platforms ?? [])
        .map((p) => p.abbreviation)
        .filter((a): a is string => Boolean(a))
        .slice(0, 5),
      posterUrl: g.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : undefined,
      sourceAttribution: "Data from IGDB",
      metadataFetchedAt: new Date().toISOString(),
      externalIds: { igdb: String(g.id) },
    });
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

interface ProxyEnvelope {
  configured?: boolean;
  results?: MediaItem[];
  error?: string;
  retryAfterMs?: number;
}

/** Client-side adapter: asks ECHO's server proxy (which holds the token). */
export class IgdbProvider implements CatalogueProvider {
  id = "igdb";
  label = "IGDB";

  capabilities = {
    anime: false,
    movies: false,
    series: false,
    games: true,
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
    if (!(filters?.mediaTypes ?? []).includes("game")) return [];
    const limit = filters?.limit ?? 8;
    const url = `${PROXY}?q=${encodeURIComponent(q)}&limit=${limit}`;
    let env: ProxyEnvelope;
    try {
      env = await fetchJson<ProxyEnvelope>(url);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("network");
    }
    if (env.configured === false) {
      this.unconfigured = true; // no IGDB credentials on this deployment
      throw new ProviderError("missing_key");
    }
    if (env.error === "rate_limited") {
      throw new ProviderError("rate_limited", undefined, env.retryAfterMs);
    }
    if (env.error) throw new ProviderError("unavailable");
    return (env.results ?? []).map((item) => ({ item, sourceLabel: "IGDB" }));
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    if (!/^\d+$/.test(providerId) || this.unconfigured) return null;
    try {
      const env = await fetchJson<ProxyEnvelope>(`${PROXY}?id=${encodeURIComponent(providerId)}`);
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
      name: "IGDB",
      notice: "Data from IGDB — free for non-commercial use under the Twitch Developer Service Agreement.",
      canonical: "https://www.igdb.com/",
    };
  }
}

/* ---------------------- server-side helpers (proxy route) ---------------------- */

/** Cached Twitch client-credentials token (per server instance). */
let tokenCache: { token: string; expiresAt: number } | null = null;

/** Obtain (or reuse) a Twitch OAuth2 client-credentials token. */
export async function igdbAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST", signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!res.ok) throw new ProviderError("unauthorized");
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new ProviderError("unauthorized");
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

/** Search upstream IGDB (Apicalypse query). Server-only. */
export async function igdbUpstreamSearch(
  query: string,
  limit: number,
  clientId: string,
  clientSecret: string,
): Promise<IgdbGame[]> {
  const token = await igdbAccessToken(clientId, clientSecret);
  const body =
    `search "${query.replace(/["\\]/g, "")}"; ` +
    "fields name,slug,summary,first_release_date,genres.name,platforms.abbreviation," +
    "involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.image_id; " +
    "where category = 0 & version_parent = null; " +
    `limit ${Math.min(20, limit)};`;
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new ProviderError("unauthorized");
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable");
  return (await res.json()) as IgdbGame[];
}

/** Session cache TTL for the proxy (server instance memory). */
export const IGDB_CACHE_TTL_MS = providerCacheTtlMs("igdb") || 10 * 60_000;
