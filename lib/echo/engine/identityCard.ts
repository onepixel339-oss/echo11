/**
 * ECHO — Taste Identity Card engine.
 *
 * The shareable "بطاقة هوية الذوق": a deterministic, honest summary of the
 * user's taste derived ONLY from their real ratings/favourites (no invented
 * percentages). Computes:
 *  - an archetype (rule-based, voted by positive genre/tag evidence)
 *  - a blend of top positive signals (shares sum to ~100%)
 *  - library stats (tracked / rated / favourites / avg / islands / era / mix)
 *  - a stable signature code (top features hashed, e.g. "ATLAS·K7X2M")
 *  - confidence-aware copy (early profiles say so honestly)
 */

import type {
  Cluster,
  Language,
  MediaItem,
  TasteProfile,
  UserMediaEntry,
} from "../types";
import { fnv1a } from "../ids";
import { vocabLabel } from "../data/vocab";
import type { TasteFeatureStat } from "../types";

export interface Bilingual {
  en: string;
  ar: string;
}

export interface IdentityArchetype {
  id: string;
  name: Bilingual;
  epithet: Bilingual;
  /** genre/tag slugs that vote for this archetype */
  triggers: string[];
}

/**
 * Archetypes. Deliberately evocative but grounded: each one is voted by the
 * actual genre/tag evidence in the profile, never picked at random.
 */
export const ARCHETYPES: IdentityArchetype[] = [
  {
    id: "warden",
    name: { en: "Warden of Shadows", ar: "حارس الظلال" },
    epithet: {
      en: "Stories that get under your skin are the ones you keep.",
      ar: "الحكايات اللي بتلمس أعصابك هي اللي بتفضل معاك.",
    },
    triggers: [
      "horror", "psychological", "dark-fantasy", "thriller", "dark",
      "mind-bending", "noir", "dystopia", "betrayal",
    ],
  },
  {
    id: "orbit",
    name: { en: "Orbit Engineer", ar: "مهندس المدارات" },
    epithet: {
      en: "You chart futures that don't exist yet — and prefer them precise.",
      ar: "بتنسّق مستقبل لسه ما حصلش — وبتفضله مضبوط.",
    },
    triggers: [
      "sci-fi", "mecha", "ai", "cyberpunk", "first-contact", "space",
      "time-travel", "dystopia",
    ],
  },
  {
    id: "cartographer",
    name: { en: "Cartographer of the Impossible", ar: "رسّام المستحيل" },
    epithet: {
      en: "Other worlds aren't an escape for you — they're a home address.",
      ar: "العوالم التانية مش هروب بالنسبالك — دي عنوان البيت.",
    },
    triggers: [
      "fantasy", "adventure", "supernatural", "epic", "whimsical",
      "fairy-tale-dark", "magic", "chosen-one",
    ],
  },
  {
    id: "collector",
    name: { en: "Collector of Quiet Moments", ar: "جامع اللحظات الهادية" },
    epithet: {
      en: "You rate the small, honest scenes higher than any explosion.",
      ar: "بتقيّم المشاهد الصادقة الصغيرة أعلى من أي انفجار.",
    },
    triggers: [
      "slice-of-life", "romance", "drama", "emotional", "friendship",
      "coming-of-age", "family-bonds", "found-family", "fatherhood",
    ],
  },
  {
    id: "tracker",
    name: { en: "The Tracker", ar: "قارئ الأثر" },
    epithet: {
      en: "You smell a twist three scenes early — and still enjoy the chase.",
      ar: "بتحسّ بالحبكة من بدء الفيلم — وبتستمتع بالمطاردة برضه.",
    },
    triggers: [
      "mystery", "crime", "cat-and-mouse", "conspiracy", "gangster",
      "heist", "detective", "revenge",
    ],
  },
  {
    id: "lightbearer",
    name: { en: "The Lightbearer", ar: "خفيف الظل" },
    epithet: {
      en: "After anything heavy, you know exactly what lifts you back up.",
      ar: "بعد أي حاجة تقيلة، عارف بالظبط اللي بيرجّع لك ابتسامتك.",
    },
    triggers: [
      "comedy", "dark-comedy", "comedic", "cringe-comedy", "music",
      "musical", "parody", "satire", "whimsical",
    ],
  },
  {
    id: "hunter",
    name: { en: "Adrenaline Hunter", ar: "صيّاد الأدرينالين" },
    epithet: {
      en: "If the stakes aren't high, you're not staying for the credits.",
      ar: "لو المخاطرة مش عالية، مش هتفضل لحد ما الشاشة تنطفي.",
    },
    triggers: ["action", "sports", "chase", "war", "epic", "shounen", "survival"],
  },
  {
    id: "keeper",
    name: { en: "Keeper of Tales", ar: "حافظ الحكايات" },
    epithet: {
      en: "Hand-drawn worlds and warm storytelling never miss with you.",
      ar: "العوالم المرسومة بإيد والحكايات الدافية عمرها ما تخيب معاك.",
    },
    triggers: [
      "animation", "family", "adventure", "fantasy", "beautiful",
      "award-winning", "whimsical", "wordless",
    ],
  },
  {
    id: "witness",
    name: { en: "Witness of Eras", ar: "شاهد على الزمن" },
    epithet: {
      en: "You watch what people lived, not only what they imagined.",
      ar: "بتتفرج على اللي عاشه الناس، مش بس اللي تخيلوه.",
    },
    triggers: [
      "historical", "biography", "war", "war-aftermath", "documentary",
      "avant-garde", "western", "class-conflict",
    ],
  },
  {
    id: "analyst",
    name: { en: "Pattern Analyst", ar: "محلّل الأنماط" },
    epithet: {
      en: "You don't watch stories — you dissect them, frame by frame.",
      ar: "إنت مش بتتفرج على الحكاية — بتشرّحها، مشهد بمشهد.",
    },
    triggers: [
      "psychological", "character-study", "mind-bending", "ambition",
      "anthology", "class-conflict", "coen-esque", "dream-heist",
    ],
  },
  {
    id: "tactician",
    name: { en: "The Grand Tactician", ar: "التكتيكي العظيم" },
    epithet: {
      en: "You don't just visit worlds — you out-think them.",
      ar: "إنت مش بتزور العوالم وبس — إنت بتفكرها وتكسبها.",
    },
    triggers: [
      "rpg", "strategy", "puzzle", "simulation", "mmo", "indie",
      "platformer", "shooter", "board-games", "card",
    ],
  },
  {
    id: "reader",
    name: { en: "The Midnight Reader", ar: "قارئ نص الليل" },
    epithet: {
      en: "When the screens go dark, your stories keep going in ink.",
      ar: "لما الشاشات بتطفي، حكاياتك بتكمل بالحبر.",
    },
    triggers: [
      "poetry", "classics", "philosophy", "short-stories", "fiction",
      "non-fiction", "biography", "self-help",
    ],
  },
];

