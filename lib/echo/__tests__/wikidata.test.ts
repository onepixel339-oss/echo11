/**
 * ECHO — Wikidata provider tests (CC0 universal live source).
 *
 * ALL network access is mocked: globalThis.fetch is stubbed per test — no
 * live calls. Covers:
 *  - the P31 instance-of type mapping (verified Q-ids) and type filtering
 *  - year / genre / creator / country extraction, AR label passthrough
 *  - items with unmapped P31 are dropped — never guessed into a type
 *  - cross-provider identity: the wikidata Q-id lands in externalIds
 *  - no artwork is ever fetched (separate rights, deliberately omitted)
 *  - registry gating: no calls when the provider is toggled off
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { WikidataProvider } from "../providers/wikidata";
import { searchCatalogue } from "../providers";
import { setProviderToggles } from "../providers/registry";

const provider = new WikidataProvider();

const realFetch = globalThis.fetch;
let calls: string[] = [];
let responder: ((url: string) => unknown | null) = () => null;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const out = responder(url);
    if (out === null) return jsonResponse({}, 500);
    if (out instanceof Response) return out;
    return jsonResponse(out);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  responder = () => null;
  setProviderToggles(null);
});

/** Minimal wbsearchentities payload. */
function searchPage(ids: string[]) {
  return {
    search: ids.map((id) => ({ id, label: `Label ${id}`, description: `Desc ${id}` })),
  };
}

/** Build one fake entity with claims. Shapes mirror the REAL Action API:
 *  entity-id claims are `datavalue.value.id`, time claims `datavalue.value.time`,
 *  string ids `datavalue.value`. */
function entity(
  id: string,
  opts: {
    p31?: string[];
    year?: number;
    genreQids?: string[];
    authorQids?: string[];
    countryQids?: string[];
    langQids?: string[];
    imdb?: string;
    labels?: Record<string, string>;
    description?: string;
  } = {},
) {
  const qidClaim = (prop: string, qids: string[]) => ({
    [prop]: qids.map((q) => ({
      mainsnak: {
        property: prop,
        snaktype: "value",
        datavalue: { value: { id: q } },
      },
    })),
  });
  return {
    id,
    labels: Object.fromEntries(
      Object.entries({ en: `Label ${id}`, ar: `تسمية ${id}`, ...opts.labels }).map(
        ([lang, value]) => [lang, { language: lang, value }],
      ),
    ),
    descriptions: { en: { language: "en", value: opts.description ?? `Desc ${id}` } },
    claims: {
      ...(opts.p31 ? qidClaim("P31", opts.p31) : {}),
      ...(opts.year
        ? {
            P577: [
              {
                mainsnak: {
                  property: "P577",
                  snaktype: "value",
                  datavalue: { value: { time: `+${opts.year}-01-01T00:00:00Z` } },
                },
              },
            ],
          }
        : {}),
      ...(opts.genreQids ? qidClaim("P136", opts.genreQids) : {}),
      ...(opts.authorQids ? qidClaim("P50", opts.authorQids) : {}),
      ...(opts.countryQids ? qidClaim("P495", opts.countryQids) : {}),
      ...(opts.langQids ? qidClaim("P407", opts.langQids) : {}),
      ...(opts.imdb
        ? {
            P345: [
              {
                mainsnak: {
                  property: "P345",
                  snaktype: "value",
                  datavalue: { value: opts.imdb },
                },
              },
            ],
          }
        : {}),
    },
  };
}

function entitiesPage(entities: object[]) {
  return { entities: Object.fromEntries(entities.map((e) => [(e as { id: string }).id, e])) };
}

/** Genre/author/country Q-id label resolution payload. */
function labelsPage(map: Record<string, string>) {
  return {
    entities: Object.fromEntries(
      Object.entries(map).map(([qid, label]) => [
        qid,
        { labels: { en: { language: "en", value: label } } },
      ]),
    ),
  };
}

