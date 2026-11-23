/**
 * ECHO — Weekly Library Digest (optional AI layer).
 *
 * Same contract as the Taste Companion:
 *  - the deterministic engine computes a REAL weekly summary of the user's
 *    activity (added, completed, rated, top genres — from their library only);
 *  - ONLY that anonymous summary leaves the device, and the model narrates it;
 *  - strictly ONE network request per ISO week per device: the result is
 *    cached in localStorage until the week rolls over (or the user forces a
 *    regenerate) — a full week of users costs the free tier almost nothing;
 *  - AI is a garnish: on failure every other feature works exactly as before.
 */

import { buildTasteProfile } from "../engine/taste";
import { vocabLabel } from "../data/vocab";
import type {
  Language,
  MediaItem,
  TasteFeedback,
  UserMediaEntry,
} from "../types";

// ---------------------------------------------------------------------------
// Digest — the ONLY data that leaves the device (labels + counts, no ids)
// ---------------------------------------------------------------------------

export interface WeeklyDigest {
  lang: "ar" | "en";
  weekKey: string; // e.g. "2026-W47"
  stats: {
    librarySize: number;
    rated: number;
    favourites: number;
    avgRating?: number;
    mix: { anime: number; movie: number; series: number; game: number; book: number; manga: number; comics: number };
  };
  weekActivity: {
    added: number;
    completed: number;
    ratingsGiven: number;
    /** titles completed this week (≤5, display names, with rating when known) */
    completedTitles: string[];
    /** titles added this week (≤5, display names) */
    addedTitles: string[];
  };
  topGenres: string[]; // display labels, positive evidence only
  topRatedTitles: string[]; // ≤5, display names with rating (e.g. "Death Note · 5★")
}

/** ISO-8601 year-week key, e.g. "2026-W47" (weeks start Monday). */
export function weekKeyOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function displayTitle(item: MediaItem, lang: Language): string {
  return lang === "ar" && item.titleAr ? item.titleAr : item.title;
}

/**
 * Build the anonymous weekly digest from real library data.
 * Returns null when there is too little to say anything honest.
 */
export function buildWeeklyDigest(opts: {
  mediaById: Map<string, MediaItem>;
  entries: UserMediaEntry[];
  feedback: TasteFeedback[];
  recencyWeight: boolean;
  lang: Language;
}): WeeklyDigest | null {
  const { mediaById, entries, feedback, recencyWeight, lang } = opts;
  if (entries.length < 3) return null;

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6); // last 7 days, inclusive

  const itemOf = (e: UserMediaEntry): MediaItem | undefined =>
    mediaById.get(e.mediaLocalId);

  const addedThisWeek = entries.filter((e) => e.addedAt >= weekStart.toISOString());
  const completedThisWeek = entries.filter(
    (e) => e.completedAt && e.completedAt >= weekStart.toISOString(),
  );
  // ratings given in the last 7 days: feedback records created this week
  const ratingsThisWeek = feedback.filter(
    (f) => f.source === "rating" && f.createdAt >= weekStart.toISOString(),
  );

  const mix: WeeklyDigest["stats"]["mix"] = { anime: 0, movie: 0, series: 0, game: 0, book: 0, manga: 0, comics: 0 };
  for (const e of entries) {
    const m = itemOf(e);
    if (m && m.mediaType in mix) mix[m.mediaType as keyof typeof mix]++;
  }

  const profile = buildTasteProfile(mediaById, entries, feedback, { recencyWeight });
  const topGenres = profile.features
    .filter((f) => f.kind === "genre" && f.score > 0.05 && f.sampleCount >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((f) => vocabLabel(f.slug, lang));

  const rated = profile.ratedCount;
  const sum = entries.reduce((acc, e) => acc + (e.rating ?? 0), 0);
  const ratedEntries = entries.filter((e) => e.rating !== undefined);
  const avgRating = ratedEntries.length
    ? Math.round((sum / ratedEntries.length) * 10) / 10
    : undefined;

  const topRatedTitles = [...ratedEntries]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (a.addedAt < b.addedAt ? 1 : -1))
    .slice(0, 5)
    .map((e) => itemOf(e))
    .filter((m): m is MediaItem => Boolean(m))
    // carry the rating with the name so the model never has to guess it
    .map((m) => {
      const e = entries.find((x) => x.mediaLocalId === m.localId);
      return e?.rating !== undefined
        ? `${displayTitle(m, lang)} · ${e.rating}★`
        : displayTitle(m, lang);
    });

  return {
    lang: lang === "ar" ? "ar" : "en",
    weekKey: weekKeyOf(),
    stats: {
      librarySize: entries.length,
      rated,
      favourites: entries.filter((e) => e.isFavourite).length,
      ...(avgRating !== undefined ? { avgRating } : {}),
      mix,
    },
    weekActivity: {
      added: addedThisWeek.length,
      completed: completedThisWeek.length,
      ratingsGiven: ratingsThisWeek.length,
      completedTitles: completedThisWeek
        .slice(0, 5)
        .map((e) => {
          const m = itemOf(e);
          if (!m) return null;
          return e.rating !== undefined
            ? `${displayTitle(m, lang)} · ${e.rating}★`
            : displayTitle(m, lang);
        })
        .filter((x): x is string => x !== null),
      addedTitles: addedThisWeek
        .slice(0, 5)
        .map((e) => itemOf(e))
        .filter((m): m is MediaItem => Boolean(m))
        .map((m) => displayTitle(m, lang)),
    },
    topGenres,
    topRatedTitles,
  };
}

// ---------------------------------------------------------------------------
// Fetch + weekly device cache (ONE request per ISO week per device)
// ---------------------------------------------------------------------------

const CACHE_KEY = "echo.weekly.v1";

interface WeeklyCacheEntry {
  weekKey: string;
  lang: "ar" | "en";
  text: string;
  generatedAt: string;
}

export interface WeeklyOutcome {
  text: string | null;
  fromCache: boolean;
  /** true when rejected by the app's own AI rate limiter (429) */
  rateLimited: boolean;
}

function readCache(): WeeklyCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyCacheEntry;
    if (typeof parsed.weekKey !== "string" || typeof parsed.text !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: WeeklyCacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* private mode / quota — the digest just won't persist this week */
  }
}

export async function fetchWeeklyDigest(
  digest: WeeklyDigest,
  opts: { force?: boolean } = {},
): Promise<WeeklyOutcome> {
  // one request per ISO week per device (same week + same language = reuse)
  const cached = readCache();
  if (!opts.force && cached && cached.weekKey === digest.weekKey && cached.lang === digest.lang) {
    return { text: cached.text, fromCache: true, rateLimited: false };
  }

  try {
    const res = await fetch("/api/echo/ai/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(digest),
    });
    if (res.status === 429) return { text: null, fromCache: false, rateLimited: true };
    if (!res.ok) return { text: null, fromCache: false, rateLimited: false };
    const data = (await res.json()) as { ok?: boolean; text?: unknown };
    if (data?.ok !== true || typeof data.text !== "string" || !data.text.trim()) {
      return { text: null, fromCache: false, rateLimited: false };
    }
    const text = data.text.trim();
    writeCache({
      weekKey: digest.weekKey,
      lang: digest.lang,
      text,
      generatedAt: new Date().toISOString(),
    });
    return { text, fromCache: false, rateLimited: false };
  } catch {
    return { text: null, fromCache: false, rateLimited: false };
  }
}
