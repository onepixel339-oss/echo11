/**
 * ECHO — Taste Companion (optional AI layer).
 *
 * Architecture contract:
 *  - The deterministic engine computes a REAL statistical snapshot of the
 *    user's taste (ratings, favourites, islands, type mix).
 *  - This module sends ONLY that anonymous snapshot to the AI endpoint,
 *    which narrates it. The model never invents data: the system prompt
 *    forbids it and the snapshot is the only material it sees.
 *  - AI is a cherry on top: if the endpoint is unavailable, every other
 *    feature works exactly as before. No caller may depend on it.
 */

import { buildTasteProfile } from "../engine/taste";
import { buildSimilarityGraph } from "../engine/similarity";
import { computeClusters } from "../engine/cluster";
import { computeIdf } from "../engine/features";
import { vocabLabel } from "../data/vocab";
import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import type {
  Language,
  MediaItem,
  TasteFeedback,
  UserMediaEntry,
} from "../types";

// ---------------------------------------------------------------------------
// Snapshot — the ONLY data that leaves the device (labels + counts, no ids)
// ---------------------------------------------------------------------------

export interface CompanionFeatureSnap {
  label: string;
  sampleCount: number;
  score?: number;
}

export interface CompanionIslandSnap {
  label: string;
  size: number;
  titles: string[];
}

export interface CompanionRecentSnap {
  title: string;
  rating?: number;
  status: string;
}

export interface CompanionSnapshot {
  lang: "ar" | "en";
  stats: {
    librarySize: number;
    rated: number;
    positive: number;
    negative: number;
    confidence: "early" | "tentative" | "established";
    mix: { anime: number; movie: number; series: number; game: number; book: number; manga: number; comics: number };
  };
  topGenres: CompanionFeatureSnap[];
  topTags: CompanionFeatureSnap[];
  negativeFeatures: CompanionFeatureSnap[];
  islands: CompanionIslandSnap[];
  recent: CompanionRecentSnap[];
  favourites: string[];
  ratingDist: number[]; // counts for 1..5 stars
}

const STATUS_WORDS: Record<string, string> = {
  completed: "completed",
  watching: "watching",
  planned: "planned",
  dropped: "dropped",
  on_hold: "on hold",
};

function displayTitle(item: MediaItem, lang: Language): string {
  return lang === "ar" && item.titleAr ? item.titleAr : item.title;
}

/**
 * Build the anonymous statistical snapshot from real library data.
 * Returns null when there is too little to say anything honest.
 */
