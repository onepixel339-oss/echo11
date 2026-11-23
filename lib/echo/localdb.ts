/**
 * ECHO — Local persistence layer (IndexedDB, no dependencies).
 *
 * Object stores:
 *  - kv          : settings (key "settings")
 *  - media       : MediaItem records keyed by localId
 *  - entries     : UserMediaEntry records (user library)
 *  - feedback    : TasteFeedback records
 *  - mapLayout   : MapLayoutState (key "layout")
 *  - demoEntries : demo-universe library (never mixed with real data)
 *  - demoMedia   : media items for the demo universe
 *  - works       : canonical ECHO works (external id mappings)   [v2]
 *  - workLinks   : explicit work relationships                  [v2]
 *  - catalog     : versioned public catalog shards              [v3]
 *
 * DB version 2 (additive migration from v1 — see migration.ts):
 *  - version 2 only CREATES the works/workLinks stores and enriches
 *    existing media records with the new catalog fields in place;
 *
 * DB version 3 (additive):
 *  - version 3 only CREATES the `catalog` store for versioned public
 *    catalog shards (static JSON → IndexedDB ingestion, see
 *    catalogShards.ts). No existing store or record is touched. The v3
 *  print-media fields (subtype, publicationStatus, volumeCount, …) are
 *  optional on records and need no migration of stored data.
 *
 * Spec: do NOT use localStorage for the library; do not upload user data.
 */

import type {
  AppSettings,
  MapLayoutState,
  MediaItem,
  TasteFeedback,
  UserMediaEntry,
  WorkLink,
  WorkRecord,
} from "./types";
import { enrichMediaItemV2, worksForBatch } from "./migration";

const DB_NAME = "echo-universe";
const DB_VERSION = 3;

