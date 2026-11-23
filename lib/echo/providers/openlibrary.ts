/**
 * ECHO — Open Library adapter (books).
 *
 * Open Library (openlibrary.org) is the Internet Archive's open catalogue —
 * fully keyless, CORS-enabled, attributed. Everything works out of the box:
 *  - search     /search.json?q=…          (title, authors, year, cover, subjects)
 *  - details    /works/{key}.json         (description, authors, subjects)
 *  - shelves    /subjects/{slug}.json     (most-read books in a subject)
 *  - trending   /trending/weekly.json     (what the world is reading now)
 */

import type { MediaItem } from "../types";
import {
  fetchJson,
  normalizeGenre,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";

const OL = "https://openlibrary.org";
const COVERS = "https://covers.openlibrary.org/b/id";

/** MARC-style cataloguing noise that carries no taste signal. */
const JUNK_SUBJECTS = new Set([
  "accessible book",
  "protected daisy",
  "in library",
  "large type",
  "internet archive wishlist",
  "overdrive",
  "lending library",
  "internet archive",
  "open library staff picks",
  "juvenile fiction",
  "juvenile literature",
  "fiction in english",
  "stories in english",
  "american literature",
  "english literature",
  "long now manual for civilization",
  "nyt bestseller",
  "new york times bestseller",
  "reading level",
]);

/** Subject fragments that mark cataloguing noise (awards, bestseller lists…). */
const JUNK_FRAGMENTS = [
  "award",
  "bestseller",
  "new york times",
  "nyt:",
  "pulitzer",
  "reading level",
  "protected daisy",
  "large type",
];

/** Nationality-prefixed subjects are cataloguing categories, not taste. */
const JUNK_NATIONALITIES = [
  "american", "british", "english", "french", "german", "russian", "japanese",
  "chinese", "italian", "spanish", "soviet", "canadian", "australian", "indian",
  "egyptian", "arabic", "african", "european", "modern",
];

function isJunkSubject(s: string): boolean {
  if (!s || s.length > 40) return true;
  // cataloguing strings: "Fiction, science fiction, general", "nyt:…", "award:…"
  if (/[,:(]/.test(s)) return true;
  if (/\d/.test(s)) return true;
  if (JUNK_SUBJECTS.has(s)) return true;
  for (const frag of JUNK_FRAGMENTS) if (s.includes(frag)) return true;
  for (const nat of JUNK_NATIONALITIES) if (s.startsWith(`${nat} `)) return true;
  return false;
}

/** Open Library subject → ECHO canonical slug (after slugification). */
const SUBJECT_ALIASES: Record<string, string> = {
  "science-fiction": "sci-fi",
  "science-fiction-general": "sci-fi",
  "historical-fiction": "historical",
  history: "historical",
  "detective-stories": "mystery",
  detective: "mystery",
  "mystery-and-detective-stories": "mystery",
  "mystery-fiction": "mystery",
  suspense: "thriller",
  thrillers: "thriller",
  "love-stories": "romance",
  "romantic-fiction": "romance",
  "horror-tales": "horror",
  "horror-fiction": "horror",
  "short-stories": "short-stories",
  "short-fiction": "short-stories",
  autobiography: "biography",
  memoirs: "biography",
  "biography-autobiography": "biography",
  humor: "comedy",
  westerns: "western",
  "adventure-stories": "adventure",
  "adventure-and-adventurers": "adventure",
  "dystopian-fiction": "dystopia",
  paranormal: "supernatural",
  "fantasy-fiction": "fantasy",
  "magic-fiction": "fantasy",
  "american-fiction": "fiction",
  "popular-fiction": "fiction",
  nonfiction: "non-fiction",
  "non-fiction": "non-fiction",
  "self-help": "self-help",
  "personal-growth": "self-help",
};

interface OlDoc {
  key: string; // "/works/OL893414W"
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  cover_id?: number; // subjects endpoint uses this name
  subject?: string[];
  language?: string[];
}

interface OlWork {
  title?: string;
  description?: string | { value?: string; type?: string };
  authors?: { author: { key: string } }[];
  subjects?: string[];
  first_publish_date?: string;
}

/** Canonical genre slug → Open Library subject path (Discover shelves). */
const GENRE_TO_SUBJECT: Record<string, string> = {
  fantasy: "fantasy",
  "sci-fi": "science_fiction",
  mystery: "mystery",
  romance: "romance",
  horror: "horror",
  thriller: "thrillers",
  historical: "historical_fiction",
  biography: "biography",
  poetry: "poetry",
  adventure: "adventure",
  war: "war",
  comedy: "humor",
  western: "westerns",
  "dark-fantasy": "dark_fantasy",
  classics: "classics",
  "non-fiction": "history",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert messy Open Library subjects into clean canonical genre slugs. */
export function subjectsToGenres(subjects: string[] | undefined, max = 4): string[] {
  if (!subjects?.length) return [];
  const out: string[] = [];
  for (const raw of subjects) {
    const s = raw.trim().toLowerCase();
    if (isJunkSubject(s)) continue;
    const slug = slugify(raw);
    const canon = normalizeGenre(SUBJECT_ALIASES[slug] ?? slug);
    if (!canon || canon.length < 2) continue;
    if (!out.includes(canon)) out.push(canon);
    if (out.length >= max) break;
  }
  return out;
}

function workId(key: string): string {
  return key.replace(/^\/works\//, "");
}

function coverUrl(doc: { cover_i?: number; cover_id?: number }): string | undefined {
  const id = doc.cover_i ?? doc.cover_id;
  return id ? `${COVERS}/${id}-L.jpg` : undefined;
}

function toMediaItem(doc: OlDoc, genres?: string[]): MediaItem {
  const id = workId(doc.key);
  const year = doc.first_publish_year;
  return stampCatalogProvenance({
    localId: `openlib:${id}`,
    provider: "openlib",
    providerId: id,
    canonicalUrl: `https://openlibrary.org/works/${id}`,
    mediaType: "book",
    format: "book",
    title: doc.title,
    creators: doc.author_name?.slice(0, 3),
    releaseYear: year && year > 1400 && year <= new Date().getFullYear() + 1 ? year : undefined,
    genres: genres ?? subjectsToGenres(doc.subject),
    tags: [],
    languages: doc.language?.slice(0, 3),
    posterUrl: coverUrl(doc),
    sourceAttribution: "Data from Open Library",
    metadataFetchedAt: new Date().toISOString(),
    // Open Library exposes no community rating — no rating provenance here
  });
}

interface OlSearchResponse {
  docs?: OlDoc[];
}

export class OpenLibraryProvider implements CatalogueProvider {
  id = "openlib";
  label = "Open Library";

  capabilities = {
    anime: false,
    movies: false,
    series: false,
    games: false,
    books: true,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true; // keyless
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const limit = filters?.limit ?? 8;
    const data = await fetchJson<OlSearchResponse>(
      `${OL}/search.json?q=${encodeURIComponent(q)}&limit=${limit}` +
        `&fields=key,title,author_name,first_publish_year,cover_i,subject,language`,
      { signal: filters?.signal },
    );
    // keep only work records with a real title
    const docs = (data?.docs ?? []).filter((d) => d.key?.startsWith("/works/") && d.title);
    return docs.slice(0, limit).map((d) => ({ item: toMediaItem(d), sourceLabel: "Open Library" }));
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const work = await fetchJson<OlWork>(`${OL}/works/${encodeURIComponent(providerId)}.json`);
    if (!work?.title) return null;
    // resolve /authors/OL…A keys into display names (best effort, parallel)
    const authorKeys = (work.authors ?? []).slice(0, 3).map((a) => a.author.key);
    const authors = await Promise.all(
      authorKeys.map(async (k) => {
        try {
          const a = await fetchJson<{ name?: string }>(`${OL}${k}.json`);
          return a?.name;
        } catch {
          return undefined;
        }
      }),
    );
    const authorNames = authors.filter((n): n is string => Boolean(n));
    const yearMatch = work.first_publish_date?.match(/(\d{4})/);
    const doc: OlDoc = {
      key: `/works/${providerId}`,
      title: work.title,
      author_name: authorNames.length ? authorNames : undefined,
      first_publish_year: yearMatch ? Number(yearMatch[1]) : undefined,
      subject: work.subjects,
    };
    const item = toMediaItem(doc);
    // works endpoint has no cover id — carry a search-level cover if available
    if (!item.posterUrl) {
      try {
        const found = await this.searchCover(providerId);
        if (found) item.posterUrl = found;
      } catch {
        /* generated artwork fallback kicks in */
      }
    }
    const desc =
      typeof work.description === "string" ? work.description : work.description?.value;
    if (desc) item.synopsis = desc.slice(0, 1200);
    return item;
  }

  /** Lightest way to find a cover for a known work id. */
  private async searchCover(providerId: string): Promise<string | undefined> {
    try {
      const data = await fetchJson<OlSearchResponse>(
        `${OL}/search.json?q=key:/works/${providerId}&limit=1&fields=key,cover_i`,
      );
      const doc = data?.docs?.[0];
      return doc ? coverUrl(doc) : undefined;
    } catch {
      return undefined;
    }
  }

  getAttribution() {
    return {
      name: "Open Library",
      notice:
        "Books data from Open Library (openlibrary.org), the Internet Archive's open catalogue. Free and keyless.",
      canonical: "https://openlibrary.org/",
    };
  }
}

interface OlSubjectResponse {
  works?: (OlDoc & { authors?: { key: string; name: string }[] })[];
}

interface OlTrendingResponse {
  works?: (OlDoc & { author_name?: string[] })[];
}

const subjectCache = new TTLCache<MediaItem[]>(60 * 60_000);
const trendingCache = new TTLCache<MediaItem[]>(15 * 60_000);

/** Subject shelf — the most-read books in a canonical genre (Discover pool).
 *  Cached 60 min: the shelf is identical for every user with that genre. */
export async function openLibrarySubject(genre: string, limit = 20): Promise<MediaItem[]> {
  return cached(subjectCache, `${genre}|${limit}`, async () => {
    const subject = GENRE_TO_SUBJECT[genre];
    if (!subject) return [];
    const data = await fetchJson<OlSubjectResponse>(
      `${OL}/subjects/${encodeURIComponent(subject)}.json?limit=${limit}&details=false`,
    );
    return (data?.works ?? [])
      .filter((w) => w.key?.startsWith("/works/") && w.title)
      .slice(0, limit)
      .map((w) =>
        toMediaItem({
          ...w,
          author_name: w.author_name ?? w.authors?.map((a) => a.name),
        }),
      );
  });
}

/** What the world is reading this week — a broad, community-ranked pool. */
export async function openLibraryTrending(limit = 20): Promise<MediaItem[]> {
  return cached(trendingCache, `trending|${limit}`, async () => {
    const data = await fetchJson<OlTrendingResponse>(`${OL}/trending/weekly.json?limit=${limit}`);
    return (data?.works ?? [])
      .filter((w) => w.key?.startsWith("/works/") && w.title)
      .slice(0, limit)
      .map((w) => toMediaItem(w));
  });
}

/**
 * Arabic-literature shelf for Arabic-interface users — real Arabic editions
 * and translations from the arabic_fiction subject (10k+ works on Open
 * Library, includes Naguib Mahfouz, Gibran, and translations). Cached like
 * the other subject shelves (60 min).
 */
const arabicShelfCache = new TTLCache<MediaItem[]>(60 * 60_000);

export async function openLibraryArabicShelf(limit = 16): Promise<MediaItem[]> {
  return cached(arabicShelfCache, `arabic|${limit}`, async () => {
    const data = await fetchJson<OlSubjectResponse>(
      `${OL}/subjects/arabic_fiction.json?limit=${limit}&details=false`,
    );
    return (data?.works ?? [])
      .filter((w) => w.key?.startsWith("/works/") && w.title)
      .slice(0, limit)
      .map((w) =>
        toMediaItem({
          ...w,
          author_name: w.author_name ?? w.authors?.map((a) => a.name),
        }),
      );
  });
}
