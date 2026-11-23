/**
 * ECHO — RAWG adapter (games).
 *
 * RAWG (api.rawg.io) is the largest open games database. It REQUIRES an API
 * key. Per the Phase 1 provider policy:
 *   - NO key ships in client code (the previous built-in project key was
 *     removed — embedded credentials must never be exposed to clients).
 *   - A deployment may provide a key via NEXT_PUBLIC_RAWG_API_KEY. That
 *     variable is public-by-design; private credentials are never used here.
 *   - Without a configured key the provider reports "not configured" and
 *     games search/pools degrade gracefully (no silent substitution).
 *   - Commercial use of RAWG data remains OFF until its applicable terms
 *     are confirmed (see docs/DATA_PROVIDER_COMPLIANCE.md).
 *
 * Endpoints used:
 *  - search   /games?search=…            (name, year, poster, genres)
 *  - details  /games/{id}                (synopsis, developers, ESRB)
 *  - pools    /games?genres=…|tags=…&ordering=-added   (Discover shelves)
 *  - upcoming /games?dates=…&ordering=-added            (Coming-soon shelf)
 */

import type { MediaItem } from "../types";
import {
  fetchJson,
  normalizeGenre,
  ProviderError,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";
import type { ContentVisibility } from "../types";

const RAWG = "https://api.rawg.io/api";

/**
 * API key — environment-provided ONLY. Nothing is baked in: exposing a
 * shared/borrowed key in client code is forbidden by the provider policy.
 * NEXT_PUBLIC_RAWG_API_KEY is public-by-design (a deployment's own key);
 * private credentials are never read here.
 */
const rawgKey = (process.env.NEXT_PUBLIC_RAWG_API_KEY ?? "").trim();

export function rawgKeyConfigured(): boolean {
  return rawgKey.length > 0;
}

interface RawgRef {
  id: number;
  name: string;
  slug: string;
}

interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released?: string | null;
  background_image?: string | null;
  description_raw?: string;
  genres?: RawgRef[];
  tags?: RawgRef[];
  parent_platforms?: { platform: RawgRef }[];
  platforms?: { platform: RawgRef }[];
  developers?: RawgRef[];
  publishers?: RawgRef[];
  esrb_rating?: RawgRef | null;
  playtime?: number; // average hours to beat
  metacritic?: number | null;
  rating?: number | null; // RAWG community score 0–5
  ratings_count?: number | null; // votes behind that community score
  added?: number;
}

/** RAWG genre/tag slug → ECHO canonical slug (normalizeGenre handles the rest). */
const RAWG_GENRE_ALIASES: Record<string, string> = {
  "role-playing-games-rpg": "rpg",
  "massively-multiplayer": "mmo",
  "board-games": "board-games",
};

/** Parent-platform slug → tag slug (a real taste signal: "you play on PC"). */
const PLATFORM_TAGS: Record<string, string> = {
  pc: "pc",
  playstation: "playstation",
  xbox: "xbox",
  nintendo: "nintendo",
  ios: "mobile",
  android: "mobile",
  mac: "mac",
  linux: "linux",
  web: "browser",
};

function gameGenres(g: RawgGame): string[] {
  const out: string[] = [];
  for (const genre of g.genres ?? []) {
    const slug = RAWG_GENRE_ALIASES[genre.slug] ?? genre.slug;
    const canon = normalizeGenre(slug);
    if (!out.includes(canon)) out.push(canon);
  }
  return out.slice(0, 5);
}

function gameTags(g: RawgGame): string[] {
  const out: string[] = [];
  const platforms = g.parent_platforms?.map((p) => p.platform) ?? g.platforms?.map((p) => p.platform) ?? [];
  for (const p of platforms) {
    const tag = PLATFORM_TAGS[p.slug];
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 3);
}

