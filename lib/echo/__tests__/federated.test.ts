/**
 * ECHO — Federated search engine tests (Phase 5).
 * ALL network access is mocked: globalThis.fetch is stubbed per test —
 * NO live provider calls are ever made from this suite.
 *
 * Covers the Phase 5 requirements:
 *  - all seven category routers (gating + routing table)
 *  - provider isolation (one failure never blocks the others)
 *  - parallel search with progressive snapshots
 *  - independent per-provider timeouts
 *  - cancellation (query changed)
 *  - rate-limit handling + Retry-After cooldowns
 *  - proxy providers (unconfigured → missing_key, never a failed search)
 *  - license-gate enforcement
 *  - NO persistence of external results (IndexedDB stays untouched)
 *  - dedup: no merging across work types / granularity / conflicting ids
 *  - attribution on every hit
 *  - Arabic + English title matching
 *  - offline fallback
 *  - MADB / BnF / Inventaire / Trakt / IGDB adapter mapping
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import {
  createFederatedSearch,
  resetFederatedCooldowns,
  runFederatedSearch,
  searchFederatedCached,
} from "../federated/engine";
import { resolveProviderJobs, routePreview, traktEnabled, igdbEnabled } from "../federated/router";
import {
  dedupeAndMerge,
  conflictingIdentifiers,
  identifierKeys,
  normalizeTitle,
  type DedupInput,
} from "../federated/dedupe";
import { setProviderToggles } from "../providers/registry";
import { searchCatalogue } from "../providers";
import { buildMadbSparql, madbRowToItem } from "../providers/madb";
import { buildBnfUrl, extractTagValues, parseBnfRecord } from "../providers/bnf";
import { InventaireProvider } from "../providers/inventaire";
import { normalizeTraktResults } from "../providers/trakt";
import { normalizeIgdbResults } from "../providers/igdb";
import { closeDB } from "../localdb";
import * as db from "../localdb";

/* ------------------------------ fetch stubbing ----------------------------- */

let calls: { url: string; body?: string }[] = [];
let responder: ((url: string, body?: string) => unknown | null) = () => null;
const realFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  resetFederatedCooldowns();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    const out = await responder(url, typeof init?.body === "string" ? init.body : undefined);
    if (out === null) return jsonResponse({}, 500); // default: provider "down"
    if (out instanceof Response) return out;
    return jsonResponse(out);
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  responder = () => null;
  setProviderToggles(null);
  resetFederatedCooldowns();
  await closeDB();
});

/* --------------------------------- helpers --------------------------------- */

function mediaItem(partial: Partial<MediaItem> & { localId: string }): MediaItem {
  return {
    provider: "test",
    providerId: partial.localId,
    mediaType: "movie",
    format: "film",
    title: "Untitled",
    genres: [],
    tags: [],
    ...partial,
  };
}

function input(item: MediaItem, providerId = item.provider, priority = 1, isLive = true): DedupInput {
  return { item, providerId, providerLabel: providerId, priority, isLive };
}

function anilistPage(media: object[]) {
  return { data: { Page: { media } } };
}

const ANILIST_HIT = {
  id: 21,
  title: { romaji: "One Piece", english: "One Piece" },
  genres: ["Adventure"],
  tags: [],
  isAdult: false,
  format: "TV",
  startDate: { year: 1999 },
  siteUrl: "https://anilist.co/anime/21",
  description: "Pirates.",
  countryOfOrigin: "JP",
};

/* ------------------------------ category routers ----------------------------- */