/** Fallback archetype — used while signals are still weak. Honest, not fake. */
export const SURVEYOR_ARCHETYPE: IdentityArchetype = {
  id: "surveyor",
  name: { en: "The Curious Surveyor", ar: "المسّاح الفضولي" },
  epithet: {
    en: "Your map has more blank space than ink — for now.",
    ar: "خريطتك لسه فيها مساحة فاضية أكتر من الحبر — لحد دلوقتي.",
  },
  triggers: [],
};

export interface IdentityStat {
  tracked: number;
  rated: number;
  favourites: number;
  /** average of rated entries, 0 when nothing rated */
  avgRating: number;
  islands: number;
  era: { from: number; to: number } | null;
  /** share of tracked titles per media type, 0..100, sums to ~100 */
  mix: { anime: number; movie: number; series: number; game: number; book: number; manga: number; comics: number };
}

export interface IdentityBlendRow {
  slug: string;
  label: string;
  /** 0..100 */
  share: number;
  kind: TasteFeatureStat["kind"];
}

export interface IdentityCardData {
  archetype: IdentityArchetype;
  /** how strongly the data supports the archetype, 0..1 (internal, not shown as %) */
  archetypeStrength: number;
  stats: IdentityStat;
  blend: IdentityBlendRow[];
  ratingDist: [number, number, number, number, number];
  confidence: TasteProfile["confidence"];
  /** stable shareable code, e.g. "ATLAS·K7X2M" */
  signature: string;
  generatedAt: string;
}

export interface BuildIdentityCardInput {
  mediaById: Map<string, MediaItem>;
  entries: UserMediaEntry[];
  profile: TasteProfile;
  clusters: Cluster[];
  lang: Language;
}

