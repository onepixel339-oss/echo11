/**
 * ECHO — Taste profile engine.
 *
 * Signal priority (spec 7.1): explicit rating > favourite/dislike feedback >
 * onboarding choices > weak completed signal > interested/not-for-me >
 * planned (no positive signal). Unrated titles never produce positive
 * evidence. Every stat carries its sample size (spec 6.5).
 */

import type {
  MediaItem,
  TasteFeatureStat,
  TasteFeedback,
  TasteProfile,
  UserMediaEntry,
} from "../types";
import { featureKey, type FeatureKind } from "./features";

const KIND_DIVISORS: Record<FeatureKind, number> = {
  genre: 0.45,
  tag: 0.35,
  creator: 0.12,
  studio: 0.12,
  type: 0.08,
};

/** Signed evidence contributed by a single library entry. */
export function entryEvidence(
  entry: UserMediaEntry,
): { value: number; counted: boolean } {
  let value = 0;
  let counted = false;
  if (entry.rating !== undefined) {
    // 1–5 scale: 5 strong positive … 1 strong negative
    value += ({ 1: -1.5, 2: -1.0, 3: 0.15, 4: 1.0, 5: 1.5 })[entry.rating];
    counted = true;
  }
  if (entry.isFavourite) {
    if (entry.rating !== undefined && entry.rating >= 4) value *= 1.3; // amplify, never override
    else if (entry.rating === undefined) value += 0.3; // weak favourite-only signal
    else if (entry.rating >= 3) value += 0.2;
  }
  if (entry.status === "completed" && entry.rating === undefined) {
    value += 0.05; // completion is a very weak signal on its own
    counted = true;
  }
  return { value, counted };
}

export interface TasteOptions {
  recencyWeight: boolean;
}

export function buildTasteProfile(
  mediaById: Map<string, MediaItem>,
  entries: UserMediaEntry[],
  feedback: TasteFeedback[],
  opts: TasteOptions,
): TasteProfile {
  const stats = new Map<string, TasteFeatureStat>();

  const bump = (kind: FeatureKind, value: string, evidence: number) => {
    if (Math.abs(evidence) < 0.03) return;
    const key = featureKey(kind, value);
    const s =
      stats.get(key) ??
      ({ key, kind, slug: value, score: 0, sampleCount: 0 } as TasteFeatureStat);
    s.score += evidence;
    s.sampleCount += 1;
    stats.set(key, s);
  };

  // recent entries get a modest boost (user can disable)
  const recentIds = new Set<string>();
  if (opts.recencyWeight) {
    [...entries]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 8)
      .forEach((e) => recentIds.add(e.id));
  }

  let ratedCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const entry of entries) {
    const item = mediaById.get(entry.mediaLocalId);
    if (!item) continue;
    if (entry.rating !== undefined) {
      ratedCount++;
      if (entry.rating >= 4) positiveCount++;
      if (entry.rating <= 2) negativeCount++;
    }
    const { value: base } = entryEvidence(entry);
    if (!base && entry.rating === undefined && !entry.isFavourite) continue;
    const evidence = base * (recentIds.has(entry.id) ? 1.15 : 1);

    // spread across feature kinds (divisors keep kinds comparable)
    for (const g of item.genres) bump("genre", g, evidence * KIND_DIVISORS.genre / Math.max(1, item.genres.length));
    for (const t of item.tags) bump("tag", t, evidence * KIND_DIVISORS.tag / Math.max(1, item.tags.length));
    for (const c of item.creators ?? []) bump("creator", c, evidence * KIND_DIVISORS.creator);
    for (const s of item.studios ?? []) bump("studio", s, evidence * KIND_DIVISORS.studio);
    bump("type", item.mediaType, evidence * KIND_DIVISORS.type);
  }

  // explicit feature feedback (onboarding preference cards)
  for (const fb of feedback) {
    if (!fb.featureKey) continue;
    const magnitude = fb.value === "liked" ? 0.3 : fb.value === "disliked" ? -0.3 : 0;
    if (!magnitude) continue;
    const [kindRaw, value] = fb.featureKey.split(":");
    const kind = kindRaw as FeatureKind;
    const s =
      stats.get(fb.featureKey) ??
      ({ key: fb.featureKey, kind, slug: value, score: 0, sampleCount: 0 } as TasteFeatureStat);
    s.score += magnitude;
    s.sampleCount += 1;
    stats.set(fb.featureKey, s);
  }

  const features = [...stats.values()].sort(
    (a, b) => Math.abs(b.score) - Math.abs(a.score) || (a.key < b.key ? -1 : 1),
  );

  const confidence =
    ratedCount < 5 ? "early" : ratedCount < 10 ? "tentative" : "established";

  return {
    features,
    ratedCount,
    positiveCount,
    negativeCount,
    confidence,
  };
}

export interface TasteInsight {
  id: string; // feature key (used for dismissal)
  kind: TasteFeatureStat["kind"];
  slug: string;
  score: number;
  sampleCount: number;
  positive: boolean;
}

/**
 * Confidence-aware insights (spec 6.5):
 * early → only strong signals from ≥1 sample; tentative ≥2; established ≥3.
 */
export function tasteInsights(
  profile: TasteProfile,
  dismissed: Set<string>,
): TasteInsight[] {
  const minSamples =
    profile.confidence === "early" ? 1 : profile.confidence === "tentative" ? 2 : 3;
  const minMagnitude =
    profile.confidence === "early" ? 0.9 : profile.confidence === "tentative" ? 1.1 : 1.4;
  return profile.features
    .filter(
      (f) =>
        !dismissed.has(f.key) &&
        Math.abs(f.score) >= minMagnitude &&
        f.sampleCount >= minSamples &&
        (f.kind === "genre" || f.kind === "tag" || f.kind === "creator" || f.kind === "studio" || f.kind === "type"),
    )
    .slice(0, 10)
    .map((f) => ({
      id: f.key,
      kind: f.kind,
      slug: f.slug,
      score: f.score,
      sampleCount: f.sampleCount,
      positive: f.score > 0,
    }));
}

/** Titles whose feature vectors best represent the current profile. */
export function mostInfluentialTitles(
  mediaById: Map<string, MediaItem>,
  entries: UserMediaEntry[],
  profile: TasteProfile,
  limit = 6,
): { entry: UserMediaEntry; item: MediaItem; affinity: number }[] {
  const positive = new Map(profile.features.filter((f) => f.score > 0).map((f) => [f.key, f.score]));
  const ranked = entries
    .map((entry) => {
      const item = mediaById.get(entry.mediaLocalId);
      if (!item) return null;
      let affinity = 0;
      for (const [key] of itemFeaturesKeys(item)) {
        affinity += positive.get(key) ?? 0;
      }
      const { value } = entryEvidence(entry);
      affinity = affinity * (value >= 0 ? 1 : -0.2) + Math.max(0, value) * 0.5;
      return { entry, item, affinity };
    })
    .filter((x): x is { entry: UserMediaEntry; item: MediaItem; affinity: number } => x !== null)
    .sort((a, b) => b.affinity - a.affinity || (a.entry.id < b.entry.id ? -1 : 1));
  return ranked.slice(0, limit);
}

function* itemFeaturesKeys(item: MediaItem): Iterable<[string]> {
  for (const g of item.genres) yield [featureKey("genre", g)];
  for (const t of item.tags) yield [featureKey("tag", t)];
  for (const c of item.creators ?? []) yield [featureKey("creator", c)];
  for (const s of item.studios ?? []) yield [featureKey("studio", s)];
  yield [featureKey("type", item.mediaType)];
}