export function buildCompanionSnapshot(opts: {
  mediaById: Map<string, MediaItem>;
  entries: UserMediaEntry[];
  feedback: TasteFeedback[];
  recencyWeight: boolean;
  lang: Language;
}): CompanionSnapshot | null {
  const { mediaById, entries, feedback, recencyWeight, lang } = opts;
  if (entries.length < 2) return null;

  const libraryItems = entries
    .map((e) => mediaById.get(e.mediaLocalId))
    .filter((m): m is MediaItem => Boolean(m));
  if (libraryItems.length < 2) return null;

  const profile = buildTasteProfile(mediaById, entries, feedback, {
    recencyWeight,
  });

  // islands — same deterministic graph the Map screen renders
  const idf = (() => {
    const corpus = [...libraryItems];
    const libIds = new Set(libraryItems.map((m) => m.localId));
    for (const seed of DEMO_CATALOGUE) {
      const item = demoToMediaItem(seed);
      if (!libIds.has(item.localId)) corpus.push(item);
    }
    return computeIdf(corpus);
  })();
  const userTags: Record<string, string[]> = {};
  for (const e of entries) userTags[e.mediaLocalId] = e.userTags;
  const edges = buildSimilarityGraph(libraryItems, { idf, userTags });
  const clusters = computeClusters(libraryItems, edges);
  const byId = new Map(libraryItems.map((m) => [m.localId, m]));

  const islands: CompanionIslandSnap[] = [];
  for (const c of clusters) {
    if (c.members.length < 2) continue;
    const label = c.labelKey
      ? vocabLabel(c.labelKey.includes(":") ? c.labelKey.split(":")[1] : c.labelKey, lang)
      : lang === "ar"
        ? `جزيرة من ${c.members.length} أعمال`
        : `Island of ${c.members.length}`;
    const titles = c.members
      .map((id) => byId.get(id))
      .filter((m): m is MediaItem => Boolean(m))
      .slice(0, 5)
      .map((m) => displayTitle(m, lang));
    islands.push({ label, size: c.members.length, titles });
  }
  islands.sort((a, b) => b.size - a.size);

  const feat = (kind: string, positive: boolean, n: number): CompanionFeatureSnap[] =>
    profile.features
      .filter(
        (f) => f.kind === kind && (positive ? f.score > 0.05 : f.score < -0.05),
      )
      .sort((a, b) => (positive ? b.score - a.score : a.score - b.score))
      .slice(0, n)
      .map((f) => ({
        label: vocabLabel(f.slug, lang),
        sampleCount: f.sampleCount,
        ...(positive ? {} : { score: Math.round(f.score * 100) / 100 }),
      }));

  const recent: CompanionRecentSnap[] = [...entries]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8)
    .map((e) => {
      const item = mediaById.get(e.mediaLocalId);
      return {
        title: item ? displayTitle(item, lang) : "?",
        ...(e.rating !== undefined ? { rating: e.rating } : {}),
        status: STATUS_WORDS[e.status] ?? e.status,
      };
    })
    .filter((r) => r.title !== "?");

  const favourites = entries
    .filter((e) => e.isFavourite)
    .slice(0, 6)
    .map((e) => {
      const item = mediaById.get(e.mediaLocalId);
      return item ? displayTitle(item, lang) : "";
    })
    .filter(Boolean);

  const ratingDist = [0, 0, 0, 0, 0];
  for (const e of entries) if (e.rating !== undefined) ratingDist[e.rating - 1]++;

  const mix: CompanionSnapshot["stats"]["mix"] = { anime: 0, movie: 0, series: 0, game: 0, book: 0, manga: 0, comics: 0 };
  for (const m of libraryItems) {
    if (m.mediaType in mix) mix[m.mediaType as keyof typeof mix]++;
  }

  return {
    lang: lang === "ar" ? "ar" : "en",
    stats: {
      librarySize: entries.length,
      rated: profile.ratedCount,
      positive: profile.positiveCount,
      negative: profile.negativeCount,
      confidence: profile.confidence,
      mix,
    },
    topGenres: feat("genre", true, 8),
    topTags: feat("tag", true, 8),
    negativeFeatures: [...feat("genre", false, 3), ...feat("tag", false, 2)],
    islands: islands.slice(0, 6),
    recent,
    favourites,
    ratingDist,
  };
}

// ---------------------------------------------------------------------------
// Fetch — returns null on any failure; callers degrade gracefully
// ---------------------------------------------------------------------------

export type CompanionInsightKind = "strength" | "pattern" | "contrast" | "gap";

export interface CompanionInsight {
  kind: CompanionInsightKind;
  title: string;
  body: string;
}

export interface CompanionReading {
  headline: string;
  insights: CompanionInsight[];
}

export async function fetchCompanionReading(snapshot: CompanionSnapshot): Promise<{
  reading: CompanionReading | null;
  /** true when rejected by the app's own AI rate limiter (429) */
  rateLimited: boolean;
}> {
  try {
    const res = await fetch("/api/echo/ai/companion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (res.status === 429) return { reading: null, rateLimited: true };
    if (!res.ok) return { reading: null, rateLimited: false };
    const data = (await res.json()) as {
      ok?: boolean;
      headline?: unknown;
      insights?: unknown;
    };
    if (data?.ok !== true || typeof data.headline !== "string" || !Array.isArray(data.insights)) {
      return { reading: null, rateLimited: false };
    }
    const KINDS: CompanionInsightKind[] = ["strength", "pattern", "contrast", "gap"];
    const insights = (
      data.insights as unknown[]
    )
      .filter(
        (i): i is CompanionInsight =>
          Boolean(i) &&
          typeof (i as CompanionInsight).kind === "string" &&
          KINDS.includes((i as CompanionInsight).kind) &&
          typeof (i as CompanionInsight).title === "string" &&
          typeof (i as CompanionInsight).body === "string" &&
          (i as CompanionInsight).title.trim().length > 0 &&
          (i as CompanionInsight).body.trim().length > 0,
      )
      .slice(0, 6);
    if (!insights.length) return { reading: null, rateLimited: false };
    return {
      reading: { headline: data.headline.trim(), insights },
      rateLimited: false,
    };
  } catch {
    return { reading: null, rateLimited: false };
  }
}
