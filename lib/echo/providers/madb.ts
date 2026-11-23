/**
 * ECHO — MADB adapter (Media Arts Database, Japan) — manga + anime.
 *
 * Real source: the official MADB SPARQL Query Service
 * https://mediaarts-db.artmuseums.go.jp/sparql (browser-direct, CORS `*`,
 * x-ratelimit headers observed at 300 requests per window).
 *
 * LICENSING (verified 2026-11-23, https://mediaarts-db.artmuseums.go.jp/about?locale=en):
 *  - The trial Web API was replaced by the SPARQL Query Service at the
 *    official-version release; SPARQL is the sanctioned query interface.
 *  - "The handling of the data acquired through the SPARQL Query Service is
 *    subject to the Terms of Use of the website."
 *  - Linking policy: free, but the linking page must clearly state it links
 *    to the Media Arts Database and links must open as a new window.
 *  - No bulk downloads; interactive, attributed use only.
 *
 * Data model (verified live 2026-11-23):
 *  - MangaBookSeries      → ECHO manga, series level (volumeCount available)
 *  - AnimationTVRegularSeries / AnimationMovie(Series) → ECHO anime
 *  - rdfs:label is the original Japanese title; schema:name carries a kana
 *    reading AND a romanized/English title (used as alternative titles).
 *  - AnimationTVProgram (individual broadcasts) and MangaBook (single
 *    volumes) are deliberately NOT searched — ECHO works at series level.
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
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";
import { providerCacheTtlMs } from "./registry";

const ENDPOINT = "https://mediaarts-db.artmuseums.go.jp/sparql";
const CLASS_BASE = "https://mediaarts-db.artmuseums.go.jp/data/class#";

/** MADB class → ECHO type + subtype (only series-level classes are searched). */
const MANGA_CLASSES: { cls: string; subtype?: string }[] = [
  { cls: "MangaBookSeries", subtype: "manga-series" },
];
const ANIME_CLASSES: { cls: string; subtype?: string }[] = [
  { cls: "AnimationTVRegularSeries" },
  { cls: "AnimationMovie", subtype: "anime-movie" },
  { cls: "AnimationMovieSeries", subtype: "anime-movie" },
];

function classesForTypes(types: MediaType[]): { cls: string; subtype?: string }[] {
  const out: { cls: string; subtype?: string }[] = [];
  if (types.includes("manga")) out.push(...MANGA_CLASSES);
  if (types.includes("anime")) out.push(...ANIME_CLASSES);
  return out;
}

/** Escape a user string for use inside a SPARQL string literal. */
function sparqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Names carried on MADB records: original label + kana reading + romanized. */
function splitNames(label: string, names: string[]): { romaji?: string; kana?: string } {
  const uniq = [...new Set(names)].filter((n) => n && n !== label);
  let romaji: string | undefined;
  let kana: string | undefined;
  for (const n of uniq) {
    // kana reading: katakana/hiragana heavy
    if (!kana && /^[\u3040-\u30ff\s\u30fc]+$/.test(n)) kana = n;
    // romanized/English: latin letters
    else if (!romaji && /[A-Za-z]{3}/.test(n)) romaji = n;
  }
  return { romaji, kana };
}

/** "[著]諌山創" → "諌山創" (creator credit prefixes are display metadata). */
function cleanCreator(raw: string): string | undefined {
  const cleaned = raw.replace(/^\[[^\]]*\]/, "").trim();
  return cleaned || undefined;
}

interface MadbBinding {
  s?: { value: string };
  label?: { value: string };
  names?: { value: string };
  creators?: { value: string };
  date?: { value: string };
  publisher?: { value: string };
  lang?: { value: string };
  items?: { value: string };
  classuri?: { value: string };
}

