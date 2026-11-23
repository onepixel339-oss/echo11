/**
 * ECHO — Catalog metrics (reproducible data-quality measurement).
 *
 * A pure function over the local catalogue + ingested shards + registry that
 * reports, per category: record counts by origin, metadata completeness,
 * identifier coverage, language/country distribution, publication-period
 * coverage, artwork availability and the live-source posture. No network
 * access — the same inputs always produce the same numbers, which is what
 * makes regressions detectable in tests and the numbers honest in the UI.
 *
 * Counting rules (honest by design):
 *  - only LOCALLY AVAILABLE records count toward catalog totals: curated
 *    ECHO content, demo-universe seeds and ingested shard records;
 *  - live-only providers (AniList manga, TVMaze, RAWG, Open Library,
 *    Wikidata…) are reported as live coverage, never as stored records;
 *  - a small curated collection is a curated starter collection — the UI
 *    says exactly that (metrics label included).
 */

import type { MediaItem, MediaType } from "./types";
import { MEDIA_TYPES } from "./types";
import { DEMO_CATALOGUE, demoToMediaItem } from "./data/demoCatalogue";
import { PROVIDER_REGISTRY, isProviderEnabled } from "./providers/registry";

export interface CategoryMetrics {
  type: MediaType;
  /** locally available records (curated + demo + ingested shards) */
  totalRecords: number;
  curated: number;
  demo: number;
  shardImported: number;
  /** live providers currently enabled for this type (interactive use) */
  liveSources: string[];
  /** true when the type has NO locally stored records at all */
  liveOnly: boolean;
  metadataCompleteness: {
    /** % of records with a synopsis */
    synopsis: number;
    /** % of records with at least one genre */
    genres: number;
    /** % of records with year + country of origin */
    year: number;
    country: number;
    /** % of records with at least one creator credit */
    creators: number;
    /** % with original title (non-English works) where one is expected */
    bilingualTitles: number;
  };
  /** records with NO external identifier (all local-catalogue records by design) */
  missingExternalIds: number;
  /** records flagged for identity review (user library data, shown for context) */
  ambiguousEntries: number;
  languageDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  periodCoverage: { minYear?: number; maxYear?: number };
  artwork: { generated: number; external: number };
}

export interface CatalogMetrics {
  perCategory: CategoryMetrics[];
  sources: {
    verifiedApproved: string[];
    restricted: string[];
    unverifiedOrPending: string[];
    hardDisabled: string[];
  };
  generatedAt: string;
  /** static snapshot inputs, for reproducibility */
  inputs: { catalogueRecords: number; shardRecords: number };
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function tally(values: (string[] | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const list of values) {
    for (const v of list ?? []) out[v] = (out[v] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/**
 * Compute catalog metrics.
 * @param shardRecords records ingested from versioned catalog shards (pass
 *        `await getAllCatalogRecords()` on the client; `[]` in tests/offline)
 * @param flaggedEntryCount user library entries currently flagged for
 *        identity review (ambiguous matches) — context, not catalog data
 */
export function computeCatalogMetrics(
  shardRecords: MediaItem[],
  flaggedEntryCount = 0,
): CatalogMetrics {
  const seeds = DEMO_CATALOGUE;
  const byType = new Map<MediaType, { curated: number; demo: number; items: MediaItem[] }>();
  for (const t of MEDIA_TYPES) byType.set(t, { curated: 0, demo: 0, items: [] });

  for (const seed of seeds) {
    const bucket = byType.get(seed.mediaType);
    if (!bucket) continue;
    if (seed.collection === "curated") bucket.curated++;
    else bucket.demo++;
    bucket.items.push(demoToMediaItem(seed));
  }

  const shardItemsByType = new Map<MediaType, MediaItem[]>();
  for (const r of shardRecords) {
    if (!byType.has(r.mediaType)) continue;
    const list = shardItemsByType.get(r.mediaType) ?? [];
    list.push(r);
    shardItemsByType.set(r.mediaType, list);
  }

  const perCategory: CategoryMetrics[] = MEDIA_TYPES.map((type) => {
    const bucket = byType.get(type)!;
    const shards = shardItemsByType.get(type) ?? [];
    const items = [...bucket.items, ...shards];
    const total = items.length;

    const years = items.map((i) => i.releaseYear).filter((y): y is number => Boolean(y));
    const liveSources = Object.values(PROVIDER_REGISTRY)
      .filter(
        (e) =>
          e.id !== "echo-demo" &&
          e.serves.includes(type) &&
          isProviderEnabled(e.id) &&
          // deployment-credential providers only count as live when the
          // deployment actually activated them (no keys ship in the app)
          !(e.id === "rawg" || e.id === "igdb" || e.id === "trakt"),
      )
      .map((e) => e.name);

    return {
      type,
      totalRecords: total,
      curated: bucket.curated,
      demo: bucket.demo,
      shardImported: shards.length,
      liveSources,
      liveOnly: total === 0,
      metadataCompleteness: {
        synopsis: pct(items.filter((i) => (i.synopsis ?? "").length > 20).length, total),
        genres: pct(items.filter((i) => i.genres.length > 0).length, total),
        year: pct(items.filter((i) => Boolean(i.releaseYear)).length, total),
        country: pct(items.filter((i) => (i.countries ?? []).length > 0).length, total),
        creators: pct(items.filter((i) => (i.creators ?? []).length > 0).length, total),
        bilingualTitles: pct(items.filter((i) => i.titleAr && i.titleAr !== i.title).length, total),
      },
      missingExternalIds: items.filter((i) => !i.externalIds || Object.keys(i.externalIds).length === 0)
        .length,
      ambiguousEntries: flaggedEntryCount,
      languageDistribution: tally(items.map((i) => i.languages)),
      countryDistribution: tally(items.map((i) => i.countries)),
      periodCoverage:
        years.length > 0
          ? { minYear: Math.min(...years), maxYear: Math.max(...years) }
          : {},
      artwork: {
        generated: items.filter((i) => !i.posterUrl).length,
        external: items.filter((i) => Boolean(i.posterUrl)).length,
      },
    };
  });

  const all = Object.values(PROVIDER_REGISTRY);
  return {
    perCategory,
    sources: {
      verifiedApproved: all.filter((e) => e.licenseStatus === "approved").map((e) => e.name),
      restricted: all.filter((e) => e.licenseStatus === "restricted").map((e) => e.name),
      unverifiedOrPending: all
        .filter((e) => e.licenseStatus === "unverified" || e.licenseStatus === "pending")
        .map((e) => e.name),
      hardDisabled: all.filter((e) => e.hardDisabled).map((e) => e.name),
    },
    generatedAt: new Date().toISOString(),
    inputs: {
      catalogueRecords: seeds.length,
      shardRecords: shardRecords.length,
    },
  };
}
