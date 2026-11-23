/**
 * ECHO — Centralized provider registry & license gate (Phase 1).
 *
 * DEFAULT-DENY: a catalogue provider may only run when it has a registry
 * entry whose license review explicitly allows it AND the entry is enabled
 * (by default or by the user). Anything not listed here is denied — new or
 * unknown providers can never be reached by accident.
 *
 * The registry records, per provider:
 *   - id, name, content types and operations served
 *   - license status + commercial-use status (never assumed)
 *   - storage / caching permissions (what may be persisted, for how long)
 *   - redistribution permissions
 *   - attribution requirements
 *   - official terms URL and last verification date
 *
 * User toggles: the client store can override the *default* on/off state for
 * entries flagged `userToggleable`. Entries flagged `hardDisabled` (pending
 * verification) can NOT be switched on by users — no silent unverified use.
 * When no user toggles are registered (server routes, tests), the registry
 * defaults apply.
 */

import type { MediaType } from "../types";

export type ProviderOperation = "search" | "details" | "artwork" | "catalogue-pools";

/** Overall license posture of a provider. `unverified` is never auto-approved. */
export type ProviderLicenseStatus =
  | "approved" // reviewed; interactive use permitted with attribution
  | "restricted" // permitted with named restrictions (storage / ShareAlike / …)
  | "unverified" // permissions not yet confirmed → must stay off
  | "pending"; // deliberately disabled pending an external confirmation

export type CommercialUseStatus = "permitted" | "prohibited" | "unverified";

export interface StoragePolicy {
  /** May results be kept in the session-only TTL caches? (transient) */
  sessionCache: boolean;
  /** May catalog data (search results / pools) be PERSISTED to IndexedDB?
   *  User-added library records are the user's own collection reference and
   *  are always allowed; this flag governs bulk/pool/catalog persistence. */
  persistCatalogData: boolean;
  /** Max TTL for upstream response caches, ms. */
  cacheTtlMs: number;
}

export interface ProviderRegistryEntry {
  id: string;
  name: string;
  serves: MediaType[];
  operations: ProviderOperation[];
  licenseStatus: ProviderLicenseStatus;
  /** One-line reason for the current status (shown in Settings + docs). */
  statusReason: string;
  commercialUse: CommercialUseStatus;
  storage: StoragePolicy;
  /** May ECHO redistribute this provider's data (exports beyond the user's
   *  own library backup, re-hosting, bundled catalogues)? */
  redistribution: boolean;
  attribution: { required: boolean; notice: string };
  termsUrl: string;
  /** ISO date of the last compliance review of this entry. */
  lastVerified: string;
  /** Ships enabled? (license-gate default) */
  defaultEnabled: boolean;
  /** Can the user flip this provider in Settings? */
  userToggleable: boolean;
  /** Hard gate: cannot be enabled by anyone until re-verified. */
  hardDisabled: boolean;
}

