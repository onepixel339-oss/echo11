/**
 * ECHO — Versioned public catalog shards (v3 catalog foundation).
 *
 * HOW THE CANONICAL PUBLIC CATALOG IS DISTRIBUTED:
 *  1. Curated TS collections (demoCatalogue + curated*) ship in the app
 *     bundle — small, always available, the baseline.
 *  2. LARGER permitted datasets ship as static JSON shards under
 *     /catalog/<shard>.json with a versioned manifest at /catalog/manifest.json.
 *     They are fetched on demand (never part of the JS bundle), validated,
 *     and INGESTED into a dedicated IndexedDB store (`catalog`) that is
 *     completely separate from user data. Ingestion is idempotent and
 *     version-tracked; after the first sync the records are available
 *     OFFLINE. Search and Discover pools merge shard records into the local
 *     labelled fill under the "echo-demo" registry umbrella (approved,
 *     redistributable content).
 *
 * Honest separation (never blurred):
 *  - `catalog` store = shared, versioned PUBLIC catalog data (ECHO's dataset);
 *  - `media`/`entries` stores = the USER's library (their own data);
 *  - provider caches = provider data under provider permissions.
 *  Per-browser IndexedDB is NOT a central database: each device holds its own
 *  copy of the same versioned shards, refreshed from static files.
 *
 * Shard JSON is authored content: bibliographic facts (public information),
 * original EN/AR descriptions, no ratings, no artwork. See
 * /public/catalog/README.md for the authoring + versioning rules.
 */

import type { MediaItem, MediaType, PublicationStatus } from "./types";
import { formatForType } from "./types";
import {
  getAllCatalogRecords,
  getCatalogShardVersion,
  putCatalogRecords,
  setCatalogShardVersion,
  closeDB,
} from "./localdb";
import type { ProviderSearchResult } from "./providers/types";

/** The shard provider id — records live under the approved echo-demo umbrella. */
export const SHARD_PROVIDER_ID = "echo-catalog";
export const SHARD_SOURCE_LABEL = "Sample";

const MANIFEST_URL = "/catalog/manifest.json";

export interface CatalogShardRecord {
  /** stable record id, unique across all shards (namespaced per shard) */
  id: string;
  mediaType: MediaType;
  title: string;
  titleAr?: string;
  originalTitle?: string;
  year: number;
  /** author / creator credits (verified public knowledge) */
  creators?: string[];
  /** publisher / imprint */
  publishers?: string[];
  genres: string[];
  tags?: string[];
  languages?: string[];
  countries?: string[];
  /** original EN description written for ECHO (never copied from elsewhere) */
  synopsis: string;
  /** original AR description written for ECHO */
  synopsisAr?: string;
  subtype?: string;
  publicationStatus?: PublicationStatus;
  volumeCount?: number;
  /** external references, e.g. a Project Gutenberg ebook number */
  gutenbergId?: number;
  /** where the work can be legally read/viewed free (public domain mirrors) */
  freeReadingUrl?: string;
}

export interface CatalogShard {
  shardId: string;
  version: number;
  /** shown in attribution, e.g. "Public-domain classics (ECHO curation)" */
  label: string;
  /** license note recorded on every record (provenance for humans) */
  licenseNote: string;
  records: CatalogShardRecord[];
}

export interface CatalogManifest {
  version: number;
  updatedAt: string;
  shards: { id: string; file: string; version: number; label: string }[];
}

/* ------------------------------ validation ------------------------------ */

const MEDIA_TYPES: MediaType[] = [
  "anime",
  "movie",
  "series",
  "game",
  "book",
  "manga",
  "comics",
];

const PUBLICATION_STATUSES: PublicationStatus[] = [
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
  "upcoming",
];

