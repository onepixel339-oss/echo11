/**
 * ECHO — Wikidata adapter (all seven content categories).
 *
 * Real source: the Wikidata Action API (www.wikidata.org/w/api.php) with
 * anonymous CORS (`origin=*`). No key required.
 *
 * LICENSING (verified 2026-11-23, https://www.wikidata.org/wiki/Wikidata:Licensing):
 *  - All structured data (main/property/lexeme namespaces) is released under
 *    CC0 1.0 (public domain): commercial use, persistent storage, caching
 *    and redistribution are permitted; attribution is not required.
 *  - ECHO still attributes every record ("Wikidata") as good practice.
 *  - NO artwork is fetched: Commons images are governed by separate,
 *    per-file rights that CC0 does not cover.
 *
 * API etiquette (Wikimedia API rate limits, 2026-11-23):
 *  - unauthenticated browser requests ~200 req/min; unidentified clients 10.
 *    ECHO issues at most 3 requests per query and caches responses for the
 *    registry-capped TTL (60 min) — no bulk collection, no scraping.
 *
 * How type detection works: search hits are only kept when their P31
 * ("instance of") statements map onto the requested ECHO content types.
 * The Q-id map below was verified against the live API on 2026-11-23.
 * Items with unmapped P31 values are dropped — never guessed into a type.
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
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";

const API = "https://www.wikidata.org/w/api.php";

/**
 * P31 ("instance of") Q-id → ECHO content type.
 * Priority when several match: the most specific form wins (a graphic novel
 * is also usually Q571 "book" — comics must win; an anime series is also a
 * television series — anime must win).
 */
const TYPE_BY_P31: Record<string, MediaType> = {
  // verified 2026-11-23 via the live API
  Q11424: "movie", // film
  Q5398426: "series", // television series
  Q15416: "series", // television program
  Q1107: "anime", // anime
  Q63952888: "anime", // anime television series
  Q8274: "manga", // manga
  Q21198342: "manga", // manga series
  Q562214: "manga", // manhwa (Korean comics) → ECHO type manga, subtype manhwa
  Q74262765: "manga", // manhwa series
  Q14406742: "comics", // comic book series
  Q838795: "comics", // comic strip
  Q725377: "comics", // graphic novel
  Q7889: "game", // video game
  Q571: "book", // book
  Q8261: "book", // novel
  Q7725634: "book", // literary work
  Q747381: "book", // light novel → ECHO type book, subtype light-novel
};

/** Type priority: the first match in this order wins a multi-P31 item. */
const TYPE_PRIORITY: MediaType[] = [
  "anime",
  "manga",
  "comics",
  "movie",
  "series",
  "game",
  "book",
];

/** P31 Q-id → fine-grained subtype (v3 print-media schema). */
const SUBTYPE_BY_P31: Record<string, string> = {
  Q562214: "manhwa",
  Q74262765: "manhwa",
  Q747381: "light-novel",
  Q725377: "graphic-novel",
  Q838795: "comic-strip",
  Q14406742: "comic-series",
};

/** Every ECHO content type — details fetches are not type-filtered. */
const ALL_TYPES: MediaType[] = [
  "anime",
  "movie",
  "series",
  "game",
  "book",
  "manga",
  "comics",
];

/** Statements ECHO reads. Chosen so nothing unverifiable is ever stored. */
const CLAIM_PROPS = {
  instanceOf: "P31",
  publicationDate: "P577",
  genre: "P136",
  author: "P50", // book author
  director: "P57", // film director
  creator: "P170", // generic creator (comics artists…)
  countryOfOrigin: "P495",
  language: "P407",
  imdbId: "P345",
} as const;

interface WbSearchResult {
  id: string;
  label?: string;
  description?: string;
}

interface WbEntity {
  id: string;
  labels?: Record<string, { language: string; value: string }>;
  descriptions?: Record<string, { language: string; value: string }>;
  aliases?: Record<string, { language: string; value: string }[]>;
  claims?: Record<string, WbClaim[]>;
}

interface WbClaim {
  mainsnak: {
    property: string;
    snaktype: string;
    datavalue?: { value?: unknown };
  };
}

function apiUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  return `${API}?${qs.toString()}`;
}

async function wikidataGet<T>(params: Record<string, string>): Promise<T> {
  return fetchJson<T>(apiUrl(params));
}

/** Q-id values of every statement of one property. */
function claimQids(entity: WbEntity, prop: string): string[] {
  const claims = entity.claims?.[prop];
  if (!claims) return [];
  const out: string[] = [];
  for (const c of claims) {
    const v = c.mainsnak?.datavalue?.value;
    const qid = typeof v === "object" && v !== null ? (v as { id?: string }).id : undefined;
    if (qid && /^Q\d+$/.test(qid)) out.push(qid);
  }
  return out;
}

