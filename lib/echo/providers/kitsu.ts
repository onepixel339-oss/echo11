/**
 * ECHO — Kitsu adapter (anime).
 *
 * Real source: Kitsu's public JSON:API (kitsu.io / kitsu.app). No key
 * required. Rich data: titles, categories (used as genres/tags), posters,
 * episode counts, age ratings, community ratings.
 * Attribution: "Data from Kitsu" with a link to the title's Kitsu page.
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import {
  fetchJson,
  normalizeGenre,
  slugifyText,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { GENRES, TAGS } from "../data/vocab";
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";

const API = "https://kitsu.io/api/edge";

interface KitsuPosterImage {
  tiny?: string;
  small?: string;
  medium?: string;
  large?: string;
  original?: string;
}

interface KitsuAttributes {
  titles?: Record<string, string | null>;
  canonicalTitle?: string;
  synopsis?: string | null;
  description?: string | null;
  subtype?: string; // TV | MOVIE | OVA | ONA | SPECIAL | MUSIC
  episodeCount?: number | null;
  episodeLength?: number | null;
  startDate?: string | null;
  ageRating?: string | null; // G | PG | R | R18
  ageRatingGuide?: string | null;
  averageRating?: string | null;
  nsfw?: boolean;
  posterImage?: KitsuPosterImage;
}

interface KitsuCategory {
  id: string;
  type: "categories";
  attributes: { title?: string; slug?: string };
}

interface KitsuResource {
  id: string;
  type: "anime";
  attributes: KitsuAttributes;
  relationships?: {
    categories?: { data?: { id: string; type: string }[] };
  };
}

interface KitsuPage {
  data: KitsuResource | KitsuResource[];
  included?: KitsuCategory[];
}

function pageResources(page: KitsuPage): KitsuResource[] {
  return Array.isArray(page.data) ? page.data : [page.data];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kitsu age ratings are coarse: G / PG / R / R18 → our display strings. */
function mapAgeRating(raw?: string | null): string | undefined {
  switch (raw) {
    case "G":
      return "G";
    case "PG":
      return "PG";
    case "R":
      return "PG-13"; // Kitsu "R" is teen-level (violence/profanity), not MPAA R
    case "R18":
      return "R18+";
    default:
      return undefined;
  }
}

/** Category titles → canonical genre/tag slugs (only vocabulary hits kept). */
function categoriesToFeatures(
  categories: KitsuCategory[] | undefined,
): { genres: string[]; tags: string[] } {
  const genres = new Set<string>();
  const tags = new Set<string>();
  for (const cat of categories ?? []) {
    const slug = slugifyText(cat.attributes.title ?? cat.attributes.slug ?? "");
    if (!slug) continue;
    const genre = normalizeGenre(slug);
    if (GENRES[genre]) genres.add(genre);
    else if (TAGS[slug]) tags.add(slug);
  }
  return { genres: [...genres], tags: [...tags] };
}

function toMediaItem(
  res: KitsuResource,
  categories: KitsuCategory[] | undefined,
): MediaItem {
  const a = res.attributes;
  const titles = a.titles ?? {};
  const title =
    titles.en || a.canonicalTitle || titles.en_jp || titles.ja_jp || "Untitled";
  const isFilm = a.subtype === "MOVIE";
  const feats = categoriesToFeatures(categories);
  const communityRating = a.averageRating ? Number(a.averageRating) : null;
  return stampCatalogProvenance({
    localId: `kitsu:${res.id}`,
    provider: "kitsu",
    providerId: res.id,
    canonicalUrl: `https://kitsu.app/anime/${res.id}`,
    mediaType: "anime" as MediaType,
    format: (isFilm ? "film" : "series") as MediaFormat,
    title,
    originalTitle:
      titles.en_jp && titles.en_jp !== title
        ? titles.en_jp
        : titles.ja_jp && titles.ja_jp !== title
          ? titles.ja_jp
          : undefined,
    synopsis: a.synopsis || a.description
      ? decodeEntities((a.synopsis ?? a.description ?? "").slice(0, 1200))
      : undefined,
    releaseYear: a.startDate ? Number(a.startDate.slice(0, 4)) : undefined,
    genres: feats.genres,
    tags: feats.tags.slice(0, 6),
    episodeCount: isFilm ? undefined : (a.episodeCount ?? undefined),
    publicScore: communityRating != null ? communityRating / 10 : undefined,
    // rating provenance: Kitsu reports a 0–100 community average string
    rating: communityRating != null ? { source: "kitsu", scale: "0-100", value: communityRating } : undefined,
    contentRating: a.nsfw ? "R18+" : mapAgeRating(a.ageRating),
    posterUrl: a.posterImage?.large ?? a.posterImage?.medium ?? a.posterImage?.original,
    countries: ["Japan"],
    sourceAttribution: "Data from Kitsu",
    metadataFetchedAt: new Date().toISOString(),
  });
}

