/**
 * ECHO — AniList adapter (anime + manga).
 *
 * Real source: AniList's public GraphQL API (graphql.anilist.co).
 * No key required. Rich data: genres, community tags (great similarity
 * features), studios/authors, scores, cover art.
 * Attribution: "Data from AniList" with a link to the title's AniList page.
 *
 * Manga (v3): AniList indexes 100k+ manga entries, including manhwa and
 * manhua (countryOfOrigin distinguishes them) and one-shots. Light novels
 * (format NOVEL) are excluded from manga results — they are books and are
 * served by the book sources, never conflated with manga.
 */

import type { MediaFormat, MediaItem, MediaType, PublicationStatus } from "../types";
import { formatForType } from "../types";
import {
  ProviderError,
  fetchJson,
  normalizeGenre,
  parseRetryAfterMs,
  slugifyText,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";

const API = "https://graphql.anilist.co";

interface AniListMedia {
  id: number;
  idMal?: number | null;
  title: { romaji?: string; english?: string; native?: string };
  genres?: string[];
  tags?: { name: string; rank: number; isGeneralSpoiler?: boolean }[];
  isAdult?: boolean;
  averageScore?: number;
  episodes?: number;
  volumes?: number | null; // manga (v3)
  chapters?: number | null; // manga (v3)
  status?: string | null; // manga publishing status (v3)
  staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] }; // manga authors (v3)
  format?: string;
  startDate?: { year?: number };
  coverImage?: { large?: string; extraLarge?: string };
  siteUrl?: string;
  studios?: { nodes?: { name: string }[] };
  description?: string | null;
  countryOfOrigin?: string;
}

interface GqlPage {
  data?: { Page?: { media: AniListMedia[] } };
  errors?: { message: string }[];
}

