/**
 * ECHO — Catalogue routing tests under the license gate.
 * ALL network access is mocked: globalThis.fetch is stubbed per test —
 * NO live provider calls are ever made from this suite.
 *
 * Phase 1 requirements covered:
 *  - gated providers are never called (default-deny routing)
 *  - user toggles actually enable/disable providers at the router
 *  - provider failures degrade gracefully (failed list, no crash)
 *  - offline fallback to the labelled sample catalogue
 *  - rating provenance and external ids flow from adapters into items
 *  - findBestMatch links confidently and flags ambiguity for review
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import {
  fetchCandidatePool,
  fetchComingSoon,
  getTitleByLocalId,
  searchCatalogue,
} from "../providers";
import { findBestMatch } from "../providers/match";
import { setProviderToggles } from "../providers/registry";
import { closeDB } from "../localdb";

/* ------------------------------ fetch stubbing ----------------------------- */

type FetchCall = { url: string; body?: string };

let calls: FetchCall[] = [];
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
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    const out = responder(url, typeof init?.body === "string" ? init.body : undefined);
    if (out === null) return jsonResponse({}, 500); // default: provider "down"
    if (out instanceof Response) return out;
    return jsonResponse(out);
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  responder = () => null;
  setProviderToggles(null);
  await closeDB();
});

/** canned provider payloads */
function anilistPage(media: object[]) {
  return { data: { Page: { media } } };
}

const ANILIST_HIT = {
  id: 21,
  idMal: 21,
  title: { romaji: "One Piece", english: "One Piece" },
  genres: ["Adventure"],
  tags: [],
  isAdult: false,
  averageScore: 87,
  episodes: null,
  format: "TV",
  startDate: { year: 1999 },
  siteUrl: "https://anilist.co/anime/21",
  coverImage: { large: "https://img.test/op.jpg" },
  description: "Pirates.",
  countryOfOrigin: "JP",
};

const TVMAZE_HIT = {
  id: 169,
  url: "https://www.tvmaze.com/shows/169",
  name: "Breaking Bad",
  type: "Scripted",
  language: "English",
  genres: ["Drama"],
  averageRuntime: 47,
  premiered: "2008-01-20",
  rating: { average: 9.2 },
  image: { medium: "https://img.test/bb.jpg" },
  summary: "<p>Chemistry teacher.</p>",
  externals: { imdb: "tt0903747" },
};

const OPENLIB_HIT = {
  key: "/works/OL12345W",
  title: "Dune",
  author_name: ["Frank Herbert"],
  first_publish_year: 1965,
  cover_i: 1,
  subject: ["science fiction"],
  language: ["eng"],
};

