/**
 * ECHO — Normalized domain types.
 * Mirrors the spec (section 11) with minor pragmatic refinements.
 * All user data is local-first (IndexedDB). No server, no accounts.
 */

export type MediaType =
  | "anime"
  | "movie"
  | "series"
  | "game"
  | "book"
  | "manga"
  | "comics";

/** Coarse running format, derived from mediaType + episode count. */
export type MediaFormat = "film" | "series" | "game" | "book";

export const MEDIA_TYPES: MediaType[] = [
  "anime",
  "movie",
  "series",
  "game",
  "book",
  "manga",
  "comics",
];

/** The three legacy screen types (pre-expansion), used for migrations. */
export const LEGACY_MEDIA_TYPES: MediaType[] = ["anime", "movie", "series"];

/** Deterministic format for a media type (manual entries, provider adapters). */
export function formatForType(mediaType: MediaType): MediaFormat {
  switch (mediaType) {
    case "movie":
      return "film";
    case "game":
      return "game";
    case "book":
    case "manga": // print media are read, not watched — book running format
    case "comics":
      return "book";
    default:
      return "series"; // anime & series are episodic by default
  }
}

export type LibraryStatus =
  | "completed"
  | "watching"
  | "planned"
  | "dropped"
  | "on_hold";

/** Rating scale: 1..5 stars. `undefined` means explicitly unrated. */
export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_MAX = 5;

/** External catalogue ids a provider record can carry (v2 catalog schema).
 *  Used for cross-provider identity resolution (e.g. TVMaze ↔ IMDb). */
export interface ExternalIdMap {
  imdb?: string;
  tvmaze?: string;
  anilist?: string;
  mal?: string;
  kitsu?: string;
  rawg?: string;
  openlib?: string;
  wikidata?: string;
  /** Project Gutenberg ebook number — external reference for public-domain
   *  classics shipped in ECHO catalog shards (not a live provider). */
  gutenberg?: string;
  /** Media Arts Database (Japan) record id — manga/anime records */
  madb?: string;
  /** Trakt.tv slug/id — movie/series records */
  trakt?: string;
  /** IGDB game id */
  igdb?: string;
  /** Inventaire entity uri ("inv:…" or "wd:…") */
  inventaire?: string;
  /** BnF catalogue ARK ("ark:/12148/cb…") */
  bnf?: string;
}

/** Provenance of a public/audience rating (v2 catalog schema):
 *  where it came from, on which scale, and how many votes back it. */
export interface RatingProvenance {
  /** registry provider id, e.g. "anilist" */
  source: string;
  /** human-readable scale label, e.g. "0-100" */
  scale: string;
  /** value on that source scale */
  value: number;
  voteCount?: number;
}

/** License/provider reference stamped onto stored records (v2 catalog schema). */
export interface ProviderRef {
  /** registry provider id */
  providerId: string;
  /** license status at fetch time, e.g. "restricted" */
  licenseStatus: string;
  termsUrl: string;
  verifiedAt: string | null;
}

/** A canonical ECHO work: one real-world creative work, mapped to any
 *  number of external provider ids (v2 catalog schema). */
export interface WorkRecord {
  workId: string;
  primaryType: MediaType;
  /** best-known display title (from the first record that created the work) */
  title: string;
  externalIds: ExternalIdMap;
  createdAt: string;
  updatedAt: string;
}

/** Explicit relationship between works / records (v2 catalog schema):
 *  seasons, editions, volumes, series membership, translations, remakes,
 *  and cross-media adaptations (v3): manga → anime, book → film,
 *  comic → series, novel → game. A link points FROM the adaptation TO its
 *  source (workId = adaptation, parentWorkId = source); distinct works are
 *  never merged merely because they share a title. */
export type WorkRelation =
  | "season"
  | "edition"
  | "volume"
  | "series-member"
  | "translation"
  | "remake"
  | "same-work"
  | "adaptation"; // v3: cross-media / same-medium adaptation

export interface WorkLink {
  id: string;
  workId: string;
  parentWorkId?: string;
  relation: WorkRelation;
  /** season / volume number or edition label, when the relation is ordered */
  order?: number;
  label?: string;
  externalIds?: ExternalIdMap;
  createdAt: string;
}