/** Date of the Phase 1 provider review that produced these statuses. */
const REVIEW_DATE = "2026-11-23";

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryEntry> = {
  anilist: {
    id: "anilist",
    name: "AniList",
    serves: ["anime", "manga"],
    operations: ["search", "details", "artwork", "catalogue-pools"],
    licenseStatus: "restricted",
    statusReason:
      "Interactive use permitted (anime and manga); returned catalog data must NOT be persisted as a catalogue mirror and no bulk collection is allowed.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 30 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from AniList — attributed per title with a link to anilist.co",
    },
    termsUrl: "https://anilist.gitbook.io/anilist-apiv2-docs/",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  kitsu: {
    id: "kitsu",
    name: "Kitsu",
    serves: ["anime"],
    operations: ["search", "details", "artwork", "catalogue-pools"],
    licenseStatus: "pending",
    statusReason:
      "Disabled until Kitsu's data-use permissions are verified. No calls are made to kitsu.io.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 30 * 60_000 },
    redistribution: false,
    attribution: { required: true, notice: "Data from Kitsu" },
    termsUrl: "https://kitsu.docs.apiary.io/",
    lastVerified: REVIEW_DATE,
    defaultEnabled: false,
    userToggleable: false,
    hardDisabled: true,
  },
  tvmaze: {
    id: "tvmaze",
    name: "TVMaze",
    serves: ["series"],
    operations: ["search", "details", "artwork"],
    licenseStatus: "restricted",
    statusReason:
      "Retained with attribution. Any derivative/shared use of TVMaze data must honour the ShareAlike terms documented in docs/DATA_PROVIDER_COMPLIANCE.md; ECHO keeps it as attributed, per-title library references only.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 30 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from TVMaze — attributed per title with a link to tvmaze.com",
    },
    termsUrl: "https://www.tvmaze.com/api",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  imdb: {
    id: "imdb",
    name: "IMDb suggestions",
    serves: ["movie", "series"],
    operations: ["search"],
    licenseStatus: "unverified",
    statusReason:
      "IMDb's suggestion endpoint is an undocumented internal API; its terms for third-party apps are unconfirmed, so it ships disabled by default.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 5 * 60_000 },
    redistribution: false,
    attribution: { required: true, notice: "Data from IMDb" },
    termsUrl: "https://www.imdb.com/conditions",
    lastVerified: REVIEW_DATE,
    defaultEnabled: false,
    userToggleable: true,
    hardDisabled: false,
  },
  cinemeta: {
    id: "cinemeta",
    name: "Cinemeta · metahub",
    serves: ["movie", "series"],
    operations: ["details", "artwork", "catalogue-pools"],
    licenseStatus: "unverified",
    statusReason:
      "Cinemeta (Stremio) and metahub artwork have no confirmed third-party usage terms; disabled by default pending verification.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 60 * 60_000 },
    redistribution: false,
    attribution: { required: true, notice: "Data from IMDb via Cinemeta" },
    termsUrl: "https://www.stremio.com/tos",
    lastVerified: REVIEW_DATE,
    defaultEnabled: false,
    userToggleable: true,
    hardDisabled: false,
  },
  rawg: {
    id: "rawg",
    name: "RAWG",
    serves: ["game"],
    operations: ["search", "details", "artwork", "catalogue-pools"],
    licenseStatus: "restricted",
    statusReason:
      "Keyless use is impossible: no API key ships in client code. A deployment may provide a key via NEXT_PUBLIC_RAWG_API_KEY. Commercial use stays OFF until RAWG's applicable terms are confirmed.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 60 * 60_000 },
    redistribution: false,
    attribution: { required: true, notice: "Data from RAWG" },
    termsUrl: "https://rawg.io/apidocs",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  openlib: {
    id: "openlib",
    name: "Open Library",
    serves: ["book"],
    operations: ["search", "details", "artwork", "catalogue-pools"],
    licenseStatus: "restricted",
    statusReason:
      "Interactive use within Open Library's documented API constraints. No bulk API harvesting; subject shelves and trending are fetched on demand only.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 60 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from Open Library — attributed per title with a link to openlibrary.org",
    },
    termsUrl: "https://openlibrary.org/developers/api",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  wikidata: {
    id: "wikidata",
    name: "Wikidata",
    serves: ["anime", "movie", "series", "game", "book", "manga", "comics"],
    operations: ["search", "details", "catalogue-pools"],
    licenseStatus: "approved",
    statusReason:
      "Structured data on Wikidata is released under CC0 1.0 (public domain): commercial use, persistence, caching and redistribution are permitted. ECHO attributes per title as good practice. No artwork is fetched — images are governed by separate rights.",
    commercialUse: "permitted",
    storage: { sessionCache: true, persistCatalogData: true, cacheTtlMs: 60 * 60_000 },
    redistribution: true,
    attribution: {
      required: false,
      notice: "Structured data from Wikidata (CC0 1.0) — no attribution required, provided as good practice",
    },
    termsUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  trakt: {
    id: "trakt",
    name: "Trakt",
    serves: ["movie", "series"],
    operations: ["search", "details", "artwork"],
    licenseStatus: "approved",
    statusReason:
      "Trakt's API Use Policy (verified 2026-11-23) permits apps that display public discovery information and search results, free for commercial and non-commercial use; catalog mirroring, bulk harvesting and dataset redistribution are prohibited — ECHO only shows transient, attributed search results. Requires a free Trakt API client_id that ECHO does NOT ship: deployments set TRAKT_CLIENT_ID (server-side proxy route).",
    commercialUse: "permitted",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 10 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data and images from Trakt — attributed per title with a link to trakt.tv",
    },
    termsUrl: "https://developer.trakt.tv/docs/api-use-policy",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  igdb: {
    id: "igdb",
    name: "IGDB",
    serves: ["game"],
    operations: ["search", "details", "artwork"],
    licenseStatus: "restricted",
    statusReason:
      "IGDB.com API is free for non-commercial usage under the Twitch Developer Service Agreement (commercial projects require IGDB's partnership program). Requires Twitch OAuth2 client credentials that ECHO does NOT ship: deployments set IGDB_CLIENT_ID + IGDB_CLIENT_SECRET (server-side proxy route, browser-direct calls are not supported).",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 10 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from IGDB — attributed per title with a link to igdb.com",
    },
    termsUrl: "https://api-docs.igdb.com/",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  madb: {
    id: "madb",
    name: "Media Arts Database (MADB)",
    serves: ["manga", "anime"],
    operations: ["search", "details"],
    licenseStatus: "restricted",
    statusReason:
      "Japan's Media Arts Database (National Center for Art Research) publishes an official SPARQL Query Service (browser-direct, CORS enabled, rate limit 300 requests per window with x-ratelimit headers). Use is governed by the site Terms of Use; linking is free but must clearly state it links to the Media Arts Database and open in a new window. Interactive, attributed use only — no bulk downloads, no catalog persistence.",
    commercialUse: "unverified",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 30 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from the Media Arts Database (メディア芸術データベース) — attributed per title with a link to mediaarts-db.artmuseums.go.jp",
    },
    termsUrl: "https://mediaarts-db.artmuseums.go.jp/about?locale=en",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  inventaire: {
    id: "inventaire",
    name: "Inventaire",
    serves: ["book"],
    operations: ["search", "details"],
    licenseStatus: "restricted",
    statusReason:
      "Inventaire's open HTTP API (verified 2026-11-23) permits interactive use; commercial services are asked to support the association fairly. Entity metadata mirrors Wikidata (CC0) plus Inventaire community contributions. ECHO routes it to books only (its work entities classify reliably there — verified live) and shows transient attributed text results only: no images (book covers carry publisher rights), no bulk collection, no catalog persistence.",
    commercialUse: "permitted",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 30 * 60_000 },
    redistribution: false,
    attribution: {
      required: true,
      notice: "Data from Inventaire — attributed per title with a link to inventaire.io",
    },
    termsUrl: "https://api.inventaire.io",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  bnf: {
    id: "bnf",
    name: "BnF Catalogue général",
    serves: ["book", "comics"],
    operations: ["search"],
    licenseStatus: "approved",
    statusReason:
      "BnF Catalogue général SRU API metadata is released under the French « Licence ouverte de l'État » (Etalab Open Licence 2.0): reuse, including commercial, is permitted with attribution of the source (BnF). Browser-direct (CORS enabled). Interactive title search only — no bulk harvesting.",
    commercialUse: "permitted",
    storage: { sessionCache: true, persistCatalogData: false, cacheTtlMs: 60 * 60_000 },
    redistribution: true,
    attribution: {
      required: true,
      notice: "« Bibliothèque nationale de France » — data under the Licence ouverte de l'État (Etalab 2.0), attributed per title with a link to catalogue.bnf.fr",
    },
    termsUrl: "https://api.bnf.fr/fr/api-sru-catalogue-general",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: true,
    hardDisabled: false,
  },
  "echo-demo": {
    id: "echo-demo",
    name: "ECHO local catalogue",
    serves: ["anime", "movie", "series", "game", "book", "manga", "comics"],
    operations: ["search", "details", "catalogue-pools"],
    licenseStatus: "approved",
    statusReason:
      "Original ECHO compilation — approved. The demo universe plus curated starter collections for movies, games, books, manga and comics (original descriptions, no ratings or artwork claims), and versioned catalog shards ingested on demand. Used as clearly-labelled local content whenever a media type has no enabled live source — not only offline.",
    commercialUse: "permitted",
    storage: { sessionCache: true, persistCatalogData: true, cacheTtlMs: 0 },
    redistribution: true,
    attribution: {
      required: true,
      notice: "ECHO sample data — original compilation, labelled \"Sample\"",
    },
    termsUrl: "https://example.invalid/echo-sample",
    lastVerified: REVIEW_DATE,
    defaultEnabled: true,
    userToggleable: false,
    hardDisabled: false,
  },
};

/** User-authored records are the user's own data — always allowed. */
export const MANUAL_PROVIDER_ID = "manual";

/* --------------------------- the license gate --------------------------- */

/** User overrides, set by the client store after hydration (id → enabled). */
let userToggles: Record<string, boolean> | null = null;

/** Register the user's provider toggles (client store, after hydration).
 *  Pass null to fall back to registry defaults (server routes, tests). */
export function setProviderToggles(toggles: Record<string, boolean> | null): void {
  userToggles = toggles;
}

/** Registry entry for a provider id, or null when unknown. */
export function providerEntry(id: string): ProviderRegistryEntry | null {
  return PROVIDER_REGISTRY[id] ?? null;
}

/**
 * The license gate. DEFAULT-DENY:
 *  - unknown provider ids are never enabled;
 *  - hard-disabled entries are never enabled (verification pending);
 *  - otherwise the user toggle (when registered) decides, else the default.
 * `manual` records are the user's own data and always pass.
 */
export function isProviderEnabled(id: string): boolean {
  if (id === MANUAL_PROVIDER_ID) return true;
  const entry = PROVIDER_REGISTRY[id];
  if (!entry) return false; // default-deny: not in the registry → no calls
  if (entry.hardDisabled) return false;
  if (userToggles && id in userToggles) return userToggles[id] === true;
  return entry.defaultEnabled;
}

/** Can the user flip this provider in Settings? (unknown ids: no) */
export function isProviderUserToggleable(id: string): boolean {
  const entry = PROVIDER_REGISTRY[id];
  return Boolean(entry && entry.userToggleable && !entry.hardDisabled);
}

/** Validate a user toggle before persisting it. Returns the effective value,
 *  or null when the toggle must not be stored for this provider. */
export function normalizeUserToggle(
  id: string,
  value: boolean,
): { id: string; enabled: boolean } | null {
  if (!isProviderUserToggleable(id)) return null;
  return { id, enabled: value === true };
}

/** May catalog data (search results / pools) from this provider be
 *  persisted outside the session caches? Governs any bulk persistence path;
 *  user-added library records are exempt (the user's own collection). */
export function canPersistCatalogData(id: string): boolean {
  if (id === MANUAL_PROVIDER_ID || id === "echo-demo") return true;
  const entry = PROVIDER_REGISTRY[id];
  return Boolean(entry?.storage.persistCatalogData);
}

/** Max cache TTL a provider's adapter may use (registry-capped). */
export function providerCacheTtlMs(id: string): number {
  const entry = PROVIDER_REGISTRY[id];
  return entry?.storage.cacheTtlMs ?? 0;
}

/** Registry rows for Settings → Data sources (stable order). */
export function listProviderRegistry(): ProviderRegistryEntry[] {
  const order = [
    "anilist",
    "kitsu",
    "tvmaze",
    "trakt",
    "imdb",
    "cinemeta",
    "rawg",
    "igdb",
    "openlib",
    "inventaire",
    "bnf",
    "madb",
    "wikidata",
    "echo-demo",
  ];
  return order.map((id) => PROVIDER_REGISTRY[id]).filter(Boolean);
}

/** Map a stored localId prefix to its registry provider ids.
 *  IMDb searches also need Cinemeta for enrichment; refreshes of stored
 *  IMDb records need Cinemeta alone. */
export function registryIdsForLocalIdPrefix(prefix: string): string[] {
  switch (prefix) {
    case "anilist":
      return ["anilist"];
    case "anilist-manga":
      return ["anilist"]; // manga records fetched via AniList's MANGA media
    case "kitsu":
      return ["kitsu"];
    case "tvmaze":
      return ["tvmaze"];
    case "imdb":
      return ["imdb", "cinemeta"]; // suggestion resolve + Cinemeta details
    case "imdb-series":
      return ["imdb", "cinemeta"];
    case "rawg":
      return ["rawg"];
    case "openlib":
      return ["openlib"];
    case "wikidata":
      return ["wikidata"];
    case "trakt":
      return ["trakt"];
    case "igdb":
      return ["igdb"];
    case "madb":
      return ["madb"];
    case "inventaire":
      return ["inventaire"];
    case "bnf":
      return ["bnf"];
    case "echo-demo":
      return ["echo-demo"];
    case "manual":
      return [MANUAL_PROVIDER_ID];
    default:
      return [];
  }
}

/** Which gate must pass for the given localId prefix to (a) appear in live
 *  search, (b) refresh metadata. Returns the registry ids consulted. */
export function searchGateIdsForPrefix(prefix: string): string[] {
  return registryIdsForLocalIdPrefix(prefix);
}

export function refreshGateIdsForPrefix(prefix: string): string[] {
  switch (prefix) {
    case "imdb":
    case "imdb-series":
      return ["cinemeta"]; // refresh reads Cinemeta only
    default:
      return registryIdsForLocalIdPrefix(prefix);
  }
}