/** Earliest year from a publication-date statement. */
function claimYear(entity: WbEntity, prop: string): number | undefined {
  const claims = entity.claims?.[prop];
  if (!claims) return undefined;
  for (const c of claims) {
    const v = c.mainsnak?.datavalue?.value;
    if (typeof v === "object" && v !== null) {
      const time = (v as { time?: string }).time;
      if (typeof time === "string") {
        const y = Number(time.substring(1, 5)); // "+1954-07-29T…" → 1954
        if (Number.isFinite(y) && y > 0 && y < 2200) return y;
      }
    }
  }
  return undefined;
}

/** External string id (IMDb) from a statement. */
function claimStringId(entity: WbEntity, prop: string): string | undefined {
  const claims = entity.claims?.[prop];
  if (!claims) return undefined;
  for (const c of claims) {
    const v = c.mainsnak?.datavalue?.value;
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function label(entity: WbEntity, lang: string): string | undefined {
  return entity.labels?.[lang]?.value;
}

/** Best ECHO type for an entity given the requested types (or null: skip). */
function typeOf(entity: WbEntity, wanted: MediaType[]): MediaType | null {
  const p31 = claimQids(entity, CLAIM_PROPS.instanceOf);
  if (!p31.length) return null;
  const candidates = new Set<MediaType>();
  for (const qid of p31) {
    const t = TYPE_BY_P31[qid];
    if (t) candidates.add(t);
  }
  if (!candidates.size) return null;
  for (const t of TYPE_PRIORITY) {
    if (candidates.has(t)) return wanted.includes(t) ? t : null;
  }
  return null;
}

/** Resolve a batch of Q-ids to English labels (genres, creators, countries).
 *  Failure is non-fatal: fields are simply omitted rather than guessed. */
async function resolveLabels(
  qids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(qids)].filter((q) => /^Q\d+$/.test(q)).slice(0, 40);
  if (!unique.length) return {};
  try {
    const data = await wikidataGet<{ entities: Record<string, WbEntity> }>({
      action: "wbgetentities",
      ids: unique.join("|"),
      props: "labels",
      languages: "en",
    });
    const out: Record<string, string> = {};
    for (const [qid, e] of Object.entries(data.entities ?? {})) {
      const l = label(e, "en");
      if (l) out[qid] = l;
    }
    return out;
  } catch {
    return {}; // rate limit or transient failure → degrade gracefully
  }
}

function toMediaItem(
  entity: WbEntity,
  mediaType: MediaType,
  labels: Record<string, string>,
): MediaItem {
  const title = label(entity, "en") ?? entity.id;
  const titleAr = label(entity, "ar");
  const description = entity.descriptions?.en?.value;

  const genreSlugs = claimQids(entity, CLAIM_PROPS.genre)
    .map((q) => labels[q])
    .filter((l): l is string => Boolean(l))
    .map(normalizeGenre)
    .filter(Boolean)
    .slice(0, 5);

  const creatorNames = [
    ...claimQids(entity, CLAIM_PROPS.author),
    ...claimQids(entity, CLAIM_PROPS.director),
    ...claimQids(entity, CLAIM_PROPS.creator),
  ]
    .map((q) => labels[q])
    .filter((l): l is string => Boolean(l))
    .slice(0, 3);

  const countryNames = claimQids(entity, CLAIM_PROPS.countryOfOrigin)
    .map((q) => labels[q])
    .filter((l): l is string => Boolean(l))
    .slice(0, 2);

  const languageNames = claimQids(entity, CLAIM_PROPS.language)
    .map((q) => labels[q])
    .filter((l): l is string => Boolean(l))
    .slice(0, 2);

  const p31 = claimQids(entity, CLAIM_PROPS.instanceOf);
  const subtype = p31.map((q) => SUBTYPE_BY_P31[q]).find(Boolean);

  const imdbId = claimStringId(entity, CLAIM_PROPS.imdbId);

  return stampCatalogProvenance({
    localId: `wikidata:${entity.id}`,
    provider: "wikidata",
    providerId: entity.id,
    canonicalUrl: `https://www.wikidata.org/wiki/${entity.id}`,
    mediaType,
    format: formatForType(mediaType) as MediaFormat,
    subtype,
    title,
    titleAr,
    // Wikidata descriptions are one-line factual definitions — CC0
    synopsis: description,
    releaseYear: claimYear(entity, CLAIM_PROPS.publicationDate),
    genres: genreSlugs,
    tags: [],
    creators: creatorNames.length ? creatorNames : undefined,
    countries: countryNames.length ? countryNames : undefined,
    languages: languageNames.length ? languageNames : undefined,
    sourceAttribution: "Structured data from Wikidata (CC0 1.0)",
    metadataFetchedAt: new Date().toISOString(),
    externalIds: { wikidata: entity.id, ...(imdbId ? { imdb: imdbId } : {}) },
    // Wikidata carries no public/audience rating — nothing is fabricated.
  });
}

export class WikidataProvider implements CatalogueProvider {
  id = "wikidata";
  label = "Wikidata";

  capabilities = {
    anime: true,
    movies: true,
    series: true,
    games: true,
    books: true,
    manga: true,
    comics: true,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  /** Per-query result cache (registry-capped TTL). */
  private searchCache = new TTLCache<ProviderSearchResult[]>(60 * 60_000);

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const types = filters?.mediaTypes ?? [];
    const limit = filters?.limit ?? 8;
    if (!types.length) return [];
    return cached(this.searchCache, `${q}|${[...types].sort().join(",")}|${limit}`, async () => {
      // 1) entity search (English labels/aliases — the international index)
      let page: { search: WbSearchResult[] };
      try {
        page = await wikidataGet<{ search: WbSearchResult[] }>({
          action: "wbsearchentities",
          search: q,
          language: "en",
          uselang: "en",
          type: "item",
          limit: String(Math.min(20, limit * 3)),
        });
      } catch (e) {
        throw e instanceof ProviderError ? e : new ProviderError("invalid_response");
      }
      const hits = (page.search ?? []).filter((h) => h.id && /^Q\d+$/.test(h.id));
      if (!hits.length) return [];

      // 2) claims + labels for the candidate entities (single batched call)
      const ids = hits.slice(0, 15).map((h) => h.id).join("|");
      let entities: WbEntity[];
      try {
        const data = await wikidataGet<{ entities: Record<string, WbEntity> }>({
          action: "wbgetentities",
          ids,
          props: "labels|descriptions|claims",
          languages: "en|ar",
        });
        entities = Object.values(data.entities ?? {});
      } catch (e) {
        throw e instanceof ProviderError ? e : new ProviderError("invalid_response");
      }

      const typed = entities
        .map((e) => ({ e, t: typeOf(e, types) }))
        .filter((x): x is { e: WbEntity; t: MediaType } => Boolean(x.t));
      if (!typed.length) return [];

      // 3) resolve genre/creator/country/language labels (batched, degradable)
      const neededQids: string[] = [];
      for (const { e } of typed) {
        neededQids.push(
          ...claimQids(e, CLAIM_PROPS.genre),
          ...claimQids(e, CLAIM_PROPS.author),
          ...claimQids(e, CLAIM_PROPS.director),
          ...claimQids(e, CLAIM_PROPS.creator),
          ...claimQids(e, CLAIM_PROPS.countryOfOrigin),
          ...claimQids(e, CLAIM_PROPS.language),
        );
      }
      const labels = await resolveLabels(neededQids);

      return typed
        .slice(0, limit)
        .map(({ e, t }) => ({ item: toMediaItem(e, t, labels), sourceLabel: "Wikidata" }));
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    if (!/^Q\d+$/.test(providerId)) return null;
    try {
      const data = await wikidataGet<{ entities: Record<string, WbEntity> }>({
        action: "wbgetentities",
        ids: providerId,
        props: "labels|descriptions|claims",
        languages: "en|ar",
      });
      const entity = data.entities?.[providerId];
      if (!entity) return null;
      // a details fetch is not filtered by requested type: any mapped type
      const typed = typeOf(entity, ALL_TYPES);
      if (!typed) return null;
      const neededQids = [
        ...claimQids(entity, CLAIM_PROPS.genre),
        ...claimQids(entity, CLAIM_PROPS.author),
        ...claimQids(entity, CLAIM_PROPS.director),
        ...claimQids(entity, CLAIM_PROPS.creator),
        ...claimQids(entity, CLAIM_PROPS.countryOfOrigin),
        ...claimQids(entity, CLAIM_PROPS.language),
      ];
      const labels = await resolveLabels(neededQids);
      return toMediaItem(entity, typed, labels);
    } catch {
      return null;
    }
  }

  getAttribution() {
    return {
      name: "Wikidata",
      notice: "Structured data from Wikidata, released under CC0 1.0 (public domain).",
      canonical: "https://www.wikidata.org/",
    };
  }
}
