/**
 * ECHO — Export/import compatibility tests (v1 and v2 bundles).
 * Pure logic + fake-indexeddb for applyBundle. Run: bun test src/lib/echo/__tests__
 *
 * Phase 1 requirements covered:
 *  - v1 bundles (pre-catalog-migration) still import after the v2 migration
 *  - v2 bundles round-trip works + relationships
 *  - replace mode restores works/workLinks; merge mode never deletes
 *  - rollback: a v2 export re-imported into a fresh DB reproduces the library
 */

import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { MediaItem, UserMediaEntry } from "../types";
import {
  applyBundle,
  buildBundle,
  validateBundle,
  MAX_IMPORT_BYTES,
  type ApplyDeps,
} from "../exportimport";
import * as db from "../localdb";

function media(over: Partial<MediaItem> & { localId: string }): MediaItem {
  return {
    provider: "tvmaze",
    providerId: over.localId.split(":")[1] ?? "1",
    mediaType: "series",
    format: "series",
    title: "Test Show",
    genres: ["drama"],
    tags: [],
    ...over,
  } as MediaItem;
}

function entry(mediaLocalId: string): UserMediaEntry {
  return {
    id: `entry_${mediaLocalId.replace(/[^a-z0-9]/gi, "")}`,
    mediaLocalId,
    status: "completed",
    rating: 5,
    isFavourite: true,
    userTags: [],
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-02T00:00:00.000Z",
  };
}

