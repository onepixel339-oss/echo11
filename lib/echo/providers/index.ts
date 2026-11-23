/**
 * ECHO — Catalogue router (license-gated).
 *
 * Every provider call passes through the centralized registry gate
 * (providers/registry.ts) — DEFAULT-DENY. A provider only runs when its
 * registry entry is licensed AND enabled (registry default or user toggle).
 *
 * Current gate defaults (see registry.ts + docs/DATA_PROVIDER_COMPLIANCE.md):
 *   anime  → AniList  (enabled; no persistent catalog data)
 *          → Kitsu    (HARD-DISABLED pending data-use verification)
 *   series → TVMaze   (enabled; attribution + ShareAlike handling)
 *   movies → IMDb suggestions + Cinemeta (DISABLED by default — unverified)
 *   games  → RAWG     (enabled in registry; needs deployment API key —
 *                     no key ships in client code)
 *   books  → Open Library (enabled; interactive use, no bulk harvesting)
 *
 * LOCAL COVERAGE (Phase 2/3): the approved, clearly-labelled ECHO local
 * catalogue (demo universe + curated starter collections for movies, games
 * and books) fills any requested media type that NO enabled live provider
 * covers — whether the gap exists because providers are gated, unconfigured,
 * failed, or the device is offline. Every local result is tagged "Sample" in
 * the UI and `usedFallback`/`usedSample` is set so screens can disclose it.
 * Live results are NEVER replaced or silently substituted: a medium with live
 * results gets no local fill, and a disabled provider is never swapped for
 * a different unverified provider.
 */

import { DemoProvider } from "./demo";
import { cinemetaCatalog, cinemetaTop } from "./imdb";
import { KitsuProvider } from "./kitsu";
import { rawgByGenre, rawgTop, rawgUpcoming, rawgKeyConfigured } from "./rawg";
import {
  openLibrarySubject,
  openLibraryTrending,
  openLibraryArabicShelf,
} from "./openlibrary";
import { searchCatalogShards, shardPoolForTypes } from "../catalogShards";
import type { CatalogueProvider, ProviderSearchResult, SearchFilters } from "./types";
import { genreDisplay } from "./types";
import type { ContentVisibility, MediaItem, MediaType } from "../types";
import { vocabLabel } from "../data/vocab";
import { cached, TTLCache } from "./cache";
import {
  isProviderEnabled,
  listProviderRegistry,
  refreshGateIdsForPrefix,
} from "./registry";
import { searchFederatedCached, clearFederatedCaches } from "../federated/engine";
// provider instances live in the federated router (single source, shared
// caches) — re-exported here for every legacy consumer
import {
  anilistProvider,
  tvmazeProvider,
  imdbProvider,
  imdbSeriesProvider,
  rawgProvider,
  openLibraryProvider,
  wikidataProvider,
  madbProvider,
  inventaireProvider,
  bnfProvider,
  traktProvider,
  igdbProvider,
} from "../federated/router";

export const demoProvider = new DemoProvider();
export const kitsuProvider = new KitsuProvider(); // hard-gated: never called until re-verified
export {
  anilistProvider,
  tvmazeProvider,
  imdbProvider,
  imdbSeriesProvider,
  rawgProvider,
  openLibraryProvider,
  wikidataProvider,
  madbProvider,
  inventaireProvider,
  bnfProvider,
  traktProvider,
  igdbProvider,
};

// re-exported for status display (env-provided key only — nothing built in)
export { rawgKeyConfigured };

export const ALL_MEDIA_TYPES: MediaType[] = [
  "anime",
  "movie",
  "series",
  "game",
  "book",
  "manga",
  "comics",
];

/** The license gate: every listed registry id must be enabled. */
function gate(...registryIds: string[]): boolean {
  return registryIds.every((id) => isProviderEnabled(id));
}

/** Which specialized (non-Wikidata) live providers cover each type right
 *  now, considering both the license gate and configuration (e.g. RAWG
 *  needs a deployment key). Mirrors the federated router's gate logic for
 *  consumers that only need coverage info. */