/** Build the SPARQL search (one request covers every requested type). */
export function buildMadbSparql(query: string, classes: { cls: string; subtype?: string }[], limit: number): string {
  const q = sparqlEscape(query.trim());
  const classIris = classes.map((c) => `<${CLASS_BASE}${c.cls}>`).join(" ");
  return `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>
SELECT ?s ?label ?classuri
  (GROUP_CONCAT(DISTINCT ?name; separator="|") AS ?names)
  (GROUP_CONCAT(DISTINCT ?creator; separator="|") AS ?creators)
  (MAX(?pubDate) AS ?date)
  (MAX(?publisherLit) AS ?publisher)
  (MAX(?langVal) AS ?lang)
  (MAX(?itemsVal) AS ?items)
WHERE {
  ?s rdfs:label ?label ; a ?classuri .
  VALUES ?classuri { ${classIris} }
  OPTIONAL { ?s schema:name ?name }
  OPTIONAL { ?s schema:creator ?creator }
  OPTIONAL { ?s schema:datePublished ?pubDate }
  OPTIONAL { ?s schema:publisher ?publisherLit . FILTER(isLiteral(?publisherLit)) }
  OPTIONAL { ?s schema:inLanguage ?langVal }
  OPTIONAL { ?s schema:numberOfItems ?itemsVal }
  FILTER(
    CONTAINS(?label, "${q}") ||
    EXISTS { ?s schema:name ?nameMatch . FILTER(CONTAINS(LCASE(STR(?nameMatch)), LCASE("${q}"))) }
  )
}
GROUP BY ?s ?label ?classuri
ORDER BY STRLEN(?label)
LIMIT ${Math.min(50, Math.max(1, limit * 3))}`;
}

/** Map one SPARQL binding row → a normalized MediaItem (null when unusable). */
export function madbRowToItem(row: MadbBinding, subtypeOf: Record<string, string | undefined>): MediaItem | null {
  const uri = row.s?.value;
  const label = row.label?.value;
  if (!uri || !label) return null;
  const id = uri.split("/id/")[1];
  if (!id) return null;
  const classShort = (row.classuri?.value ?? "").split("#")[1] ?? "";
  const isManga = classShort.startsWith("Manga");
  const mediaType: MediaType = isManga ? "manga" : "anime";
  const subtype = subtypeOf[classShort];
  const names = (row.names?.value ?? "").split("|").filter(Boolean);
  const { romaji } = splitNames(label, names);
  const creators = (row.creators?.value ?? "")
    .split("|")
    .map((c) => cleanCreator(c))
    .filter((c): c is string => Boolean(c))
    .slice(0, 3);
  const publisherRaw = row.publisher?.value;
  const publisher = publisherRaw ? publisherRaw.split("∥")[0].trim() : undefined;
  const year = row.date?.value ? Number(row.date.value.substring(0, 4)) : undefined;
  const volumeCount = row.items?.value ? Number(row.items.value) : undefined;
  const lang = row.lang?.value;

  return stampCatalogProvenance({
    localId: `madb:${id}`,
    provider: "madb",
    providerId: id,
    canonicalUrl: `https://mediaarts-db.artmuseums.go.jp/id/${id}`,
    mediaType,
    format: formatForType(mediaType) as MediaFormat,
    subtype,
    title: romaji ?? label, // romanized/English title when available, original otherwise
    originalTitle: label,
    altTitles: names.filter((n) => n && n !== label && n !== romaji).slice(0, 4),
    releaseYear: year && Number.isFinite(year) && year > 1900 && year < 2200 ? year : undefined,
    creators: creators.length ? creators : undefined,
    studios: publisher ? [publisher] : undefined, // publisher of the manga run
    languages: lang ? [lang] : undefined,
    volumeCount: volumeCount && Number.isFinite(volumeCount) ? volumeCount : undefined,
    genres: [],
    tags: [],
    sourceAttribution: "Data from the Media Arts Database (メディア芸術データベース)",
    metadataFetchedAt: new Date().toISOString(),
    externalIds: { madb: id },
  });
}

export class MadbProvider implements CatalogueProvider {
  id = "madb";
  label = "MADB";

