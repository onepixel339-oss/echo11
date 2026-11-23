/**
 * ECHO — Inventaire adapter (books, manga, comics — works level).
 *
 * Real source: the Inventaire HTTP API (verified 2026-11-23):
 *   - GET https://inventaire.io/api/search?search=…&types=works
 *   - GET https://inventaire.io/api/entities/by-uris?uris=…  (claims lookup)
 *   Browser-direct (Access-Control-Allow-Origin: *), no key required.
 *
 * LICENSING (verified 2026-11-23, https://api.inventaire.io):
 *  - Global API rules: set a unique User-Agent; commercial services are
 *    welcome and asked to support the Inventaire association fairly.
 *  - Entity metadata mirrors Wikidata (CC0) plus Inventaire community
 *    contributions; ECHO shows transient, attributed TEXT results only.
 *  - NO images: the API exposes book-cover image paths, but cover artwork
 *    carries publisher rights that are not granted to ECHO — results render
 *    with ECHO's own placeholder cards instead.
 *
 * Classification: every result is classified client-side from its Wikidata
 * P31 ("instance of") claims — a work is only returned for a category its
 * P31 actually supports. Work-level (wd:) entities classify reliably for
 * LITERARY WORKS; Inventaire's own (inv:) edition entities carry no P31
 * claims and are therefore dropped rather than guessed — which is why
 * ECHO routes Inventaire to BOOKS only (verified live, 2026-11-23).
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

const SEARCH_API = "https://inventaire.io/api/search";
const ENTITIES_API = "https://inventaire.io/api/entities/by-uris";

/** Wikidata P31 Q-ids → ECHO type + subtype (verified against Wikidata). */
const P31_MAP: Record<string, { type: MediaType; subtype?: string }> = {
  // manga family
  Q8274: { type: "manga", subtype: "manga" },
  Q21198342: { type: "manga", subtype: "manga-series" },
  Q562214: { type: "manga", subtype: "manhwa" },
  Q74262765: { type: "manga", subtype: "manhwa" },
  // comics family
  Q14406742: { type: "comics", subtype: "comic-series" },
  Q725377: { type: "comics", subtype: "graphic-novel" },
  Q838795: { type: "comics", subtype: "comic-strip" },
  Q1004: { type: "comics", subtype: "comic" },
  // book family
  Q571: { type: "book" },
  Q8261: { type: "book", subtype: "novel" },
  Q7725634: { type: "book" },
  Q747381: { type: "book", subtype: "light-novel" },
};

/** Verified Wikidata language Q-ids → display names (P407 values).
 *  Every id verified against the live Wikidata API on 2026-11-23. */
const LANGUAGE_NAMES: Record<string, string> = {
  Q1860: "English",
  Q5287: "Japanese",
  Q13955: "Arabic",
  Q150: "French",
  Q188: "German",
  Q1321: "Spanish",
  Q652: "Italian",
  Q7737: "Russian",
  Q7850: "Chinese",
  Q9176: "Korean",
  Q9027: "Swedish",
  Q7411: "Dutch",
  Q9035: "Danish",
  Q9043: "Norwegian",
  Q1412: "Finnish",
};

