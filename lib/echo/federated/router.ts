/**
 * ECHO — Federated search router: the per-category provider routing table.
 *
 * Each of the seven content categories routes to its OWN set of the most
 * relevant providers — a query is never sprayed at every source. Routing
 * considers, per provider:
 *   1. the license gate (registry default-deny + user toggles),
 *   2. deployment configuration (credentials absent → skipped, not failed),
 *   3. the engine's rate-limit cooldowns,
 *   4. priority (which provider's record becomes the primary when several
 *      return the same work — richer, specialized sources win).
 *
 * Wikidata (CC0) is the universal live baseline: it serves exactly the
 * requested categories that no enabled+configured specialized provider
 * covers — richer data wins and duplicate requests are avoided
 * (Wikimedia etiquette).
 */

import type { MediaType } from "../types";
import type { CatalogueProvider, SearchFilters } from "../providers/types";
import { isProviderEnabled } from "../providers/registry";
// Classes imported from their modules (NOT providers/index) to avoid a
// circular module dependency: providers/index re-exports the instances that
// live here. This module is the single source of provider instances, so the
// engine and the legacy catalogue API share one set of caches per provider.
import { AniListProvider } from "../providers/anilist";
import { TvMazeProvider } from "../providers/tvmaze";
import { ImdbProvider, ImdbSeriesProvider } from "../providers/imdb";
import { RawgProvider } from "../providers/rawg";
import { OpenLibraryProvider } from "../providers/openlibrary";
import { WikidataProvider } from "../providers/wikidata";
import { MadbProvider } from "../providers/madb";
import { InventaireProvider } from "../providers/inventaire";
import { BnfProvider } from "../providers/bnf";
import { TraktProvider } from "../providers/trakt";
import { IgdbProvider } from "../providers/igdb";

/** The single set of catalogue provider instances (shared caches). */
export const anilistProvider = new AniListProvider();
export const tvmazeProvider = new TvMazeProvider();
export const imdbProvider = new ImdbProvider();
export const imdbSeriesProvider = new ImdbSeriesProvider();
export const rawgProvider = new RawgProvider();
export const openLibraryProvider = new OpenLibraryProvider();
export const wikidataProvider = new WikidataProvider();
export const madbProvider = new MadbProvider();
export const inventaireProvider = new InventaireProvider();
export const bnfProvider = new BnfProvider();
export const traktProvider = new TraktProvider();
export const igdbProvider = new IgdbProvider();

/** One route entry: which provider serves which category, at what priority. */
export interface RouteEntry {
  /** registry provider id (for the license gate) */
  registryId: string;
  /** provider instance */
  provider: CatalogueProvider;
  /** display label */
  label: string;
  /** lower runs first / wins the primary record on merges */
  priority: number;
  /** independent timeout for this provider's calls */
  timeoutMs: number;
  /** extra registry ids that must ALSO pass the gate (IMDb needs Cinemeta) */
  gateWith?: string[];
  /** only run when the deployment enabled the server proxy */
  requiresDeploymentFlag?: () => boolean;
  /** does this entry suppress the Wikidata baseline for its categories?
 *  Default true (specialized source wins); false keeps Wikidata live
 *  alongside (e.g. BnF comics: deep but slow). */
  suppressWikidata?: boolean;
}

/**
 * The per-category routing table (THE routing configuration).
 * NOTE: Wikidata is appended dynamically as the universal baseline.
 */
