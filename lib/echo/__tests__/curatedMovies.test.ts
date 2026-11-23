/**
 * ECHO — Curated local movie starter collection (Phase 2) data tests.
 *
 * Editorial contract (docs/DATA_PROVIDER_COMPLIANCE.md):
 *  - original EN + AR synopses on every entry
 *  - NO fabricated ratings, popularity, awards, vote counts or runtimes
 *  - recognisable classics with real decade/country/genre spread
 *  - clearly labelled as ECHO-curated sample content (provider "echo-demo",
 *    "Sample" source chip, curated source attribution)
 *  - stable ids that never collide with the demo universe
 */

import { describe, expect, test } from "bun:test";
import { CURATED_MOVIES } from "../data/curatedMovies";
import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import { DemoProvider } from "../providers/demo";
import type { MediaItem } from "../types";

const provider = new DemoProvider();

describe("curated movie starter collection — editorial rules", () => {
  test("every entry is a movie with original EN + AR synopses", () => {
    expect(CURATED_MOVIES.length).toBeGreaterThanOrEqual(40);
    for (const seed of CURATED_MOVIES) {
      expect(seed.mediaType).toBe("movie");
      expect(seed.format).toBe("film");
      expect(seed.synopsis.length).toBeGreaterThan(40);
      expect(seed.synopsisAr.length).toBeGreaterThan(40);
      expect(seed.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(seed.year)).toBe(true);
      expect(seed.year).toBeGreaterThanOrEqual(1920);
      expect(seed.year).toBeLessThanOrEqual(2025);
      expect(seed.genres.length).toBeGreaterThan(0);
      expect(seed.creators?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("no fabricated ratings, popularity, awards or runtimes", () => {
    for (const seed of CURATED_MOVIES) {
      const item = demoToMediaItem(seed);
      expect(item.publicScore).toBeUndefined();
      expect(item.rating).toBeUndefined(); // no rating provenance
      expect(item.runtimeMinutes).toBeUndefined();
      expect(item.posterUrl).toBeUndefined(); // generated placeholder art only
      // content ratings omitted rather than approximated
      expect(seed.contentRating).toBeUndefined();
    }
  });

  test("entries are labelled as ECHO-curated sample content", () => {
    for (const seed of CURATED_MOVIES) {
      const item = demoToMediaItem(seed);
      expect(item.provider).toBe("echo-demo");
      expect(item.localId).toBe(`echo-demo:${seed.id}`);
      expect(item.sourceAttribution).toContain("ECHO curated sample collection");
      // v2 provenance stamp from the approved registry entry
      expect(item.providerRef?.providerId).toBe("echo-demo");
      expect(item.providerRef?.licenseStatus).toBe("approved");
      expect(item.workId).toBe(`echo-work-echo-demo-${seed.id}`);
    }
  });

  test("ids are unique and never collide with the demo universe", () => {
    const ids = new Set<string>();
    for (const seed of CURATED_MOVIES) {
      expect(ids.has(seed.id)).toBe(false);
      ids.add(seed.id);
      expect(seed.id.startsWith("cm-")).toBe(true);
    }
    const demoIds = new Set(DEMO_CATALOGUE.map((s) => s.id));
    for (const id of ids) expect(demoIds.has(id)).toBe(true); // composed in
    // no duplicate (title, year) works either
    const keys = new Set<string>();
    for (const seed of DEMO_CATALOGUE) {
      const key = `${seed.title.toLowerCase()}|${seed.year}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  test("real spread across decades, countries and genres", () => {
    const decades = new Set(CURATED_MOVIES.map((s) => Math.floor(s.year / 10) * 10));
    const countries = new Set(CURATED_MOVIES.flatMap((s) => s.countries ?? []));
    const genres = new Set(CURATED_MOVIES.flatMap((s) => s.genres));
    const languages = new Set(CURATED_MOVIES.flatMap((s) => s.languages ?? []));
    expect(decades.size).toBeGreaterThanOrEqual(9); // 1920s … 2010s
    expect(countries.size).toBeGreaterThanOrEqual(12);
    expect(genres.size).toBeGreaterThanOrEqual(15);
    expect(languages.size).toBeGreaterThanOrEqual(10);
    // pre-1990 classics are well represented (not a "recent releases" list)
    const pre1990 = CURATED_MOVIES.filter((s) => s.year < 1990).length;
    expect(pre1990).toBeGreaterThanOrEqual(20);
    // Arabic-language cinema is represented (the app ships an Arabic UI)
    expect(CURATED_MOVIES.some((s) => (s.languages ?? []).includes("Arabic"))).toBe(true);
  });
});

describe("curated movies work through the local provider", () => {
  test("searchable by English, Arabic and original titles", async () => {
    const byTitle = await provider.search("The Godfather", { mediaTypes: ["movie"], limit: 3 });
    expect(byTitle[0].item.title).toBe("The Godfather");
    expect(byTitle[0].sourceLabel).toBe("Sample");

    const byArabic = await provider.search("باب الحديد", { mediaTypes: ["movie"], limit: 3 });
    expect(byArabic[0].item.title).toBe("Cairo Station");

    const byOriginal = await provider.search("Cidade de Deus", { mediaTypes: ["movie"], limit: 3 });
    expect(byOriginal[0].item.title).toBe("City of God");
  });

  test("search respects the requested content type", async () => {
    const results = await provider.search("Metropolis", { mediaTypes: ["series"], limit: 5 });
    expect(results.length).toBe(0); // the movie is not returned for series
    const movieResults = await provider.search("Metropolis", { mediaTypes: ["movie"], limit: 5 });
    expect(movieResults.some((r) => r.item.title === "Metropolis")).toBe(true);
  });

  test("poolForTypes returns only requested types, genre-matched first", () => {
    const pool = provider.poolForTypes(["movie"], { genres: ["crime"], limit: 8 });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((m) => m.mediaType === "movie")).toBe(true);
    expect(pool[0].genres).toContain("crime");

    const mixed = provider.poolForTypes(["movie", "series"], { limit: 40 });
    expect(mixed.every((m) => m.mediaType === "movie" || m.mediaType === "series")).toBe(true);
    expect(mixed.some((m) => m.mediaType === "movie")).toBe(true);
    expect(mixed.some((m) => m.mediaType === "series")).toBe(true);
  });

  test("movie pools weave classics with recent titles (not a recent-only shelf)", () => {
    // the first 12 movie entries — a Discover starter shelf's worth — must
    // include pre-1990 curated classics AND post-1990 demo-universe titles
    const pool = provider.poolForTypes(["movie"], { limit: 12 });
    const years = pool.map((m) => m.releaseYear ?? 0);
    expect(years.some((y) => y < 1990)).toBe(true); // classics present
    expect(years.some((y) => y >= 1990)).toBe(true); // recent titles present
    // and the classics are curated-collection records
    expect(
      pool.some(
        (m) =>
          (m.releaseYear ?? 0) < 1990 &&
          m.sourceAttribution?.includes("ECHO curated sample collection"),
      ),
    ).toBe(true);
  });

  test("poolForTypes honours the visibility ceiling like live providers", () => {
    const all: MediaItem[] = provider.poolForTypes(["movie", "series"], { limit: 100, visibility: "moderate" });
    const safe: MediaItem[] = provider.poolForTypes(["movie", "series"], { limit: 100, visibility: "safe" });
    // safe never shows MORE than moderate
    expect(safe.length).toBeLessThanOrEqual(all.length);
    // moderate shows the unrated curated classics; safe hides them
    expect(all.some((m) => m.localId.startsWith("echo-demo:cm-"))).toBe(true);
    expect(safe.some((m) => m.localId.startsWith("echo-demo:cm-"))).toBe(false);
  });

  test("getTitle resolves curated records by providerId", async () => {
    const item = await provider.getTitle("cm-seven-samurai");
    expect(item?.title).toBe("Seven Samurai");
    expect(item?.originalTitle).toBe("Shichinin no Samurai");
    expect(item?.releaseYear).toBe(1954);
  });
});