/** Structural validation — a malformed shard is rejected whole, never partially ingested. */
export function validateShard(data: unknown): CatalogShard | null {
  if (typeof data !== "object" || data === null) return null;
  const s = data as Partial<CatalogShard> & { shardId?: string; records?: unknown };
  if (typeof s.shardId !== "string" || !/^[\w-]+$/.test(s.shardId)) return null;
  if (typeof s.version !== "number" || !Number.isInteger(s.version) || s.version < 1) return null;
  if (typeof s.label !== "string" || !s.label) return null;
  if (typeof s.licenseNote !== "string" || !s.licenseNote) return null;
  if (!Array.isArray(s.records) || !s.records.length) return null;
  if (s.records.length > 5000) return null; // guard against absurd payloads
  const seen = new Set<string>();
  for (const r of s.records) {
    if (typeof r !== "object" || r === null) return null;
    const rec = r as Partial<CatalogShardRecord>;
    if (typeof rec.id !== "string" || !/^[\w-]+$/.test(rec.id)) return null;
    if (seen.has(rec.id)) return null;
    seen.add(rec.id);
    if (typeof rec.title !== "string" || !rec.title.trim()) return null;
    if (typeof rec.year !== "number" || !Number.isInteger(rec.year)) return null;
    if (!MEDIA_TYPES.includes(rec.mediaType as MediaType)) return null;
    if (!Array.isArray(rec.genres)) return null;
    if (typeof rec.synopsis !== "string" || rec.synopsis.length < 20) return null;
    if (rec.publicationStatus !== undefined && !PUBLICATION_STATUSES.includes(rec.publicationStatus as PublicationStatus)) {
      return null;
    }
  }
  return data as CatalogShard;
}

/** Validate a manifest document (missing shards are simply not ingested). */
export function validateManifest(data: unknown): CatalogManifest | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Partial<CatalogManifest>;
  if (!Array.isArray(m.shards)) return null;
  for (const sh of m.shards) {
    if (typeof sh?.id !== "string" || typeof sh.file !== "string") return null;
    if (!/^[\w-]+$/.test(sh.id) || !/^[\w./-]+$/.test(sh.file) || sh.file.includes("..")) return null;
  }
  return data as CatalogManifest;
}

/* ------------------------------- ingestion ------------------------------- */

function shardToMediaItem(shard: CatalogShard, r: CatalogShardRecord): MediaItem {
  const externalIds: NonNullable<MediaItem["externalIds"]> = {};
  if (r.gutenbergId) externalIds.gutenberg = String(r.gutenbergId);
  return {
    localId: `${SHARD_PROVIDER_ID}:${r.id}`,
    provider: SHARD_PROVIDER_ID,
    providerId: r.id,
    canonicalUrl: r.freeReadingUrl,
    mediaType: r.mediaType,
    format: formatForType(r.mediaType),
    subtype: r.subtype,
    publicationStatus: r.publicationStatus,
    volumeCount: r.volumeCount,
    title: r.title,
    titleAr: r.titleAr,
    originalTitle: r.originalTitle,
    synopsis: r.synopsis,
    synopsisAr: r.synopsisAr,
    releaseYear: r.year,
    releaseDate: `${r.year}`,
    genres: r.genres,
    tags: r.tags ?? [],
    creators: r.creators,
    studios: r.publishers, // publisher slot — same as game developers
    languages: r.languages,
    countries: r.countries,
    sourceAttribution: `${shard.label} — ${shard.licenseNote} · ECHO curated sample collection`,
    metadataFetchedAt: new Date(0).toISOString(),
    workId: `echo-work-${SHARD_PROVIDER_ID}-${r.id}`,
    provenance: {
      title: SHARD_PROVIDER_ID,
      mediaType: SHARD_PROVIDER_ID,
      format: SHARD_PROVIDER_ID,
      genres: SHARD_PROVIDER_ID,
      releaseYear: SHARD_PROVIDER_ID,
      synopsis: SHARD_PROVIDER_ID,
      ...(r.creators?.length ? { creators: SHARD_PROVIDER_ID } : {}),
    },
    providerRef: {
      providerId: "echo-demo",
      licenseStatus: "approved",
      termsUrl: "https://example.invalid/echo-sample",
      verifiedAt: null,
    },
    externalIds,
  };
}

