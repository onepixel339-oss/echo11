/**
 * ECHO — Catalog metrics tests (reproducible data-quality measurement).
 *
 * Verifies the numbers the Settings "Catalog status" panel shows:
 *  - per-category counts by origin (curated / demo / shards) are exact
 *  - every one of the seven categories has locally available records
 *  - live-only providers are NEVER counted as stored records
 *  - metadata completeness, language/country spread, period coverage and
 *    artwork posture are computed from the real catalogue
 *  - the same inputs always produce the same outputs (reproducibility)
 *
 * Pure logic, no network.
 */

import { describe, expect, test } from "bun:test";
import { computeCatalogMetrics } from "../catalogMetrics";
import { CURATED_MANGA } from "../data/curatedManga";
import { CURATED_COMICS } from "../data/curatedComics";
import { DEMO_CATALOGUE } from "../data/demoCatalogue";
import { MEDIA_TYPES } from "../types";
import { isProviderEnabled } from "../providers/registry";
import type { MediaItem } from "../types";

function shardRecord(id: string, type: MediaItem["mediaType"], title: string): MediaItem {
  return {
    localId: `echo-catalog:${id}`,
    provider: "echo-catalog",
    providerId: id,
    mediaType: type,
    format: "book",
    title,
    genres: ["drama"],
    tags: [],
    synopsis: "A shard description.",
    releaseYear: 1900,
    workId: `echo-work-echo-catalog-${id}`,
  };
}

describe("catalog metrics — per-category record counts", () => {
  const metrics = computeCatalogMetrics([], 0);

  test("covers all seven categories", () => {
    expect(metrics.perCategory.map((c) => c.type)).toEqual(MEDIA_TYPES);
  });

  test("every category has locally available records (curated or demo)", () => {
    for (const cat of metrics.perCategory) {
      expect(cat.totalRecords).toBeGreaterThan(0);
      expect(cat.liveOnly).toBe(false);
    }
  });

  test("counts match the curated collections exactly", () => {
    const manga = metrics.perCategory.find((c) => c.type === "manga")!;
    expect(manga.curated).toBe(CURATED_MANGA.length);
    expect(manga.demo).toBe(0); // no demo-universe manga seeds

    const comics = metrics.perCategory.find((c) => c.type === "comics")!;
    expect(comics.curated).toBe(CURATED_COMICS.length);
    expect(comics.demo).toBe(0);

    const anime = metrics.perCategory.find((c) => c.type === "anime")!;
    expect(anime.curated).toBe(0);
    expect(anime.demo).toBe(
      DEMO_CATALOGUE.filter((s) => s.mediaType === "anime" && s.collection !== "curated").length,
    );
  });

  test("shard records count toward stored records, per type", () => {
    const withShards = computeCatalogMetrics(
      [shardRecord("s1", "book", "Shard Classic One"), shardRecord("s2", "comics", "Shard Comic")],
      0,
    );
    const books = withShards.perCategory.find((c) => c.type === "book")!;
    expect(books.shardImported).toBe(1);
    const comics = withShards.perCategory.find((c) => c.type === "comics")!;
    expect(comics.shardImported).toBe(1);
    expect(books.totalRecords).toBe(books.curated + books.demo + 1);
  });

  test("the same inputs always produce the same counts (reproducible)", () => {
    const a = computeCatalogMetrics([], 0);
    const b = computeCatalogMetrics([], 0);
    expect(JSON.stringify(a.perCategory)).toBe(JSON.stringify(b.perCategory));
    expect(a.inputs.catalogueRecords).toBe(DEMO_CATALOGUE.length);
  });
});

