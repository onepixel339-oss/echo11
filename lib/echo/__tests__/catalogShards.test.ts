/**
 * ECHO — Catalog shard system tests (v3 catalog foundation).
 *
 * ALL fetch access is mocked. Covers:
 *  - manifest + shard structural validation (malformed shards rejected whole)
 *  - idempotent, version-tracked ingestion into the `catalog` store
 *  - shard records join the local search fill and Discover pools, labelled
 *  - offline / missing manifest / fetch failure never break the app
 *  - public shard JSON on disk stays valid against the loader's rules
 *
 * Uses fake-indexeddb (the same store the client uses).
 */

import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import {
  SHARD_PROVIDER_ID,
  searchCatalogShards,
  shardPoolForTypes,
  syncCatalogShards,
  validateManifest,
  validateShard,
  type CatalogShard,
  type CatalogShardRecord,
} from "../catalogShards";
import * as db from "../localdb";
import type { MediaItem, MediaType } from "../types";

const realFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.closeDB();
  // fake-indexeddb keeps databases per-process: wipe ours so every test
  // starts from a clean catalog store
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("echo-universe");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

function fetchOk(map: Record<string, unknown>) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, payload] of Object.entries(map)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

const GOOD_RECORD: CatalogShardRecord = {
  id: "pg-x",
  mediaType: "book",
  title: "A Public Domain Classic",
  year: 1851,
  creators: ["An Author"],
  genres: ["drama"],
  synopsis: "An original ECHO-written description of the work, long enough.",
  gutenbergId: 11,
  freeReadingUrl: "https://www.gutenberg.org/ebooks/11",
};

function goodShard(overrides: Partial<CatalogShard> = {}): CatalogShard {
  return {
    shardId: "test-shard",
    version: 1,
    label: "Test shard",
    licenseNote: "public domain (US) + original ECHO descriptions",
    records: [GOOD_RECORD],
    ...overrides,
  };
}

/* ------------------------------- validation ------------------------------- */

describe("shard + manifest structural validation", () => {
  test("a well-formed shard validates", () => {
    expect(validateShard(goodShard())).not.toBeNull();
  });

  test("malformed shards are rejected WHOLE — never partially trusted", () => {
    expect(validateShard({ ...goodShard(), shardId: "bad id!" })).toBeNull();
    expect(validateShard({ ...goodShard(), version: 0 })).toBeNull();
    expect(validateShard({ ...goodShard(), version: 1.5 })).toBeNull();
    expect(validateShard({ ...goodShard(), records: [] })).toBeNull();
    expect(
      validateShard({
        ...goodShard(),
        records: [{ ...GOOD_RECORD, id: "dup" }, { ...GOOD_RECORD, id: "dup" }],
      }),
    ).toBeNull(); // duplicate ids
    expect(validateShard({ ...goodShard(), records: [{ ...GOOD_RECORD, year: "1851" }] })).toBeNull();
    expect(
      validateShard({ ...goodShard(), records: [{ ...GOOD_RECORD, mediaType: "podcast" as MediaType }] }),
    ).toBeNull();
    expect(
      validateShard({ ...goodShard(), records: [{ ...GOOD_RECORD, synopsis: "too short" }] }),
    ).toBeNull();
    expect(validateShard(null)).toBeNull();
  });

  test("manifests are validated and path traversal is rejected", () => {
    expect(
      validateManifest({
        version: 1,
        updatedAt: "2026-11-23",
        shards: [{ id: "a", file: "a.json", version: 1, label: "A" }],
      }),
    ).not.toBeNull();
    expect(validateManifest({ shards: [{ id: "a", file: "../etc/passwd" }] })).toBeNull();
    expect(validateManifest({ shards: [{ id: "bad id", file: "a.json" }] })).toBeNull();
    expect(validateManifest(null)).toBeNull();
  });
});

/* ------------------------------- ingestion -------------------------------- */