/** Fine-grained publication status for serialized print media (v3). */
export type PublicationStatus =
  | "ongoing"
  | "completed"
  | "hiatus"
  | "cancelled"
  | "upcoming";

export interface MediaItem {
  localId: string;
  provider: string; // "anilist" | "tvmaze" | "imdb" | "echo-demo" | "manual"
  providerId: string;
  canonicalUrl?: string;
  mediaType: MediaType;
  format: MediaFormat;
  title: string;
  titleAr?: string;
  originalTitle?: string;
  synopsis?: string;
  synopsisAr?: string;
  releaseDate?: string;
  releaseYear?: number;
  genres: string[]; // slugs, e.g. "sci-fi"
  tags: string[]; // slugs, e.g. "time-travel"
  creators?: string[];
  studios?: string[];
  cast?: string[];
  languages?: string[];
  countries?: string[];
  contentRating?: string; // e.g. "PG-13", "TV-MA" — approximate in demo data
  /** public/audience score on a 0–10 scale (TVMaze/IMDb/AniList/RAWG/Kitsu) */
  publicScore?: number;
  runtimeMinutes?: number;
  episodeCount?: number;
  posterUrl?: string; // external providers only; demo uses generated art
  backdropUrl?: string;
  /** trailer link (YouTube) when the provider ships one — Cinemeta */
  trailerUrl?: string;
  sourceAttribution?: string;
  metadataFetchedAt?: string;

  /* ---- v3 print-media schema (all optional: v1/v2 records stay valid) ---- */

  /** fine-grained work form within a media type, e.g. "manhwa", "manhua",
   *  "one-shot", "light-novel" (books), "comic-series", "graphic-novel",
   *  "collected-edition", "comic-issue" (comics). Distinguishes a comic
   *  SERIES from an individual ISSUE or collected edition, and a manga
   *  from manhwa/manhua — they are related forms, never merged. */
  subtype?: string;
  /** serialization status of a manga/comics series */
  publicationStatus?: PublicationStatus;
  /** collected volume count (tankōbon / trade paperback) — only when the
   *  count is a settled public fact (completed runs); omitted for ongoing */
  volumeCount?: number;
  /** chapter count where it is a settled public fact */
  chapterCount?: number;
  /** issue count of a comic series run (approximate public figure) */
  issueCount?: number;
  /** issue number for an individual comic-issue record (e.g. Amazing
   *  Fantasy #15) — distinguishes a single issue from its series */
  issueNumber?: number;
  /** publication end year, when verified */
  endYear?: number;
  /** alternative/romanized titles (provider-supplied, used for search &
   *  dedup matching only — never fabricated) */
  altTitles?: string[];

  /* ---- v2 catalog schema (all optional: v1 records stay valid) ---- */

  /** stable canonical ECHO work id (see ids.ts `workIdFor`) */
  workId?: string;
  /** external provider ids this record is known by */
  externalIds?: ExternalIdMap;
  /** field-level provenance: field name → registry provider id */
  provenance?: Record<string, string>;
  /** license/provider reference for this record's data */
  providerRef?: ProviderRef;
  /** public rating provenance (source, scale, votes) */
  rating?: RatingProvenance;
}

export interface UserMediaEntry {
  id: string;
  mediaLocalId: string;
  status: LibraryStatus;
  rating?: Rating;
  isFavourite: boolean;
  personalNote?: string;
  userTags: string[];
  addedAt: string;
  updatedAt: string;
  completedAt?: string;
  /** set when automatic identity matching found multiple plausible records:
   *  the entry stays on its own manual record until the user resolves it. */
  matchReview?: {
    flaggedAt: string;
    candidates: MatchCandidateSummary[];
  };
}

/** Compact candidate descriptor stored with a review flag (no live objects). */
export interface MatchCandidateSummary {
  localId: string;
  provider: string;
  providerId: string;
  title: string;
  releaseYear?: number;
  mediaType: MediaType;
}

export type FeedbackValue =
  | "liked"
  | "disliked"
  | "interested"
  | "not_for_me"
  | "already_watched";

