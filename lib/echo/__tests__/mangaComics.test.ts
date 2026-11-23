/**
 * ECHO — Manga & Comics first-class integration tests (catalog expansion).
 *
 * Covers:
 *  - editorial rules for both curated collections (bilingual synopses,
 *    verified print metadata, no fabricated ratings/popularity/artwork)
 *  - series vs issue vs collected-edition / manga vs manhwa distinctions
 *  - full Search integration (English / Arabic / romaji-original titles)
 *  - Discover pool availability + content-type separation + era mixing
 *  - cross-media adaptation links resolve to real catalogue entries
 *  - identity: a manga is NEVER auto-linked to its anime adaptation
 *  - settings migration v2 → v3 is additive
 *  - export/import round trip for manga/comics records + adaptation links
 *
 * No network access. Run: bun test src/lib/echo/__tests__
 */

import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import { CURATED_MANGA } from "../data/curatedManga";
import { CURATED_COMICS } from "../data/curatedComics";
import { CURATED_BOOKS } from "../data/curatedBooks";
import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import {
  CURATED_LINKS,
  curatedLinksAsWorkLinks,
  curatedLinksValid,
  relatedWorksForSeed,
} from "../data/curatedLinks";
import { VOCAB } from "../data/vocab";
import { DemoProvider } from "../providers/demo";
import { evaluateMatch } from "../providers/match";
import { searchCatalogue } from "../providers";
import { setProviderToggles } from "../providers/registry";
import { applyBundle, buildBundle, validateBundle, type ApplyDeps } from "../exportimport";
import { DEFAULT_SETTINGS, migrateSettings, MEDIA_TYPES, formatForType } from "../types";
import * as db from "../localdb";
import type { MediaItem, UserMediaEntry } from "../types";

const provider = new DemoProvider();

afterEach(async () => {
  setProviderToggles(null);
  await db.closeDB();
});

/* ------------------------- editorial rules: manga ------------------------- */

describe("curated manga collection — editorial rules", () => {
  test("collection size is inside the approved 28–36 window", () => {
    expect(CURATED_MANGA.length).toBeGreaterThanOrEqual(28);
    expect(CURATED_MANGA.length).toBeLessThanOrEqual(36);
  });

  test("every entry is a manga-type print work with original EN + AR synopses and author credit", () => {
    for (const seed of CURATED_MANGA) {
      expect(seed.mediaType).toBe("manga");
      expect(seed.format).toBe("book"); // print media: book running format
      expect(seed.synopsis.length).toBeGreaterThan(40);
      expect(seed.synopsisAr.length).toBeGreaterThan(40);
      expect(Number.isInteger(seed.year)).toBe(true);
      expect(seed.genres.length).toBeGreaterThan(0);
      expect((seed.creators?.length ?? 0)).toBeGreaterThan(0); // author/art credit
    }
  });

  test("no fabricated ratings, popularity, sales or artwork — unverifiable fields are omitted", () => {
    for (const seed of CURATED_MANGA) {
      expect(seed.contentRating).toBeUndefined();
      expect(seed.runtimeMinutes).toBeUndefined();
      expect(seed.publicScore).toBeUndefined();
    }
  });

  test("volume/chapter counts appear ONLY on completed runs (settled public facts)", () => {
    for (const seed of CURATED_MANGA) {
      if (seed.volumeCount !== undefined || seed.chapterCount !== undefined) {
        expect(seed.publicationStatus).toBe("completed");
      }
      if (seed.publicationStatus === "ongoing" || seed.publicationStatus === "hiatus") {
        expect(seed.volumeCount).toBeUndefined();
        expect(seed.chapterCount).toBeUndefined();
      }
    }
    // and completed runs with counts have end years recorded
    const withCounts = CURATED_MANGA.filter((s) => s.volumeCount !== undefined);
    expect(withCounts.length).toBeGreaterThanOrEqual(15);
    for (const seed of withCounts) {
      expect(seed.endYear).toBeDefined();
      expect(seed.endYear!).toBeGreaterThan(seed.year);
    }
  });

  test("manhwa and manhua are represented as distinct subtypes, never plain manga", () => {
    const manhwa = CURATED_MANGA.filter((s) => s.subtype === "manhwa");
    const manhua = CURATED_MANGA.filter((s) => s.subtype === "manhua");
    expect(manhwa.length).toBeGreaterThanOrEqual(2);
    expect(manhua.length).toBeGreaterThanOrEqual(1);
    for (const s of manhwa) {
      expect(s.countries).toEqual(["South Korea"]);
      expect(s.subtype).not.toBe("manga");
    }
    for (const s of manhua) {
      expect(s.countries).toEqual(["China"]);
    }
  });

  test("demographics span shōnen/shōjo/seinen/josei; eras span pre-1970 to post-2015", () => {
    const genres = new Set(CURATED_MANGA.flatMap((s) => s.genres));
    expect(genres.has("shounen")).toBe(true);
    expect(genres.has("shoujo") || genres.has("romance")).toBe(true);
    expect(genres.has("seinen")).toBe(true);
    expect(genres.has("josei")).toBe(true);
    const years = CURATED_MANGA.map((s) => s.year);
    expect(Math.min(...years)).toBeLessThanOrEqual(1952); // Tezuka-era classic
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2019); // modern hit
  });

  test("ids are namespaced cmk-* and never collide with any other collection", () => {
    const ids = new Set(DEMO_CATALOGUE.map((s) => s.id));
    expect(ids.size).toBe(DEMO_CATALOGUE.length);
    for (const seed of CURATED_MANGA) {
      expect(seed.id.startsWith("cmk-")).toBe(true);
    }
  });

  test("every genre and tag slug has a bilingual vocab label", () => {
    for (const seed of CURATED_MANGA) {
      for (const g of seed.genres) expect(VOCAB[g], `genre slug "${g}"`).toBeDefined();
      for (const t of seed.tags) expect(VOCAB[t], `tag slug "${t}"`).toBeDefined();
    }
  });
});

