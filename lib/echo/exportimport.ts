/**
 * ECHO — Export / import (versioned JSON backups, spec 10.3).
 * Import always validates before touching existing data, shows a count
 * preview and asks before merge/replace.
 *
 * Bundle versions:
 *  - v1: settings/entries/media/feedback/mapLayout (pre-catalog-migration)
 *  - v2: additionally works + workLinks and the v2 media fields
 *        (workId, externalIds, provenance, providerRef, rating)
 * v1 bundles remain importable forever — missing v2 fields are filled by
 * the lazy catalog enrichment (migration.ts), never guessed here.
 */

import { z } from "zod";
import type {
  ExportBundle,
  MediaItem,
  TasteFeedback,
  UserMediaEntry,
  WorkLink,
  WorkRecord,
} from "./types";

const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const externalIdMapSchema = z
  .object({
    imdb: z.string().optional(),
    tvmaze: z.string().optional(),
    anilist: z.string().optional(),
    mal: z.string().optional(),
    kitsu: z.string().optional(),
    rawg: z.string().optional(),
    openlib: z.string().optional(),
    wikidata: z.string().optional(),
    gutenberg: z.string().optional(),
  })
  .optional();

const MEDIA_TYPE_ENUM = z.enum([
  "anime",
  "movie",
  "series",
  "game",
  "book",
  "manga",
  "comics",
]);

const mediaItemSchema = z.object({
  localId: z.string().min(1),
  provider: z.string().min(1),
  providerId: z.string(),
  canonicalUrl: z.string().optional(),
  mediaType: MEDIA_TYPE_ENUM,
  format: z.enum(["film", "series", "game", "book"]),
  title: z.string().min(1),
  titleAr: z.string().optional(),
  originalTitle: z.string().optional(),
  synopsis: z.string().optional(),
  synopsisAr: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseYear: z.number().int().optional(),
  genres: z.array(z.string()),
  tags: z.array(z.string()),
  creators: z.array(z.string()).optional(),
  studios: z.array(z.string()).optional(),
  cast: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  contentRating: z.string().optional(),
  runtimeMinutes: z.number().optional(),
  episodeCount: z.number().optional(),
  posterUrl: z.string().optional(),
  backdropUrl: z.string().optional(),
  sourceAttribution: z.string().optional(),
  metadataFetchedAt: z.string().optional(),
  // ---- v3 print-media fields (optional: v1/v2 bundles keep importing) ----
  subtype: z.string().optional(),
  publicationStatus: z
    .enum(["ongoing", "completed", "hiatus", "cancelled", "upcoming"])
    .optional(),
  volumeCount: z.number().int().nonnegative().optional(),
  chapterCount: z.number().int().nonnegative().optional(),
  issueCount: z.number().int().nonnegative().optional(),
  issueNumber: z.number().int().nonnegative().optional(),
  endYear: z.number().int().optional(),
  // ---- v2 catalog fields (optional: v1 bundles keep importing) ----
  workId: z.string().optional(),
  externalIds: externalIdMapSchema,
  provenance: z.record(z.string(), z.string()).optional(),
  providerRef: z
    .object({
      providerId: z.string(),
      licenseStatus: z.string(),
      termsUrl: z.string(),
      verifiedAt: z.string().nullable().optional(),
    })
    .optional(),
  rating: z
    .object({
      source: z.string(),
      scale: z.string(),
      value: z.number(),
      voteCount: z.number().optional(),
    })
    .optional(),
});

const matchCandidateSchema = z.object({
  localId: z.string(),
  provider: z.string(),
  providerId: z.string(),
  title: z.string(),
  releaseYear: z.number().optional(),
  mediaType: MEDIA_TYPE_ENUM,
});

const entrySchema = z.object({
  id: z.string().min(1),
  mediaLocalId: z.string().min(1),
  status: z.enum(["completed", "watching", "planned", "dropped", "on_hold"]),
  rating: ratingSchema.optional(),
  isFavourite: z.boolean(),
  personalNote: z.string().optional(),
  userTags: z.array(z.string()),
  addedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  // v2: ambiguity review flag from identity matching
  matchReview: z
    .object({
      flaggedAt: z.string(),
      candidates: z.array(matchCandidateSchema),
    })
    .optional(),
});

const feedbackSchema = z.object({
  id: z.string().min(1),
  mediaLocalId: z.string().optional(),
  featureKey: z.string().optional(),
  value: z.enum(["liked", "disliked", "interested", "not_for_me", "already_watched"]),
  source: z.enum(["rating", "favourite", "onboarding", "recommendation", "manual"]),
  createdAt: z.string(),
});

const workRecordSchema = z.object({
  workId: z.string().min(1),
  primaryType: MEDIA_TYPE_ENUM,
  title: z.string(),
  externalIds: externalIdMapSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workLinkSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  parentWorkId: z.string().optional(),
  relation: z.enum([
    "season",
    "edition",
    "volume",
    "series-member",
    "translation",
    "remake",
    "same-work",
    "adaptation",
  ]),
  order: z.number().optional(),
  label: z.string().optional(),
  externalIds: externalIdMapSchema,
  createdAt: z.string(),
});