function toMediaItem(g: RawgGame, withDetail?: Partial<RawgGame>): MediaItem {
  const merged = { ...g, ...withDetail };
  const communityRating = merged.rating ?? null;
  return {
    localId: `rawg:${g.id}`,
    provider: "rawg",
    providerId: String(g.id),
    canonicalUrl: `https://rawg.io/games/${g.slug}`,
    mediaType: "game",
    format: "game",
    title: g.name,
    synopsis: merged.description_raw?.slice(0, 1200),
    releaseDate: g.released ?? undefined,
    releaseYear: g.released ? Number(g.released.slice(0, 4)) : undefined,
    genres: gameGenres(merged),
    tags: gameTags(merged),
    studios: merged.developers?.slice(0, 3).map((d) => d.name),
    contentRating: merged.esrb_rating?.name,
    publicScore: communityRating
      ? communityRating * 2
      : merged.metacritic
        ? merged.metacritic / 10
        : undefined,
    rating: communityRating
      ? {
          source: "rawg",
          scale: "0-5",
          value: communityRating,
          voteCount: merged.ratings_count ?? undefined,
        }
      : merged.metacritic
        ? { source: "rawg-metacritic", scale: "0-100", value: merged.metacritic }
        : undefined,
    runtimeMinutes: merged.playtime ? merged.playtime * 60 : undefined, // avg hours → minutes
    posterUrl: g.background_image ?? undefined,
    backdropUrl: g.background_image ?? undefined,
    sourceAttribution: "Data from RAWG",
    metadataFetchedAt: new Date().toISOString(),
  };
}

function requireKey(): string {
  if (!rawgKey) throw new ProviderError("missing_key");
  return rawgKey;
}