/* ------------------------- editorial rules: comics ------------------------ */

describe("curated comics collection — editorial rules", () => {
  test("collection size is inside the approved 24–32 window", () => {
    expect(CURATED_COMICS.length).toBeGreaterThanOrEqual(24);
    expect(CURATED_COMICS.length).toBeLessThanOrEqual(32);
  });

  test("every entry is a comics-type work with original EN + AR synopses and creator credit", () => {
    for (const seed of CURATED_COMICS) {
      expect(seed.mediaType).toBe("comics");
      expect(seed.format).toBe("book");
      expect(seed.synopsis.length).toBeGreaterThan(40);
      expect(seed.synopsisAr.length).toBeGreaterThan(40);
      expect(seed.genres.length).toBeGreaterThan(0);
      expect((seed.creators?.length ?? 0)).toBeGreaterThan(0); // writer/artist credit
    }
  });

  test("the data model distinguishes series, strips, issues, graphic novels and collected editions", () => {
    const subtypes = new Set(CURATED_COMICS.map((s) => s.subtype));
    expect(subtypes.has("comic-strip")).toBe(true);
    expect(subtypes.has("comic-series")).toBe(true);
    expect(subtypes.has("graphic-novel")).toBe(true);
    expect(subtypes.has("collected-edition")).toBe(true);
    // a landmark individual ISSUE exists with its issue number — a single
    // issue is its own work, never merged with the series it belongs to
    const issue = CURATED_COMICS.find((s) => s.subtype === "comic-issue");
    expect(issue).toBeDefined();
    expect(issue!.issueNumber).toBe(15);
    // and the series-vs-issue pair is present as two SEPARATE records
    const series = CURATED_COMICS.find((s) => s.id === "cc-amazing-spider-man");
    expect(series).toBeDefined();
    expect(series!.id).not.toBe(issue!.id);
  });

  test("no fabricated ratings, popularity, sales or artwork", () => {
    for (const seed of CURATED_COMICS) {
      expect(seed.contentRating).toBeUndefined();
      expect(seed.publicScore).toBeUndefined();
    }
  });

  test("international coverage spans at least 10 countries of origin", () => {
    const countries = new Set(CURATED_COMICS.flatMap((s) => s.countries ?? []));
    // US content is present but NOT overrepresented (< 60%)
    const us = CURATED_COMICS.filter((s) => (s.countries ?? []).includes("USA")).length;
    expect(countries.size).toBeGreaterThanOrEqual(10);
    expect(us / CURATED_COMICS.length).toBeLessThan(0.6);
  });

  test("ids are namespaced cc-* and never collide with any other collection", () => {
    for (const seed of CURATED_COMICS) {
      expect(seed.id.startsWith("cc-")).toBe(true);
    }
    const ids = new Set(DEMO_CATALOGUE.map((s) => s.id));
    expect(ids.size).toBe(DEMO_CATALOGUE.length);
  });

  test("every genre and tag slug has a bilingual vocab label", () => {
    for (const seed of CURATED_COMICS) {
      for (const g of seed.genres) expect(VOCAB[g], `genre slug "${g}"`).toBeDefined();
      for (const t of seed.tags) expect(VOCAB[t], `tag slug "${t}"`).toBeDefined();
    }
  });
});