describe("versioned ingestion into the catalog store", () => {
  test("ingests a newer shard; re-sync at the same version is a no-op", async () => {
    const manifest = {
      version: 1,
      updatedAt: "2026-11-23",
      shards: [{ id: "test-shard", file: "test-shard.json", version: 1, label: "Test shard" }],
    };
    const fetch1 = fetchOk({
      "manifest.json": manifest,
      "test-shard.json": goodShard(),
    });
    const first = await syncCatalogShards(fetch1);
    expect(first.ingested).toBe(1);
    expect(first.shards).toEqual(["test-shard"]);

    const records1 = await db.getAllCatalogRecords();
    expect(records1.length).toBe(1);
    expect(records1[0].localId).toBe(`${SHARD_PROVIDER_ID}:pg-x`);
    expect(records1[0].provider).toBe(SHARD_PROVIDER_ID);
    expect(records1[0].mediaType).toBe("book");
    expect(records1[0].externalIds).toEqual({ gutenberg: "11" });
    expect(records1[0].workId).toBe(`echo-work-${SHARD_PROVIDER_ID}-pg-x`);

    // same version → no re-ingestion
    const second = await syncCatalogShards(fetch1);
    expect(second.ingested).toBe(0);
    const records2 = await db.getAllCatalogRecords();
    expect(records2.length).toBe(1);

    // newer version → replaced
    const manifest2 = {
      ...manifest,
      shards: [{ ...manifest.shards[0], version: 2 }],
    };
    const v2Shard = goodShard({ version: 2, records: [GOOD_RECORD, { ...GOOD_RECORD, id: "pg-y", title: "Second Classic" }] });
    const third = await syncCatalogShards(
      fetchOk({ "manifest.json": manifest2, "test-shard.json": v2Shard }),
    );
    expect(third.ingested).toBe(2);
    const records3 = await db.getAllCatalogRecords();
    expect(records3.length).toBe(2);
  });

  test("shard mismatch (id ≠ manifest id) is rejected", async () => {
    const manifest = {
      version: 1,
      updatedAt: "2026-11-23",
      shards: [{ id: "other-shard", file: "test-shard.json", version: 1, label: "X" }],
    };
    const result = await syncCatalogShards(
      fetchOk({ "manifest.json": manifest, "test-shard.json": goodShard() }),
    );
    expect(result.ingested).toBe(0);
  });

  test("offline / missing manifest / fetch failure never throws", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await syncCatalogShards(failing)).toEqual({ ingested: 0, shards: [] });
    expect(await syncCatalogShards(fetchOk({}))).toEqual({ ingested: 0, shards: [] });
  });

  test("the catalog store is separate from user data (media store untouched)", async () => {
    await db.putMedia([
      {
        localId: "manual:m1",
        provider: "manual",
        providerId: "m1",
        mediaType: "book",
        format: "book",
        title: "My Own Book",
        genres: [],
        tags: [],
      },
    ]);
    await syncCatalogShards(
      fetchOk({
        "manifest.json": {
          version: 1,
          updatedAt: "2026-11-23",
          shards: [{ id: "test-shard", file: "test-shard.json", version: 1, label: "T" }],
        },
        "test-shard.json": goodShard(),
      }),
    );
    const media = await db.getAllMedia();
    const catalog = await db.getAllCatalogRecords();
    expect(media.length).toBe(1);
    expect(media[0].title).toBe("My Own Book");
    expect(catalog.length).toBe(1);
    expect(catalog[0].title).toBe("A Public Domain Classic");
  });
});

/* --------------------------- search + pool joins --------------------------- */

describe("shard records in search and pools", () => {
  test("ingested shard records are searchable like the rest of the local catalogue", async () => {
    await syncCatalogShards(
      fetchOk({
        "manifest.json": {
          version: 1,
          updatedAt: "2026-11-23",
          shards: [{ id: "test-shard", file: "test-shard.json", version: 1, label: "T" }],
        },
        "test-shard.json": goodShard({
          records: [
            { ...GOOD_RECORD, id: "pg-moby", title: "Moby-Dick", year: 1851 },
            { ...GOOD_RECORD, id: "pg-holmes", title: "The Adventures of Sherlock Holmes", year: 1892 },
          ],
        }),
      }),
    );
    const hits = await searchCatalogShards("Moby", ["book"], 5);
    expect(hits.length).toBe(1);
    expect(hits[0].item.title).toBe("Moby-Dick");
    expect(hits[0].sourceLabel).toBe("Sample");

    // type-filtered: a book shard record never matches a manga query
    const wrongType = await searchCatalogShards("Moby", ["manga"], 5);
    expect(wrongType.length).toBe(0);

    // pools
    const pool = await shardPoolForTypes(["book"], { limit: 10 });
    expect(pool.length).toBe(2);
    const genrePool = await shardPoolForTypes(["book"], { genres: ["drama"], limit: 10 });
    expect(genrePool.length).toBe(2);
    const nonePool = await shardPoolForTypes(["manga"], { limit: 10 });
    expect(nonePool.length).toBe(0);
  });
});

/* --------------------------- on-disk shard health -------------------------- */

describe("the shipped public shard stays valid", () => {
  test("public/catalog/manifest.json and pg-classics-en.json validate and carry unique ids", async () => {
    const fs = await import("node:fs/promises");
    const manifestRaw = await fs.readFile("public/catalog/manifest.json", "utf8");
    const manifest = validateManifest(JSON.parse(manifestRaw));
    expect(manifest).not.toBeNull();

    const shardRaw = await fs.readFile("public/catalog/pg-classics-en.json", "utf8");
    const shard = validateShard(JSON.parse(shardRaw));
    expect(shard).not.toBeNull();
    expect(shard!.records.length).toBeGreaterThanOrEqual(20);
    expect(shard!.records.every((r) => r.mediaType === "book")).toBe(true);

    // ids unique vs the curated books bundle (no identity collisions by design)
    const { CURATED_BOOKS } = await import("../data/curatedBooks");
    const curatedTitles = new Set(CURATED_BOOKS.map((b) => `${b.title}|${b.year}`));
    for (const r of shard!.records) {
      expect(curatedTitles.has(`${r.title}|${r.year}`)).toBe(false);
    }

    // every record carries a legal free-reading link + Gutenberg id
    for (const r of shard!.records) {
      expect(r.freeReadingUrl?.startsWith("https://www.gutenberg.org/ebooks/")).toBe(true);
      expect(r.gutenbergId).toBeGreaterThan(0);
      expect(r.synopsisAr ?? r.synopsis.length).toBeTruthy();
    }
  });
});