describe("Wikidata adapter — type detection via P31 (verified Q-ids)", () => {
  test("maps manga / comics / movie / series / game / book P31 values", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
      if (url.includes("wbgetentities")) {
        // first call carries labels+descriptions+claims; second resolves
        // genre/creator/country label ids (props=labels only)
        if (url.includes("descriptions")) {
          return entitiesPage([
            entity("Q1", { p31: ["Q21198342"], year: 1997, description: "manga series" }),
            entity("Q2", { p31: ["Q725377"], year: 1980 }),
            entity("Q3", { p31: ["Q11424"], year: 1972 }),
            entity("Q4", { p31: ["Q5398426"], year: 2008 }),
            entity("Q5", { p31: ["Q7889"], year: 2011 }),
            entity("Q6", { p31: ["Q8261"], year: 1949 }),
          ]);
        }
        if (url.includes("props=labels")) return labelsPage({});
        return null;
      }
      return null;
    };
    const results = await provider.search("test", {
      mediaTypes: ["manga", "comics", "movie", "series", "game", "book"],
      limit: 8,
    });
    const byType = Object.fromEntries(results.map((r) => [r.item.mediaType, r.item.title]));
    expect(byType.manga).toBe("Label Q1");
    expect(byType.comics).toBe("Label Q2");
    expect(byType.movie).toBe("Label Q3");
    expect(byType.series).toBe("Label Q4");
    expect(byType.game).toBe("Label Q5");
    expect(byType.book).toBe("Label Q6");
  });

  test("manhwa / light-novel / comic-strip P31 values map to subtypes", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q1", "Q2", "Q3"]);
      if (url.includes("descriptions")) {
        return entitiesPage([
          entity("Q1", { p31: ["Q562214", "Q571"], year: 2018 }), // manhwa (also book)
          entity("Q2", { p31: ["Q747381"], year: 2015 }), // light novel → book
          entity("Q3", { p31: ["Q838795"], year: 1950 }), // comic strip → comics
        ]);
      }
      if (url.includes("props=labels")) return labelsPage({});
      return null;
    };
    const results = await provider.search("test", { mediaTypes: ["manga", "book", "comics"], limit: 8 });
    const manhwa = results.find((r) => r.item.title === "Label Q1");
    // manhwa beats book in the priority order → manga type with manhwa subtype
    expect(manhwa!.item.mediaType).toBe("manga");
    expect(manhwa!.item.subtype).toBe("manhwa");
    const ln = results.find((r) => r.item.title === "Label Q2");
    expect(ln!.item.mediaType).toBe("book");
    expect(ln!.item.subtype).toBe("light-novel");
    const strip = results.find((r) => r.item.title === "Label Q3");
    expect(strip!.item.mediaType).toBe("comics");
    expect(strip!.item.subtype).toBe("comic-strip");
  });

  test("items with unmapped P31 values are dropped — never guessed into a type", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q1", "Q2"]);
      if (url.includes("descriptions")) {
        return entitiesPage([
          entity("Q1", { p31: ["Q5"], year: 1990 }), // Q5 = human — not a work
          entity("Q2", {}), // no P31 at all
        ]);
      }
      if (url.includes("props=labels")) return labelsPage({});
      return null;
    };
    const results = await provider.search("person", { mediaTypes: ["movie"], limit: 8 });
    expect(results.length).toBe(0);
  });
});

