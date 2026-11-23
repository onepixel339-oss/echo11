/**
 * ECHO — Curated local games & books starter collections (Phase 3) data tests.
 *
 * Editorial contract (docs/DATA_PROVIDER_COMPLIANCE.md, same as Phase 2):
 *  - original EN + AR synopses on every entry
 *  - NO fabricated ratings, popularity, sales figures, awards or playtimes
 *  - recognisable titles with real era/region/genre/platform spread
 *  - clearly labelled as ECHO-curated sample content (provider "echo-demo",
 *    "Sample" source chip, curated source attribution)
 *  - stable ids that never collide with the demo universe or other collections
 *  - full Search / Discover-pool integration, offline behaviour and
 *    export/import round trips for both new content types
 */

import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import { CURATED_GAMES } from "../data/curatedGames";
import { CURATED_BOOKS } from "../data/curatedBooks";
import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import { VOCAB } from "../data/vocab";
import { DemoProvider } from "../providers/demo";
import { PROVIDER_REGISTRY, providerEntry } from "../providers/registry";
import { applyBundle, buildBundle, validateBundle, type ApplyDeps } from "../exportimport";
import * as db from "../localdb";
import type { MediaItem, UserMediaEntry } from "../types";

const provider = new DemoProvider();

/* ------------------------------ size & shape ------------------------------ */