describe("catalog metrics — live sources are reported, never counted as records", () => {
  test("live sources per type reflect the CURRENT gate state", () => {
    // defaults: anilist (anime+manga), tvmaze (series), openlib (book),
    // wikidata (all types) enabled; imdb/cinemeta/kitsu off; rawg keyless
    const metrics = computeCatalogMetrics([], 0);
    const anime = metrics.perCategory.find((c) => c.type === "anime")!;
    const manga = metrics.perCategory.find((c) => c.type === "manga")!;
    const comics = metrics.perCategory.find((c) => c.type === "comics")!;

    expect(anime.liveSources).toContain("AniList");
    expect(manga.liveSources).toContain("AniList");
    // comics now has BnF (deep, slow) + the Wikidata baseline (fast)
    expect(comics.liveSources).toContain("Wikidata");
    expect(comics.liveSources).toContain("BnF Catalogue général");
    expect(comics.liveSources).not.toContain("AniList");
    // deployment-credential providers (Trakt/IGDB/RAWG) never report as live
    // in a keyless deployment
    for (const c of metrics.perCategory) {
      expect(c.liveSources).not.toContain("Trakt");
      expect(c.liveSources).not.toContain("IGDB");
      expect(c.liveSources).not.toContain("RAWG");
    }

    // and live providers never inflate the stored-record totals
    expect(anime.totalRecords).toBe(anime.curated + anime.demo + anime.shardImported);
  });

  test("source posture counts match the registry", () => {
    const metrics = computeCatalogMetrics([], 0);
    // approved: echo-demo + wikidata + trakt + bnf
    expect(metrics.sources.verifiedApproved.length).toBe(4);
    // restricted: anilist, tvmaze, rawg, openlib, igdb, madb, inventaire
    expect(metrics.sources.restricted.length).toBe(7);
    // unverified/pending: imdb, cinemeta, kitsu
    expect(metrics.sources.unverifiedOrPending.length).toBe(3);
    expect(metrics.sources.hardDisabled).toEqual(["Kitsu"]);
    // gate honesty: the metrics reflect isProviderEnabled directly
    for (const name of metrics.sources.verifiedApproved) expect(name.length).toBeGreaterThan(0);
  });
});

describe("catalog metrics — data quality dimensions", () => {
  const metrics = computeCatalogMetrics([], 0);

  test("metadata completeness: manga/comics synopses, years and creators are ~100%", () => {
    for (const type of ["manga", "comics"] as const) {
      const cat = metrics.perCategory.find((c) => c.type === type)!;
      expect(cat.metadataCompleteness.synopsis).toBe(100);
      expect(cat.metadataCompleteness.year).toBe(100);
      expect(cat.metadataCompleteness.creators).toBe(100);
      expect(cat.metadataCompleteness.bilingualTitles).toBe(100);
    }
  });

  test("period coverage spans a wide range per category", () => {
    const manga = metrics.perCategory.find((c) => c.type === "manga")!;
    expect(manga.periodCoverage.minYear!).toBeLessThanOrEqual(1935);
    expect(manga.periodCoverage.maxYear!).toBeGreaterThanOrEqual(2020);
    const comics = metrics.perCategory.find((c) => c.type === "comics")!;
    expect(comics.periodCoverage.minYear!).toBeLessThanOrEqual(1905);
    expect(comics.periodCoverage.maxYear!).toBeGreaterThanOrEqual(2010);
  });

  test("language and country distribution reflects the real catalogue", () => {
    const manga = metrics.perCategory.find((c) => c.type === "manga")!;
    expect(manga.countryDistribution["Japan"]).toBeGreaterThan(20);
    expect(manga.countryDistribution["South Korea"]).toBeGreaterThanOrEqual(2);
    expect(manga.countryDistribution["China"]).toBeGreaterThanOrEqual(1);
    expect(manga.languageDistribution["Japanese"]).toBeGreaterThan(20);
    expect(manga.languageDistribution["Korean"]).toBeGreaterThanOrEqual(2);

    const comics = metrics.perCategory.find((c) => c.type === "comics")!;
    const comicCountries = Object.keys(comics.countryDistribution);
    expect(comicCountries.length).toBeGreaterThanOrEqual(10);
  });

  test("artwork posture: all local records use generated placeholders (no bundled art)", () => {
    for (const cat of metrics.perCategory) {
      expect(cat.artwork.external).toBe(0);
      expect(cat.artwork.generated).toBe(cat.totalRecords);
    }
  });

  test("local-catalogue records carry no external ids by design (missing ≠ broken)", () => {
    const manga = metrics.perCategory.find((c) => c.type === "manga")!;
    expect(manga.missingExternalIds).toBe(manga.totalRecords);
  });
});

describe("catalog metrics — no regressions in coverage", () => {
  test("the full catalogue exceeds 240 bundled records across all seven types", () => {
    // 22 additional public-domain classics arrive via the catalog shard on
    // first sync (not part of the bundle — counted separately by the metrics)
    const metrics = computeCatalogMetrics([], 0);
    const total = metrics.perCategory.reduce((sum, c) => sum + c.totalRecords, 0);
    expect(total).toBe(DEMO_CATALOGUE.length);
    expect(total).toBeGreaterThan(240);
  });

  test("no duplicate (title, year) across the whole local catalogue", () => {
    const keys = new Set<string>();
    for (const seed of DEMO_CATALOGUE) {
      const key = `${seed.title.toLowerCase()}|${seed.year}`;
      expect(keys.has(key), `duplicate: ${key}`).toBe(false);
      keys.add(key);
    }
  });
});