describe("Wikidata adapter — record mapping", () => {
  test("labels, year, genres, creators, countries, languages, external ids", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q633"]);
      if (url.includes("descriptions")) {
        return entitiesPage([
          entity("Q633", {
            p31: ["Q14406742"],
            year: 1986,
            genreQids: ["Q130232", "Q157443"],
            authorQids: ["Q193712"],
            countryQids: ["Q142"],
            langQids: ["Q150"],
            imdb: "tt123456",
            labels: { en: "Watchmen", ar: "المراقبون" },
            description: "comic book series by Alan Moore",
          }),
        ]);
      }
      if (url.includes("props=labels")) {
        return labelsPage({
          Q130232: "drama",
          Q157443: "superhero",
          Q193712: "Alan Moore",
          Q142: "France",
          Q150: "French",
        });
      }
      return null;
    };
    const results = await provider.search("Watchmen", { mediaTypes: ["comics"], limit: 5 });
    expect(results.length).toBe(1);
    const item = results[0].item;
    expect(results[0].sourceLabel).toBe("Wikidata");
    expect(item.localId).toBe("wikidata:Q633");
    expect(item.title).toBe("Watchmen");
    expect(item.titleAr).toBe("المراقبون");
    expect(item.releaseYear).toBe(1986);
    expect(item.genres).toEqual(["drama", "superhero"]);
    expect(item.creators).toEqual(["Alan Moore"]);
    expect(item.countries).toEqual(["France"]);
    expect(item.languages).toEqual(["French"]);
    expect(item.externalIds).toEqual({ wikidata: "Q633", imdb: "tt123456" });
    expect(item.canonicalUrl).toBe("https://www.wikidata.org/wiki/Q633");
    // NO artwork (separate rights), NO rating (none exists on Wikidata)
    expect(item.posterUrl).toBeUndefined();
    expect(item.publicScore).toBeUndefined();
    expect(item.rating).toBeUndefined();
    // provenance is stamped like every other provider record
    expect(item.workId).toBe("echo-work-wikidata-Q633");
    expect(item.provenance?.title).toBe("wikidata");
  });

  test("label-resolution failure degrades gracefully (no genres/creators, no crash)", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q9"]);
      if (url.includes("descriptions")) {
        return entitiesPage([
          entity("Q9", { p31: ["Q571"], year: 1847, genreQids: ["Q100"] }),
        ]);
      }
      if (url.includes("props=labels")) return null; // 500 → degrade
      return null;
    };
    const results = await provider.search("Jane Eyre", { mediaTypes: ["book"], limit: 5 });
    expect(results.length).toBe(1);
    expect(results[0].item.releaseYear).toBe(1847);
    expect(results[0].item.genres).toEqual([]);
  });

  test("at most 3 upstream requests per query (Wikimedia etiquette)", async () => {
    responder = (url) => {
      if (url.includes("wbsearchentities")) return searchPage(["Q1"]);
      if (url.includes("descriptions")) return entitiesPage([entity("Q1", { p31: ["Q571"] })]);
      if (url.includes("props=labels")) return labelsPage({});
      return null;
    };
    await provider.search("etiquette", { mediaTypes: ["book"], limit: 5 });
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.every((u) => u.startsWith("https://www.wikidata.org/w/api.php"))).toBe(true);
    expect(calls.every((u) => u.includes("origin=%2A") || u.includes("origin=*"))).toBe(true);
  });
});

describe("Wikidata through the license gate", () => {
  test("toggled off → the router never contacts wikidata; local fill covers the gap", async () => {
    // comics now has specialized live sources (Inventaire, BnF) — toggling
    // wikidata alone no longer silences every live call, so this test also
    // disables them to exercise the pure wikidata-off path it was written for.
    setProviderToggles({ wikidata: false, inventaire: false, bnf: false });
    const outcome = await searchCatalogue("Watchmen", {
      mediaTypes: ["comics"],
      limit: 5,
    });
    expect(calls.length).toBe(0);
    // comics has no other live source → the curated local catalogue fills in
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.results.some((r) => r.item.title === "Watchmen")).toBe(true);
    expect(outcome.results.every((r) => r.sourceLabel === "Sample")).toBe(true);
  });

  test("enabled (default) → comics queries reach BnF AND the wikidata baseline", async () => {
    // comics routes to BnF (deep, slow) + wikidata (fast baseline) — BnF's
    // route entry explicitly keeps the wikidata baseline live
    responder = (url) => {
      if (url.includes("wikidata.org")) {
        if (url.includes("wbsearchentities")) return { search: [] };
        return {};
      }
      if (url.includes("catalogue.bnf.fr")) return "";
      return null;
    };
    const outcome = await searchCatalogue("some obscure comic", {
      mediaTypes: ["comics"],
      limit: 5,
    });
    expect(calls.some((u) => u.includes("catalogue.bnf.fr"))).toBe(true);
    expect(calls.some((u) => u.includes("wikidata.org"))).toBe(true);
    expect(outcome.sources).toEqual([]); // empty search → no live result
  });

  test("enabled (default) → UNcovered categories still reach wikidata (movie baseline)", async () => {
    // movies have no active specialized provider in a default keyless
    // deployment (IMDb gated, Trakt unconfigured) → wikidata is their source
    responder = (url) => {
      if (url.includes("wikidata.org")) {
        if (url.includes("wbsearchentities")) return { search: [] };
        return {};
      }
      return null;
    };
    const outcome = await searchCatalogue("some obscure film", {
      mediaTypes: ["movie"],
      limit: 5,
    });
    expect(calls.some((u) => u.includes("wikidata.org"))).toBe(true);
    expect(outcome.sources).toEqual([]);
  });
});