function rawgUrl(path: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(`${RAWG}${path}`);
  u.searchParams.set("key", requireKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/** Enrich a game with its detail record (synopsis, developers, ESRB). Best effort. */
async function rawgDetail(id: number): Promise<Partial<RawgGame> | null> {
  try {
    const g = await fetchJson<RawgGame>(rawgUrl(`/games/${id}`, {}));
    return g ?? null;
  } catch {
    return null; // enrichment is optional — the list-level data is usable
  }
}

interface RawgListResponse {
  results?: RawgGame[];
}

/** Content-visibility gate for ESRB ratings (mirrors engine/recommend RATING_LEVEL).
 *  "safe" keeps family/teen only, "moderate" adds Mature (17+),
 *  "all" shows everything. Adults Only is hidden unless "all". */
function esrbAllowedByVisibility(esrb: string | undefined, visibility: ContentVisibility): boolean {
  if (visibility === "all") return true;
  if (!esrb) return true; // unrated games are mainstream catalogue titles
  if (esrb === "Adults Only") return false; // hidden unless "all"
  if (visibility === "safe" && esrb === "Mature") return false;
  return true;
}

/** Canonical genre slug → RAWG `genres=` param. */
const GENRE_TO_RAWG_GENRE: Record<string, string> = {
  action: "action",
  adventure: "adventure",
  sports: "sports",
  strategy: "strategy",
  simulation: "simulation",
  puzzle: "puzzle",
  racing: "racing",
  fighting: "fighting",
  family: "family",
  indie: "indie",
  rpg: "role-playing-games-rpg",
  shooter: "shooter",
  platformer: "platformer",
  casual: "casual",
  arcade: "arcade",
  card: "card",
  "board-games": "board-games",
  mmo: "massively-multiplayer",
};

/** Canonical genre slug → RAWG `tags=` param (thematic genres have no RAWG genre). */
const GENRE_TO_RAWG_TAG: Record<string, string> = {
  "sci-fi": "sci-fi",
  fantasy: "fantasy",
  horror: "horror",
  mystery: "mystery",
  war: "war",
  historical: "historical",
  comedy: "comedy",
  romance: "romance",
  supernatural: "supernatural",
  dystopia: "post-apocalyptic",
  "dark-fantasy": "dark-fantasy",
};

export class RawgProvider implements CatalogueProvider {
  id = "rawg";
  label = "RAWG";

  capabilities = {
    anime: false,
    movies: false,
    series: false,
    games: true,
    books: false,
    contentRatings: true, // ESRB
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return rawgKeyConfigured();
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const limit = filters?.limit ?? 8;
    const data = await fetchJson<RawgListResponse>(
      rawgUrl("/games", { search: q, page_size: Math.max(limit, 6), exclude_additions: "true" }),
      { signal: filters?.signal },
    );
    const results = data?.results ?? [];
    const top = results.slice(0, limit);
    // enrich the head with detail records (synopsis, developers, ESRB)
    const details = await Promise.all(top.slice(0, 4).map((g) => rawgDetail(g.id)));
    return top.map((g, i) => ({
      item: toMediaItem(g, details[i] ?? undefined),
      sourceLabel: "RAWG",
    }));
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const id = Number(providerId);
    if (!Number.isFinite(id)) return null;
    const g = await fetchJson<RawgGame>(rawgUrl(`/games/${id}`, {}));
    if (!g?.name) return null;
    return toMediaItem(g);
  }

  getAttribution() {
    return {
      name: "RAWG",
      notice:
        "Games data from RAWG (rawg.io). Requires a RAWG API key provided by the deployment (NEXT_PUBLIC_RAWG_API_KEY) — no key ships with the app. Commercial use pending terms confirmation.",
      canonical: "https://rawg.io/",
    };
  }
}

/**
 * Genre-anchored Discover pool: most-added games for a canonical genre slug,
 * via the RAWG `genres` param (mechanical genres) or `tags` param (thematic).
 * Cached 60 min — identical for everyone, protecting the key's monthly
 * quota. Cache TTL is additionally capped by the provider registry.
 */
const genreCache = new TTLCache<MediaItem[]>(60 * 60_000);

export async function rawgByGenre(
  genre: string,
  limit = 20,
  visibility: ContentVisibility = "moderate",
): Promise<MediaItem[]> {
  return cached(genreCache, `${genre}|${limit}|${visibility}`, async () => {
    const genreParam = GENRE_TO_RAWG_GENRE[genre];
    const tagParam = genreParam ? undefined : GENRE_TO_RAWG_TAG[genre];
    if (!genreParam && !tagParam) return [];
    const params: Record<string, string | number> = {
      ordering: "-added",
      page_size: limit,
      exclude_additions: "true",
    };
    if (genreParam) params.genres = genreParam;
    else params.tags = tagParam as string;
    const data = await fetchJson<RawgListResponse>(rawgUrl("/games", params));
    return (data?.results ?? [])
      .filter((g) => g.name && esrbAllowedByVisibility(g.esrb_rating?.name, visibility))
      .slice(0, limit)
      .map((g) => toMediaItem(g));
  });
}

/** Broad community pool — most-added games of all time (independent of taste). */
const topCache = new TTLCache<MediaItem[]>(30 * 60_000);

export async function rawgTop(
  limit = 20,
  visibility: ContentVisibility = "moderate",
): Promise<MediaItem[]> {
  return cached(topCache, `top|${limit}|${visibility}`, async () => {
    const data = await fetchJson<RawgListResponse>(
      rawgUrl("/games", { ordering: "-added", page_size: limit, exclude_additions: "true" }),
    );
    return (data?.results ?? [])
      .filter((g) => g.name && esrbAllowedByVisibility(g.esrb_rating?.name, visibility))
      .slice(0, limit)
      .map((g) => toMediaItem(g));
  });
}

/**
 * Coming-soon games: unreleased titles from today to +8 months, most-added
 * first (community anticipation). Cached 60 min — identical for everyone,
 * so one upstream call serves the whole shelf for an hour.
 */
const upcomingCache = new TTLCache<MediaItem[]>(60 * 60_000);

export async function rawgUpcoming(
  limit = 16,
  visibility: ContentVisibility = "moderate",
): Promise<MediaItem[]> {
  return cached(upcomingCache, `upcoming|${limit}|${visibility}`, async () => {
    const from = new Date();
    const to = new Date();
    to.setMonth(to.getMonth() + 8);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const data = await fetchJson<RawgListResponse>(
      rawgUrl("/games", {
        dates: `${fmt(from)},${fmt(to)}`,
        ordering: "-added",
        page_size: limit,
        exclude_additions: "true",
      }),
    );
    return (data?.results ?? [])
      .filter(
        (g) =>
          g.name &&
          g.released &&
          g.released > fmt(from) && // strictly upcoming: not released yet
          esrbAllowedByVisibility(g.esrb_rating?.name, visibility),
      )
      .slice(0, limit)
      .map((g) => toMediaItem(g));
  });
}