async function anilistQuery(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<AniListMedia[]> {
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    // cancellation propagates as-is (the engine ignores aborted results)
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ProviderError("network");
  }
  if (res.status === 429) {
    throw new ProviderError(
      "rate_limited",
      undefined,
      parseRetryAfterMs(res.headers.get("Retry-After") ?? res.headers.get("retry-after")),
    );
  }
  if (res.status >= 500) throw new ProviderError("unavailable");
  let body: GqlPage;
  try {
    body = (await res.json()) as GqlPage;
  } catch {
    throw new ProviderError("invalid_response");
  }
  if (body.errors?.length) throw new ProviderError("invalid_response");
  return body.data?.Page?.media ?? [];
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function toMediaItem(m: AniListMedia): MediaItem {
  const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
  const isFilm = m.format === "MOVIE";
  const tags = (m.tags ?? [])
    .filter((t) => t.rank >= 75 && !t.isGeneralSpoiler)
    .slice(0, 8)
    .map((t) => slugifyText(t.name))
    .filter(Boolean);
  return stampCatalogProvenance({
    localId: `anilist:${m.id}`,
    provider: "anilist",
    providerId: String(m.id),
    canonicalUrl: m.siteUrl,
    mediaType: "anime" as MediaType,
    format: (isFilm ? "film" : "series") as MediaFormat,
    title,
    originalTitle: m.title.romaji !== title ? m.title.romaji : m.title.native,
    synopsis: m.description ? stripMarkdown(m.description).slice(0, 1200) : undefined,
    releaseYear: m.startDate?.year,
    genres: (m.genres ?? []).map(normalizeGenre),
    tags,
    studios: m.studios?.nodes?.map((s) => s.name).slice(0, 3),
    episodeCount: isFilm ? undefined : m.episodes,
    publicScore: m.averageScore ? m.averageScore / 10 : undefined, // AniList is 0–100
    // rating provenance: AniList reports a 0–100 community average
    rating: m.averageScore
      ? { source: "anilist", scale: "0-100", value: m.averageScore }
      : undefined,
    contentRating: m.isAdult ? "18+" : undefined,
    posterUrl: m.coverImage?.extraLarge ?? m.coverImage?.large,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : undefined,
    sourceAttribution: "Data from AniList",
    metadataFetchedAt: new Date().toISOString(),
    // cross-provider identity: the MyAnimeList id, when AniList exposes it
    externalIds: m.idMal ? { mal: String(m.idMal) } : undefined,
  });
}

/** Manga subtype from country of origin + format (AniList groups manga,
 *  manhwa and manhua under media type MANGA). */
function mangaSubtypeOf(m: AniListMedia): string | undefined {
  if (m.format === "ONE_SHOT") return "one-shot";
  if (m.countryOfOrigin === "KR") return "manhwa";
  if (m.countryOfOrigin === "CN" || m.countryOfOrigin === "TW") return "manhua";
  return "manga";
}

/** AniList publishing status → ECHO publicationStatus. */
function publicationStatusOf(m: AniListMedia): PublicationStatus | undefined {
  switch (m.status) {
    case "RELEASING":
      return "ongoing";
    case "FINISHED":
      return "completed";
    case "HIATUS":
      return "hiatus";
    case "CANCELLED":
      return "cancelled";
    case "NOT_YET_RELEASED":
      return "upcoming";
    default:
      return undefined;
  }
}

/** Author credits for manga: Story & Art roles from the staff connection. */
function mangaAuthors(m: AniListMedia): string[] | undefined {
  const names = (m.staff?.edges ?? [])
    .filter((e) => /story|art|original story|script/i.test(e.role ?? ""))
    .map((e) => e.node?.name?.full)
    .filter((n): n is string => Boolean(n));
  const unique = [...new Set(names)].slice(0, 3);
  return unique.length ? unique : undefined;
}

function toMangaItem(m: AniListMedia): MediaItem {
  const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
  const tags = (m.tags ?? [])
    .filter((t) => t.rank >= 75 && !t.isGeneralSpoiler)
    .slice(0, 8)
    .map((t) => slugifyText(t.name))
    .filter(Boolean);
  return stampCatalogProvenance({
    localId: `anilist-manga:${m.id}`,
    provider: "anilist",
    providerId: String(m.id),
    canonicalUrl: m.siteUrl,
    mediaType: "manga" as MediaType,
    format: formatForType("manga"),
    subtype: mangaSubtypeOf(m),
    title,
    originalTitle: m.title.romaji !== title ? m.title.romaji : m.title.native,
    synopsis: m.description ? stripMarkdown(m.description).slice(0, 1200) : undefined,
    releaseYear: m.startDate?.year,
    genres: (m.genres ?? []).map(normalizeGenre),
    tags,
    creators: mangaAuthors(m),
    publicationStatus: publicationStatusOf(m),
    volumeCount: m.volumes ?? undefined,
    chapterCount: m.chapters ?? undefined,
    publicScore: m.averageScore ? m.averageScore / 10 : undefined,
    rating: m.averageScore
      ? { source: "anilist", scale: "0-100", value: m.averageScore }
      : undefined,
    contentRating: m.isAdult ? "18+" : undefined,
    posterUrl: m.coverImage?.extraLarge ?? m.coverImage?.large,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : undefined,
    sourceAttribution: "Data from AniList",
    metadataFetchedAt: new Date().toISOString(),
    externalIds: {
      ...(m.idMal ? { mal: String(m.idMal) } : {}),
      anilist: String(m.id),
    },
  });
}

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  genres
  tags { name rank isGeneralSpoiler }
  isAdult
  averageScore
  episodes
  format
  startDate { year }
  coverImage { large extraLarge }
  siteUrl
  studios(isMain: true) { nodes { name } }
  description(asHtml: false)
  countryOfOrigin
`;

/** Manga fields (v3) — volumes/chapters/status + author credits. */
const MANGA_FIELDS = `
  id
  idMal
  title { romaji english native }
  genres
  tags { name rank isGeneralSpoiler }
  isAdult
  averageScore
  volumes
  chapters
  status
  format
  startDate { year }
  coverImage { large extraLarge }
  siteUrl
  staff { edges { role node { name { full } } } }
  description(asHtml: false)
  countryOfOrigin
`;

export class AniListProvider implements CatalogueProvider {
  id = "anilist";
  label = "AniList";

  capabilities = {
    anime: true,
    movies: false,
    series: false,
    games: false,
    books: false,
    manga: true, // v3: AniList's MANGA media (manga/manhwa/manhua/one-shots)
    comics: false,
    contentRatings: true,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const media = await anilistQuery(
      `query ($s: String, $n: Int) {
        Page(perPage: $n) {
          media(search: $s, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { s: query, n: Math.min(20, (filters?.limit ?? 8) * 2) },
      filters?.signal,
    );
    return media
      .filter((m) => !m.isAdult)
      .slice(0, filters?.limit ?? 8)
      .map((item) => ({ item: toMediaItem(item), sourceLabel: "AniList" }));
  }

  /** Trending/popular anime — used to build a real candidate pool for Discover.
   *  Cached 30 min: identical for every user with the same genres. */
  private genreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async byGenres(genres: string[], limit = 24, includeMature = false): Promise<MediaItem[]> {
    const display = genres.slice(0, 3);
    return cached(this.genreCache, `${display.join(",")}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($g: [String], $n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(genre_in: $g, type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { g: display, n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map(toMediaItem);
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const media = await anilistQuery(
      `query ($id: Int) {
        Page(perPage: 1) { media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }
      }`,
      { id: Number(providerId) },
    );
    return media[0] ? toMediaItem(media[0]) : null;
  }

  // ---- manga (v3) -------------------------------------------------------

  /** Manga search — media type MANGA, light novels (format NOVEL) excluded:
   *  they are books and are served by the book sources, never conflated. */
  async searchManga(query: string, limit = 8): Promise<MediaItem[]> {
    const media = await anilistQuery(
      `query ($s: String, $n: Int) {
        Page(perPage: $n) {
          media(search: $s, type: MANGA, format_not_in: NOVEL, sort: SEARCH_MATCH, isAdult: false) { ${MANGA_FIELDS} }
        }
      }`,
      { s: query, n: Math.min(20, limit * 2) },
    );
    return media
      .filter((m) => !m.isAdult)
      .slice(0, limit)
      .map(toMangaItem);
  }

  /** Manga genre pool for Discover (cached 30 min, like the anime pool). */
  private mangaGenreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async mangaByGenres(genres: string[], limit = 24, includeMature = false): Promise<MediaItem[]> {
    const display = genres.slice(0, 3);
    return cached(this.mangaGenreCache, `${display.join(",")}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($g: [String], $n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(genre_in: $g, type: MANGA, format_not_in: NOVEL, sort: POPULARITY_DESC, isAdult: $adult) { ${MANGA_FIELDS} }
          }
        }`,
        { g: display, n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map(toMangaItem);
    });
  }

  /** Manga publishing RIGHT NOW (status RELEASING, trending first) — the
   *  live "publishing now" shelf. Cached 30 min. */
  private mangaPublishingCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async mangaPublishingNow(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.mangaPublishingCache, `publishing|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(status: RELEASING, type: MANGA, format_not_in: NOVEL, sort: TRENDING_DESC, isAdult: $adult) {
              ${MANGA_FIELDS}
            }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map(toMangaItem);
    });
  }

  /** Manga details by AniList id. */
  async getMangaTitle(providerId: string): Promise<MediaItem | null> {
    const media = await anilistQuery(
      `query ($id: Int) {
        Page(perPage: 1) { media(id: $id, type: MANGA) { ${MANGA_FIELDS} } }
      }`,
      { id: Number(providerId) },
    );
    return media[0] ? toMangaItem(media[0]) : null;
  }

  /** Anime airing RIGHT NOW (status RELEASING, trending first) — the live
   *  "currently airing" shelf. Cached 30 min: identical for every user. */
  private airingCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async airingNow(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.airingCache, `airing|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(status: RELEASING, type: ANIME, sort: TRENDING_DESC, isAdult: $adult) {
              ${MEDIA_FIELDS}
              nextAiringEpisode { episode airingAt }
            }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map(toMediaItem);
    });
  }

  getAttribution() {
    return {
      name: "AniList",
      notice: "Anime metadata and artwork from AniList's public API.",
      canonical: "https://anilist.co/",
    };
  }
}