/** A bundle exactly as version 1 of the app exported it (no v2 fields). */
function v1Bundle(): Record<string, unknown> {
  const m = media({ localId: "tvmaze:169", title: "Breaking Bad", releaseYear: 2008 });
  return {
    app: "ECHO",
    schemaVersion: 1,
    exportedAt: "2026-06-01T00:00:00.000Z",
    entries: [entry("tvmaze:169")],
    media: [{ ...m, posterUrl: "https://example.test/p.jpg" }],
    feedback: [
      {
        id: "fb_1",
        mediaLocalId: "tvmaze:169",
        value: "liked",
        source: "rating",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    settings: { language: "en", interests: ["anime", "movie", "series"] },
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

describe("bundle validation", () => {
  test("v1 bundles are still valid after the v2 migration", () => {
    const parsed = validateBundle(v1Bundle());
    expect(parsed.ok).toBe(true);
  });

  test("v2 bundles validate and carry works + workLinks", () => {
    const parsed = validateBundle({
      ...v1Bundle(),
      schemaVersion: 2,
      works: [
        {
          workId: "echo-work-tvmaze-169",
          primaryType: "series",
          title: "Breaking Bad",
          externalIds: { tvmaze: "169", imdb: "tt0903747" },
          createdAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
      workLinks: [
        {
          id: "link_1",
          workId: "echo-work-tvmaze-169",
          relation: "season",
          order: 2,
          createdAt: "2026-11-23T00:00:00.000Z",
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.works?.length).toBe(1);
      expect(parsed.data.workLinks?.length).toBe(1);
    }
  });

  test("v3 bundles (manga/comics schema) validate — additive evolution", () => {
    const b = v1Bundle() as { media: unknown[]; entries: unknown[]; schemaVersion: number };
    b.schemaVersion = 3;
    b.entries = [];
    b.media = [
      {
        localId: "echo-demo:cmk-akira",
        provider: "echo-demo",
        providerId: "cmk-akira",
        mediaType: "manga",
        format: "book",
        subtype: "manga",
        publicationStatus: "completed",
        volumeCount: 6,
        endYear: 1990,
        title: "Akira",
        genres: ["sci-fi"],
        tags: [],
        synopsis: "A manga landmark.",
        externalIds: {},
      },
    ];
    const parsed = validateBundle(b);
    expect(parsed.ok).toBe(true);
  });

  test("future bundle versions are rejected (no guessing)", () => {
    const parsed = validateBundle({ ...v1Bundle(), schemaVersion: 99 });
    expect(parsed.ok).toBe(false);
  });

  test("non-ECHO payloads and orphan-entry bundles are rejected", () => {
    expect(validateBundle({ app: "Other" }).ok).toBe(false);
    const orphans = v1Bundle();
    (orphans as { entries: unknown[] }).entries = [
      { ...entry("tvmaze:999"), id: "entry_orphan" },
    ];
    const parsed = validateBundle(orphans);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe("orphan-entries");
  });

  test("MAX_IMPORT_BYTES stays a sane guard", () => {
    expect(MAX_IMPORT_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});

describe("buildBundle (v3)", () => {
  test("exports schemaVersion 3 with works, and strips artwork", () => {
    const m = media({ localId: "tvmaze:169", posterUrl: "https://x/p.jpg", workId: "echo-work-tvmaze-169" });
    const bundle = buildBundle({
      settings: { language: "en" },
      media: [m, media({ localId: "openlib:OL1W", provider: "openlib", mediaType: "book", format: "book", title: "Unreferenced" })],
      entries: [entry("tvmaze:169")],
      feedback: [],
      works: [
        {
          workId: "echo-work-tvmaze-169",
          primaryType: "series",
          title: "Breaking Bad",
          externalIds: { tvmaze: "169" },
          createdAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
    });
    expect(bundle.schemaVersion).toBe(3);
    // only referenced media (or manual) ships
    expect(bundle.media.length).toBe(1);
    expect(bundle.media[0].posterUrl).toBeUndefined();
    expect(bundle.works?.length).toBe(1);
  });
});

describe("applyBundle against the migrated (v2) database", () => {
  test("importing a v1 bundle restores the library (rollback path)", async () => {
    await resetDb();
    const parsed = validateBundle(v1Bundle());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const count = await applyBundle(parsed.data, "replace", deps());
    expect(count).toBe(1);
    const media = await db.getAllMedia();
    expect(media.length).toBe(1);
    expect(media[0].title).toBe("Breaking Bad");
    expect(media[0].posterUrl).toBeDefined(); // restored as stored in bundle
  });

  test("replace mode also restores works + workLinks", async () => {
    await resetDb();
    const parsed = validateBundle({
      ...v1Bundle(),
      schemaVersion: 2,
      works: [
        {
          workId: "echo-work-tvmaze-169",
          primaryType: "series",
          title: "Breaking Bad",
          externalIds: { tvmaze: "169" },
          createdAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
      workLinks: [
        {
          id: "link_1",
          workId: "echo-work-tvmaze-169",
          relation: "edition",
          label: "4k remaster",
          createdAt: "2026-11-23T00:00:00.000Z",
        },
      ],
    });
    if (!parsed.ok) throw new Error("bundle should validate");
    await applyBundle(parsed.data, "replace", deps());
    const works = await db.getAllWorks();
    const links = await db.getAllWorkLinks();
    expect(works.length).toBe(1);
    expect(works[0].externalIds.tvmaze).toBe("169");
    expect(links.length).toBe(1);
    expect(links[0].relation).toBe("edition");
  });

  test("curated sample records (echo-demo:cm-*) round-trip with attribution (Phase 2)", async () => {
    await resetDb();
    // a curated movie added to the library from local search
    const curated = media({
      localId: "echo-demo:cm-the-godfather",
      provider: "echo-demo",
      providerId: "cm-the-godfather",
      mediaType: "movie",
      format: "film",
      title: "The Godfather",
      releaseYear: 1972,
      workId: "echo-work-echo-demo-cm-the-godfather",
      sourceAttribution: "ECHO curated sample collection — original descriptions",
      providerRef: {
        providerId: "echo-demo",
        licenseStatus: "approved",
        termsUrl: "https://example.invalid/echo-sample",
        verifiedAt: "2026-11-23",
      },
    });
    const bundle = buildBundle({
      settings: { language: "en" },
      media: [curated],
      entries: [entry("echo-demo:cm-the-godfather")],
      feedback: [],
      works: [
        {
          workId: "echo-work-echo-demo-cm-the-godfather",
          primaryType: "movie",
          title: "The Godfather",
          externalIds: {},
          createdAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
    });
    const parsed = validateBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyBundle(parsed.data, "replace", deps());
    const restored = (await db.getAllMedia()).find(
      (m) => m.localId === "echo-demo:cm-the-godfather",
    );
    expect(restored?.title).toBe("The Godfather");
    expect(restored?.sourceAttribution).toContain("ECHO curated sample collection");
    expect(restored?.providerRef?.licenseStatus).toBe("approved");
    const works = await db.getAllWorks();
    expect(works.some((w) => w.title === "The Godfather")).toBe(true);
  });

  test("merge mode adds only new entries and never deletes existing works", async () => {
    await resetDb();
    // seed with one existing work + entry
    await db.putMedia([media({ localId: "tvmaze:169", title: "Breaking Bad", workId: "echo-work-tvmaze-169" })]);
    await db.putEntries([entry("tvmaze:169")]);
    await db.putWorks([
      {
        workId: "echo-work-tvmaze-169",
        primaryType: "series",
        title: "Breaking Bad",
        externalIds: { tvmaze: "169" },
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
    ]);

    // incoming bundle has a DIFFERENT title plus the same one
    const bundle = {
      ...v1Bundle(),
      schemaVersion: 2 as const,
      entries: [entry("tvmaze:169"), entry("tvmaze:170")],
      media: [
        media({ localId: "tvmaze:169", title: "Breaking Bad" }),
        media({ localId: "tvmaze:170", title: "Better Call Saul" }),
      ],
      works: [
        {
          workId: "echo-work-tvmaze-170",
          primaryType: "series",
          title: "Better Call Saul",
          externalIds: { tvmaze: "170" },
          createdAt: "2026-11-23T00:00:00.000Z",
          updatedAt: "2026-11-23T00:00:00.000Z",
        },
      ],
    };
    const parsed = validateBundle(bundle);
    if (!parsed.ok) throw new Error("bundle should validate");
    const added = await applyBundle(parsed.data, "merge", deps());
    expect(added).toBe(1); // only the new title
    const allMedia = await db.getAllMedia();
    expect(allMedia.length).toBe(2);
    const works = await db.getAllWorks();
    expect(works.length).toBe(2); // existing work survived, new work added
  });

  test("v2 round-trip: export → wipe → replace-import reproduces the library", async () => {
    await resetDb();
    await db.putMedia([
      media({ localId: "tvmaze:169", title: "Breaking Bad", workId: "echo-work-tvmaze-169", externalIds: { tvmaze: "169", imdb: "tt0903747" } }),
    ]);
    await db.putEntries([entry("tvmaze:169")]);
    await db.putWorks([
      {
        workId: "echo-work-tvmaze-169",
        primaryType: "series",
        title: "Breaking Bad",
        externalIds: { tvmaze: "169", imdb: "tt0903747" },
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
    ]);

    const bundle = buildBundle({
      settings: { language: "en" },
      media: await db.getAllMedia(),
      entries: await db.getAllEntries(),
      feedback: await db.getAllFeedback(),
      works: await db.getAllWorks(),
      workLinks: await db.getAllWorkLinks(),
    });

    // simulate a fresh device: wipe, then import the bundle
    await db.clearAllLocalData();
    expect((await db.getAllMedia()).length).toBe(0);
    const parsed = validateBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyBundle(parsed.data, "replace", deps());

    expect((await db.getAllMedia()).length).toBe(1);
    expect((await db.getAllEntries()).length).toBe(1);
    const works = await db.getAllWorks();
    expect(works.length).toBe(1);
    expect(works[0].externalIds.imdb).toBe("tt0903747");
  });

  test("clearAllLocalData clears the v2 stores too", async () => {
    await resetDb();
    await db.putMedia([media({ localId: "tvmaze:169" })]);
    await db.putWorks([
      {
        workId: "echo-work-tvmaze-169",
        primaryType: "series",
        title: "Breaking Bad",
        externalIds: {},
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
    ]);
    await db.clearAllLocalData();
    expect((await db.getAllMedia()).length).toBe(0);
    expect((await db.getAllWorks()).length).toBe(0);
  });
});