describe("license-gated search routing (default-deny)", () => {
  test("gated providers are never called; enabled ones are", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("api.tvmaze.com/search")) return [{ show: TVMAZE_HIT }];
      if (url.includes("openlibrary.org/search")) return { docs: [OPENLIB_HIT] };
      return null;
    };
    const outcome = await searchCatalogue("gated default routing test", {
      mediaTypes: ["anime", "movie", "series", "game", "book"],
      limit: 5,
    });

    // enabled: anilist, tvmaze, openlib
    expect(outcome.sources).toContain("AniList");
    expect(outcome.sources).toContain("TVMaze");
    expect(outcome.sources).toContain("Open Library");
    // gated: imdb suggestions, cinemeta, kitsu, rawg — zero network calls
    const urls = calls.map((c) => c.url).join(" ");
    expect(urls).not.toContain("media-imdb.com");
    expect(urls).not.toContain("cinemeta");
    expect(urls).not.toContain("kitsu");
    expect(urls).not.toContain("rawg");
    expect(outcome.usedFallback).toBe(false);
    // results carried through
    expect(outcome.results.some((r) => r.item.provider === "anilist")).toBe(true);
    expect(outcome.results.some((r) => r.item.provider === "tvmaze")).toBe(true);
    expect(outcome.results.some((r) => r.item.provider === "openlib")).toBe(true);
    expect(outcome.results.some((r) => r.item.provider === "imdb")).toBe(false);
  });

  test("user toggles switch IMDb + Cinemeta back on at the router", async () => {
    setProviderToggles({ imdb: true, cinemeta: true });
    responder = (url) => {
      if (url.includes("media-imdb.com/suggestion")) {
        return { d: [{ id: "tt0903747", l: "Breaking Bad", qid: "tvSeries", y: 2008 }] };
      }
      if (url.includes("cinemeta.strem.io/meta")) {
        return { meta: { name: "Breaking Bad", year: "2008", genres: ["Drama"], imdbRating: "9.5" } };
      }
      return null;
    };
    const outcome = await searchCatalogue("user enables imdb test", {
      mediaTypes: ["series"],
      limit: 5,
    });
    expect(calls.some((c) => c.url.includes("media-imdb.com"))).toBe(true);
    expect(calls.some((c) => c.url.includes("cinemeta"))).toBe(true);
    expect(outcome.sources).toContain("IMDb");
    const imdbItem = outcome.results.find((r) => r.item.provider === "imdb-series");
    expect(imdbItem).toBeDefined();
    // rating provenance from Cinemeta/IMDb
    expect(imdbItem!.item.rating).toEqual({ source: "imdb", scale: "0-10", value: 9.5 });
  });

  test("a user toggle can disable an enabled provider (AniList off → no calls, labelled local fill)", async () => {
    // Wikidata (CC0, enabled by default) would otherwise answer anime as the
    // universal fallback, and MADB is now a default anime/manga source too —
    // both disabled here so this test exercises the pure AniList-off →
    // local-fill path it was written for.
    setProviderToggles({ anilist: false, wikidata: false, madb: false });
    responder = () => anilistPage([ANILIST_HIT]);
    const outcome = await searchCatalogue("Death Note", {
      mediaTypes: ["anime"],
      limit: 5,
    });
    expect(calls.length).toBe(0); // the disabled providers are never contacted
    // the only other anime provider (Kitsu) is hard-gated → the approved
    // local catalogue fills the anime gap, clearly labelled
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every((r) => r.item.provider === "echo-demo")).toBe(true);
    expect(outcome.results.every((r) => r.sourceLabel === "Sample")).toBe(true);
    expect(outcome.sources).toEqual([]); // no live source answered
  });

  test("RAWG never runs without a deployment key (no key ships in code)", async () => {
    // Wikidata would answer games as the CC0 universal fallback when RAWG is
    // unconfigured — disabled here so the test stays about RAWG's key gate.
    setProviderToggles({ wikidata: false });
    responder = () => ({ results: [] });
    const outcome = await searchCatalogue("rawg no key test", {
      mediaTypes: ["game"],
      limit: 5,
    });
    expect(calls.length).toBe(0);
    // this query matches nothing (not even the local curated games) → empty
    expect(outcome.results.length).toBe(0);
    expect(outcome.usedFallback).toBe(false);

    // Phase 3: a query that DOES match the curated local games now fills the
    // gap with clearly-labelled sample results — no RAWG call was made
    const curated = await searchCatalogue("Minecraft", {
      mediaTypes: ["game"],
      limit: 5,
    });
    expect(calls.length).toBe(0); // still zero network calls
    expect(curated.usedFallback).toBe(true);
    expect(curated.results.some((r) => r.item.title === "Minecraft")).toBe(true);
    expect(curated.results.every((r) => r.item.provider === "echo-demo")).toBe(true);
    expect(curated.results.every((r) => r.sourceLabel === "Sample")).toBe(true);
  });
});