export interface TasteFeedback {
  id: string;
  mediaLocalId?: string;
  featureKey?: string; // e.g. "genre:mystery" (onboarding preference cards)
  value: FeedbackValue;
  source:
    | "rating"
    | "favourite"
    | "onboarding"
    | "recommendation"
    | "manual";
  createdAt: string;
}

export interface MapLayoutState {
  positions: Record<string, { x: number; y: number }>;
  zoom: number;
  panX: number;
  panY: number;
  activeFilters: Record<string, unknown>;
  layoutVersion: number;
  updatedAt: string;
}

export type ThemeMode = "dark" | "light" | "system";
export type ContentVisibility = "safe" | "moderate" | "all";
export type Language = "en" | "ar";

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  interests: MediaType[];
  onboarded: boolean;
  onboardedAt?: string;
  demoMode: boolean;
  contentVisibility: ContentVisibility;
  recencyWeight: boolean;
  mapLabels: boolean;
  animations: boolean;
  excludedGenres: string[];
  dismissedInsights: string[];
  /** per-provider on/off overrides (registry ids). Absent key = registry
   *  default. Hard-gated providers can never be toggled on. */
  providerToggles?: Record<string, boolean>;
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  theme: "dark",
  interests: ["anime", "movie", "series", "game", "book", "manga", "comics"],
  onboarded: false,
  demoMode: false,
  contentVisibility: "moderate",
  recencyWeight: true,
  mapLabels: true,
  animations: true,
  excludedGenres: [],
  dismissedInsights: [],
  schemaVersion: 3,
};

/** v1 → v2: the catalogue grew games (RAWG) and books (Open Library).
 *  v2 → v3: the catalogue grew manga and comics (curated local collections,
 *  AniList manga, Wikidata). Existing users never opted out of types that
 *  did not exist, so each expansion is additive — they can turn any type
 *  off in Settings. */
export function migrateSettings(settings: AppSettings): AppSettings {
  let s = settings;
  if (s.schemaVersion < 2) {
    s = {
      ...s,
      interests: [...new Set([...s.interests, "game" as MediaType, "book" as MediaType])],
      schemaVersion: 2,
    };
  }
  if (s.schemaVersion < 3) {
    s = {
      ...s,
      interests: [...new Set([...s.interests, "manga" as MediaType, "comics" as MediaType])],
      schemaVersion: 3,
    };
  }
  return s;
}

/** An edge in the similarity graph (spec 8.1). */
export interface SimEdge {
  a: string; // localId
  b: string; // localId
  score: number; // 0..1
  reasons: SimReason[];
}

export interface SimReason {
  kind: "genre" | "tag" | "format" | "creator" | "era" | "language" | "userTag";
  /** Shared values that produced this reason. */
  values: string[];
  weight: number; // contribution 0..1
}

export interface Cluster {
  id: string;
  labelKey: string | null; // genre/tag slug the cluster is named after, if confident
  members: string[]; // localIds
}

export type RecMode =
  | "closest"
  | "because"
  | "adjacent"
  | "explore"
  | "island";

export interface RecReasonData {
  key: string; // i18n key suffix
  values: string[]; // display values
}

export interface Recommendation {
  item: MediaItem;
  score: number; // 0..1
  reasonData: RecReasonData[];
  mode: RecMode;
}

export interface TasteFeatureStat {
  key: string; // "genre:mystery"
  kind: "genre" | "tag" | "creator" | "studio" | "type";
  slug: string;
  score: number; // signed evidence
  sampleCount: number; // titles contributing
}

export type TasteConfidence = "early" | "tentative" | "established";

export interface TasteProfile {
  features: TasteFeatureStat[];
  ratedCount: number;
  positiveCount: number;
  negativeCount: number;
  confidence: TasteConfidence;
}

export interface ExportBundle {
  app: "ECHO";
  schemaVersion: number;
  exportedAt: string;
  settings?: Partial<AppSettings>;
  entries: UserMediaEntry[];
  media: MediaItem[]; // provider IDs + permitted fields only
  feedback: TasteFeedback[];
  mapLayout?: MapLayoutState | null;
  /** v2 bundles additionally carry the canonical works + relationships */
  works?: WorkRecord[];
  workLinks?: WorkLink[];
}