/* --------------------------- search integration --------------------------- */

describe("manga & comics work through the local provider (Search)", () => {
  test("searchable by English, Arabic, and original (romaji) titles", async () => {
    const manga = await provider.search("Akira", { mediaTypes: ["manga"], limit: 3 });
    expect(manga[0].item.title).toBe("Akira");
    expect(manga[0].sourceLabel).toBe("Sample");
    expect(manga[0].item.mediaType).toBe("manga");

    const mangaAr = await provider.search("مفكرة الموت", { mediaTypes: ["manga"], limit: 3 });
    expect(mangaAr[0].item.title).toBe("Death Note");

    const mangaRomaji = await provider.search("Kozure Ōkami", { mediaTypes: ["manga"], limit: 3 });
    expect(mangaRomaji[0].item.title).toBe("Lone Wolf and Cub");

    const comics = await provider.search("Watchmen", { mediaTypes: ["comics"], limit: 3 });
    expect(comics[0].item.title).toBe("Watchmen");
    expect(comics[0].item.mediaType).toBe("comics");

    const comicsAr = await provider.search("مافالدا", { mediaTypes: ["comics"], limit: 3 });
    expect(comicsAr[0].item.title).toBe("Mafalda");
  });

  test("type separation: a manga query never returns comics and vice versa", async () => {
    const mangaResults = await provider.search("Maus", { mediaTypes: ["manga"], limit: 5 });
    expect(mangaResults.length).toBe(0); // Maus is comics, not manga
    const comicsResults = await provider.search("Maus", { mediaTypes: ["comics"], limit: 5 });
    expect(comicsResults[0].item.title).toBe("Maus");
  });

  test("the full router finds manga/comics via local fill when no live source covers them", async () => {
    // anilist (manga live source) disabled + wikidata disabled + the new
    // default manga sources (MADB, Inventaire, BnF) disabled → curated
    // manga must fill the gap, clearly labelled as sample content
    setProviderToggles({
      anilist: false,
      wikidata: false,
      madb: false,
      inventaire: false,
      bnf: false,
    });
    const outcome = await searchCatalogue("Dragon Ball", {
      mediaTypes: ["manga"],
      limit: 5,
    });
    expect(outcome.usedFallback).toBe(true);
    const hit = outcome.results.find((r) => r.item.title === "Dragon Ball");
    expect(hit).toBeDefined();
    expect(hit!.item.mediaType).toBe("manga");
    expect(hit!.sourceLabel).toBe("Sample");
  });
});

/* --------------------------- discover pool quality ------------------------- */

describe("manga & comics in Discover pools", () => {
  test("starter pool for manga mixes classics and modern works (ends-alternating)", () => {
    const pool = provider.poolForTypes(["manga"], { limit: 20 });
    expect(pool.length).toBeGreaterThanOrEqual(12);
    const years = pool.map((m) => m.releaseYear ?? 0);
    expect(Math.min(...years)).toBeLessThan(1990);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2018);
    // no popularity ordering is claimed — curated curation only
    expect(pool.every((m) => m.publicScore === undefined)).toBe(true);
  });

  test("starter pool for comics mixes strips, series and graphic novels across eras", () => {
    const pool = provider.poolForTypes(["comics"], { limit: 20 });
    expect(pool.length).toBeGreaterThanOrEqual(12);
    const years = pool.map((m) => m.releaseYear ?? 0);
    expect(Math.min(...years)).toBeLessThanOrEqual(1905);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2010);
    const subtypes = new Set(pool.map((m) => m.subtype));
    expect(subtypes.size).toBeGreaterThanOrEqual(3);
  });

  test("type separation: manga pools never contain comics records", () => {
    const pool = provider.poolForTypes(["manga"], { limit: 40 });
    expect(pool.every((m) => m.mediaType === "manga")).toBe(true);
  });
});

/* ------------------------ cross-media relationships ------------------------ */