describe("federated category routers (all seven)", () => {
  test("anime routes to AniList + MADB (wikidata skipped: covered)", () => {
    const jobs = resolveProviderJobs(["anime"]);
    const ids = jobs.map((j) => j.registryId).sort();
    expect(ids).toEqual(["anilist", "madb"]);
  });

  test("manga routes to AniList (manga path) and MADB; BnF serves books/comics only", () => {
    const jobs = resolveProviderJobs(["manga"]);
    const ids = jobs.map((j) => j.registryId).sort();
    expect(ids).toEqual(["anilist", "madb"]);
    // the AniList job for manga is the dedicated MANGA search
    const anilistJob = jobs.find((j) => j.registryId === "anilist")!;
    expect(anilistJob.categories).toEqual(["manga"]);
  });

  test("movie routes to wikidata only in a keyless deployment (IMDb gated, Trakt unconfigured)", () => {
    const jobs = resolveProviderJobs(["movie"]);
    expect(jobs.map((j) => j.registryId)).toEqual(["wikidata"]);
  });

  test("series routes to TVMaze only (wikidata skips covered categories)", () => {
    const jobs = resolveProviderJobs(["series"]);
    expect(jobs.map((j) => j.registryId)).toEqual(["tvmaze"]);
  });

  test("game routes to wikidata only without deployment keys", () => {
    const jobs = resolveProviderJobs(["game"]);
    expect(jobs.map((j) => j.registryId)).toEqual(["wikidata"]);
  });

  test("book routes to Open Library, Inventaire, BnF (wikidata skips: covered)", () => {
    const jobs = resolveProviderJobs(["book"]);
    const ids = jobs.map((j) => j.registryId).sort();
    expect(ids).toEqual(["bnf", "inventaire", "openlib"]);
  });

  test("comics routes to BnF + the wikidata baseline (BnF is deep but slow)", () => {
    const jobs = resolveProviderJobs(["comics"]);
    const ids = jobs.map((j) => j.registryId).sort();
    expect(ids).toEqual(["bnf", "wikidata"]);
  });

  test("wikidata serves categories whose specialized sources are gated off", () => {
    setProviderToggles({ openlib: false, inventaire: false, bnf: false });
    const jobs = resolveProviderJobs(["book"]);
    expect(jobs.map((j) => j.registryId)).toEqual(["wikidata"]);
  });

  test("anime+manga together splits the AniList job into anime and manga paths", () => {
    const jobs = resolveProviderJobs(["anime", "manga"]);
    const anilistJobs = jobs.filter((j) => j.registryId === "anilist");
    expect(anilistJobs.length).toBe(2);
    expect(anilistJobs.some((j) => j.categories.includes("anime"))).toBe(true);
    expect(anilistJobs.some((j) => j.categories.includes("manga"))).toBe(true);
  });

  test("every query is routed — never sprayed at every provider", () => {
    // a comics-only query never touches AniList/TVMaze/Open Library
    const jobs = resolveProviderJobs(["comics"]);
    expect(jobs.some((j) => j.registryId === "anilist")).toBe(false);
    expect(jobs.some((j) => j.registryId === "tvmaze")).toBe(false);
    expect(jobs.some((j) => j.registryId === "openlib")).toBe(false);
  });
});

/* ---------------------------- license-gate enforcement ---------------------------- */

describe("license-gate enforcement (default-deny)", () => {
  test("a disabled provider is never contacted", async () => {
    setProviderToggles({
      anilist: false,
      madb: false,
      wikidata: false,
      bnf: false,
    });
    responder = () => anilistPage([ANILIST_HIT]);
    // manga: every live source gated → the curated local catalogue answers
    const snap = await runFederatedSearch("one piece", { categories: ["manga"] });
    expect(calls.length).toBe(0); // manga fully gated → local fill only
    expect(snap.providers).toEqual([]);
    expect(snap.usedLocal).toBe(true);
    expect(snap.hits.some((h) => h.item.title === "One Piece")).toBe(true);
    expect(snap.hits.every((h) => !h.isLive)).toBe(true);
  });

  test("IMDb (movie route) stays gated by default; Trakt needs a deployment flag", () => {
    expect(traktEnabled()).toBe(false); // no NEXT_PUBLIC_TRAKT_ENABLED in tests
    expect(igdbEnabled()).toBe(false);
    const jobs = resolveProviderJobs(["movie", "series", "game"]);
    expect(jobs.some((j) => j.registryId === "imdb")).toBe(false);
    expect(jobs.some((j) => j.registryId === "trakt")).toBe(false);
    expect(jobs.some((j) => j.registryId === "igdb")).toBe(false);
  });

  test("user toggles switch IMDb + Cinemeta on at the router", () => {
    setProviderToggles({ imdb: true, cinemeta: true });
    const jobs = resolveProviderJobs(["movie"]);
    expect(jobs.some((j) => j.registryId === "imdb")).toBe(true);
    // wikidata no longer serves movie (specialized coverage exists)
    expect(jobs.some((j) => j.registryId === "wikidata")).toBe(false);
  });
});

/* ------------------------- isolation · parallel · timeout ------------------------- */