describe("curated games collection — editorial rules", () => {
  test("collection size is inside the approved 25–35 window", () => {
    expect(CURATED_GAMES.length).toBeGreaterThanOrEqual(25);
    expect(CURATED_GAMES.length).toBeLessThanOrEqual(35);
  });
  test("every entry is a game with original EN + AR synopses and a developer credit", () => {
    for (const seed of CURATED_GAMES) {
      expect(seed.mediaType).toBe("game");
      expect(seed.format).toBe("game");
      expect(seed.synopsis.length).toBeGreaterThan(40);
      expect(seed.synopsisAr.length).toBeGreaterThan(40);
      expect(seed.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(seed.year)).toBe(true);
      expect(seed.year).toBeGreaterThanOrEqual(1970);
      expect(seed.year).toBeLessThanOrEqual(2025);
      expect(seed.genres.length).toBeGreaterThan(0);
      // developer credit: studio (RAWG-style mapping) and/or a designer whose
      // attribution is unambiguous public knowledge
      expect((seed.studios?.length ?? 0) + (seed.creators?.length ?? 0)).toBeGreaterThan(0);
    }
    // studio credit everywhere except Tetris (credited to its solo author)
    const withoutStudio = CURATED_GAMES.filter((s) => (s.studios?.length ?? 0) === 0);
    expect(withoutStudio.map((s) => s.id)).toEqual(["cg-tetris"]);
    // individual designers documented on a healthy subset
    expect(CURATED_GAMES.filter((s) => (s.creators?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(10);
  });

  test("no fabricated ratings, popularity, sales, playtimes or artwork", () => {
    for (const seed of CURATED_GAMES) {
      const item = demoToMediaItem(seed);
      expect(item.publicScore).toBeUndefined();
      expect(item.rating).toBeUndefined(); // no rating provenance
      expect(item.runtimeMinutes).toBeUndefined(); // no playtime claims
      expect(item.posterUrl).toBeUndefined(); // generated placeholder art only
      // content ratings omitted rather than approximated
      expect(seed.contentRating).toBeUndefined();
    }
  });

  test("real spread across decades, regions, genres and platforms", () => {
    const decades = new Set(CURATED_GAMES.map((s) => Math.floor(s.year / 10) * 10));
    const countries = new Set(CURATED_GAMES.flatMap((s) => s.countries ?? []));
    const genres = new Set(CURATED_GAMES.flatMap((s) => s.genres));
    const platforms = new Set(CURATED_GAMES.flatMap((s) => s.tags));
    expect(decades.size).toBeGreaterThanOrEqual(6); // 1970s … 2020s
    expect(countries.size).toBeGreaterThanOrEqual(7); // USA, Japan, UK, USSR, Sweden, Poland, Estonia, China
    expect(genres.size).toBeGreaterThanOrEqual(15);
    // classic and modern mix (not a "recent releases" list)
    expect(CURATED_GAMES.filter((s) => s.year < 2000).length).toBeGreaterThanOrEqual(15);
    expect(CURATED_GAMES.filter((s) => s.year >= 2010).length).toBeGreaterThanOrEqual(8);
    // platform families tagged (nintendo / pc / playstation / xbox / mobile)
    for (const p of ["nintendo", "pc", "playstation", "xbox"]) {
      expect(platforms.has(p)).toBe(true);
    }
  });
});

describe("curated books collection — editorial rules", () => {
  test("collection size is inside the approved window (35 + 3 cross-media additions)", () => {
    // Phase 3 shipped 35; the catalog expansion added The Last Wish, The Lord
    // of the Rings and the Violet Evergarden light novel (38 total) so the
    // book→game / book→film / light-novel→anime relationship types have real
    // representatives in the local catalogue.
    expect(CURATED_BOOKS.length).toBe(38);
  });

  test("every entry is a book with original EN + AR synopses and an author", () => {
    for (const seed of CURATED_BOOKS) {
      expect(seed.mediaType).toBe("book");
      expect(seed.format).toBe("book");
      expect(seed.synopsis.length).toBeGreaterThan(40);
      expect(seed.synopsisAr.length).toBeGreaterThan(40);
      expect(seed.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(seed.year)).toBe(true);
      expect(seed.year).toBeGreaterThanOrEqual(1600);
      expect(seed.year).toBeLessThanOrEqual(2025);
      expect(seed.genres.length).toBeGreaterThan(0);
      expect(seed.creators?.length ?? 0).toBeGreaterThan(0); // author (Open Library mapping)
    }
  });

  test("no fabricated ratings, sales, awards or artwork", () => {
    for (const seed of CURATED_BOOKS) {
      const item = demoToMediaItem(seed);
      expect(item.publicScore).toBeUndefined();
      expect(item.rating).toBeUndefined();
      expect(item.posterUrl).toBeUndefined();
      expect(seed.contentRating).toBeUndefined();
    }
  });

  test("real spread across centuries, countries and languages; Arabic literature present", () => {
    const decades = new Set(CURATED_BOOKS.map((s) => Math.floor(s.year / 10) * 10));
    const countries = new Set(CURATED_BOOKS.flatMap((s) => s.countries ?? []));
    const languages = new Set(CURATED_BOOKS.flatMap((s) => s.languages ?? []));
    const genres = new Set(CURATED_BOOKS.flatMap((s) => s.genres));
    expect(decades.size).toBeGreaterThanOrEqual(15); // 1600s … 2010s
    expect(countries.size).toBeGreaterThanOrEqual(15);
    expect(languages.size).toBeGreaterThanOrEqual(9); // EN, AR, ES, FR, DE, RU, NL, JA, ZH, IT
    expect(genres.size).toBeGreaterThanOrEqual(15);
    // classics and modern works both well represented
    expect(CURATED_BOOKS.filter((s) => s.year < 1900).length).toBeGreaterThanOrEqual(7);
    expect(CURATED_BOOKS.filter((s) => s.year >= 1990).length).toBeGreaterThanOrEqual(5);
    // the app ships an Arabic UI — Arabic-language literature is included
    expect(CURATED_BOOKS.filter((s) => (s.languages ?? []).includes("Arabic")).length).toBeGreaterThanOrEqual(4);
  });
});

/* --------------------------- labelling & integrity ------------------------ */

describe("sample-content labelling and provenance (both collections)", () => {
  const ALL = [...CURATED_GAMES, ...CURATED_BOOKS];
  test("entries are labelled as ECHO-curated sample content", () => {
    for (const seed of ALL) {
      const item = demoToMediaItem(seed);
      expect(item.provider).toBe("echo-demo");
      expect(item.localId).toBe(`echo-demo:${seed.id}`);
      expect(item.sourceAttribution).toContain("ECHO curated sample collection");
      // v2 provenance stamp from the approved registry entry
      expect(item.providerRef?.providerId).toBe("echo-demo");
      expect(item.providerRef?.licenseStatus).toBe("approved");
      expect(item.workId).toBe(`echo-work-echo-demo-${seed.id}`);
      // field-level provenance
      expect(item.provenance?.title).toBe("echo-demo");
      expect(item.provenance?.genres).toBe("echo-demo");
    }
  });

  test("ids are unique, prefixed, and never collide with the demo universe", () => {
    for (const seed of CURATED_GAMES) expect(seed.id.startsWith("cg-")).toBe(true);
    for (const seed of CURATED_BOOKS) expect(seed.id.startsWith("cb-")).toBe(true);
    const ids = new Set<string>();
    for (const seed of DEMO_CATALOGUE) {
      expect(ids.has(seed.id)).toBe(false);
      ids.add(seed.id);
    }
    const cgIds = new Set(CURATED_GAMES.map((s) => s.id));
    const cbIds = new Set(CURATED_BOOKS.map((s) => s.id));
    for (const id of cgIds) expect(cbIds.has(id)).toBe(false); // cross-collection safety
    for (const id of cgIds) expect(ids.has(id)).toBe(true); // composed in
    for (const id of cbIds) expect(ids.has(id)).toBe(true);
    // no duplicate (title, year) works across the whole local catalogue
    const keys = new Set<string>();
    for (const seed of DEMO_CATALOGUE) {
      const key = `${seed.title.toLowerCase()}|${seed.year}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  test("the registry and provider declare game + book coverage", () => {
    const entry = providerEntry("echo-demo");
    expect(entry?.serves).toContain("game");
    expect(entry?.serves).toContain("book");
    expect(entry?.serves).toEqual([
      "anime",
      "movie",
      "series",
      "game",
      "book",
      "manga",
      "comics",
    ]);
    expect(entry?.licenseStatus).toBe("approved");
    expect(PROVIDER_REGISTRY["echo-demo"].redistribution).toBe(true);
    expect(provider.capabilities.games).toBe(true);
    expect(provider.capabilities.books).toBe(true);
  });

  test("every genre and tag slug has a bilingual vocab label (filters + tiles)", () => {
    for (const seed of [...CURATED_GAMES, ...CURATED_BOOKS]) {
      for (const g of seed.genres) expect(VOCAB[g], `genre slug "${g}"`).toBeDefined();
      for (const t of seed.tags) expect(VOCAB[t], `tag slug "${t}"`).toBeDefined();
    }
  });
});

/* -------------------------- search & discover pools ----------------------- */

describe("games & books work through the local provider (Search + Discover)", () => {
  test("searchable by English, Arabic and original titles", async () => {
    const game = await provider.search("Minecraft", { mediaTypes: ["game"], limit: 3 });
    expect(game[0].item.title).toBe("Minecraft");
    expect(game[0].sourceLabel).toBe("Sample");

    const gameAr = await provider.search("أسطورة زيلدا", { mediaTypes: ["game"], limit: 3 });
    expect(gameAr[0].item.title).toBe("The Legend of Zelda");

    const gameOriginal = await provider.search("Wanda to Kyozō", { mediaTypes: ["game"], limit: 3 });
    expect(gameOriginal[0].item.title).toBe("Shadow of the Colossus");

    const gameOriginalCjk = await provider.search("原神", { mediaTypes: ["game"], limit: 3 });
    expect(gameOriginalCjk[0].item.title).toBe("Genshin Impact");

    const book = await provider.search("Crime and Punishment", { mediaTypes: ["book"], limit: 3 });
    expect(book[0].item.title).toBe("Crime and Punishment");

    const bookAr = await provider.search("الكثيب", { mediaTypes: ["book"], limit: 3 });
    expect(bookAr[0].item.title).toBe("Dune");

    const bookOriginal = await provider.search("Le Petit Prince", { mediaTypes: ["book"], limit: 3 });
    expect(bookOriginal[0].item.title).toBe("The Little Prince");

    const bookOriginalCjk = await provider.search("三体", { mediaTypes: ["book"], limit: 3 });
    expect(bookOriginalCjk[0].item.title).toBe("The Three-Body Problem");
  });

  test("onboarding seed suggestions now resolve locally", async () => {
    // OnboardingFlow.SEED_SUGGESTIONS examples for game/book interests
    for (const [q, type, title] of [
      ["The Witcher 3", "game", "The Witcher 3: Wild Hunt"],
      ["Elden Ring", "game", "Elden Ring"],
      ["Zelda: Breath of the Wild", "game", "The Legend of Zelda: Breath of the Wild"],
      ["Nineteen Eighty-Four", "book", "Nineteen Eighty-Four"],
      ["Crime and Punishment", "book", "Crime and Punishment"],
    ] as const) {
      const res = await provider.search(q, { mediaTypes: [type], limit: 5 });
      expect(res.some((r) => r.item.title === title)).toBe(true);
    }
  });

  test("search respects the requested content type (no cross-type mixing)", async () => {
    // a game query never returns books, and vice versa
    const gameOnly = await provider.search("Dune", { mediaTypes: ["game"], limit: 5 });
    expect(gameOnly.length).toBe(0); // Dune the book is not returned for games
    const bookOnly = await provider.search("Tetris", { mediaTypes: ["book"], limit: 5 });
    expect(bookOnly.length).toBe(0); // Tetris the game is not returned for books
    const book = await provider.search("Dune", { mediaTypes: ["book"], limit: 5 });
    expect(book.some((r) => r.item.title === "Dune" && r.item.releaseYear === 1965)).toBe(true);
    const game = await provider.search("Tetris", { mediaTypes: ["game"], limit: 5 });
    expect(game.some((r) => r.item.title === "Tetris")).toBe(true);
  });

  test("poolForTypes returns starter-shelf-sized pools for games and books", () => {
    // DiscoverScreen requires >= 4 items to show a starter shelf
    const games = provider.poolForTypes(["game"], { limit: 12 });
    const books = provider.poolForTypes(["book"], { limit: 12 });
    expect(games.length).toBeGreaterThanOrEqual(12); // full shelf
    expect(books.length).toBeGreaterThanOrEqual(12);
    expect(games.every((m) => m.mediaType === "game")).toBe(true);
    expect(books.every((m) => m.mediaType === "book")).toBe(true);
    // no record appears twice within a pool
    expect(new Set(games.map((m) => m.localId)).size).toBe(games.length);
    expect(new Set(books.map((m) => m.localId)).size).toBe(books.length);
    // a mixed pool carries both types without duplication
    const mixed = provider.poolForTypes(["game", "book"], { limit: 40 });
    expect(mixed.some((m) => m.mediaType === "game")).toBe(true);
    expect(mixed.some((m) => m.mediaType === "book")).toBe(true);
    expect(new Set(mixed.map((m) => m.localId)).size).toBe(mixed.length);
  });

  test("starter shelves weave classics with modern works (no popularity claims)", () => {
    const games = provider.poolForTypes(["game"], { limit: 12 });
    const gameYears = games.map((m) => m.releaseYear ?? 0);
    expect(gameYears.some((y) => y < 2000)).toBe(true); // arcade & console classics present
    expect(gameYears.some((y) => y >= 2010)).toBe(true); // modern titles present
    const books = provider.poolForTypes(["book"], { limit: 12 });
    const bookYears = books.map((m) => m.releaseYear ?? 0);
    expect(bookYears.some((y) => y < 1900)).toBe(true); // literary classics present
    expect(bookYears.some((y) => y >= 1990)).toBe(true); // modern works present
    // every pooled record carries the curated attribution (honest labelling)
    for (const m of [...games, ...books]) {
      expect(m.sourceAttribution).toContain("ECHO curated sample collection");
      expect(m.publicScore).toBeUndefined(); // no fabricated ranking signal
    }
  });

  test("poolForTypes honours the visibility ceiling like live providers", () => {
    const gamesModerate = provider.poolForTypes(["game"], { limit: 100, visibility: "moderate" });
    const gamesSafe = provider.poolForTypes(["game"], { limit: 100, visibility: "safe" });
    const booksModerate = provider.poolForTypes(["book"], { limit: 100, visibility: "moderate" });
    const booksSafe = provider.poolForTypes(["book"], { limit: 100, visibility: "safe" });
    expect(gamesSafe.length).toBeLessThanOrEqual(gamesModerate.length);
    expect(booksSafe.length).toBeLessThanOrEqual(booksModerate.length);
    // moderate shows the unrated curated records; safe hides them
    expect(gamesModerate.some((m) => m.localId.startsWith("echo-demo:cg-"))).toBe(true);
    expect(gamesSafe.some((m) => m.localId.startsWith("echo-demo:cg-"))).toBe(false);
    expect(booksModerate.some((m) => m.localId.startsWith("echo-demo:cb-"))).toBe(true);
    expect(booksSafe.some((m) => m.localId.startsWith("echo-demo:cb-"))).toBe(false);
  });

  test("genre-filtered pools lead with genre matches", () => {
    const rpgPool = provider.poolForTypes(["game"], { genres: ["rpg"], limit: 8 });
    expect(rpgPool.length).toBeGreaterThan(0);
    expect(rpgPool[0].genres).toContain("rpg");
    const poetryPool = provider.poolForTypes(["book"], { genres: ["poetry"], limit: 8 });
    expect(poetryPool.length).toBeGreaterThan(0);
    expect(poetryPool[0].genres).toContain("poetry");
  });

  test("getTitle resolves curated records by providerId", async () => {
    const game = await provider.getTitle("cg-witcher-3");
    expect(game?.title).toBe("The Witcher 3: Wild Hunt");
    expect(game?.releaseYear).toBe(2015);
    expect(game?.mediaType).toBe("game");
    const book = await provider.getTitle("cb-dune");
    expect(book?.title).toBe("Dune");
    expect(book?.releaseYear).toBe(1965);
    expect(book?.mediaType).toBe("book");
    expect(book?.creators).toContain("Frank Herbert");
  });
});

/* ------------------------------ offline safety ---------------------------- */

describe("offline behaviour — the local collections need no network", () => {
  const realFetch = globalThis.fetch;
  let offlineCalls = 0;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("search and pools work with fetch hard-down (offline device)", async () => {
    globalThis.fetch = (async () => {
      offlineCalls++;
      throw new Error("offline");
    }) as typeof fetch;
    const game = await provider.search("Dark Souls", { mediaTypes: ["game"], limit: 3 });
    expect(game[0].item.title).toBe("Dark Souls");
    const book = await provider.search("Beloved", { mediaTypes: ["book"], limit: 3 });
    expect(book[0].item.title).toBe("Beloved");
    const pool = provider.poolForTypes(["game", "book"], { limit: 20 });
    expect(pool.length).toBeGreaterThanOrEqual(20);
    expect(offlineCalls).toBe(0); // zero network attempts — pure local data
    expect(provider.isConfigured()).toBe(true);
  });
});

/* --------------------------- export/import round trips -------------------- */

describe("export/import round trips for curated game & book records", () => {
  async function resetDb(): Promise<void> {
    await db.closeDB();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("echo-universe");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    await db.openDB();
  }

  afterEach(async () => {
    await resetDb();
  });

  function entryFor(mediaLocalId: string): UserMediaEntry {
    return {
      id: `entry_${mediaLocalId.replace(/[^a-z0-9]/gi, "")}`,
      mediaLocalId,
      status: "completed",
      rating: 5,
      isFavourite: true,
      userTags: [],
      addedAt: "2026-11-23T00:00:00.000Z",
      updatedAt: "2026-11-23T00:00:00.000Z",
      completedAt: "2026-11-23T00:00:00.000Z",
    };
  }

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

  test("curated game + book records round-trip with attribution (Phase 3)", async () => {
    await resetDb();
    const seeds = [
      CURATED_GAMES.find((s) => s.id === "cg-elden-ring")!,
      CURATED_BOOKS.find((s) => s.id === "cb-the-prophet")!,
    ];
    const media: MediaItem[] = seeds.map(demoToMediaItem);
    const bundle = buildBundle({
      settings: { language: "en" },
      media,
      entries: media.map((m) => entryFor(m.localId)),
      feedback: [],
      works: seeds.map((s) => ({
        workId: `echo-work-echo-demo-${s.id}`,
        primaryType: s.mediaType,
        title: s.title,
        externalIds: {},
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      })),
    });
    const parsed = validateBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyBundle(parsed.data, "replace", deps());

    const restoredMedia = await db.getAllMedia();
    const game = restoredMedia.find((m) => m.localId === "echo-demo:cg-elden-ring");
    const book = restoredMedia.find((m) => m.localId === "echo-demo:cb-the-prophet");
    expect(game?.title).toBe("Elden Ring");
    expect(game?.mediaType).toBe("game");
    expect(game?.sourceAttribution).toContain("ECHO curated sample collection");
    expect(game?.providerRef?.licenseStatus).toBe("approved");
    expect(book?.title).toBe("The Prophet");
    expect(book?.mediaType).toBe("book");
    expect(book?.sourceAttribution).toContain("ECHO curated sample collection");
    const works = await db.getAllWorks();
    expect(works.some((w) => w.title === "Elden Ring")).toBe(true);
    expect(works.some((w) => w.title === "The Prophet")).toBe(true);
    const entries = await db.getAllEntries();
    expect(entries.length).toBe(2);
    // artwork stripping applies to curated records too (no bundled art)
    expect(game?.posterUrl).toBeUndefined();
    expect(book?.posterUrl).toBeUndefined();
  });
});
