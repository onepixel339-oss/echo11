/**
 * ECHO — IMDb/Cinemeta adapter (movies AND series).
 *
 * Real sources, all keyless:
 *  - Search: IMDb's public suggestion endpoint
 *    (v2.sg.media-imdb.com/suggestion/…) — what imdb.com's own search box uses.
 *  - Details & genre catalogues: Cinemeta (v3-cinemeta.strem.io), the open
 *    metadata service built on IMDb ids used by Stremio.
 *
 * Search flow: suggestion (title, year, poster) → Cinemeta meta per result
 * (genres, cast, director, synopsis, runtime, rating). Poster art served from
 * metahub. Attribution: "Data from IMDb via Cinemeta".
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import {
  fetchJson,
  normalizeGenre,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";

const SUGGESTION = "https://v2.sg.media-imdb.com/suggestion";
const CINEMETA = "https://v3-cinemeta.strem.io";
const METAHUB = "https://images.metahub.space/poster/medium";

type ImdbKind = "movie" | "series";

interface SuggestionEntry {
  id: string; // ttXXXXXXX
  l: string; // title
  q?: string; // "feature" | "TV series" | …
  qid?: string; // "movie" | "tvSeries" | …
  y?: number;
  s?: string; // stars
  i?: { imageUrl?: string };
}

interface CinemetaMeta {
  imdb_id?: string;
  name?: string;
  year?: string;
  released?: string;
  runtime?: string;
  genre?: string[];
  genres?: string[];
  description?: string;
  cast?: string[];
  director?: (string | null)[];
  writer?: (string | null)[];
  imdbRating?: string;
  poster?: string;
  trailers?: { source: string; type: string }[];
  country?: string;
  type?: string;
  awards?: string;
}

function parseRuntime(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d+)\s*min/i);
  return m ? Number(m[1]) : undefined;
}

/** Best trailer link from a Cinemeta meta record (YouTube id → watch URL). */
function trailerUrlOf(meta?: CinemetaMeta): string | undefined {
  const trailers = meta?.trailers ?? [];
  if (!trailers.length) return undefined;
  const pick =
    trailers.find((tr) => tr.type === "Trailer" && tr.source) ??
    trailers.find((tr) => tr.source);
  return pick ? `https://www.youtube.com/watch?v=${pick.source}` : undefined;
}

function toMediaItem(
  kind: ImdbKind,
  id: string,
  title: string,
  meta?: CinemetaMeta,
  year?: number,
): MediaItem {
  const genres = (meta?.genre ?? meta?.genres ?? []).map(normalizeGenre);
  // NOTE: movies keep the legacy `imdb:` prefix; series use `imdb-series:`
  // so stored library ids from earlier versions keep resolving.
  const prefix = kind === "movie" ? "imdb" : "imdb-series";
  const imdbRating = meta?.imdbRating ? Number(meta.imdbRating) : null;
  return stampCatalogProvenance({
    localId: `${prefix}:${id}`,
    provider: prefix,
    providerId: id,
    canonicalUrl: `https://www.imdb.com/title/${id}/`,
    mediaType: kind as MediaType,
    format: (kind === "movie" ? "film" : "series") as MediaFormat,
    title,
    synopsis: meta?.description?.slice(0, 1200),
    releaseYear: year ?? (meta?.year ? Number(String(meta.year).slice(0, 4)) : undefined),
    genres,
    tags: [],
    cast: meta?.cast?.slice(0, 8),
    creators: meta?.director?.filter(Boolean).slice(0, 3) as string[] | undefined,
    runtimeMinutes: parseRuntime(meta?.runtime),
    publicScore: imdbRating ?? undefined,
    // rating provenance: IMDb rating on a 0–10 scale via Cinemeta
    rating: imdbRating != null ? { source: "imdb", scale: "0-10", value: imdbRating } : undefined,
    countries: meta?.country?.split(/,\s*/).slice(0, 3),
    posterUrl: `${METAHUB}/${id}/img`,
    trailerUrl: trailerUrlOf(meta),
    sourceAttribution: "Data from IMDb via Cinemeta",
    metadataFetchedAt: new Date().toISOString(),
  });
}

async function cinemetaMeta(kind: ImdbKind, id: string): Promise<CinemetaMeta | null> {
  try {
    const data = await fetchJson<{ meta?: CinemetaMeta }>(
      `${CINEMETA}/meta/${kind}/${encodeURIComponent(id)}.json`,
    );
    return data?.meta ?? null;
  } catch {
    return null; // meta is enrichment — a search hit without meta is still usable
  }
}