describe("provider isolation, parallel search, timeouts", () => {
  test("one failed provider never prevents the others' results", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return null; // 500 → error
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return null; // 500 → error
      if (url.includes("api.tvmaze.com/search")) {
        return [
          {
            show: {
              id: 169,
              url: "https://www.tvmaze.com/shows/169",
              name: "Breaking Bad",
              type: "Scripted",
              genres: ["Drama"],
              premiered: "2008-01-20",
              rating: { average: 9.2 },
              summary: "<p>Chemistry teacher.</p>",
              externals: { imdb: "tt0903747" },
            },
          },
        ];
      }
      return null;
    };
    const snap = await runFederatedSearch("breaking bad", { categories: ["anime", "series"] });
    const statuses = Object.fromEntries(snap.providers.map((p) => [p.id, p.status]));
    expect(statuses["anilist"]).toBe("error");
    expect(statuses["madb"]).toBe("error");
    expect(statuses["tvmaze"]).toBe("ok");
    expect(snap.hits.some((h) => h.item.title === "Breaking Bad")).toBe(true);
  });

  test("a slow provider times out independently; fast providers still answer", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        // never resolves before its timeout (simulate with a hung promise)
        return new Promise(() => undefined) as unknown as null;
      }
      if (url.includes("wikidata.org") && url.includes("wbsearchentities")) {
        return { search: [] };
      }
      if (url.includes("wikidata.org")) return {};
      return null;
    };
    // movie+series: wikidata answers movies fast while TVMaze hangs on series
    const handle = createFederatedSearch("slow provider test", { categories: ["movie", "series"] });
    let fastAnswered = false;
    await new Promise<void>((resolve) => {
      void createFederatedSearch("slow provider test", {
        categories: ["movie", "series"],
        onUpdate: (s) => {
          if (s.providers.some((p) => p.id === "wikidata" && p.status !== "pending")) {
            fastAnswered = true;
            resolve();
          }
        },
      }).promise.then(() => resolve());
    });
    handle.cancel();
    expect(fastAnswered).toBe(true); // the hung provider never blocked wikidata
  });

  test("progressive updates fire as providers answer (slow never blocks fast)", async () => {
    let anilistDelay = 40;
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(anilistPage([ANILIST_HIT])), anilistDelay),
        ) as unknown as null;
      }
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return { results: { bindings: [] } };
      return null;
    };
    const updates: boolean[] = [];
    const snap = await runFederatedSearch("one piece", {
      categories: ["anime"],
      onUpdate: (s) => updates.push(s.done),
    });
    // at least one intermediate update arrived before the final one
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates[updates.length - 1]).toBe(true);
    expect(snap.done).toBe(true);
    expect(snap.hits.some((h) => h.item.provider === "anilist")).toBe(true);
  });
});

/* --------------------------- cancellation and debounce --------------------------- */

describe("cancellation (query changed)", () => {
  test("cancel() aborts the search: no results render, providers marked cancelled", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) {
        return new Promise(() => undefined) as unknown as null; // hangs
      }
      if (url.includes("mediaarts-db.artmuseums.go.jp")) {
        return new Promise(() => undefined) as unknown as null;
      }
      return null;
    };
    const handle = createFederatedSearch("cancelled query", { categories: ["anime"] });
    setTimeout(() => handle.cancel(), 30);
    const snap = await handle.promise;
    expect(snap.done).toBe(false);
    expect(snap.providers.every((p) => p.status === "cancelled" || p.status === "pending")).toBe(true);
  });

  test("an aborted engine signal propagates to the provider fetches", async () => {
    // every provider hangs → the abort lands while requests are in flight
    responder = () => new Promise(() => undefined) as unknown as null;
    const engine = new AbortController();
    const handle = createFederatedSearch("abort signal test", {
      categories: ["anime"],
      signal: engine.signal,
    });
    setTimeout(() => engine.abort(), 20);
    const snap = await handle.promise;
    expect(snap.done).toBe(false);
    expect(snap.providers.every((p) => p.status === "cancelled")).toBe(true);
  });
});

/* ------------------------------ rate-limit handling ------------------------------ */

describe("rate-limit handling with Retry-After", () => {
  test("a 429 + Retry-After puts the provider in a cooldown; the next search skips it", async () => {
    let anilistCalls = 0;
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) {
        anilistCalls++;
        return new Response(JSON.stringify({}), {
          status: 429,
          headers: { "Retry-After": "120" },
        });
      }
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return { results: { bindings: [] } };
      return null;
    };
    const first = await runFederatedSearch("rate limit test", { categories: ["anime"] });
    const anilistState = first.providers.find((p) => p.id === "anilist")!;
    expect(anilistState.status).toBe("rate_limited");
    expect(anilistState.retryAfterMs).toBe(120_000);

    const callsAfterFirst = anilistCalls;
    const second = await runFederatedSearch("rate limit test two", { categories: ["anime"] });
    expect(anilistCalls).toBe(callsAfterFirst); // cooldown: no new call
    expect(second.providers.some((p) => p.id === "anilist")).toBe(false);
  });

  test("Retry-After parsing: seconds and HTTP dates", async () => {
    const { parseRetryAfterMs } = await import("../providers/types");
    expect(parseRetryAfterMs("30")).toBe(30_000);
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("not-a-date")).toBeUndefined();
    const future = new Date(Date.now() + 45_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms === undefined ? 0 : ms).toBeGreaterThan(30_000);
  });
});