describe("local coverage — per-type fill (Phase 2)", () => {
  test("movie search works ONLINE while IMDb + Cinemeta are gated (default state)", async () => {
    // IMDb + Cinemeta stay gated; Wikidata (CC0) IS contacted for movies now —
    // the universal live baseline — but the mock 500s, so the approved local
    // catalogue still fills the gap, clearly labelled. (Toggle it off to
    // verify the pure gated path makes no live calls for movies.)
    setProviderToggles({ wikidata: false });
    responder = () => null;
    const outcome = await searchCatalogue("The Godfather", {
      mediaTypes: ["movie"],
      limit: 5,
    });
    expect(calls.length).toBe(0); // nothing was contacted — all gated
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.offline).toBe(false); // this is NOT an offline fallback
    expect(outcome.results.length).toBeGreaterThan(0);
    const gf = outcome.results.find((r) =>
      r.item.title.toLowerCase().includes("godfather"),
    );
    expect(gf).toBeDefined();
    expect(gf!.item.provider).toBe("echo-demo");
    expect(gf!.sourceLabel).toBe("Sample");
    expect(gf!.item.rating).toBeUndefined(); // no fabricated ratings
  });

  test("live results suppress the local fill for that type; gaps still fill", async () => {
    // anime lives via AniList; movies are gated → only movies get local fill
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      return null;
    };
    const outcome = await searchCatalogue("metropolis", {
      mediaTypes: ["anime", "movie"],
      limit: 8,
    });
    expect(outcome.sources).toEqual(["AniList"]);
    expect(outcome.usedFallback).toBe(true);
    const animeResults = outcome.results.filter((r) => r.item.mediaType === "anime");
    const movieResults = outcome.results.filter((r) => r.item.mediaType === "movie");
    // anime came only from the live provider (no sample mixing)
    expect(animeResults.length).toBeGreaterThan(0);
    expect(animeResults.every((r) => r.item.provider === "anilist")).toBe(true);
    // the movie gap is filled by the labelled local catalogue (Metropolis)
    expect(
      movieResults.some(
        (r) => r.item.provider === "echo-demo" && r.item.title === "Metropolis",
      ),
    ).toBe(true);
  });

  test("a failing provider (network error) does not break local search for its type", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) throw new Error("network down");
      return null;
    };
    const outcome = await searchCatalogue("Breaking Bad", {
      mediaTypes: ["series"],
      limit: 5,
    });
    expect(outcome.failed).toContain("TVMaze");
    expect(outcome.usedFallback).toBe(true);
    expect(
      outcome.results.some(
        (r) => r.item.provider === "echo-demo" && r.item.title === "Breaking Bad",
      ),
    ).toBe(true);
  });

  test("Arabic and original titles are searchable and float to the top", async () => {
    responder = () => null;
    const outcome = await searchCatalogue("المواطن كين", {
      mediaTypes: ["movie"],
      limit: 5,
    });
    expect(outcome.results[0].item.title).toBe("Citizen Kane");

    const outcome2 = await searchCatalogue("Shichinin no Samurai", {
      mediaTypes: ["movie"],
      limit: 5,
    });
    expect(outcome2.results[0].item.title).toBe("Seven Samurai");
  });

  test("sample results never auto-link manual entries (usedFallback guard)", async () => {
    responder = () => null;
    const manual: MediaItem = {
      localId: "manual:x",
      provider: "manual",
      providerId: "Inception",
      mediaType: "movie",
      format: "film",
      title: "Inception",
      releaseYear: 2010,
      genres: [],
      tags: [],
    };
    const outcome = await findBestMatch(manual);
    expect(outcome.status).toBe("none"); // sample data must not link user records
  });
});

describe("provider failures degrade gracefully", () => {
  test("a failing provider lands in `failed`, the others still answer", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return null; // 500 → ProviderError
      if (url.includes("api.tvmaze.com/search")) return [{ show: TVMAZE_HIT }];
      return null;
    };
    const outcome = await searchCatalogue("failure handling test", {
      mediaTypes: ["anime", "series"],
      limit: 5,
    });
    expect(outcome.failed).toContain("AniList");
    expect(outcome.sources).toContain("TVMaze");
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.usedFallback).toBe(false);
  });

  test("offline + all applicable providers gated → sample fallback still works", async () => {
    const prevNavigator = (globalThis as { navigator?: Navigator }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    try {
      // movies only: IMDb + Cinemeta are gated off, so no jobs are queued —
      // the approved sample catalogue must still answer while offline
      const outcome = await searchCatalogue("Inception", {
        mediaTypes: ["movie"],
        limit: 5,
      });
      expect(calls.length).toBe(0); // no provider was contacted
      expect(outcome.usedFallback).toBe(true);
      expect(outcome.offline).toBe(true);
      expect(outcome.sources).toEqual([]); // no live source answered
      expect(outcome.results.length).toBeGreaterThan(0);
      expect(outcome.results.every((r) => r.sourceLabel === "Sample")).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: prevNavigator,
        configurable: true,
      });
    }
  });

  test("offline + everything failing falls back to the labelled sample catalogue", async () => {
    const prevNavigator = (globalThis as { navigator?: Navigator }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    try {
      responder = () => null; // every provider fails
      // a query that matches a real sample-catalogue title ("Death Note")
      const outcome = await searchCatalogue("Death Note", {
        mediaTypes: ["anime", "series"],
        limit: 5,
      });
      expect(outcome.usedFallback).toBe(true);
      expect(outcome.sources).toEqual([]); // no live source answered
      expect(outcome.results.length).toBeGreaterThan(0);
      expect(outcome.results[0].sourceLabel).toBe("Sample");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: prevNavigator,
        configurable: true,
      });
    }
  });
});