/** Volume-shaped labels ("…, Vol. 15", "… #15", "… Tome 15") → subtype volume. */
const VOLUME_PATTERN = /[(,][^,)]*\b(vol\.?|tome|band|volume|#)\s*\d+|\d+\s*(巻|권)\b|第\s*\d+\s*巻/i;

interface InvSearchRow {
  id: string;
  uri: string; // "wd:Q123" | "inv:abcd…"
  label: string;
  description?: string;
  image?: string;
}

interface InvEntity {
  uri: string;
  labels?: Record<string, { value?: string } | string>;
  claims?: Record<string, (string | { uri?: string })[]>;
}

/** Extract the string value of a claim whose values are entity uris ("wd:Q42"). */
function claimUris(entity: InvEntity, prop: string): string[] {
  const claims = entity.claims?.[prop] ?? [];
  const out: string[] = [];
  for (const c of claims) {
    if (typeof c === "string" && c) out.push(c);
    else if (typeof c === "object" && c && typeof c.uri === "string") out.push(c.uri);
  }
  return out;
}

function labelValue(entity: InvEntity, lang: string): string | undefined {
  const l = entity.labels?.[lang];
  if (!l) return undefined;
  return typeof l === "string" ? l : l.value;
}

/** "2004 novel by John Altman" → "John Altman" (creator from the description). */
function creatorFromDescription(description?: string): string | undefined {
  if (!description) return undefined;
  const m = description.match(/\bby ([^,;()]{2,60})$/i);
  return m?.[1]?.trim() || undefined;
}

export class InventaireProvider implements CatalogueProvider {
  id = "inventaire";
  label = "Inventaire";

  capabilities = {
    anime: false,
    movies: false,
    series: false,
    games: false,
    books: true, // verified live: only wd: work entities classify reliably
    manga: false,
    comics: false,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  /** Per-query result cache (registry-capped TTL). */
  private searchCache = new TTLCache<ProviderSearchResult[]>(
    Math.min(30 * 60_000, providerCacheTtlMs("inventaire") || 30 * 60_000),
  );

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const types = (filters?.mediaTypes ?? []).filter((t) => t === "book");
    if (!types.length) return [];
    const limit = filters?.limit ?? 8;
    const key = `${q}|${types.slice().sort().join(",")}|${limit}`;
    return cached(this.searchCache, key, async () => {
      // 1) works search (one request, works index only)
      const searchUrl = `${SEARCH_API}?search=${encodeURIComponent(q)}&types=works&limit=${Math.min(20, limit * 3)}`;
      let rows: InvSearchRow[];
      try {
        const data = await fetchJson<{ results?: InvSearchRow[] }>(searchUrl);
        rows = (data.results ?? []).filter((r) => r.uri && r.label);
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError("network");
      }
      if (!rows.length) return [];

      // 2) batched claims lookup — P31 drives classification, P50/P577/P407 enrich
      const uris = rows.slice(0, 15).map((r) => r.uri).join("|");
      let entities: Record<string, InvEntity> = {};
      try {
        const data = await fetchJson<{ entities?: Record<string, InvEntity> }>(
          `${ENTITIES_API}?uris=${encodeURIComponent(uris)}`,
        );
        entities = data.entities ?? {};
      } catch {
        entities = {}; // claims lookup failed → classify nothing, degrade gracefully
      }

      const wanted = new Set<MediaType>(types);
      const items: MediaItem[] = [];
      for (const row of rows) {
        const entity = entities[row.uri];
        if (!entity) continue;
        const p31s = claimUris(entity, "wdt:P31").map((u) => u.replace(/^wd:/, ""));
        // classify: the FIRST P31 that maps onto a requested type wins
        let mapped: { type: MediaType; subtype?: string } | null = null;
        for (const p31 of p31s) {
          const m = P31_MAP[p31];
          if (m && wanted.has(m.type)) {
            mapped = m;
            break;
          }
        }
        if (!mapped) continue; // unclassifiable / wrong type → dropped, never guessed

        const en = labelValue(entity, "en") ?? row.label;
        const yearClaim = claimUris(entity, "wdt:P577")[0];
        const year = yearClaim ? Number(yearClaim.replace(/\D/g, "").slice(0, 4)) : undefined;
        const langQid = claimUris(entity, "wdt:P407")[0]?.replace(/^wd:/, "");
        const langName = langQid ? LANGUAGE_NAMES[langQid] : undefined;
        // original title: the label in the work's own language
        const originalTitle =
          langQid === "Q1860" ? undefined : labelValue(entity, langNameToIso(langQid) ?? "") ?? undefined;
        const volumeLike = VOLUME_PATTERN.test(row.label);

        const item = stampCatalogProvenance({
          localId: `inventaire:${row.uri}`,
          provider: "inventaire",
          providerId: row.uri,
          canonicalUrl:
            row.uri.startsWith("wd:")
              ? `https://www.wikidata.org/wiki/${row.uri.slice(3)}`
              : `https://inventaire.io/entity/${encodeURIComponent(row.uri)}`,
          mediaType: mapped.type,
          format: formatForType(mapped.type) as MediaFormat,
          subtype: volumeLike ? "volume" : mapped.subtype,
          title: en,
          originalTitle: originalTitle && originalTitle !== en ? originalTitle : undefined,
          synopsis: row.description,
          releaseYear: year && Number.isFinite(year) && year > 800 && year < 2200 ? year : undefined,
          creators: [creatorFromDescription(row.description)].filter((c): c is string => Boolean(c)),
          languages: langName ? [langName] : undefined,
          genres: [],
          tags: [],
          sourceAttribution: "Data from Inventaire",
          metadataFetchedAt: new Date().toISOString(),
          externalIds: {
            inventaire: row.uri,
            ...(row.uri.startsWith("wd:") ? { wikidata: row.uri.slice(3) } : {}),
          },
        });
        items.push(item);
        if (items.length >= limit) break;
      }
      return items.map((item) => ({ item, sourceLabel: "Inventaire" }));
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    // providerId is the entity uri ("wd:Q123" / "inv:…")
    if (!/^(wd:Q\d+|inv:[a-f0-9]+)$/.test(providerId)) return null;
    try {
      const data = await fetchJson<{ entities?: Record<string, InvEntity> }>(
        `${ENTITIES_API}?uris=${encodeURIComponent(providerId)}`,
      );
      const entity = data.entities?.[providerId];
      if (!entity) return null;
      const p31s = claimUris(entity, "wdt:P31").map((u) => u.replace(/^wd:/, ""));
      const mapped = p31s.map((p) => P31_MAP[p]).find(Boolean);
      if (!mapped) return null;
      const en = labelValue(entity, "en") ?? providerId;
      const yearClaim = claimUris(entity, "wdt:P577")[0];
      const year = yearClaim ? Number(yearClaim.replace(/\D/g, "").slice(0, 4)) : undefined;
      return stampCatalogProvenance({
        localId: `inventaire:${providerId}`,
        provider: "inventaire",
        providerId,
        canonicalUrl: providerId.startsWith("wd:")
          ? `https://www.wikidata.org/wiki/${providerId.slice(3)}`
          : `https://inventaire.io/entity/${encodeURIComponent(providerId)}`,
        mediaType: mapped.type,
        format: formatForType(mapped.type) as MediaFormat,
        subtype: mapped.subtype,
        title: en,
        releaseYear: year && Number.isFinite(year) && year > 800 && year < 2200 ? year : undefined,
        genres: [],
        tags: [],
        sourceAttribution: "Data from Inventaire",
        metadataFetchedAt: new Date().toISOString(),
        externalIds: {
          inventaire: providerId,
          ...(providerId.startsWith("wd:") ? { wikidata: providerId.slice(3) } : {}),
        },
      });
    } catch {
      return null;
    }
  }

  getAttribution() {
    return {
      name: "Inventaire",
      notice: "Data from Inventaire — entity metadata mirrored from Wikidata (CC0) plus community contributions.",
      canonical: "https://inventaire.io/",
    };
  }
}

/** Map a verified language Q-id to the ISO code used in Inventaire labels. */
function langNameToIso(qid?: string): string | undefined {
  switch (qid) {
    case "Q1860": return "en";
    case "Q5287": return "ja";
    case "Q13955": return "ar";
    case "Q150": return "fr";
    case "Q188": return "de";
    case "Q1321": return "es";
    case "Q652": return "it";
    case "Q7737": return "ru";
    case "Q7850": return "zh";
    case "Q9176": return "ko";
    default: return undefined;
  }
}