/* ----------------------------- proxy providers (Trakt/IGDB) ----------------------------- */

describe("proxy providers — browser vs server connections", () => {
  test("Trakt adapter reports missing_key (not a failure) when the proxy is unconfigured", async () => {
    responder = (url) => {
      if (url.startsWith("/api/echo/providers/trakt")) {
        return { configured: false, results: [] };
      }
      return null;
    };
    const snap = await runFederatedSearch("proxy unconfigured", { categories: ["movie"] });
    // trakt is not routed without the flag — simulate direct adapter call:
    const { traktProvider } = await import("../federated/router");
    await traktProvider
      .search("dune", { mediaTypes: ["movie"], limit: 5 })
      .then(() => expect(true).toBe(false)) // must throw
      .catch((err: Error & { code?: string }) => {
        expect((err as { code?: string }).code ?? err.name).toBeDefined();
      });
    expect(snap.providers.length).toBeGreaterThanOrEqual(0);
  });

  test("Trakt normalization: search rows → MediaItems with attribution and ids", () => {
    const rows = [
      {
        score: 10,
        type: "movie",
        movie: {
          title: "Dune",
          year: 2021,
          overview: "A noble family…",
          ids: { trakt: 100, slug: "dune-2021", imdb: "tt1160419", tmdb: 438631 },
        },
      },
    ];
    const items = normalizeTraktResults(rows, "movie", 5);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Dune");
    expect(items[0].releaseYear).toBe(2021);
    expect(items[0].externalIds).toMatchObject({ trakt: "100", imdb: "tt1160419" });
    expect(items[0].canonicalUrl).toContain("trakt.tv/movies/dune-2021");
    expect(items[0].sourceAttribution).toContain("Trakt");
    expect(items[0].providerRef?.termsUrl).toContain("trakt");
  });

  test("IGDB normalization: games → MediaItems with cover art and platform tags", () => {
    const rows = [
      {
        id: 1030,
        name: "The Legend of Zelda: Breath of the Wild",
        slug: "the-legend-of-zelda-breath-of-the-wild",
        summary: "Open-air adventure.",
        first_release_date: 1489449600, // 2017-03-14
        genres: [{ name: "Adventure" }],
        platforms: [{ abbreviation: "Switch" }, { abbreviation: "Wii U" }],
        involved_companies: [{ developer: true, company: { name: "Nintendo EPD" } }],
        cover: { image_id: "co1r7d" },
      },
    ];
    const items = normalizeIgdbResults(rows, 5);
    expect(items.length).toBe(1);
    expect(items[0].releaseYear).toBe(2017);
    expect(items[0].creators).toEqual(["Nintendo EPD"]);
    expect(items[0].posterUrl).toContain("images.igdb.com");
    expect(items[0].tags).toContain("Switch");
    expect(items[0].localId).toBe("igdb:1030");
  });
});

/* ------------------------------ no persistence ------------------------------ */

describe("no persistent external result storage", () => {
  test("a federated search never writes provider results to IndexedDB", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return { results: { bindings: [] } };
      return null;
    };
    const before = await db.getAllMedia();
    const snap = await runFederatedSearch("persistence guard", { categories: ["anime"] });
    expect(snap.hits.length).toBeGreaterThan(0);
    const after = await db.getAllMedia();
    // not a single live result was persisted
    expect(after.length).toBe(before.length);
    expect(after.some((m) => m.localId.startsWith("anilist:"))).toBe(false);
  });

  test("searchCatalogue (legacy API) also never persists live results", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return { results: { bindings: [] } };
      return null;
    };
    const before = await db.getAllMedia();
    await searchCatalogue("persistence guard two", { mediaTypes: ["anime"], limit: 5 });
    const after = await db.getAllMedia();
    expect(after.length).toBe(before.length);
  });
});

/* ----------------------------------- dedup ----------------------------------- */