describe("rating provenance + external ids flow through adapters", () => {
  test("AniList items carry 0-100 scale provenance; TVMaze items carry IMDb ids", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("api.tvmaze.com/search")) return [{ show: TVMAZE_HIT }];
      return null;
    };
    const outcome = await searchCatalogue("provenance flow test", {
      mediaTypes: ["anime", "series"],
      limit: 5,
    });
    const anilistItem = outcome.results.find((r) => r.item.provider === "anilist")!.item;
    expect(anilistItem.rating).toEqual({ source: "anilist", scale: "0-100", value: 87 });
    expect(anilistItem.workId).toBe("echo-work-anilist-21");
    expect(anilistItem.externalIds).toEqual({ anilist: "21", mal: "21" });
    expect(anilistItem.providerRef?.providerId).toBe("anilist");
    expect(anilistItem.provenance?.title).toBe("anilist");

    const tvmazeItem = outcome.results.find((r) => r.item.provider === "tvmaze")!.item;
    expect(tvmazeItem.rating).toEqual({ source: "tvmaze", scale: "0-10", value: 9.2 });
    expect(tvmazeItem.externalIds?.imdb).toBe("tt0903747");
    expect(tvmazeItem.provenance?.genres).toBe("tvmaze");
  });
});

describe("metadata refresh is gated per record prefix", () => {
  test("IMDb records do not refresh while Cinemeta is disabled", async () => {
    responder = () => ({ meta: { name: "X" } });
    expect(await getTitleByLocalId("imdb:tt0903747")).toBeNull();
    expect(await getTitleByLocalId("imdb-series:tt0903747")).toBeNull();
    expect(calls.length).toBe(0); // gate blocks BEFORE any network
  });

  test("TVMaze records refresh when TVMaze is enabled", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/shows/169")) return TVMAZE_HIT;
      return null;
    };
    const item = await getTitleByLocalId("tvmaze:169");
    expect(item?.title).toBe("Breaking Bad");
    expect(item?.rating?.value).toBe(9.2);
  });

  test("unknown prefixes never refresh", async () => {
    expect(await getTitleByLocalId("tmdb:12345")).toBeNull();
    expect(calls.length).toBe(0);
  });
});

