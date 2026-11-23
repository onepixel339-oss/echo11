/**
 * ECHO — IndexedDB v1 → v2 catalog migration tests.
 * Uses fake-indexeddb (dev-only dependency) to exercise the real upgrade
 * path: a version-1 database with legacy records is opened by the v2 code,
 * upgraded additively, and verified for zero data loss.
 *
 * Run: bun test src/lib/echo/__tests__
 */

import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import {
  enrichMediaItemV2,
  ratingProvenanceOf,
  worksForBatch,
} from "../migration";
import {
  closeDB,
  deleteWorks,
  getAllMedia,
  getAllWorks,
  openDB,
  putMedia,
  runCatalogMigrationV2,
  STORES,
} from "../localdb";

const DB_NAME = "echo-universe";

/** A legacy v1 record exactly as version 1 of the app stored it. */
function v1Record(over: Partial<MediaItem> & { localId: string }): MediaItem {
  return {
    provider: "anilist",
    providerId: over.localId.split(":")[1] ?? "1",
    mediaType: "anime",
    format: "series",
    title: "Legacy Record",
    genres: ["drama"],
    tags: [],
    sourceAttribution: "Data from AniList",
    metadataFetchedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as MediaItem;
}

async function deleteDatabase(): Promise<void> {
  await closeDB();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** Create the OLD (v1) database shape with records, as the previous app
 *  version would have left it on a user's device. */
async function createV1Database(records: MediaItem[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["kv", "media", "entries", "feedback", "mapLayout", "demoEntries", "demoMedia"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction("media", "readwrite");
      for (const r of records) t.objectStore("media").put(r, r.localId);
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

afterEach(async () => {
  await deleteDatabase();
});

describe("pure enrichment (no I/O)", () => {
  test("enrichMediaItemV2 adds v2 fields and preserves every v1 field", () => {
    const record = v1Record({
      localId: "anilist:42",
      title: "Legacy Anime",
      releaseYear: 2019,
      publicScore: 8.5,
      synopsis: "A story.",
    });
    const enriched = enrichMediaItemV2(record, "2026-11-23T00:00:00.000Z");
    // v2 fields added
    expect(enriched.workId).toBe("echo-work-anilist-42");
    expect(enriched.externalIds).toEqual({ anilist: "42" });
    expect(enriched.provenance?.title).toBe("anilist");
    expect(enriched.providerRef?.providerId).toBe("anilist");
    expect(enriched.providerRef?.termsUrl).toContain("anilist");
    // v1 fields untouched
    expect(enriched.title).toBe("Legacy Anime");
    expect(enriched.releaseYear).toBe(2019);
    expect(enriched.publicScore).toBe(8.5);
    expect(enriched.synopsis).toBe("A story.");
    expect(enriched.sourceAttribution).toBe("Data from AniList");
    expect(enriched.metadataFetchedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("rating provenance is reconstructed per provider scale", () => {
    const anilist = ratingProvenanceOf(v1Record({ localId: "anilist:1", publicScore: 8.6 }));
    expect(anilist).toEqual({ source: "anilist", scale: "0-100", value: 86 });
    const imdb = ratingProvenanceOf(v1Record({ localId: "imdb:tt1", provider: "imdb", publicScore: 8.8 }));
    expect(imdb).toEqual({ source: "imdb", scale: "0-10", value: 8.8 });
    const demo = ratingProvenanceOf(v1Record({ localId: "echo-demo:d1", provider: "echo-demo", publicScore: 7 }));
    expect(demo).toBeUndefined(); // sample data has no public rating provenance
  });

  test("already-migrated records are returned as-is (idempotent)", () => {
    const record = enrichMediaItemV2(v1Record({ localId: "anilist:42" }), "2026-11-23T00:00:00.000Z");
    const again = enrichMediaItemV2(record, "2026-12-01T00:00:00.000Z");
    expect(again).toBe(record); // same reference — never touched twice
  });

  test("worksForBatch merges external ids across records of one work", () => {
    const a = enrichMediaItemV2(
      v1Record({ localId: "tvmaze:169", provider: "tvmaze", providerId: "169", title: "Breaking Bad", externalIds: { imdb: "tt0903747" } }),
      "2026-11-23T00:00:00.000Z",
    );
    const works = worksForBatch([a], "2026-11-23T00:00:00.000Z");
    expect(works.length).toBe(1);
    expect(works[0].externalIds).toEqual({ tvmaze: "169", imdb: "tt0903747" });
    expect(works[0].title).toBe("Breaking Bad");
  });
});

describe("IndexedDB v1 → v2/v3 upgrade (fake-indexeddb)", () => {
  test("opening v2 creates the works/workLinks stores without touching v1 stores", async () => {
    await createV1Database([
      v1Record({ localId: "anilist:1", title: "Solo Leveling" }),
    ]);
    const db = await openDB();
    expect(db.version).toBe(3);
    expect(db.objectStoreNames.contains(STORES.works)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.workLinks)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.catalog)).toBe(true); // v3 shard store
    // every v1 store still present
    for (const name of ["kv", "media", "entries", "feedback", "mapLayout", "demoEntries", "demoMedia"]) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  test("migration enriches existing records IN PLACE and loses nothing", async () => {
    const legacy = [
      v1Record({ localId: "anilist:1", title: "Solo Leveling", releaseYear: 2024, publicScore: 8.7 }),
      v1Record({ localId: "tvmaze:169", provider: "tvmaze", providerId: "169", title: "Breaking Bad", releaseYear: 2008 }),
      v1Record({ localId: "manual:entry_abc", provider: "manual", providerId: "entry_abc", title: "My Private Note Entry" }),
    ];
    await createV1Database(legacy);
    const result = await runCatalogMigrationV2();
    expect(result.enriched).toBe(3);
    expect(result.works).toBe(3);

    const media = await getAllMedia();
    expect(media.length).toBe(3);
    for (const original of legacy) {
      const stored = media.find((m) => m.localId === original.localId);
      expect(stored).toBeDefined();
      // EVERY v1 field survives byte-for-byte
      expect(stored!.title).toBe(original.title);
      expect(stored!.provider).toBe(original.provider);
      expect(stored!.providerId).toBe(original.providerId);
      expect(stored!.genres).toEqual(original.genres);
      expect(stored!.sourceAttribution).toBe(original.sourceAttribution);
      expect(stored!.metadataFetchedAt).toBe(original.metadataFetchedAt);
      // and the v2 fields are stamped on
      expect(stored!.workId).toBeTruthy();
      expect(stored!.provenance).toBeTruthy();
    }
    // canonical works created with external id mappings
    const works = await getAllWorks();
    const anilistWork = works.find((w) => w.workId === "echo-work-anilist-1");
    expect(anilistWork?.externalIds.anilist).toBe("1");
    const tvmazeWork = works.find((w) => w.workId === "echo-work-tvmaze-169");
    expect(tvmazeWork?.externalIds.tvmaze).toBe("169");
    // manual records get their own stable work id
    const manualWork = works.find((w) => w.workId === "echo-work-manual:entry_abc");
    expect(manualWork).toBeDefined();
  });

  test("migration is idempotent — a second run enriches nothing new", async () => {
    await createV1Database([v1Record({ localId: "anilist:1", title: "Solo Leveling" })]);
    await runCatalogMigrationV2();
    const second = await runCatalogMigrationV2();
    expect(second.enriched).toBe(0);
  });

  test("new records written after migration carry v2 fields (stamped by adapters)", async () => {
    await createV1Database([]);
    await openDB(); // upgrade
    const fresh: MediaItem = {
      localId: "tvmaze:170",
      provider: "tvmaze",
      providerId: "170",
      mediaType: "series",
      format: "series",
      title: "Better Call Saul",
      genres: ["drama"],
      tags: [],
      workId: "echo-work-tvmaze-170",
      externalIds: { tvmaze: "170", imdb: "tt3032476" },
      provenance: { title: "tvmaze" },
    };
    await putMedia([fresh]);
    const media = await getAllMedia();
    expect(media[0].workId).toBe("echo-work-tvmaze-170");
    expect(media[0].externalIds?.imdb).toBe("tt3032476");
  });

  test("works store CRUD round-trips and deleteWorks removes exactly what is asked", async () => {
    await createV1Database([]);
    await openDB();
    const { putWorks } = await import("../localdb");
    await putWorks([
      {
        workId: "echo-work-anilist-1",
        primaryType: "anime",
        title: "Solo Leveling",
        externalIds: { anilist: "1" },
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      },
    ]);
    expect((await getAllWorks()).length).toBe(1);
    await deleteWorks(["echo-work-anilist-1"]);
    expect((await getAllWorks()).length).toBe(0);
    // media store untouched by works deletion
    expect((await getAllMedia()).length).toBe(0);
  });

  test("a v1 record with an unknown provider still migrates without a license stamp", async () => {
    await createV1Database([
      v1Record({ localId: "mystery:xyz", provider: "mystery", providerId: "xyz", title: "Unknown Source" }),
    ]);
    const result = await runCatalogMigrationV2();
    expect(result.enriched).toBe(1);
    const media = await getAllMedia();
    expect(media[0].workId).toBe("echo-work-mystery-xyz");
    expect(media[0].providerRef).toBeUndefined(); // never guess a license for unknown sources
    expect(media[0].title).toBe("Unknown Source"); // data preserved
  });
});