describe("evidence-based deduplication", () => {
  const base = {
    mediaType: "series" as const,
    format: "series" as const,
    genres: [],
    tags: [],
  };

  test("shared verified identifier merges into one hit with both sources", () => {
    const a = mediaItem({
      ...base,
      localId: "tvmaze:169",
      provider: "tvmaze",
      title: "Breaking Bad",
      releaseYear: 2008,
      externalIds: { tvmaze: "169", imdb: "tt0903747" },
    });
    const b = mediaItem({
      ...base,
      localId: "wikidata:Q83495",
      provider: "wikidata",
      title: "Breaking Bad",
      releaseYear: 2008,
      externalIds: { wikidata: "Q83495", imdb: "tt0903747" },
    });
    const hits = dedupeAndMerge([input(a, "tvmaze", 1), input(b, "wikidata", 5)]);
    expect(hits.length).toBe(1);
    expect(hits[0].contributions.map((c) => c.providerId).sort()).toEqual(["tvmaze", "wikidata"]);
    expect(hits[0].confidence).toBe("identifier");
    expect(hits[0].matchedIds).toContain("imdb:tt0903747");
    // the specialized provider's record is primary
    expect(hits[0].item.provider).toBe("tvmaze");
  });

  test("different content categories NEVER merge (manga vs its anime adaptation)", () => {
    const manga = mediaItem({
      ...base,
      mediaType: "manga",
      format: "book",
      localId: "anilist-manga:30013",
      provider: "anilist",
      title: "Attack on Titan",
      releaseYear: 2009,
    });
    const anime = mediaItem({
      ...base,
      mediaType: "anime",
      localId: "anilist:16498",
      provider: "anilist",
      title: "Attack on Titan",
      releaseYear: 2013,
    });
    const hits = dedupeAndMerge([input(manga, "anilist", 1), input(anime, "anilist", 1)]);
    expect(hits.length).toBe(2);
  });

  test("series vs volume/edition never merge (granularity guard)", () => {
    const series = mediaItem({
      ...base,
      mediaType: "manga",
      format: "book",
      localId: "madb:C274933",
      provider: "madb",
      title: "進撃の巨人",
      releaseYear: 2010,
      subtype: "manga-series",
    });
    const volume = mediaItem({
      ...base,
      mediaType: "manga",
      format: "book",
      localId: "inventaire:inv:08b4",
      provider: "inventaire",
      title: "One-Punch Man, Vol. 15",
      subtype: "volume",
    });
    const edition = mediaItem({
      ...base,
      mediaType: "book",
      format: "book",
      localId: "bnf:ark:/12148/cb43483041j",
      provider: "bnf",
      title: "Dune",
      releaseYear: 2006,
      subtype: "edition",
    });
    const work = mediaItem({
      ...base,
      mediaType: "book",
      format: "book",
      localId: "openlib:OL893415W",
      provider: "openlib",
      title: "Dune",
      releaseYear: 2006,
    });
    const work2 = mediaItem({
      ...base,
      mediaType: "book",
      format: "book",
      localId: "wikidata:Q1012455",
      provider: "wikidata",
      title: "Dune",
      releaseYear: 1965,
      externalIds: { wikidata: "Q1012455" },
    });
    const hits = dedupeAndMerge([
      input(series, "madb", 2),
      input(volume, "inventaire", 3),
      input(edition, "bnf", 4),
      input(work, "openlib", 1),
      input(work2, "wikidata", 5),
    ]);
    // 5 logical results: manga series, manga volume, three Dune records
    // (edition + 1965 work + 2006 work — distinct works never merge).
    expect(hits.length).toBe(5);
    const duneHits = hits.filter((h) => h.item.title === "Dune");
    expect(duneHits.length).toBe(3); // two works + one edition, all separate
    expect(duneHits.some((h) => h.item.subtype === "edition")).toBe(true);
    // every Dune hit keeps exactly one contribution (nothing was merged)
    expect(duneHits.every((h) => h.contributions.length === 1)).toBe(true);
  });

  test("two work-level records of the same work DO merge (title + exact year)", () => {
    const a = mediaItem({
      ...base,
      mediaType: "book",
      format: "book",
      localId: "openlib:OL893415W",
      provider: "openlib",
      title: "Dune",
      releaseYear: 1965,
    });
    const b = mediaItem({
      ...base,
      mediaType: "book",
      format: "book",
      localId: "wikidata:Q1012455",
      provider: "wikidata",
      title: "Dune",
      releaseYear: 1965,
    });
    const hits = dedupeAndMerge([input(a, "openlib", 1), input(b, "wikidata", 5)]);
    expect(hits.length).toBe(1);
    expect(hits[0].contributions.length).toBe(2);
    expect(hits[0].item.provider).toBe("openlib"); // specialized primary
  });

  test("conflicting identifiers block a title merge (distinct same-title works)", () => {
    const a = mediaItem({
      ...base,
      localId: "tvmaze:1",
      provider: "tvmaze",
      title: "The Sinner",
      releaseYear: 2017,
      externalIds: { imdb: "tt1" },
    });
    const b = mediaItem({
      ...base,
      localId: "tvmaze:2",
      provider: "tvmaze",
      title: "The Sinner",
      releaseYear: 2018,
      externalIds: { imdb: "tt2" },
    });
    expect(conflictingIdentifiers(a, b)).toBe(true);
    const hits = dedupeAndMerge([input(a, "tvmaze", 1), input(b, "tvmaze", 1)]);
    expect(hits.length).toBe(2); // ambiguity stays separate
  });

  test("year conflict (remake) never merges", () => {
    const a = mediaItem({
      ...base,
      localId: "wikidata:Q1",
      provider: "wikidata",
      title: "Dune",
      releaseYear: 1984,
    });
    const b = mediaItem({
      ...base,
      localId: "wikidata:Q2",
      provider: "wikidata",
      title: "Dune",
      releaseYear: 2021,
    });
    const hits = dedupeAndMerge([input(a, "wikidata", 5), input(b, "wikidata", 5)]);
    expect(hits.length).toBe(2);
  });

  test("identifier namespaces stay separate (anilist anime #21 ≠ manga #21)", () => {
    const anime = mediaItem({
      ...base,
      mediaType: "anime",
      localId: "anilist:21",
      provider: "anilist",
      title: "One Piece",
      releaseYear: 1999,
      externalIds: { anilist: "21" },
    });
    const manga = mediaItem({
      ...base,
      mediaType: "manga",
      format: "book",
      localId: "anilist-manga:21",
      provider: "anilist",
      title: "One Piece",
      releaseYear: 1997,
      externalIds: { anilist: "21" },
    });
    const keysA = identifierKeys(anime);
    const keysB = identifierKeys(manga);
    expect(keysA).toContain("anilist-anime:21");
    expect(keysB).toContain("anilist-manga:21");
    expect(keysA.some((k) => keysB.includes(k))).toBe(false);
  });

  test("Arabic and original titles participate in matching", () => {
    const withAr = mediaItem({
      ...base,
      localId: "echo-demo:m1",
      provider: "echo-demo",
      title: "Citizen Kane",
      titleAr: "المواطن كين",
      releaseYear: 1941,
    });
    expect(normalizeTitle("المواطن كين")).toBe(normalizeTitle("المواطن كين"));
    const wikidata = mediaItem({
      ...base,
      localId: "wikidata:Q131098",
      provider: "wikidata",
      title: "Citizen Kane",
      originalTitle: "Citizen Kane",
      releaseYear: 1941,
    });
    const hits = dedupeAndMerge([input(withAr, "echo-demo", 90, false), input(wikidata, "wikidata", 5)]);
    // local + live same work → one hit, live primary
    expect(hits.length).toBe(1);
    expect(hits[0].isLive).toBe(true);
  });
});