export const STORES = {
  kv: "kv",
  media: "media",
  entries: "entries",
  feedback: "feedback",
  mapLayout: "mapLayout",
  demoEntries: "demoEntries",
  demoMedia: "demoMedia",
  works: "works",
  workLinks: "workLinks",
  catalog: "catalog",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (and memoize) the IndexedDB connection. */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // ADDITIVE ONLY: create any missing store. Existing stores and every
      // record inside them are left exactly as they are.
      for (const name of [
        STORES.kv,
        STORES.media,
        STORES.entries,
        STORES.feedback,
        STORES.mapLayout,
        STORES.demoEntries,
        STORES.demoMedia,
        STORES.works,
        STORES.workLinks,
        STORES.catalog,
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onblocked = () => {
      /* another tab holds an older connection; it will close eventually */
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

/** Close and forget the memoized connection (tests). */
export async function closeDB(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  try {
    (await p)?.close();
  } catch {
    /* already closed */
  }
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result: T;
        const r = fn(s);
        if (r) {
          r.onsuccess = () => {
            result = r.result;
          };
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error("Transaction failed"));
        t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
      }),
  );
}

/** Storage health check used by the boot screen to surface recoverable errors. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await tx(STORES.kv, "readonly", (s) => s.get("ping"));
    return true;
  } catch {
    return false;
  }
}

// ---------- kv / settings ----------

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const v = await tx<AppSettings | undefined>(
      STORES.kv,
      "readonly",
      (s) => s.get("settings"),
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await tx(STORES.kv, "readwrite", (s) => s.put(settings, "settings"));
}

// ---------- media ----------

export async function getAllMedia(): Promise<MediaItem[]> {
  return tx<MediaItem[]>(STORES.media, "readonly", (s) => s.getAll());
}

export async function putMedia(items: MediaItem[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.media, "readwrite");
        const s = t.objectStore(STORES.media);
        for (const item of items) s.put(item, item.localId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Remove media records by localId (used when a manual record is replaced
 *  by its linked provider record). */
export async function deleteMedia(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.media, "readwrite");
        const s = t.objectStore(STORES.media);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- entries (real library) ----------

export async function getAllEntries(): Promise<UserMediaEntry[]> {
  return tx<UserMediaEntry[]>(STORES.entries, "readonly", (s) => s.getAll());
}

export async function putEntries(entries: UserMediaEntry[]): Promise<void> {
  if (!entries.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.entries, "readwrite");
        const s = t.objectStore(STORES.entries);
        for (const e of entries) s.put(e, e.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteEntries(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.entries, "readwrite");
        const s = t.objectStore(STORES.entries);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- feedback ----------

export async function getAllFeedback(): Promise<TasteFeedback[]> {
  return tx<TasteFeedback[]>(STORES.feedback, "readonly", (s) => s.getAll());
}

export async function putFeedback(items: TasteFeedback[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.feedback, "readwrite");
        const s = t.objectStore(STORES.feedback);
        for (const f of items) s.put(f, f.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteFeedback(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.feedback, "readwrite");
        const s = t.objectStore(STORES.feedback);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- map layout ----------

export async function getMapLayout(): Promise<MapLayoutState | null> {
  try {
    const v = await tx<MapLayoutState | undefined>(
      STORES.mapLayout,
      "readonly",
      (s) => s.get("layout"),
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveMapLayout(state: MapLayoutState): Promise<void> {
  await tx(STORES.mapLayout, "readwrite", (s) => s.put(state, "layout"));
}

// ---------- works & relationships (v2) ----------

export async function getAllWorks(): Promise<WorkRecord[]> {
  return tx<WorkRecord[]>(STORES.works, "readonly", (s) => s.getAll());
}

export async function getWork(workId: string): Promise<WorkRecord | null> {
  try {
    const v = await tx<WorkRecord | undefined>(
      STORES.works,
      "readonly",
      (s) => s.get(workId),
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function putWorks(works: WorkRecord[]): Promise<void> {
  if (!works.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.works, "readwrite");
        const s = t.objectStore(STORES.works);
        for (const w of works) s.put(w, w.workId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteWorks(workIds: string[]): Promise<void> {
  if (!workIds.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.works, "readwrite");
        const s = t.objectStore(STORES.works);
        for (const id of workIds) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function getAllWorkLinks(): Promise<WorkLink[]> {
  return tx<WorkLink[]>(STORES.workLinks, "readonly", (s) => s.getAll());
}

export async function putWorkLinks(links: WorkLink[]): Promise<void> {
  if (!links.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.workLinks, "readwrite");
        const s = t.objectStore(STORES.workLinks);
        for (const l of links) s.put(l, l.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteWorkLinks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.workLinks, "readwrite");
        const s = t.objectStore(STORES.workLinks);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Find a work by any of its external ids (cross-provider resolution). */
export async function findWorkByExternalId(
  kind: keyof import("./types").ExternalIdMap,
  value: string,
): Promise<WorkRecord | null> {
  if (!value) return null;
  const works = await getAllWorks();
  return works.find((w) => w.externalIds[kind] === value) ?? null;
}

/**
 * v1 → v2 additive migration runner. Enriches every stored media record
 * with the v2 catalog fields (in place, keys added only) and upserts a
 * canonical work record for each. Idempotent; failures leave stored data
 * untouched (enrichment happens on copies and per-record writes are
 * independent).
 */
export async function runCatalogMigrationV2(): Promise<{
  enriched: number;
  works: number;
}> {
  const db = await openDB();
  // sanity: v2 stores must exist (upgrade ran on open)
  if (!db.objectStoreNames.contains(STORES.works)) {
    return { enriched: 0, works: 0 };
  }
  const nowIso = new Date().toISOString();

  const media = await getAllMedia();
  const enrichedById = new Map(
    media.filter((m) => !m.workId).map((m) => [m.localId, enrichMediaItemV2(m, nowIso)]),
  );
  const toEnrich = [...enrichedById.values()];
  // works are (re)built from the FULL set — enriched where applicable
  const works = worksForBatch(
    media.map((m) => enrichedById.get(m.localId) ?? m),
    nowIso,
  );

  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORES.media, STORES.works], "readwrite");
    const mediaStore = t.objectStore(STORES.media);
    const worksStore = t.objectStore(STORES.works);
    for (const item of toEnrich) mediaStore.put(item, item.localId);
    for (const w of works) worksStore.put(w, w.workId);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("Catalog migration failed"));
    t.onabort = () => reject(t.error ?? new Error("Catalog migration aborted"));
  });

  return { enriched: toEnrich.length, works: works.length };
}

// ---------- catalog shards (v3: versioned public catalog data) ----------

/** All locally ingested public-catalog records (shards). Read-only consumers:
 *  search (local fill), Discover pools, catalog metrics. Never user data. */
export async function getAllCatalogRecords(): Promise<MediaItem[]> {
  return tx<MediaItem[]>(STORES.catalog, "readonly", (s) => s.getAll());
}

export async function putCatalogRecords(items: MediaItem[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.catalog, "readwrite");
        const s = t.objectStore(STORES.catalog);
        for (const item of items) s.put(item, item.localId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Delete catalog records by localId (stale shard versions). */
export async function deleteCatalogRecords(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.catalog, "readwrite");
        const s = t.objectStore(STORES.catalog);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Shard bookkeeping in kv (key: catalogShardVersion:<shardId>). */
export async function getCatalogShardVersion(shardId: string): Promise<number | null> {
  try {
    const v = await tx<number | undefined>(
      STORES.kv,
      "readonly",
      (s) => s.get(`catalogShardVersion:${shardId}`),
    );
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

export async function setCatalogShardVersion(shardId: string, version: number): Promise<void> {
  await tx(STORES.kv, "readwrite", (s) => s.put(version, `catalogShardVersion:${shardId}`));
}

// ---------- demo universe (isolated stores) ----------

export async function getAllDemoEntries(): Promise<UserMediaEntry[]> {
  return tx<UserMediaEntry[]>(STORES.demoEntries, "readonly", (s) => s.getAll());
}

export async function putDemoEntries(entries: UserMediaEntry[]): Promise<void> {
  if (!entries.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.demoEntries, "readwrite");
        const s = t.objectStore(STORES.demoEntries);
        for (const e of entries) s.put(e, e.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function clearDemoData(): Promise<void> {
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(
          [STORES.demoEntries, STORES.demoMedia],
          "readwrite",
        );
        t.objectStore(STORES.demoEntries).clear();
        t.objectStore(STORES.demoMedia).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function getDemoMedia(): Promise<MediaItem[]> {
  return tx<MediaItem[]>(STORES.demoMedia, "readonly", (s) => s.getAll());
}

export async function putDemoMedia(items: MediaItem[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.demoMedia, "readwrite");
        const s = t.objectStore(STORES.demoMedia);
        for (const item of items) s.put(item, item.localId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- destructive ----------

export async function clearAllLocalData(): Promise<void> {
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(
          [
            STORES.kv,
            STORES.media,
            STORES.entries,
            STORES.feedback,
            STORES.mapLayout,
            STORES.demoEntries,
            STORES.demoMedia,
            STORES.works,
            STORES.workLinks,
            STORES.catalog,
          ],
          "readwrite",
        );
        for (const name of Object.values(STORES)) {
          t.objectStore(name).clear();
        }
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}
