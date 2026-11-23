/**
 * ECHO — v1 → v2 catalog migration (IndexedDB `echo-universe` DB version
 * 1 → 2). ADDITIVE ONLY: existing records are enriched in place by adding
 * the new v2 fields (workId, externalIds, provenance, providerRef, rating)
 * and a canonical `works` record is created for every stored media item.
 *
 * Guarantees:
 *  - no existing field is modified or removed (records are spread, then
 *    only new keys are stamped on top);
 *  - no record or store is deleted;
 *  - the migration is idempotent (records that already carry a workId are
 *    left untouched), so it can safely re-run;
 *  - records whose provider is unknown to the registry keep all their data
 *    and only receive a workId (no license stamp guessing).
 */

import type { ExternalIdMap, MediaItem, WorkRecord } from "./types";
import { manualWorkIdFor, workIdFor } from "./ids";
import { providerEntry } from "./providers/registry";

/** externalIds for a record, derived from what the provider itself gave us.
 *  The record's own provider id always maps to its own namespace. */
export function externalIdsOf(item: MediaItem): ExternalIdMap {
  const ids: ExternalIdMap = { ...(item.externalIds ?? {}) };
  switch (item.provider) {
    case "anilist":
      ids.anilist = ids.anilist ?? item.providerId;
      break;
    case "kitsu":
      ids.kitsu = ids.kitsu ?? item.providerId;
      break;
    case "tvmaze":
      ids.tvmaze = ids.tvmaze ?? item.providerId;
      break;
    case "imdb":
    case "imdb-series":
      ids.imdb = ids.imdb ?? item.providerId;
      break;
    case "rawg":
      ids.rawg = ids.rawg ?? item.providerId;
      break;
    case "openlib":
      ids.openlib = ids.openlib ?? item.providerId;
      break;
    case "wikidata":
      ids.wikidata = ids.wikidata ?? item.providerId;
      break;
    default:
      break; // manual / echo-demo / unknown providers carry no external ids
  }
  return ids;
}

/** WorkRecord for a media item (upsert source of truth for the works store). */
export function workRecordOf(item: MediaItem, nowIso: string): WorkRecord {
  return {
    workId: item.workId ?? "",
    primaryType: item.mediaType,
    title: item.title,
    externalIds: externalIdsOf(item),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Enrich a v1 media record with the v2 catalog fields. PURE — no I/O.
 *  Returns the SAME reference when nothing needs adding (already migrated). */
export function enrichMediaItemV2(item: MediaItem, nowIso: string): MediaItem {
  if (item.workId) return item; // already migrated — never touch it twice
  const provider = item.provider;
  const workId =
    provider === "manual"
      ? manualWorkIdFor(item.localId)
      : workIdFor(provider, item.providerId);
  const entry = providerEntry(registryProviderOf(provider));
  const externalIds = externalIdsOf(item);

  const enriched: MediaItem = {
    ...item, // v1 fields are preserved exactly
    workId,
    externalIds,
    providerRef: entry
      ? {
          providerId: entry.id,
          licenseStatus: entry.licenseStatus,
          termsUrl: entry.termsUrl,
          verifiedAt: entry.lastVerified,
        }
      : undefined,
    provenance: provenanceOf(item),
    rating: ratingProvenanceOf(item),
  };
  // do not add keys whose value is undefined where possible
  if (!enriched.providerRef) delete enriched.providerRef;
  if (Object.keys(externalIds).length === 0) delete enriched.externalIds;
  return enriched;
}

/** Field-level provenance: which provider supplied each core field. */
function provenanceOf(item: MediaItem): Record<string, string> {
  const src = item.provider === "imdb-series" ? "cinemeta" : item.provider;
  const fields: Record<string, string> = {
    title: src,
    mediaType: src,
    format: src,
    genres: src,
    tags: src,
    releaseYear: src,
  };
  if (item.synopsis) fields.synopsis = src;
  if (item.posterUrl) fields.posterUrl = src;
  if (item.cast?.length) fields.cast = src;
  if (item.creators?.length) fields.creators = src;
  if (item.publicScore !== undefined) fields.publicScore = src;
  return fields;
}

/** Rating provenance reconstructed from a v1 record's publicScore.
 *  The scale each provider reports on was fixed at adapter build time:
 *  AniList/Kitsu 0–100 (÷10 into publicScore), TVMaze/IMDb 0–10, RAWG 0–10
 *  (from a 0–5 community score or Metacritic). When the original scale
 *  cannot be proven, we record the normalized 0-10 with the source noted. */
export function ratingProvenanceOf(item: MediaItem): MediaItem["rating"] {
  if (item.rating) return item.rating;
  if (item.publicScore === undefined) return undefined;
  switch (item.provider) {
    case "anilist":
      return { source: "anilist", scale: "0-100", value: item.publicScore * 10 };
    case "kitsu":
      return { source: "kitsu", scale: "0-100", value: item.publicScore * 10 };
    case "tvmaze":
      return { source: "tvmaze", scale: "0-10", value: item.publicScore };
    case "imdb":
    case "imdb-series":
      return { source: "imdb", scale: "0-10", value: item.publicScore };
    case "rawg":
      return { source: "rawg", scale: "0-10", value: item.publicScore };
    default:
      return undefined; // demo/manual records have no public rating provenance
  }
}

/** Registry provider id for a record's provider string. */
export function registryProviderOf(provider: string): string {
  switch (provider) {
    case "imdb":
    case "imdb-series":
      return "cinemeta"; // details/artwork origin for stored IMDb records
    default:
      return provider;
  }
}

/**
 * Compute the works to upsert for a batch of media records.
 * First record per workId wins the display title (stable, deterministic
 * on the store's iteration order); external ids are merged across records.
 */
export function worksForBatch(items: MediaItem[], nowIso: string): WorkRecord[] {
  const byWork = new Map<string, WorkRecord>();
  for (const item of items) {
    const workId =
      item.workId ??
      (item.provider === "manual"
        ? manualWorkIdFor(item.localId)
        : workIdFor(item.provider, item.providerId));
    const externalIds = externalIdsOf(item);
    const existing = byWork.get(workId);
    if (!existing) {
      byWork.set(workId, {
        workId,
        primaryType: item.mediaType,
        title: item.title,
        externalIds,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else {
      byWork.set(workId, {
        ...existing,
        externalIds: { ...existing.externalIds, ...externalIds },
        updatedAt: nowIso,
      });
    }
  }
  return [...byWork.values()];
}