export interface ShardSyncResult {
  ingested: number;
  shards: string[];
}

/**
 * Fetch the manifest and ingest any shard whose version is newer than the
 * locally stored one. Failures are silent-and-safe: offline, missing manifest
 * or a malformed shard simply means "keep what we have" (possibly nothing).
 */
export async function syncCatalogShards(
  fetchFn: typeof fetch = fetch,
): Promise<ShardSyncResult> {
  let manifest: CatalogManifest | null = null;
  try {
    const res = await fetchFn(MANIFEST_URL);
    if (res.ok) manifest = validateManifest(await res.json());
  } catch {
    return { ingested: 0, shards: [] }; // offline / not deployed — fine
  }
  if (!manifest) return { ingested: 0, shards: [] };

  let ingested = 0;
  const done: string[] = [];
  for (const entry of manifest.shards) {
    const local = await getCatalogShardVersion(entry.id);
    if (local !== null && local >= entry.version) continue;
    try {
      const res = await fetchFn(`/catalog/${entry.file}`);
      if (!res.ok) continue;
      const shard = validateShard(await res.json());
      if (!shard || shard.shardId !== entry.id) continue;
      const items = shard.records.map((r) => shardToMediaItem(shard, r));
      await putCatalogRecords(items);
      await setCatalogShardVersion(entry.id, entry.version);
      ingested += items.length;
      done.push(entry.id);
    } catch {
      // this shard stays as-is; others are unaffected
    }
  }
  return { ingested, shards: done };
}

/* -------------------------------- search -------------------------------- */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Search ingested shard records, mirroring the demo provider's scoring so
 *  shard content behaves exactly like the rest of the local catalogue. */
export async function searchCatalogShards(
  query: string,
  mediaTypes: MediaType[],
  limit: number,
): Promise<ProviderSearchResult[]> {
  const q = normalize(query);
  if (!q) return [];
  let records: MediaItem[] = [];
  try {
    records = await getAllCatalogRecords();
  } catch {
    return [];
  }
  const scored: { item: MediaItem; score: number }[] = [];
  for (const item of records) {
    if (!mediaTypes.includes(item.mediaType)) continue;
    const title = normalize(item.title);
    const titleAr = item.titleAr ? normalize(item.titleAr) : "";
    const original = item.originalTitle ? normalize(item.originalTitle) : "";
    let score = 0;
    if (title === q || titleAr === q || original === q) score = 100;
    else if (title.startsWith(q) || titleAr.startsWith(q) || original.startsWith(q)) score = 80;
    else if (title.includes(q) || titleAr.includes(q) || original.includes(q)) score = 60;
    else if (normalize(item.genres.join(" ")).includes(q)) score = 25;
    else if (normalize((item.tags ?? []).join(" ")).includes(q)) score = 20;
    else if (normalize(item.synopsis ?? "").includes(q)) score = 10;
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.item.title < b.item.title ? -1 : 1));
  return scored.slice(0, limit).map((s) => ({ item: s.item, sourceLabel: SHARD_SOURCE_LABEL }));
}

/** Ingsted shard items for Discover pools (genre-matched first). */
export async function shardPoolForTypes(
  mediaTypes: MediaType[],
  opts?: { genres?: string[]; limit?: number },
): Promise<MediaItem[]> {
  let records: MediaItem[] = [];
  try {
    records = await getAllCatalogRecords();
  } catch {
    return [];
  }
  const genres = new Set(opts?.genres ?? []);
  const limit = opts?.limit ?? 20;
  const matching = records.filter((m) => mediaTypes.includes(m.mediaType));
  const genreMatched = genres.size
    ? matching.filter((m) => m.genres.some((g) => genres.has(g)))
    : [];
  const rest = matching.filter((m) => !genreMatched.includes(m));
  return [...genreMatched, ...rest].slice(0, limit);
}

/** Test helper: reset memoized DB handles so fake-indexeddb tests are isolated. */
export async function resetShardStoreForTests(): Promise<void> {
  await closeDB();
}