describe("cross-media adaptation links", () => {
  test("every curated link resolves to REAL catalogue entries (no invented edges)", () => {
    const check = curatedLinksValid();
    expect(check.ok).toBe(true);
    expect(check.broken).toEqual([]);
  });

  test("manga → anime links exist and are typed adaptations", () => {
    const mangaToAnime = CURATED_LINKS.filter((l) => {
      const from = DEMO_CATALOGUE.find((s) => s.id === l.from);
      const to = DEMO_CATALOGUE.find((s) => s.id === l.to);
      return from?.mediaType === "manga" && to?.mediaType === "anime";
    });
    expect(mangaToAnime.length).toBeGreaterThanOrEqual(8);
    expect(mangaToAnime.every((l) => l.relation === "adaptation")).toBe(true);
  });

  test("book → film, book → series, book → game, game → series and light-novel → anime all exist", () => {
    const pairs = CURATED_LINKS.map((l) => ({
      from: DEMO_CATALOGUE.find((s) => s.id === l.from)!.mediaType,
      to: DEMO_CATALOGUE.find((s) => s.id === l.to)!.mediaType,
    }));
    expect(pairs.some((p) => p.from === "book" && p.to === "movie")).toBe(true); // LOTR
    expect(pairs.some((p) => p.from === "book" && p.to === "series")).toBe(true); // GoT
    expect(pairs.some((p) => p.from === "book" && p.to === "game")).toBe(true); // The Witcher
    expect(pairs.some((p) => p.from === "game" && p.to === "series")).toBe(true); // The Last of Us
    expect(pairs.some((p) => p.from === "book" && p.to === "anime")).toBe(true); // Violet Evergarden LN
  });

  test("both directions resolve: an anime record sees its manga source", () => {
    const fromManga = relatedWorksForSeed("cmk-attack-on-titan");
    expect(fromManga.length).toBe(1);
    expect(fromManga[0].direction).toBe("adapted-into");
    const fromAnime = relatedWorksForSeed("attack-on-titan");
    expect(fromAnime.length).toBe(1);
    expect(fromAnime[0].direction).toBe("adapted-from");
    expect(fromAnime[0].seedId).toBe("cmk-attack-on-titan");
  });

  test("links convert to WorkLink records pointing adaptation → source", () => {
    const links = curatedLinksAsWorkLinks("2026-11-23T00:00:00.000Z");
    expect(links.length).toBe(CURATED_LINKS.length);
    for (const l of links) {
      expect(l.relation).toBe("adaptation");
      expect(l.workId.startsWith("echo-work-echo-demo-")).toBe(true);
      expect(l.parentWorkId!.startsWith("echo-work-echo-demo-")).toBe(true);
      expect(l.workId).not.toBe(l.parentWorkId);
    }
  });
});

/* ------------------------------ identity rules ----------------------------- */

describe("identity: adaptations are related, NEVER the same work", () => {
  test("a manga record never auto-links to its anime adaptation (type gate)", () => {
    const manga = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cmk-attack-on-titan")!);
    const anime = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "attack-on-titan")!);
    const verdict = evaluateMatch(manga, anime);
    expect(verdict.verdict).toBe("reject"); // cross-type: hard reject
  });

  test("a comic series and its individual issue never auto-link (ordinal asymmetry)", () => {
    const series = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cc-amazing-spider-man")!);
    const issue = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cc-amazing-fantasy-15")!);
    // both are comics type — but distinct works; only exact title matches can
    // auto-link, and "Amazing Fantasy #15" ≠ "The Amazing Spider-Man"
    const verdict = evaluateMatch(series, issue);
    expect(verdict.verdict).not.toBe("auto-link");
  });

  test("same title + same type + different year = different work (manga vs manga)", () => {
    const a = { ...demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cmk-akira")!) };
    const remake = { ...a, localId: "echo-demo:other", releaseYear: a.releaseYear! + 10 };
    const verdict = evaluateMatch(a, remake);
    expect(verdict.verdict).toBe("reject"); // year conflict → not the same edition
  });
});

/* ------------------------- settings migration v2 → v3 ---------------------- */