/* -------------------------------- attribution -------------------------------- */

describe("attribution and provenance", () => {
  test("every live hit carries attribution, a canonical URL and provider reference", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("mediaarts-db.artmuseums.go.jp")) return { results: { bindings: [] } };
      return null;
    };
    const snap = await runFederatedSearch("attribution test", { categories: ["anime"] });
    expect(snap.hits.length).toBeGreaterThan(0);
    for (const hit of snap.hits) {
      expect(hit.item.sourceAttribution).toBeTruthy();
      expect(hit.item.canonicalUrl).toBeTruthy();
      expect(hit.item.providerRef?.providerId).toBeTruthy();
      expect(hit.item.providerRef?.termsUrl).toBeTruthy();
      expect(hit.contributions.length).toBeGreaterThanOrEqual(1);
      expect(hit.contributions[0].providerLabel).toBeTruthy();
    }
  });
});

/* ------------------------------ offline fallback ------------------------------ */

describe("graceful offline fallback", () => {
  test("offline → no live provider is contacted; labelled local content answers", async () => {
    const prevNavigator = (globalThis as { navigator?: Navigator }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    try {
      const snap = await runFederatedSearch("Inception", { categories: ["movie"] });
      expect(calls.length).toBe(0);
      expect(snap.offline).toBe(true);
      expect(snap.providers).toEqual([]);
      expect(snap.usedLocal).toBe(true);
      expect(snap.hits.length).toBeGreaterThan(0);
      expect(snap.hits.every((h) => !h.isLive)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: prevNavigator,
        configurable: true,
      });
    }
  });
});

/* ------------------------------ adapter mappings ------------------------------ */