const CATEGORY_ROUTES: Record<MediaType, RouteEntry[]> = {
  anime: [
    { registryId: "anilist", provider: anilistProvider, label: "AniList", priority: 1, timeoutMs: 12_000 },
    { registryId: "madb", provider: madbProvider, label: "MADB", priority: 3, timeoutMs: 14_000 },
  ],
  manga: [
    { registryId: "anilist", provider: anilistProvider, label: "AniList", priority: 1, timeoutMs: 12_000 },
    { registryId: "madb", provider: madbProvider, label: "MADB", priority: 2, timeoutMs: 14_000 },
    // NOTE: BnF is deliberately NOT routed to manga. Its DC records carry no
    // subject headings (verified live), so French manga editions cannot be
    // reliably classified as manga — the BnF provider only serves books and
    // comics, matching its registry entry. Routing it here would guarantee
    // a "no results" answer on every manga search.
  ],
  movie: [
    {
      registryId: "trakt",
      provider: traktProvider,
      label: "Trakt",
      priority: 1,
      timeoutMs: 10_000,
      requiresDeploymentFlag: traktEnabled,
    },
    {
      registryId: "imdb",
      provider: imdbProvider,
      label: "IMDb",
      priority: 1,
      timeoutMs: 10_000,
      gateWith: ["cinemeta"],
    },
  ],
  series: [
    { registryId: "tvmaze", provider: tvmazeProvider, label: "TVMaze", priority: 1, timeoutMs: 10_000 },
    {
      registryId: "trakt",
      provider: traktProvider,
      label: "Trakt",
      priority: 2,
      timeoutMs: 10_000,
      requiresDeploymentFlag: traktEnabled,
    },
    {
      registryId: "imdb",
      provider: imdbSeriesProvider,
      label: "IMDb",
      priority: 1,
      timeoutMs: 10_000,
      gateWith: ["cinemeta"],
    },
  ],
  game: [
    {
      registryId: "igdb",
      provider: igdbProvider,
      label: "IGDB",
      priority: 1,
      timeoutMs: 10_000,
      requiresDeploymentFlag: igdbEnabled,
    },
    { registryId: "rawg", provider: rawgProvider, label: "RAWG", priority: 1, timeoutMs: 10_000 },
  ],
  book: [
    { registryId: "openlib", provider: openLibraryProvider, label: "Open Library", priority: 1, timeoutMs: 10_000 },
    { registryId: "inventaire", provider: inventaireProvider, label: "Inventaire", priority: 2, timeoutMs: 12_000 },
    // BnF SRU can take 15-20s under load (verified live)
    { registryId: "bnf", provider: bnfProvider, label: "BnF", priority: 3, timeoutMs: 22_000 },
  ],
  comics: [
    // BnF comics queries carry the « bande dessinée » subject filter — slow
    // but precise (verified live). Wikidata stays live for comics as the
    // fast baseline (suppressWikidata: false) so results appear immediately.
    {
      registryId: "bnf",
      provider: bnfProvider,
      label: "BnF",
      priority: 2,
      timeoutMs: 22_000,
      suppressWikidata: false,
    },
  ],
};

/** Deployment flags for the proxy providers (client-visible activation). */
export function traktEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TRAKT_ENABLED === "1";
}
export function igdbEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IGDB_ENABLED === "1";
}

/** A resolved, ready-to-run provider job (all gates passed). */
export interface ResolvedProviderJob {
  registryId: string;
  provider: CatalogueProvider;
  label: string;
  priority: number;
  timeoutMs: number;
  /** the requested categories this job serves */
  categories: MediaType[];
  /** provider-specific search invocation (e.g. AniList's manga path) */
  run: (query: string, filters: SearchFilters) => Promise<{ item: import("../types").MediaItem }[]>;
}

/** Cooldown bookkeeping shared with the engine. */
export interface CooldownStore {
  isCooling(registryId: string, now?: number): boolean;
}

/** Resolve the provider jobs for a federated search.
 *  Deterministic, fully gated — this is the single source of truth for
 *  which external catalogues a query touches. */