/** Collect the included category resources referenced by one anime row. */
function categoriesOf(page: KitsuPage, res: KitsuResource): KitsuCategory[] | undefined {
  const refs = res.relationships?.categories?.data;
  if (!refs?.length || !page.included?.length) return undefined;
  const byId = new Map(page.included.map((c) => [c.id, c]));
  const out: KitsuCategory[] = [];
  for (const r of refs) {
    const c = byId.get(r.id);
    if (c) out.push(c);
  }
  return out.length ? out : undefined;
}

/** Our canonical genre slug → Kitsu category slug. */
const KITSU_CATEGORY: Record<string, string> = {
  "sci-fi": "science-fiction",
};

export class KitsuProvider implements CatalogueProvider {
  id = "kitsu";
  label = "Kitsu";

  capabilities = {
    anime: true,
    movies: false,
    series: false,
    games: false,
    books: false,
    contentRatings: true,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const limit = filters?.limit ?? 8;
    const page = await fetchJson<KitsuPage>(
      `${API}/anime?filter%5Btext%5D=${encodeURIComponent(q)}&include=categories&page%5Blimit%5D=${Math.min(20, limit * 2)}`,
    );
    return pageResources(page)
      .filter((r) => !r.attributes.nsfw && r.attributes.subtype !== "MUSIC")
      .slice(0, limit)
      .map((r) => ({
        item: toMediaItem(r, categoriesOf(page, r)),
        sourceLabel: "Kitsu",
      }));
  }

  /** Trending anime (real Kitsu trending endpoint) — extra Discover pool.
   *  Cached 15 min: identical for everyone. */
  private trendingCache = new TTLCache<MediaItem[]>(15 * 60_000);

  async trending(limit = 20): Promise<MediaItem[]> {
    return cached(this.trendingCache, `trending|${limit}`, async () => {
      const page = await fetchJson<KitsuPage>(
        `${API}/trending/anime?limit=${limit}&include=categories`,
      );
      return pageResources(page)
        .filter((r) => !r.attributes.nsfw && r.attributes.subtype !== "MUSIC")
        .map((r) => toMediaItem(r, categoriesOf(page, r)));
    });
  }

  /** Popular anime in given genres — Discover pool by taste.
   *  Cached 30 min: identical for every user with the same genres. */
  private genreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async byGenres(genres: string[], limit = 20, includeMature = false): Promise<MediaItem[]> {
    const cats = genres
      .slice(0, 2)
      .map((g) => KITSU_CATEGORY[g] ?? g)
      .filter(Boolean)
      .join(",");
    return cached(this.genreCache, `${cats}|${limit}|${includeMature}`, async () => {
      const page = await fetchJson<KitsuPage>(
        `${API}/anime?filter%5Bcategories%5D=${encodeURIComponent(cats)}&sort=-userCount&include=categories&page%5Blimit%5D=${limit}`,
      );
      return pageResources(page)
        .filter(
          (r) => (includeMature || (!r.attributes.nsfw && r.attributes.ageRating !== "R18")) && r.attributes.subtype !== "MUSIC",
        )
        .map((r) => toMediaItem(r, categoriesOf(page, r)));
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const page = await fetchJson<KitsuPage>(
      `${API}/anime/${encodeURIComponent(providerId)}?include=categories`,
    );
    const res = pageResources(page)[0];
    if (!res?.id) return null;
    return toMediaItem(res, categoriesOf(page, res));
  }

  getAttribution() {
    return {
      name: "Kitsu",
      notice: "Anime metadata and artwork from Kitsu's public JSON:API.",
      canonical: "https://kitsu.app/",
    };
  }
}