/** One shared search implementation used by the movie and series adapters. */
async function imdbSuggestionSearch(
  kind: ImdbKind,
  query: string,
  filters?: SearchFilters,
): Promise<ProviderSearchResult[]> {
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  if (!q) return [];
  // IMDb suggestion hosts files only under [a-z0-9] first letters. Any other
  // script (Arabic, Japanese…) 404s on its own letter, so we use the "x"
  // placeholder path which matches localized/AKA titles instead — this is what
  // makes Arabic-script queries («الهيبة», «الحفرة») find real works.
  const first = q.slice(0, 1);
  const letter = /^[a-z0-9]$/.test(first) ? first : "x";
  const data = await fetchJson<{ d: SuggestionEntry[] }>(
    `${SUGGESTION}/${letter}/${encodeURIComponent(q)}.json`,
    { signal: filters?.signal },
  );
  const limit = filters?.limit ?? 8;
  const isSeries = kind === "series";
  const matched = (data.d ?? []).filter((e) => {
    if (!e.id?.startsWith("tt")) return false;
    if (isSeries) {
      return e.qid === "tvSeries" || e.qid === "tvMiniSeries" || e.q === "TV series" || e.q === "TV mini-series";
    }
    return e.qid === "movie" || e.q === "feature";
  });
  const top = matched.slice(0, limit);
  // enrich with Cinemeta (genres, cast, runtime, synopsis) — best effort
  const metas = await Promise.all(top.map((e) => cinemetaMeta(kind, e.id)));
  return top.map((e, i) => ({
    item: toMediaItem(kind, e.id, e.l, metas[i] ?? undefined, e.y),
    sourceLabel: "IMDb",
  }));
}

export class ImdbProvider implements CatalogueProvider {
  id = "imdb";
  label = "IMDb";

  capabilities = {
    anime: false,
    movies: true,
    series: false,
    games: false,
    books: false,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    return imdbSuggestionSearch("movie", query, filters);
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const meta = await cinemetaMeta("movie", providerId);
    if (!meta?.name) return null;
    return toMediaItem("movie", providerId, meta.name, meta);
  }

  getAttribution() {
    return {
      name: "IMDb · Cinemeta",
      notice:
        "Movie search via IMDb's public suggestion endpoint; details and artwork from Cinemeta (Stremio).",
      canonical: "https://www.imdb.com/",
    };
  }
}

export class ImdbSeriesProvider implements CatalogueProvider {
  id = "imdb-series";
  label = "IMDb";
  kind: ImdbKind = "series";

  capabilities = {
    anime: false,
    movies: false,
    series: true,
    games: false,
    books: false,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    return imdbSuggestionSearch("series", query, filters);
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const meta = await cinemetaMeta("series", providerId);
    if (!meta?.name) return null;
    return toMediaItem("series", providerId, meta.name, meta);
  }

  getAttribution() {
    return {
      name: "IMDb · Cinemeta",
      notice:
        "Series search via IMDb's public suggestion endpoint; details and artwork from Cinemeta (Stremio).",
      canonical: "https://www.imdb.com/",
    };
  }
}

/**
 * Cinemeta genre catalogue — real "top titles in genre X" pools used by
 * Discover. kind: "movie" | "series"; genreDisplay e.g. "Sci-Fi", "Drama".
 * NOTE: the genre must ride on the `top` catalogue as a filter
 * (`/catalog/{kind}/top/genre=X.json`). The bare `/catalog/{kind}/genre/X`
 * endpoint ignores the genre entirely (verified live: Drama/Comedy/Horror
 * all returned the same list), which silently made Discover genre-blind.
 */
const catalogCache = new TTLCache<MediaItem[]>(60 * 60_000);
const topCache = new TTLCache<MediaItem[]>(30 * 60_000);

export async function cinemetaCatalog(
  kind: ImdbKind,
  genreDisplay: string,
  limit = 24,
): Promise<MediaItem[]> {
  return cached(catalogCache, `${kind}|${genreDisplay}|${limit}`, async () => {
    const data = await fetchJson<{ metas?: CinemetaMeta[] }>(
      `${CINEMETA}/catalog/${kind}/top/genre=${encodeURIComponent(genreDisplay)}.json`,
    );
    const metas = data?.metas ?? [];
    return metas
      .filter((m) => m.imdb_id && m.name)
      .slice(0, limit)
      .map((m) =>
        toMediaItem(
          kind,
          m.imdb_id as string,
          m.name as string,
          m,
          m.year ? Number(String(m.year).slice(0, 4)) : undefined,
        ),
      );
  });
}

/**
 * Cinemeta all-time top-rated catalogue — a broad, high-quality Discover pool
 * independent of the user's genres (real community-ranked data).
 */
export async function cinemetaTop(kind: ImdbKind, limit = 24): Promise<MediaItem[]> {
  return cached(topCache, `${kind}|top|${limit}`, async () => {
    const data = await fetchJson<{ metas?: CinemetaMeta[] }>(
      `${CINEMETA}/catalog/${kind}/top.json`,
    );
    const metas = data?.metas ?? [];
    return metas
      .filter((m) => m.imdb_id && m.name)
      .slice(0, limit)
      .map((m) =>
        toMediaItem(
          kind,
          m.imdb_id as string,
          m.name as string,
          m,
          m.year ? Number(String(m.year).slice(0, 4)) : undefined,
        ),
      );
  });
}