export function specializedCoverage(types: MediaType[]): Set<MediaType> {
  const covered = new Set<MediaType>();
  const check = (t: MediaType, on: boolean) => {
    if (on && types.includes(t)) covered.add(t);
  };
  check("anime", gate("anilist") || gate("kitsu") || gate("madb"));
  check("manga", gate("anilist") || gate("madb") || gate("bnf"));
  check("movie", gate("imdb", "cinemeta") || gate("trakt"));
  check("series", gate("tvmaze") || gate("imdb", "cinemeta") || gate("trakt"));
  check("game", (gate("rawg") && rawgProvider.isConfigured()) || gate("igdb"));
  check("book", gate("openlib") || gate("inventaire") || gate("bnf"));
  check("comics", gate("inventaire") || gate("bnf"));
  return covered;
}

/** Drop all memoized catalogue outcomes (called when provider toggles change,
 *  so gating is reflected immediately instead of after the TTL). */
export function clearCatalogueCaches(): void {
  searchCache.clear();
  clearFederatedCaches();
}

export interface CatalogueSearchOutcome {
  results: ProviderSearchResult[];
  /** live providers that actually answered */
  sources: string[];
  /** true when labelled local sample results were included (per-type fill
   *  for media types no enabled live provider covered) */
  usedFallback: boolean;
  /** provider ids that failed (for a soft notice) */
  failed: string[];
  /** true when the device reported itself offline at query time */
  offline: boolean;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Search the live federated catalogue and ECHO's approved local content.
 *  Kept as the stable batch-style API (Ask ECHO, onboarding, matching,
 *  DetailsDrawer, server routes): it runs the SAME federated engine the
 *  search UI uses — category routing, parallel providers, per-provider
 *  timeouts, rate-limit cooldowns, evidence-based dedup — and maps the
 *  final snapshot onto this legacy shape. Cached 5 min per
 *  (query, types, limit): identical queries share one upstream call set. */
const searchCache = new TTLCache<CatalogueSearchOutcome>(5 * 60_000);

export async function searchCatalogue(
  query: string,
  filters?: SearchFilters,
): Promise<CatalogueSearchOutcome> {
  const q = query.trim();
  const types = filters?.mediaTypes ?? ALL_MEDIA_TYPES;
  const limit = filters?.limit ?? 8;
  if (!q) return { results: [], sources: [], usedFallback: false, failed: [], offline: isOffline() };
  const key = `${q}|${[...types].sort().join(",")}|${limit}`;
  return cached(
    searchCache,
    key,
    async () => {
      const snapshot = await searchFederatedCached(q, {
        categories: types,
        limitPerProvider: limit,
        includeLocal: true,
        signal: filters?.signal,
      });
      return outcomeFromSnapshot(snapshot);
    },
    (outcome) => !outcome.results.length || outcome.usedFallback,
  );
}

/** Map a federated snapshot onto the legacy outcome shape. */
export function outcomeFromSnapshot(snapshot: {
  hits: { item: MediaItem; contributions: { providerId: string; providerLabel: string }[]; isLive: boolean }[];
  providers: { id: string; label: string; status: string }[];
  offline: boolean;
  usedLocal: boolean;
}): CatalogueSearchOutcome {
  const results: ProviderSearchResult[] = snapshot.hits.map((hit) => ({
    item: hit.item,
    sourceLabel: hit.contributions[0]?.providerLabel ?? hit.item.provider,
  }));
  const sources = new Set<string>();
  for (const hit of snapshot.hits) {
    if (hit.isLive) sources.add(hit.contributions[0]?.providerLabel ?? hit.item.provider);
  }
  const failed = snapshot.providers
    .filter((p) => p.status === "error" || p.status === "timeout" || p.status === "rate_limited")
    .map((p) => p.label);
  return {
    results,
    sources: [...sources],
    usedFallback: snapshot.usedLocal,
    failed,
    offline: snapshot.offline,
  };
}

/** Refresh metadata for a stored title, routed by its localId prefix.
 *  Gated per prefix: refresh reads the provider the record came from, and
 *  disabled providers simply don't refresh (stored data is never deleted). */
export async function getTitleByLocalId(localId: string): Promise<MediaItem | null> {
  const [prefix, ...rest] = localId.split(":");
  const id = rest.join(":");
  const gateIds = refreshGateIdsForPrefix(prefix);
  if (!gateIds.length || !gate(...gateIds)) return null;
  try {
    switch (prefix) {
      case "anilist":
        return await anilistProvider.getTitle(id);
      case "kitsu":
        return await kitsuProvider.getTitle(id);
      case "tvmaze":
        return await tvmazeProvider.getTitle(id);
      case "imdb":
        return await imdbProvider.getTitle(id);
      case "imdb-series":
        return await imdbSeriesProvider.getTitle(id);
      case "rawg":
        if (!rawgProvider.isConfigured()) return null;
        return await rawgProvider.getTitle(id);
      case "openlib":
        return await openLibraryProvider.getTitle(id);
      case "wikidata":
        return await wikidataProvider.getTitle(id);
      case "madb":
        return await madbProvider.getTitle(id);
      case "inventaire":
        return await inventaireProvider.getTitle(id);
      case "trakt":
        return await traktProvider.getTitle(id);
      case "igdb":
        return await igdbProvider.getTitle(id);
      case "bnf":
        return null; // BnF records are transient search results (no refresh)
      case "anilist-manga":
        // manga records fetched via AniList (localId prefix anilist-manga)
        return await anilistProvider.getMangaTitle(id);
      case "echo-demo":
        return await demoProvider.getTitle(id);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface CandidatePool {
  pool: MediaItem[];
  /** live sources that contributed */
  sources: string[];
  errors: string[];
  /** true when labelled local sample items were included (per-type fill
   *  for media types no enabled live source covered) */
  usedSample: boolean;
}

/**
 * Build a REAL candidate pool for Discover from the user's top genres —
 * across every catalogue medium whose providers pass the license gate.
 *  - anime  → AniList genre-ranked (Kitsu pools hard-disabled pending
 *            data-use verification)
 *  - movies → Cinemeta genre catalogues + Cinemeta all-time top (gated:
 *            disabled by default while unverified)
 *  - series → TVMaze has no genre pool; Cinemeta pools serve series (gated)
 *  - games  → RAWG genre/tag pools + RAWG most-added (needs deployment key)
 *  - books  → Open Library subject shelves + weekly trending
 *
 * LOCAL COVERAGE (Phase 2): requested media types that no enabled live
 * source covered are filled from the approved ECHO local catalogue
 * (labelled "Sample" in the UI, `usedSample` set on the result). Live
 * coverage always suppresses the local fill for that type.
 */
export async function fetchCandidatePool(opts: {
  genres: string[]; // canonical slugs, best first
  mediaTypes: MediaType[];
  includeMature?: boolean;
  visibility?: ContentVisibility;
  limitPerSource?: number;
  /** Arabic-interface users get an Arabic-literature book shelf added. */
  arabicShelf?: boolean;
}): Promise<CandidatePool> {
  const limit = opts.limitPerSource ?? 20;
  const jobs: Promise<{ items: MediaItem[]; source: string }>[] = [];
  const genres = opts.genres.slice(0, 3);
  // RAWG pools are ESRB-gated by the SAME visibility setting (safe/moderate/all)
  const visibility = opts.visibility ?? (opts.includeMature ? "all" : "moderate");
  const wantAnime = opts.mediaTypes.includes("anime");
  const wantManga = opts.mediaTypes.includes("manga");
  const wantGames = opts.mediaTypes.includes("game") && rawgProvider.isConfigured() && gate("rawg");
  const wantBooks = opts.mediaTypes.includes("book") && gate("openlib");
  // Cinemeta pools (movies/series) need BOTH the IMDb-ecosystem gate entries
  const wantCinemeta = gate("cinemeta");

  if (wantAnime && gate("anilist")) {
    jobs.push(
      anilistProvider
        .byGenres(genres, limit, opts.includeMature ?? false)
        .then((items) => ({ items, source: "AniList" })),
    );
  }
  if (wantManga && gate("anilist")) {
    // v3: manga genre pools from AniList's MANGA media
    jobs.push(
      anilistProvider
        .mangaByGenres(genres, limit, opts.includeMature ?? false)
        .then((items) => ({ items, source: "AniList" })),
    );
  }
  if (wantAnime && gate("kitsu")) {
    jobs.push(
      kitsuProvider
        .byGenres(genres, limit, opts.includeMature ?? false)
        .then((items) => ({ items, source: "Kitsu" })),
      kitsuProvider
        .trending(Math.ceil(limit / 2))
        .then((items) => ({ items, source: "Kitsu" })),
    );
  }
  for (const g of genres.slice(0, 2)) {
    const display = genreDisplay(g, vocabLabel(g, "en"));
    if (opts.mediaTypes.includes("movie") && wantCinemeta) {
      jobs.push(
        cinemetaCatalog("movie", display, limit).then((items) => ({ items, source: "IMDb" })),
      );
    }
    if (opts.mediaTypes.includes("series") && wantCinemeta) {
      jobs.push(
        cinemetaCatalog("series", display, limit).then((items) => ({ items, source: "IMDb" })),
      );
    }
    if (wantGames) {
      jobs.push(rawgByGenre(g, limit, visibility).then((items) => ({ items, source: "RAWG" })));
    }
    if (wantBooks) {
      jobs.push(
        openLibrarySubject(g, limit).then((items) => ({ items, source: "Open Library" })),
      );
    }
  }
  // broad, community-ranked pools so shelves stay rich even for thin taste
  if (opts.mediaTypes.includes("movie") && wantCinemeta) {
    jobs.push(cinemetaTop("movie", limit).then((items) => ({ items, source: "IMDb" })));
  }
  if (opts.mediaTypes.includes("series") && wantCinemeta) {
    jobs.push(cinemetaTop("series", limit).then((items) => ({ items, source: "IMDb" })));
  }
  if (wantGames) {
    jobs.push(rawgTop(limit, visibility).then((items) => ({ items, source: "RAWG" })));
  }
  if (wantBooks) {
    jobs.push(openLibraryTrending(limit).then((items) => ({ items, source: "Open Library" })));
    if (opts.arabicShelf) {
      jobs.push(openLibraryArabicShelf(16).then((items) => ({ items, source: "Open Library" })));
    }
  }
  if (wantManga && gate("anilist")) {
    // broad community-ranked manga pool so shelves stay rich for thin taste
    jobs.push(
      anilistProvider
        .mangaPublishingNow(Math.ceil(limit / 2), opts.includeMature ?? false)
        .then((items) => ({ items, source: "AniList" })),
    );
  }

  if (!jobs.length) {
    // every applicable live pool is license-gated or unconfigured → the
    // local catalogue may still cover some of the requested types
    const local = gate("echo-demo")
      ? demoProvider.poolForTypes(opts.mediaTypes, { genres, limit, visibility })
      : [];
    // versioned catalog shards join the labelled local pool
    const shardPool = gate("echo-demo")
      ? await shardPoolForTypes(opts.mediaTypes, { genres, limit }).catch(() => [])
      : [];
    const merged = [...local, ...shardPool];
    return {
      pool: merged,
      sources: [],
      errors: [],
      usedSample: merged.length > 0,
    };
  }

  const settled = await Promise.allSettled(jobs.map((j) => j));
  const sources: string[] = [];
  const errors: string[] = [];
  const bySource = new Map<string, MediaItem[]>();
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  for (const r of settled) {
    if (r.status === "fulfilled") {
      sources.push(r.value.source);
      for (const item of r.value.items) {
        if (seen.has(item.localId)) continue;
        // catalogue junk guard: skip unreleased / mis-dated titles
        if (item.releaseYear && item.releaseYear > new Date().getFullYear() + 1) continue;
        // cross-source dedupe by normalized title+year (IMDb vs TVMaze overlap)
        const key = `${item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${item.releaseYear ?? ""}`;
        if (seenTitles.has(key)) continue;
        seen.add(item.localId);
        seenTitles.add(key);
        const list = bySource.get(r.value.source) ?? [];
        list.push(item);
        bySource.set(r.value.source, list);
      }
    } else {
      errors.push(String((r.reason as Error)?.message ?? r.reason));
    }
  }
  // interleave sources so no single provider dominates the recommendation order
  const order = [...bySource.keys()];
  const pool: MediaItem[] = [];
  let i = 0;
  while (pool.length < seen.size) {
    let pushed = false;
    for (const src of order) {
      const item = bySource.get(src)?.[i];
      if (item) {
        pool.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
    i++;
  }

  // ---- LOCAL COVERAGE (Phase 2) ---------------------------------------
  // requested types with no live items get labelled local catalogue items
  // appended AFTER the live pool (live first, never replaced). Catalog
  // shards (versioned static JSON → IndexedDB) join the local fill.
  let usedSample = false;
  const coveredTypes = new Set(pool.map((m) => m.mediaType));
  const uncoveredTypes = opts.mediaTypes.filter((t) => !coveredTypes.has(t));
  if (uncoveredTypes.length && gate("echo-demo")) {
    const local = demoProvider.poolForTypes(uncoveredTypes, { genres, limit, visibility });
    const shardPool = await shardPoolForTypes(uncoveredTypes, { genres, limit }).catch(
      () => [] as MediaItem[],
    );
    for (const item of [...local, ...shardPool]) {
      if (seen.has(item.localId)) continue;
      const key = `${item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${item.releaseYear ?? ""}`;
      if (seenTitles.has(key)) continue;
      seen.add(item.localId);
      seenTitles.add(key);
      pool.push(item);
      usedSample = true;
    }
  }

  return { pool, sources: [...new Set(sources)], errors, usedSample };
}

export interface ComingSoonShelf {
  /** unreleased games from today forward (RAWG, community anticipation) */
  games: MediaItem[];
  /** anime airing right now (AniList, trending first) */
  airingAnime: MediaItem[];
  /** manga publishing right now (AniList MANGA, trending first) — v3 */
  publishingManga: MediaItem[];
}

/**
 * The "coming soon" shelf — upcoming games, currently-airing anime and
 * currently-publishing manga, independent of the user's taste (a calendar,
 * not a recommendation). Each half is cached upstream (60/30 min), filtered
 * by the SAME content-visibility setting, and each is license-gated
 * independently.
 */
export async function fetchComingSoon(opts: {
  mediaTypes: MediaType[];
  visibility?: ContentVisibility;
  includeMature?: boolean;
  limitPerShelf?: number;
}): Promise<ComingSoonShelf> {
  const visibility = opts.visibility ?? (opts.includeMature ? "all" : "moderate");
  const includeMature = visibility === "all";
  const limit = opts.limitPerShelf ?? 12;
  const jobs: Promise<MediaItem[]>[] = [];
  const wantGames =
    opts.mediaTypes.includes("game") && rawgProvider.isConfigured() && gate("rawg");
  const wantAnime = opts.mediaTypes.includes("anime") && gate("anilist");
  const wantManga = opts.mediaTypes.includes("manga") && gate("anilist");

  if (wantGames) jobs.push(rawgUpcoming(limit, visibility));
  else jobs.push(Promise.resolve([]));
  if (wantAnime) jobs.push(anilistProvider.airingNow(limit, includeMature));
  else jobs.push(Promise.resolve([]));
  if (wantManga) jobs.push(anilistProvider.mangaPublishingNow(limit, includeMature));
  else jobs.push(Promise.resolve([]));

  const [games, airingAnime, publishingManga] = await Promise.all(
    jobs.map((p) => p.catch(() => [] as MediaItem[])),
  );
  return { games, airingAnime, publishingManga };
}

/** Registry shown in Settings → Data sources (registry-driven, gate-aware). */
export function catalogueSources(): {
  id: string;
  label: string;
  serves: string;
  notice: string;
  canonical: string;
  enabled: boolean;
}[] {
  const labels: Record<string, string> = {
    anilist: "Anime & Manga",
    kitsu: "Anime",
    tvmaze: "Series",
    trakt: "Movies & Series",
    imdb: "Movies & Series",
    cinemeta: "Movies & Series",
    rawg: "Games",
    igdb: "Games",
    openlib: "Books",
    inventaire: "Books · Manga · Comics",
    bnf: "Books & Comics (FR)",
    madb: "Manga & Anime (JP)",
    wikidata: "All categories (CC0)",
    "echo-demo": "Local coverage",
  };
  return listProviderRegistry().map((entry) => ({
    id: entry.id,
    label: entry.name,
    serves: labels[entry.id] ?? entry.serves.join(", "),
    notice: entry.statusReason,
    canonical: entry.termsUrl,
    enabled: isProviderEnabled(entry.id),
  }));
}

export function allProviders(): CatalogueProvider[] {
  return [
    anilistProvider,
    kitsuProvider,
    tvmazeProvider,
    imdbProvider,
    imdbSeriesProvider,
    rawgProvider,
    openLibraryProvider,
    wikidataProvider,
    madbProvider,
    inventaireProvider,
    bnfProvider,
    traktProvider,
    igdbProvider,
    demoProvider,
  ];
}