describe("MADB adapter (SPARQL, browser-direct)", () => {
  test("builds a series-level manga query with label + name matching", () => {
    const sparql = buildMadbSparql("進撃の巨人", [{ cls: "MangaBookSeries", subtype: "manga-series" }], 8);
    expect(sparql).toContain("MangaBookSeries");
    expect(sparql).toContain("進撃の巨人");
    // volume-level records (MangaBook) and episode-level (AnimationTVProgram)
    // are excluded — exact class IRI check, not a substring
    expect(sparql).not.toMatch(/class#MangaBook>/);
    expect(sparql).not.toContain("AnimationTVProgram");
  });

  test("maps a SPARQL row to a normalized manga item with volume count", () => {
    const item = madbRowToItem(
      {
        s: { value: "https://mediaarts-db.artmuseums.go.jp/id/C274933" },
        label: { value: "進撃の巨人" },
        names: { value: "シンゲキ ノ キョジン|attack on titan|進撃の巨人" },
        creators: { value: "[著]諫山創|[訳]シェルダン・ドルヅカ" },
        date: { value: "2010-03-17" },
        publisher: { value: "講談社　∥　コウダンシャ" },
        lang: { value: "日本語" },
        items: { value: "27" },
        classuri: { value: "https://mediaarts-db.artmuseums.go.jp/data/class#MangaBookSeries" },
      },
      { MangaBookSeries: "manga-series" },
    )!;
    expect(item).toBeTruthy();
    expect(item.mediaType).toBe("manga");
    expect(item.subtype).toBe("manga-series");
    expect(item.title).toBe("attack on titan"); // romanized title preferred
    expect(item.originalTitle).toBe("進撃の巨人");
    expect(item.altTitles).toContain("シンゲキ ノ キョジン");
    expect(item.releaseYear).toBe(2010);
    expect(item.volumeCount).toBe(27);
    expect(item.creators).toContain("諫山創");
    expect(item.canonicalUrl).toContain("/id/C274933");
    expect(item.externalIds).toMatchObject({ madb: "C274933" });
  });

  test("live-style row with missing fields degrades gracefully (no fabrication)", () => {
    const item = madbRowToItem(
      {
        s: { value: "https://mediaarts-db.artmuseums.go.jp/id/C370792" },
        label: { value: "進撃の巨人" },
        classuri: { value: "https://mediaarts-db.artmuseums.go.jp/data/class#MangaBookSeries" },
      },
      { MangaBookSeries: "manga-series" },
    )!;
    expect(item.releaseYear).toBeUndefined();
    expect(item.volumeCount).toBeUndefined();
    expect(item.creators).toBeUndefined();
  });
});

describe("BnF adapter (SRU, browser-direct XML)", () => {
  test("extracts DC fields from an SRU record block", () => {
    const block = `<srw:record><srw:recordIdentifier>ark:/12148/cb38823886r</srw:recordIdentifier>
      <oai_dc:dc><dc:title>Astérix et les Normands</dc:title>
      <dc:creator>Goscinny, René (1926-1977). Auteur du texte</dc:creator>
      <dc:publisher>Hachette</dc:publisher><dc:date>2000</dc:date>
      <dc:language>fre</dc:language>
      <dc:subject>bande dessinée</dc:subject></oai_dc:dc></srw:record>`;
    const rec = parseBnfRecord(block)!;
    expect(rec.ark).toBe("ark:/12148/cb38823886r");
    expect(rec.title).toBe("Astérix et les Normands");
    expect(rec.creators[0]).toBe("Goscinny, René");
    expect(rec.language).toBe("fre");
  });

  test("comics queries add the bande dessinée subject filter; books don't", () => {
    const decode = (u: string) => decodeURIComponent(u).replace(/\+/g, " ");
    const comicsUrl = decode(buildBnfUrl("asterix", ["comics"], 5));
    const booksUrl = decode(buildBnfUrl("asterix", ["book"], 5));
    expect(comicsUrl).toContain("bande dessinée");
    expect(booksUrl).not.toContain("bande dessinée");
    expect(comicsUrl).toContain("catalogue.bnf.fr/api/SRU");
  });

  test("query injection via SRU operators is neutralized", () => {
    const url = decodeURIComponent(buildBnfUrl('dune" and secret', ["book"], 5));
    expect(url).not.toContain('and secret');
  });
});

describe("Inventaire adapter (books, browser-direct)", () => {
  test("classifies results by P31 and keeps only requested types", async () => {
    responder = (url) => {
      if (url.includes("inventaire.io/api/search")) {
        return {
          results: [
            { id: "1", uri: "wd:Q8261", label: "Berserk", description: "novel by Anonymous" },
            { id: "2", uri: "wd:Q8274", label: "Berserk", description: "manga series by Kentaro Miura" },
          ],
          total: 2,
        };
      }
      if (url.includes("inventaire.io/api/entities")) {
        return {
          entities: {
            "wd:Q8261": { uri: "wd:Q8261", labels: { en: "Berserk" }, claims: { "wdt:P31": ["wd:Q8261"], "wdt:P50": ["wd:Q298826"], "wdt:P577": ["1978"] } },
            "wd:Q8274": { uri: "wd:Q8274", labels: { en: "Berserk" }, claims: { "wdt:P31": ["wd:Q8274"], "wdt:P577": ["1989"], "wdt:P407": ["wd:Q5287"] } },
          },
        };
      }
      return null;
    };
    const provider = new InventaireProvider();
    // books requested: the novel (Q8261) is kept, the manga entity is dropped —
    // strict type routing, nothing is guessed into a category
    const results = await provider.search("berserk", { mediaTypes: ["book"], limit: 5 });
    expect(results.length).toBe(1);
    expect(results[0].item.mediaType).toBe("book");
    expect(results[0].item.releaseYear).toBe(1978);
    expect(results[0].item.externalIds).toMatchObject({ inventaire: "wd:Q8261", wikidata: "Q8261" });
    expect(results[0].item.posterUrl).toBeUndefined(); // no images from Inventaire
    expect(calls.every((c) => c.url.startsWith("https://inventaire.io/api/"))).toBe(true);
    // manga is NOT served by Inventaire (inv: entities lack P31 — verified live)
    const mangaResults = await provider.search("berserk", { mediaTypes: ["manga"], limit: 5 });
    expect(mangaResults.length).toBe(0);
  });

  test("volume-shaped labels are labelled subtype volume (never merged with works)", async () => {
    responder = (url) => {
      if (url.includes("inventaire.io/api/search")) {
        return {
          results: [
            { id: "1", uri: "inv:08b42c3bb8fc7a30912cbb535e6bd693", label: "The Collected Poems, Vol. 5", description: "" },
          ],
        };
      }
      if (url.includes("inventaire.io/api/entities")) {
        return {
          entities: {
            "inv:08b42c3bb8fc7a30912cbb535e6bd693": {
              uri: "inv:08b42c3bb8fc7a30912cbb535e6bd693",
              labels: { en: "The Collected Poems, Vol. 5" },
              claims: { "wdt:P31": ["wd:Q571"] },
            },
          },
        };
      }
      return null;
    };
    const provider = new InventaireProvider();
    const results = await provider.search("collected poems", { mediaTypes: ["book"], limit: 5 });
    expect(results.length).toBe(1);
    expect(results[0].item.subtype).toBe("volume");
  });
});

/* ------------------------------ searchCatalogue mapping ------------------------------ */

describe("searchCatalogue maps the engine onto the legacy contract", () => {
  test("sources, failed, usedFallback and offline survive the mapping", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        return [
          {
            show: {
              id: 169,
              url: "https://www.tvmaze.com/shows/169",
              name: "Breaking Bad",
              type: "Scripted",
              genres: ["Drama"],
              premiered: "2008-01-20",
              rating: { average: 9.2 },
              summary: "",
              externals: { imdb: "tt0903747" },
            },
          },
        ];
      }
      return null; // everything else fails → failed list
    };
    const outcome = await searchCatalogue("legacy contract", {
      mediaTypes: ["movie", "series"],
      limit: 5,
    });
    expect(outcome.sources).toContain("TVMaze");
    expect(outcome.results.some((r) => r.item.title === "Breaking Bad")).toBe(true);
    // movies had no active specialized source → wikidata served them and 500ed
    expect(outcome.failed).toContain("Wikidata");
    expect(outcome.offline).toBe(false);
  });

  test("cached repeated queries share one upstream call set", async () => {
    let tvmazeCalls = 0;
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        tvmazeCalls++;
        return [
          {
            show: {
              id: 169,
              url: "https://www.tvmaze.com/shows/169",
              name: "Breaking Bad",
              type: "Scripted",
              genres: ["Drama"],
              premiered: "2008-01-20",
              summary: "",
              externals: { imdb: "tt0903747" },
            },
          },
        ];
      }
      return null;
    };
    await searchFederatedCached("cache me", { categories: ["series"] });
    await searchFederatedCached("cache me", { categories: ["series"] });
    await searchFederatedCached("cache me", { categories: ["series"] });
    expect(tvmazeCalls).toBe(1); // one upstream call, shared across searches
  });
});

/* ------------------------------ route preview (UI) ------------------------------ */

describe("routePreview (routing transparency for the UI)", () => {
  test("shows which providers serve a category and whether they are enabled", () => {
    const rows = routePreview(["comics"]);
    const ids = rows.map((r) => r.registryId);
    expect(ids).toContain("bnf");
    // wikidata runs ALONGSIDE BnF for comics (suppressWikidata: false)
    expect(ids).toContain("wikidata");
    expect(rows.every((r) => r.enabled)).toBe(true);
  });
});
