/**
 * ECHO — BnF Catalogue général adapter (books + comics — bibliographic records).
 *
 * Real source: the BnF SRU (Search/Retrieve via URL) API
 *   https://catalogue.bnf.fr/api/SRU?operation=searchRetrieve&version=1.2
 *   &query=bib.title all "…"&recordSchema=dc
 * Browser-direct (Access-Control-Allow-Origin: * — verified 2026-11-23),
 * no key required. XML responses are parsed with a small hand-rolled
 * extractor so the adapter works in the browser AND in bun/node tests.
 *
 * LICENSING (verified 2026-11-23, https://api.bnf.fr/fr/api-sru-catalogue-general):
 *  - Catalogue général metadata is released under the « Licence ouverte de
 *    l'État » (Etalab Open Licence 2.0): reuse, including commercial, is
 *    permitted as long as the source is mentioned (BnF).
 *  - Interactive title search only — no bulk harvesting.
 *
 * Record granularity: SRU records are BIBLIOGRAPHIC EDITIONS (a specific
 * publication), not abstract works. ECHO labels every BnF result with
 * subtype "edition" so it can never merge with a work-level record from
 * another provider. Comics searches are narrowed with the subject filter
 * « bande dessinée »; books use the plain title index.
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import { formatForType } from "../types";
import {
  ProviderError,
  fetchText,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";
import { stampCatalogProvenance } from "./provenance";
import { providerCacheTtlMs } from "./registry";

const SRU = "https://catalogue.bnf.fr/api/SRU";

/** Build the SRU query URL for the requested categories. */
export function buildBnfUrl(query: string, types: MediaType[], limit: number): string {
  const q = query.trim().replace(/["?*]/g, " ").trim();
  // comics searches narrow on the « bande dessinée » subject heading
  const comicsOnly = types.includes("comics") && !types.includes("book");
  const subject = comicsOnly ? ' and bib.subject all "bande dessinée"' : "";
  const params = new URLSearchParams({
    operation: "searchRetrieve",
    version: "1.2",
    query: `bib.title all "${q}"${subject}`,
    maximumRecords: String(Math.min(30, Math.max(1, limit * 2))),
    recordSchema: "dc",
  });
  return `${SRU}?${params.toString()}`;
}

/** Minimal XML text extraction — returns the inner text of every
 *  <prefix:tag>…</prefix:tag> occurrence at any depth. Robust for the
 *  well-formed SRU/DC responses BnF returns; no dependency, works in
 *  browsers, bun and node. */
export function extractTagValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const inner = decodeXmlEntities(m[1]).trim();
    if (inner) out.push(inner);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

interface BnfRecord {
  ark: string;
  title: string;
  creators: string[];
  date?: string;
  publisher?: string;
  language?: string;
}

/** Split one <srw:record>…</srw:record> block into its DC fields. */
export function parseBnfRecord(block: string): BnfRecord | null {
  const title = extractTagValues(block, "title")[0];
  const ark = extractTagValues(block, "recordIdentifier")[0];
  if (!title || !ark) return null;
  const creators = extractTagValues(block, "creator")
    .map((c) =>
      // "Goscinny, René (1926-1977). Auteur du texte" → "Goscinny, René"
      c.split("(")[0].split(".")[0].split("/")[0].trim(),
    )
    .filter((c) => c.length > 1)
    .slice(0, 3);
  const date = extractTagValues(block, "date")[0];
  const publisher = extractTagValues(block, "publisher")[0];
  const language = extractTagValues(block, "language")[0];
  return { ark, title, creators, date, publisher, language };
}

/** Categorize a BnF record: comics when the record carries a comics
 *  subject heading, or when the search itself was comics-only (the server
 *  side « bande dessinée » subject filter already guaranteed it — the DC
 *  record does not echo that heading, verified live 2026-11-23).
 *  Otherwise the record is a book. Only requested categories are kept. */
function categorize(
  block: string,
  wanted: Set<MediaType>,
  comicsOnlyRequest: boolean,
): MediaType | null {
  const subjects = extractTagValues(block, "subject").join(" ").toLowerCase();
  const isComics =
    comicsOnlyRequest ||
    subjects.includes("bande dessinée") ||
    subjects.includes("comics") ||
    subjects.includes("manga");
  const type: MediaType = isComics ? "comics" : "book";
  return wanted.has(type) ? type : null;
}

export class BnfProvider implements CatalogueProvider {
  id = "bnf";
  label = "BnF";

  capabilities = {
    anime: false,
    movies: false,
    series: false,
    games: false,
    books: true,
    manga: false,
    comics: true,
    contentRatings: false,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  /** Per-query result cache (registry-capped TTL). */
  private searchCache = new TTLCache<ProviderSearchResult[]>(
    Math.min(60 * 60_000, providerCacheTtlMs("bnf") || 60 * 60_000),
  );

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const types = (filters?.mediaTypes ?? []).filter((t) => t === "book" || t === "comics");
    if (!types.length) return [];
    const limit = filters?.limit ?? 8;
    const key = `${q}|${types.slice().sort().join(",")}|${limit}`;
    return cached(this.searchCache, key, async () => {
      let xml: string;
      try {
        // BnF SRU can take 15-20s under load (verified live): honor the
        // engine's cancellation signal, and fall back to a generous
        // standalone timeout instead of the shared 10s default.
        xml = await fetchText(buildBnfUrl(q, types, limit), {
          signal: filters?.signal ?? AbortSignal.timeout(20_000),
        });
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError("network");
      }
      const blocks = xml.split(/<\/(?:[\w.-]+:)?record>/).slice(0, -1);
      const wanted = new Set(types);
      const comicsOnly = types.includes("comics") && !types.includes("book");
      const items: MediaItem[] = [];
      for (const block of blocks) {
        if (!block.includes("recordIdentifier")) continue;
        const type = categorize(block, wanted, comicsOnly);
        if (!type) continue;
        const rec = parseBnfRecord(block);
        if (!rec) continue;
        const year = rec.date ? Number(rec.date.replace(/\D/g, "").slice(0, 4)) : undefined;
        const item = stampCatalogProvenance({
          localId: `bnf:${rec.ark}`,
          provider: "bnf",
          providerId: rec.ark,
          canonicalUrl: `https://catalogue.bnf.fr/${rec.ark}`,
          mediaType: type,
          format: formatForType(type) as MediaFormat,
          subtype: "edition", // BnF records are bibliographic editions
          title: rec.title,
          creators: rec.creators.length ? rec.creators : undefined,
          studios: rec.publisher ? [rec.publisher] : undefined,
          releaseYear: year && Number.isFinite(year) && year > 800 && year < 2200 ? year : undefined,
          languages: mapBnfLanguage(rec.language),
          genres: [],
          tags: [],
          sourceAttribution: "« Bibliothèque nationale de France » — data under the Licence ouverte de l'État (Etalab 2.0)",
          metadataFetchedAt: new Date().toISOString(),
          externalIds: { bnf: rec.ark },
        });
        items.push(item);
        if (items.length >= limit) break;
      }
      return items.map((item) => ({ item, sourceLabel: "BnF" }));
    });
  }

  async getTitle(): Promise<MediaItem | null> {
    // BnF records are transient search results only (editions, no refresh)
    return null;
  }

  getAttribution() {
    return {
      name: "BnF Catalogue général",
      notice: "« Bibliothèque nationale de France » — metadata under the Licence ouverte de l'État (Etalab Open Licence 2.0).",
      canonical: "https://catalogue.bnf.fr/",
    };
  }
}

/** MARC language codes used by BnF DC records → display names (verified subset). */
function mapBnfLanguage(code?: string): string[] | undefined {
  switch (code) {
    case "fre": return ["French"];
    case "eng": return ["English"];
    case "ara": return ["Arabic"];
    case "jpn": return ["Japanese"];
    case "ger": return ["German"];
    case "spa": return ["Spanish"];
    case "ita": return ["Italian"];
    case "rus": return ["Russian"];
    case "chi": return ["Chinese"];
    case "kor": return ["Korean"];
    case "por": return ["Portuguese"];
    case "dut": return ["Dutch"];
    default: return undefined;
  }
}