describe("settings migration v2 → v3 (additive interests)", () => {
  test("v2 settings gain manga + comics, everything else preserved", () => {
    const v2 = {
      ...DEFAULT_SETTINGS,
      interests: ["anime", "movie", "series", "game", "book"],
      schemaVersion: 2,
      language: "ar" as const,
    };
    const migrated = migrateSettings(v2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.interests).toEqual([
      "anime",
      "movie",
      "series",
      "game",
      "book",
      "manga",
      "comics",
    ]);
    expect(migrated.language).toBe("ar");
  });

  test("v1 settings still migrate straight to v3 in one call", () => {
    const v1 = {
      ...DEFAULT_SETTINGS,
      interests: ["anime", "movie", "series"],
      schemaVersion: 1,
    };
    const migrated = migrateSettings(v1);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.interests).toEqual([
      "anime",
      "movie",
      "series",
      "game",
      "book",
      "manga",
      "comics",
    ]);
  });

  test("v3 settings pass through untouched", () => {
    const v3 = { ...DEFAULT_SETTINGS, interests: ["manga"], schemaVersion: 3 };
    expect(migrateSettings(v3)).toBe(v3);
  });

  test("MEDIA_TYPES lists all seven types and formats map correctly", () => {
    expect(MEDIA_TYPES).toEqual([
      "anime",
      "movie",
      "series",
      "game",
      "book",
      "manga",
      "comics",
    ]);
    expect(formatForType("manga")).toBe("book");
    expect(formatForType("comics")).toBe("book");
  });
});

/* --------------------------- export/import round trip ---------------------- */

describe("export/import round trip with manga, comics and adaptation links", () => {
  function deps(): ApplyDeps {
    return {
      putMedia: db.putMedia,
      putEntries: db.putEntries,
      putFeedback: db.putFeedback,
      getAllEntries: db.getAllEntries,
      getAllMedia: db.getAllMedia,
      getAllFeedback: db.getAllFeedback,
      putWorks: db.putWorks,
      putWorkLinks: db.putWorkLinks,
    };
  }

  test("a manga entry + its anime adaptation + links survive a full round trip", async () => {
    const manga = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cmk-monster")!);
    const anime = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "monster")!);
    const comics = demoToMediaItem(DEMO_CATALOGUE.find((s) => s.id === "cc-maus")!);
    const entries: UserMediaEntry[] = [
      {
        id: "entry_1",
        mediaLocalId: manga.localId,
        status: "completed",
        isFavourite: true,
        userTags: [],
        addedAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
        rating: 5,
      },
      {
        id: "entry_2",
        mediaLocalId: anime.localId,
        status: "watching",
        isFavourite: false,
        userTags: [],
        addedAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
      {
        id: "entry_3",
        mediaLocalId: comics.localId,
        status: "planned",
        isFavourite: false,
        userTags: [],
        addedAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
    ];
    const links = curatedLinksAsWorkLinks("2026-11-23T00:00:00.000Z");
    const bundle = buildBundle({
      settings: { language: "en" },
      media: [manga, anime, comics],
      entries,
      feedback: [],
      works: [],
      workLinks: links.filter((l) => l.workId === "echo-work-echo-demo-monster"),
    });
    expect(bundle.schemaVersion).toBe(3);

    const parsed = validateBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const count = await applyBundle(parsed.data, "merge", deps());
    expect(count).toBe(3);

    const stored = await db.getAllMedia();
    const storedManga = stored.find((m) => m.localId === manga.localId);
    expect(storedManga).toBeDefined();
    expect(storedManga!.mediaType).toBe("manga");
    expect(storedManga!.subtype).toBe("manga");
    expect(storedManga!.volumeCount).toBe(18);
    expect(storedManga!.publicationStatus).toBe("completed");
    expect(storedManga!.endYear).toBe(2001);

    const storedLinks = await db.getAllWorkLinks();
    expect(storedLinks.length).toBe(1);
    expect(storedLinks[0].relation).toBe("adaptation");
    expect(storedLinks[0].parentWorkId).toBe("echo-work-echo-demo-cmk-monster");
  });

  test("v1/v2 bundles with five-type interests still import (back-compat)", () => {
    const media: MediaItem = demoToMediaItem(
      DEMO_CATALOGUE.find((s) => s.id === "cmk-death-note")!,
    );
    const bundle = {
      app: "ECHO",
      schemaVersion: 2,
      exportedAt: "2026-11-23T00:00:00.000Z",
      settings: { interests: ["anime", "movie", "series", "game", "book"] },
      media: [media],
      entries: [
        {
          id: "entry_old",
          mediaLocalId: media.localId,
          status: "planned",
          isFavourite: false,
          userTags: [],
          addedAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
      feedback: [],
    };
    const parsed = validateBundle(bundle);
    expect(parsed.ok).toBe(true);
  });
});