const bundleSchema = z.object({
  app: z.literal("ECHO"),
  // v1/v2 bundles (pre manga/comics) stay importable forever
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: z.string(),
  settings: z
    .object({
      language: z.enum(["en", "ar"]).optional(),
      interests: z.array(MEDIA_TYPE_ENUM).optional(),
      recencyWeight: z.boolean().optional(),
      mapLabels: z.boolean().optional(),
      animations: z.boolean().optional(),
    })
    .optional(),
  entries: z.array(entrySchema),
  media: z.array(mediaItemSchema),
  feedback: z.array(feedbackSchema),
  mapLayout: z.any().optional(),
  // v2 additions
  works: z.array(workRecordSchema).optional(),
  workLinks: z.array(workLinkSchema).optional(),
});

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ValidBundle = ExportBundle;

export function validateBundle(data: unknown): { ok: true; data: ValidBundle } | { ok: false; error: string } {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "schema" };
  const b = parsed.data as unknown as ValidBundle;
  // every entry must reference a media item present in the bundle
  const ids = new Set(b.media.map((m) => m.localId));
  const orphans = b.entries.filter((e) => !ids.has(e.mediaLocalId));
  if (orphans.length === b.entries.length && b.entries.length > 0) {
    return { ok: false, error: "orphan-entries" };
  }
  return { ok: true, data: b };
}

export function buildBundle(args: {
  settings: ExportBundle["settings"];
  media: MediaItem[];
  entries: UserMediaEntry[];
  feedback: TasteFeedback[];
  works?: WorkRecord[];
  workLinks?: WorkLink[];
}): ExportBundle {
  const entryMediaIds = new Set(args.entries.map((e) => e.mediaLocalId));
  return {
    app: "ECHO",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    // provider references + permitted fields only (no secrets, no images)
    media: args.media
      .filter((m) => entryMediaIds.has(m.localId) || m.provider === "manual")
      .map((m) => ({
        ...m,
        posterUrl: undefined,
        backdropUrl: undefined,
      })),
    entries: args.entries,
    feedback: args.feedback,
    settings: args.settings,
    // v2: canonical works + relationships (personal backup of the user's
    // own library references — attribution ships via providerRef)
    works: args.works?.length ? args.works : undefined,
    workLinks: args.workLinks?.length ? args.workLinks : undefined,
  };
}

export interface ApplyDeps {
  putMedia: (items: MediaItem[]) => Promise<void>;
  putEntries: (entries: UserMediaEntry[]) => Promise<void>;
  putFeedback: (items: TasteFeedback[]) => Promise<void>;
  getAllEntries: () => Promise<UserMediaEntry[]>;
  getAllMedia: () => Promise<MediaItem[]>;
  getAllFeedback: () => Promise<TasteFeedback[]>;
  putWorks?: (works: WorkRecord[]) => Promise<void>;
  putWorkLinks?: (links: WorkLink[]) => Promise<void>;
}

/** Merge keeps current entries (incoming only fills new titles);
 *  Replace wipes and restores the bundle (works and relationships too —
 *  v1 bundles rebuild their works lazily from the imported media). */
export async function applyBundle(
  bundle: ValidBundle,
  mode: "merge" | "replace",
  deps: ApplyDeps,
): Promise<number> {
  if (mode === "replace") {
    const { clearLibraryStores } = await import("./localdbHelpers");
    await clearLibraryStores();
    await deps.putMedia(bundle.media);
    await deps.putEntries(bundle.entries);
    await deps.putFeedback(bundle.feedback);
    if (bundle.works?.length && deps.putWorks) await deps.putWorks(bundle.works);
    if (bundle.workLinks?.length && deps.putWorkLinks) await deps.putWorkLinks(bundle.workLinks);
    return bundle.entries.length;
  }
  const [existingEntries, existingMedia] = await Promise.all([
    deps.getAllEntries(),
    deps.getAllMedia(),
  ]);
  const existingMediaIds = new Set(existingMedia.map((m) => m.localId));
  const existingKeys = new Set(existingEntries.map((e) => e.mediaLocalId));
  const newMedia = bundle.media.filter((m) => !existingMediaIds.has(m.localId));
  const newEntries = bundle.entries.filter((e) => !existingKeys.has(e.mediaLocalId));
  const existingFb = await deps.getAllFeedback();
  const fbKeys = new Set(existingFb.map((f) => `${f.mediaLocalId ?? ""}|${f.featureKey ?? ""}|${f.value}`));
  const newFb = bundle.feedback.filter(
    (f) => !fbKeys.has(`${f.mediaLocalId ?? ""}|${f.featureKey ?? ""}|${f.value}`),
  );
  await deps.putMedia(newMedia);
  await deps.putEntries(newEntries);
  await deps.putFeedback(newFb);
  // merge: upsert works/links additively (never deletes existing ones)
  if (bundle.works?.length && deps.putWorks) await deps.putWorks(bundle.works);
  if (bundle.workLinks?.length && deps.putWorkLinks) await deps.putWorkLinks(bundle.workLinks);
  return newEntries.length;
}
