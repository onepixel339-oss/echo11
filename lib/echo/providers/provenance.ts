/**
 * ECHO — v2 catalog provenance stamping, shared by every provider adapter.
 *
 * Every record produced by an adapter carries:
 *  - a stable canonical work id (workId),
 *  - its external provider ids (externalIds),
 *  - field-level provenance (which provider supplied each core field),
 *  - a license/provider reference looked up from the registry.
 *
 * Rating provenance is adapter-specific (only the adapter knows the real
 * scale and vote count) and is NOT touched here when already present.
 */

import type { MediaItem } from "../types";
import { manualWorkIdFor, workIdFor } from "../ids";
import { externalIdsOf } from "../migration";
import { providerEntry } from "./registry";

/** Fields every provider supplies itself → provenance map entries. */
const CORE_FIELDS = ["title", "mediaType", "format", "genres", "tags", "releaseYear"];

/** Registry id that governs a record's data (imdb records are Cinemeta-sourced). */
function registryIdOf(provider: string): string {
  if (provider === "imdb" || provider === "imdb-series") return "cinemeta";
  return provider;
}

/** Stamp the v2 catalog fields onto a freshly built provider record. */
export function stampCatalogProvenance(item: MediaItem): MediaItem {
  const registryId = registryIdOf(item.provider);
  const entry = providerEntry(registryId);
  const workId =
    item.provider === "manual" ? manualWorkIdFor(item.localId) : workIdFor(item.provider, item.providerId);
  const externalIds = externalIdsOf(item);

  const provenance: Record<string, string> = {};
  for (const f of CORE_FIELDS) provenance[f] = registryId;
  if (item.synopsis) provenance.synopsis = registryId;
  if (item.posterUrl) provenance.posterUrl = registryId;
  if (item.cast?.length) provenance.cast = registryId;
  if (item.creators?.length) provenance.creators = registryId;
  if (item.publicScore !== undefined) provenance.publicScore = registryId;

  const stamped: MediaItem = {
    ...item,
    workId,
    externalIds,
    provenance,
    providerRef: entry
      ? {
          providerId: entry.id,
          licenseStatus: entry.licenseStatus,
          termsUrl: entry.termsUrl,
          verifiedAt: entry.lastVerified,
        }
      : undefined,
  };
  if (!stamped.providerRef) delete stamped.providerRef;
  if (Object.keys(externalIds).length === 0) delete stamped.externalIds;
  return stamped;
}