describe("gated candidate pools and coming-soon shelves", () => {
  test("candidate pool skips gated sources; enabled ones contribute", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      if (url.includes("openlibrary.org/subjects")) return { works: [OPENLIB_HIT] };
      return null;
    };
    const pool = await fetchCandidatePool({
      genres: ["drama"],
      mediaTypes: ["anime", "movie", "series", "game", "book"],
      limitPerSource: 5,
    });
    const urls = calls.map((c) => c.url).join(" ");
    expect(urls).not.toContain("cinemeta");
    expect(urls).not.toContain("rawg");
    expect(urls).not.toContain("kitsu");
    expect(pool.sources).toContain("AniList");
    expect(pool.pool.length).toBeGreaterThan(0);
    // Phase 2: movies & series have no enabled live pool → labelled local
    // items fill those types; Phase 3: games fill from the curated local
    // games collection (RAWG unconfigured) — every gap type is covered
    expect(pool.usedSample).toBe(true);
    expect(pool.pool.some((m) => m.mediaType === "movie" && m.provider === "echo-demo")).toBe(true);
    expect(pool.pool.some((m) => m.mediaType === "series" && m.provider === "echo-demo")).toBe(true);
    expect(pool.pool.some((m) => m.mediaType === "game" && m.provider === "echo-demo")).toBe(true);
    // live anime items are present and NOT displaced by sample items
    expect(pool.pool.some((m) => m.mediaType === "anime" && m.provider === "anilist")).toBe(true);
  });

  test("pool with NO live sources at all falls back fully to the local catalogue", async () => {
    // movies only: Cinemeta/IMDb gated, nothing else serves movies
    const pool = await fetchCandidatePool({
      genres: ["crime"],
      mediaTypes: ["movie"],
      limitPerSource: 10,
    });
    expect(calls.length).toBe(0);
    expect(pool.sources).toEqual([]);
    expect(pool.usedSample).toBe(true);
    expect(pool.pool.length).toBeGreaterThan(0);
    // genre-matched first: crime movies lead the pool
    expect(pool.pool[0].genres).toContain("crime");
  });

  test("coming-soon anime works via AniList; games stay empty without a RAWG key", async () => {
    responder = (url) => {
      if (url.includes("graphql.anilist.co")) return anilistPage([ANILIST_HIT]);
      return null;
    };
    const shelf = await fetchComingSoon({
      mediaTypes: ["anime", "game"],
      limitPerShelf: 4,
    });
    expect(shelf.airingAnime.length).toBe(1);
    expect(shelf.games.length).toBe(0); // no RAWG key configured
    expect(calls.some((c) => c.url.includes("rawg"))).toBe(false);
  });
});

describe("findBestMatch — automatic linking under the new rules", () => {
  function manualItem(over: Partial<MediaItem> & { title: string }): MediaItem {
    return {
      localId: `manual:${over.title}`,
      provider: "manual",
      providerId: over.title,
      mediaType: "series",
      format: "series",
      genres: [],
      tags: [],
      ...over,
    };
  }

  test("one confident hit → linked", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) return [{ show: TVMAZE_HIT }];
      return null;
    };
    const manual = manualItem({ title: "Breaking Bad", releaseYear: 2008 });
    const outcome = await findBestMatch(manual);
    expect(outcome.status).toBe("linked");
    if (outcome.status === "linked") {
      expect(outcome.item.localId).toBe("tvmaze:169");
    }
  });

  test("several distinct same-title works → ambiguous (flagged for review, never linked)", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        return [
          { show: { ...TVMAZE_HIT, id: 1, name: "The Sinner", premiered: "2017-01-01", externals: { imdb: "tt1" } } },
          { show: { ...TVMAZE_HIT, id: 2, name: "The Sinner", premiered: "2018-01-01", externals: { imdb: "tt2" } } },
        ];
      }
      return null;
    };
    const manual = manualItem({ title: "The Sinner" }); // no year — cannot disambiguate
    const outcome = await findBestMatch(manual);
    expect(outcome.status).toBe("ambiguous");
    if (outcome.status === "ambiguous") {
      expect(outcome.candidates.length).toBe(2);
    }
  });

  test("remakes (year conflict) never link", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        return [{ show: { ...TVMAZE_HIT, name: "Dune", premiered: "2000-01-01" } }];
      }
      return null;
    };
    const manual = manualItem({ title: "Dune", releaseYear: 1965, mediaType: "series" });
    const outcome = await findBestMatch(manual);
    expect(outcome.status).toBe("none");
  });

  test("substring hits never link", async () => {
    responder = (url) => {
      if (url.includes("api.tvmaze.com/search")) {
        return [{ show: { ...TVMAZE_HIT, name: "It Chapter Two", premiered: "2019-01-01" } }];
      }
      return null;
    };
    const manual = manualItem({ title: "It", releaseYear: 2017 });
    const outcome = await findBestMatch(manual);
    expect(outcome.status).toBe("none");
  });

  test("non-manual records never trigger matching", async () => {
    const outcome = await findBestMatch({
      ...manualItem({ title: "Breaking Bad" }),
      provider: "tvmaze",
      localId: "tvmaze:169",
    });
    expect(outcome.status).toBe("none");
    expect(calls.length).toBe(0);
  });
});