export function resolveProviderJobs(
  categories: MediaType[],
  cooldowns?: CooldownStore,
): ResolvedProviderJob[] {
  const jobs = new Map<string, ResolvedProviderJob>();
  const coveredBySpecialized = new Set<MediaType>();

  for (const category of categories) {
    for (const entry of CATEGORY_ROUTES[category] ?? []) {
      const gateIds = [entry.registryId, ...(entry.gateWith ?? [])];
      const gatePass = gateIds.every((id) => isProviderEnabled(id));
      if (!gatePass) continue;
      if (entry.requiresDeploymentFlag && !entry.requiresDeploymentFlag()) continue;
      if (entry.provider && typeof entry.provider.isConfigured === "function" && !entry.provider.isConfigured()) {
        continue; // e.g. RAWG without a deployment key — skipped, not failed
      }
      if (cooldowns?.isCooling(entry.registryId)) continue; // rate-limit cooldown
      if (entry.suppressWikidata !== false) coveredBySpecialized.add(category);
      const key = `${entry.registryId}:${entry.provider.id}`;
      const existing = jobs.get(key);
      if (existing) {
        if (!existing.categories.includes(category)) existing.categories.push(category);
      } else {
        jobs.set(key, {
          registryId: entry.registryId,
          provider: entry.provider,
          label: entry.label,
          priority: entry.priority,
          timeoutMs: entry.timeoutMs,
          categories: [category],
          run: (query, filters) => entry.provider.search(query, filters),
        });
      }
    }
  }

  // AniList serves manga through its dedicated MANGA path — split the job so
  // the anime search and the manga search each get the right request.
  const anilistJob = jobs.get("anilist:anilist");
  if (anilistJob) {
    const wantsAnime = anilistJob.categories.includes("anime");
    const wantsManga = anilistJob.categories.includes("manga");
    if (wantsAnime && wantsManga) {
      // keep this job for anime only; add a dedicated manga job
      anilistJob.categories = ["anime"];
      jobs.set("anilist:anilist-manga", {
        ...anilistJob,
        categories: ["manga"],
        run: (query, filters) =>
          (anilistProvider as AniListProvider)
            .searchManga(query, filters.limit)
            .then((items) => items.map((item) => ({ item }))),
      });
    } else if (wantsManga) {
      anilistJob.categories = ["manga"];
      anilistJob.run = (query, filters) =>
        (anilistProvider as AniListProvider)
          .searchManga(query, filters.limit)
          .then((items) => items.map((item) => ({ item })));
    }
  }

  // Wikidata (CC0): universal live baseline for categories with no enabled
  // specialized provider (verified: fewer duplicate requests, richer data wins)
  const wikidataTypes = categories.filter((t) => !coveredBySpecialized.has(t));
  if (wikidataTypes.length && isProviderEnabled("wikidata") && !cooldowns?.isCooling("wikidata")) {
    jobs.set("wikidata:wikidata", {
      registryId: "wikidata",
      provider: wikidataProvider,
      label: "Wikidata",
      priority: 5, // specialized providers win the primary record
      timeoutMs: 12_000,
      categories: wikidataTypes,
      run: (query, filters) => wikidataProvider.search(query, filters),
    });
  }

  return [...jobs.values()];
}

/** Which live providers are candidates for a category (gate-aware)?
 *  Used by the UI to show routing transparency. */
export function routePreview(categories: MediaType[]): {
  registryId: string;
  label: string;
  categories: MediaType[];
  enabled: boolean;
}[] {
  const rows = new Map<string, { registryId: string; label: string; categories: MediaType[]; enabled: boolean }>();
  for (const category of categories) {
    for (const entry of CATEGORY_ROUTES[category] ?? []) {
      const gateIds = [entry.registryId, ...(entry.gateWith ?? [])];
      const configured =
        (!entry.requiresDeploymentFlag || entry.requiresDeploymentFlag()) &&
        (typeof entry.provider.isConfigured !== "function" || entry.provider.isConfigured());
      const enabled = gateIds.every((id) => isProviderEnabled(id)) && configured;
      const existing = rows.get(entry.registryId);
      if (existing) {
        if (!existing.categories.includes(category)) existing.categories.push(category);
        existing.enabled = existing.enabled || enabled;
      } else {
        rows.set(entry.registryId, { registryId: entry.registryId, label: entry.label, categories: [category], enabled });
      }
    }
  }
  const wikidataTypes = categories.filter((t) =>
    !(CATEGORY_ROUTES[t] ?? []).some((entry) => {
      if (entry.suppressWikidata === false) return false; // runs alongside wikidata
      const gateIds = [entry.registryId, ...(entry.gateWith ?? [])];
      const configured =
        (!entry.requiresDeploymentFlag || entry.requiresDeploymentFlag()) &&
        (typeof entry.provider.isConfigured !== "function" || entry.provider.isConfigured());
      return gateIds.every((id) => isProviderEnabled(id)) && configured;
    }),
  );
  if (wikidataTypes.length && isProviderEnabled("wikidata")) {
    rows.set("wikidata", {
      registryId: "wikidata",
      label: "Wikidata",
      categories: wikidataTypes,
      enabled: true,
    });
  }
  return [...rows.values()];
}