export function buildIdentityCard(input: BuildIdentityCardInput): IdentityCardData {
  const { mediaById, entries, profile, clusters, lang } = input;

  // ---- archetype vote (positive genre/tag evidence only) ----
  const voteOf = new Map<string, number>();
  for (const f of profile.features) {
    if (f.score <= 0.05) continue;
    if (f.kind !== "genre" && f.kind !== "tag") continue;
    for (const a of ARCHETYPES) {
      if (a.triggers.includes(f.slug)) {
        const w = f.kind === "genre" ? 1.25 : 1;
        voteOf.set(a.id, (voteOf.get(a.id) ?? 0) + f.score * w);
      }
    }
  }
  const ranked = [...voteOf.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const totalVotes = ranked.reduce((s, [, v]) => s + Math.max(0, v), 0);
  const topVote = ranked[0]?.[1] ?? 0;
  const secondVote = ranked[1]?.[1] ?? 0;

  // need real support: some positive evidence, and a clear winner
  const clear =
    topVote >= 0.9 &&
    (secondVote === 0 || topVote / Math.max(secondVote, 1e-6) >= 1.12);
  const archetype = clear
    ? (ARCHETYPES.find((a) => a.id === ranked[0][0]) ?? SURVEYOR_ARCHETYPE)
    : SURVEYOR_ARCHETYPE;
  const archetypeStrength = totalVotes > 0 ? Math.min(1, topVote / totalVotes + 0.15) : 0;

  // ---- stats ----
  const items = entries
    .map((e) => mediaById.get(e.mediaLocalId))
    .filter((m): m is MediaItem => Boolean(m));
  let ratedSum = 0;
  let ratedCount = 0;
  let favourites = 0;
  const ratingDist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let minYear: number | null = null;
  let maxYear: number | null = null;
  const typeCount: IdentityStat["mix"] = { anime: 0, movie: 0, series: 0, game: 0, book: 0, manga: 0, comics: 0 };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const m = mediaById.get(e.mediaLocalId);
    if (e.isFavourite) favourites++;
    if (e.rating !== undefined) {
      ratedCount++;
      ratedSum += e.rating;
      ratingDist[e.rating - 1]++;
    }
    if (m) {
      typeCount[m.mediaType]++;
      if (m.releaseYear) {
        minYear = minYear === null ? m.releaseYear : Math.min(minYear, m.releaseYear);
        maxYear = maxYear === null ? m.releaseYear : Math.max(maxYear, m.releaseYear);
      }
    }
  }
  const tracked = entries.length || items.length;
  const pct = (n: number) => (tracked > 0 ? Math.round((n / tracked) * 100) : 0);

  const stats: IdentityStat = {
    tracked,
    rated: ratedCount || profile.ratedCount,
    favourites,
    avgRating: ratedCount ? Math.round((ratedSum / ratedCount) * 10) / 10 : 0,
    islands: clusters.filter((c) => c.members.length >= 2).length,
    era: minYear !== null && maxYear !== null ? { from: minYear, to: maxYear } : null,
    mix: {
      anime: pct(typeCount.anime),
      movie: pct(typeCount.movie),
      series: pct(typeCount.series),
      game: pct(typeCount.game),
      book: pct(typeCount.book),
      manga: pct(typeCount.manga),
      comics: pct(typeCount.comics),
    },
  };

  // ---- blend: top positive signals, shares over their own sum ----
  const positives = profile.features
    .filter((f) => f.score > 0.05 && (f.kind === "genre" || f.kind === "tag"))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const chosen = dedupeBySlug(positives).slice(0, 5);
  const blendSum = chosen.reduce((s, f) => s + f.score, 0) || 1;
  const blend: IdentityBlendRow[] = chosen.map((f) => ({
    slug: f.slug,
    label: vocabLabel(f.slug, lang),
    share: Math.max(4, Math.round((f.score / blendSum) * 100)),
    kind: f.kind,
  }));

  // ---- signature: stable code from the strongest features ----
  const sigSeed = chosen.map((f) => f.key).join("|") + `#${profile.ratedCount}#${tracked}`;
  const h = fnv1a(sigSeed).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const signature = `ATLAS·${(h + "XK27M").slice(0, 5)}`;

  return {
    archetype,
    archetypeStrength,
    stats,
    blend,
    ratingDist,
    confidence: profile.confidence,
    signature,
    generatedAt: new Date().toISOString(),
  };
}

/** keep the strongest signal per slug (genres and tags share one namespace) */
function dedupeBySlug(features: TasteFeatureStat[]): TasteFeatureStat[] {
  const seen = new Set<string>();
  const out: TasteFeatureStat[] = [];
  for (const f of features) {
    if (seen.has(f.slug)) continue;
    seen.add(f.slug);
    out.push(f);
  }
  return out;
}

/** Localized "generated on" label for the card footer. */
export function cardDateLabel(iso: string, lang: Language): string {
  const d = new Date(iso);
  const loc = lang === "ar" ? "ar-EG" : "en-GB";
  try {
    return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(d);
  } catch {
    return lang === "ar" ? `${d.getMonth() + 1}/${d.getFullYear()}` : `${d.getFullYear()}`;
  }
}