  capabilities = {
    anime: true,
    movies: false,
    series: false,
    games: false,
    books: false,
    manga: true,
    comics: false,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  /** Per-query result cache (registry-capped TTL). */
  private searchCache = new TTLCache<ProviderSearchResult[]>(
    Math.min(30 * 60_000, providerCacheTtlMs("madb") || 30 * 60_000),
  );

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const types = (filters?.mediaTypes ?? []).filter((t) => t === "manga" || t === "anime");
    if (!types.length) return [];
    const limit = filters?.limit ?? 8;
    const classes = classesForTypes(types);
    const key = `${q}|${types.slice().sort().join(",")}|${limit}`;
    return cached(this.searchCache, key, async () => {
      const sparql = buildMadbSparql(q, classes, limit);
      let data: { results?: { bindings?: MadbBinding[] } };
      try {
        const res = await fetch(`${ENDPOINT}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/sparql-results+json",
          },
          body: new URLSearchParams({ query: sparql }).toString(),
          signal: filters?.signal ?? AbortSignal.timeout(12_000),
        });
        if (res.status === 429) throw new ProviderError("rate_limited");
        if (!res.ok) throw new ProviderError("unavailable");
        data = (await res.json()) as { results?: { bindings?: MadbBinding[] } };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError("network");
      }
      const subtypeOf: Record<string, string | undefined> = {};
      for (const c of classes) subtypeOf[c.cls] = c.subtype;
      const rows = data.results?.bindings ?? [];
      // series-level first, then trim to the requested limit
      const items = rows
        .map((r) => madbRowToItem(r, subtypeOf))
        .filter((m): m is MediaItem => Boolean(m))
        .slice(0, limit);
      return items.map((item) => ({ item, sourceLabel: "MADB" }));
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    // details refresh: fetch the single record by identifier
    const isMangaId = /^C\d+$/.test(providerId) || /^M\d+$/.test(providerId);
    if (!/^[CM]\d+$/.test(providerId) && !isMangaId) return null;
    const sparql = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>
SELECT ?s ?label ?classuri
  (GROUP_CONCAT(DISTINCT ?name; separator="|") AS ?names)
  (GROUP_CONCAT(DISTINCT ?creator; separator="|") AS ?creators)
  (MAX(?pubDate) AS ?date)
  (MAX(?publisherLit) AS ?publisher)
  (MAX(?langVal) AS ?lang)
  (MAX(?itemsVal) AS ?items)
WHERE {
  <https://mediaarts-db.artmuseums.go.jp/id/${providerId}> rdfs:label ?label ; a ?classuri .
  OPTIONAL { ?s schema:name ?name }
  OPTIONAL { ?s schema:creator ?creator }
  OPTIONAL { ?s schema:datePublished ?pubDate }
  OPTIONAL { ?s schema:publisher ?publisherLit . FILTER(isLiteral(?publisherLit)) }
  OPTIONAL { ?s schema:inLanguage ?langVal }
  OPTIONAL { ?s schema:numberOfItems ?itemsVal }
}
GROUP BY ?s ?label ?classuri
LIMIT 1`;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json",
        },
        body: new URLSearchParams({ query: sparql }).toString(),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: { bindings?: MadbBinding[] } };
      const row = data.results?.bindings?.[0];
      if (!row) return null;
      const classShort = (row.classuri?.value ?? "").split("#")[1] ?? "";
      const subtypeOf: Record<string, string | undefined> = {};
      for (const c of [...MANGA_CLASSES, ...ANIME_CLASSES]) subtypeOf[c.cls] = c.subtype;
      return madbRowToItem(row, subtypeOf);
    } catch {
      return null;
    }
  }

  getAttribution() {
    return {
      name: "Media Arts Database",
      notice: "Data from the Media Arts Database (メディア芸術データベース), National Center for Art Research, Japan.",
      canonical: "https://mediaarts-db.artmuseums.go.jp/",
    };
  }
}
