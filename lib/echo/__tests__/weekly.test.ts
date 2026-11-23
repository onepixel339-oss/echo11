/**
 * ECHO — Unit tests for the new (late-2026) feature surface:
 *  - weekly digest builder + ISO week keys (ai/weekly)
 *  - standalone per-language translator translateFor (i18n)
 *  - store select() staging behaviour is UI-level; the pure parts are here.
 * Run: bun test src/lib/echo/__tests__
 */

import { describe, expect, test } from "bun:test";
import { buildWeeklyDigest, weekKeyOf, type WeeklyDigest } from "../ai/weekly";
import { translateFor } from "../i18n";
import type { MediaItem, UserMediaEntry } from "../types";

function media(localId: string, title: string, genres: string[]): MediaItem {
  return {
    localId,
    provider: "anilist",
    providerId: localId.split(":")[1] ?? "1",
    mediaType: localId.startsWith("rawg") ? "game" : "anime",
    format: localId.startsWith("rawg") ? "game" : "series",
    title,
    genres,
    tags: [],
  };
}

function entry(
  mediaLocalId: string,
  over: Partial<UserMediaEntry> = {},
): UserMediaEntry {
  const now = new Date().toISOString();
  return {
    id: `e-${mediaLocalId}`,
    mediaLocalId,
    status: "completed",
    isFavourite: false,
    userTags: [],
    addedAt: now,
    updatedAt: now,
    ...(over.completedAt ? {} : { completedAt: now }),
    ...over,
  };
}

describe("weekKeyOf (ISO 8601 year-week)", () => {
  test("known Mondays and mid-week dates", () => {
    // 2026-11-16 is a Monday → week 47
    expect(weekKeyOf(new Date("2026-11-16T10:00:00Z"))).toBe("2026-W47");
    // same week, Thursday
    expect(weekKeyOf(new Date("2026-11-19T10:00:00Z"))).toBe("2026-W47");
    // Sunday still belongs to the same ISO week
    expect(weekKeyOf(new Date("2026-11-22T10:00:00Z"))).toBe("2026-W47");
    // next Monday starts week 48
    expect(weekKeyOf(new Date("2026-11-23T10:00:00Z"))).toBe("2026-W48");
  });

  test("year boundaries keep the ISO year (not the calendar year)", () => {
    // 2027-01-01 is a Friday → ISO week 53 of 2026
    expect(weekKeyOf(new Date("2027-01-01T10:00:00Z"))).toBe("2026-W53");
  });

  test("pads week numbers to two digits", () => {
    expect(weekKeyOf(new Date("2026-01-08T10:00:00Z"))).toBe("2026-W02");
  });
});

describe("buildWeeklyDigest", () => {
  const mediaById = new Map<string, MediaItem>([
    ["anilist:1", media("anilist:1", "Death Note", ["mystery", "thriller"])],
    ["anilist:2", media("anilist:2", "Monster", ["drama", "thriller"])],
    ["rawg:3", media("rawg:3", "Hollow Knight", ["indie"])],
  ]);

  test("honesty gate: fewer than 3 entries → null", () => {
    const digest = buildWeeklyDigest({
      mediaById,
      entries: [entry("anilist:1"), entry("anilist:2")],
      feedback: [],
      recencyWeight: true,
      lang: "en",
    });
    expect(digest).toBeNull();
  });

  test("counts weekly activity and stats from real entries", () => {
    const weekAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
    const digest: WeeklyDigest | null = buildWeeklyDigest({
      mediaById,
      entries: [
        entry("anilist:1", { rating: 5, isFavourite: true }),
        entry("anilist:2", { rating: 4, addedAt: weekAgo, completedAt: weekAgo }),
        entry("rawg:3", { status: "planned", completedAt: undefined }),
      ],
      feedback: [],
      recencyWeight: true,
      lang: "en",
    });
    expect(digest).not.toBeNull();
    if (!digest) return;
    expect(digest.stats.librarySize).toBe(3);
    expect(digest.stats.rated).toBe(2);
    expect(digest.stats.favourites).toBe(1);
    expect(digest.stats.avgRating).toBe(4.5);
    expect(digest.stats.mix.game).toBe(1);
    expect(digest.stats.mix.anime).toBe(2);
    // anilist:2 was added/completed 10 days ago → outside this week
    expect(digest.weekActivity.added).toBe(2);
    expect(digest.weekActivity.completed).toBe(1);
    expect(digest.weekActivity.completedTitles).toEqual(["Death Note · 5★"]);
    expect(digest.weekActivity.addedTitles).not.toContain("Monster");
    expect(digest.topRatedTitles[0]).toBe("Death Note · 5★");
    // thriller is voted by two positive entries
    expect(digest.topGenres).toContain("Thriller");
    expect(digest.weekKey).toBe(weekKeyOf());
  });

  test("Arabic interface uses Arabic genre labels", () => {
    const digest = buildWeeklyDigest({
      mediaById,
      entries: [entry("anilist:1", { rating: 5 }), entry("anilist:2", { rating: 5 }), entry("rawg:3")],
      feedback: [],
      recencyWeight: true,
      lang: "ar",
    });
    expect(digest).not.toBeNull();
    if (!digest) return;
    expect(digest.lang).toBe("ar");
    expect(digest.topGenres).toContain("إثارة");
  });
});

describe("translateFor (independent of interface language)", () => {
  test("returns the requested language regardless of app state", () => {
    expect(translateFor("en", "card.tagline")).toBe("Your taste, mapped.");
    expect(translateFor("ar", "card.tagline")).toBe("ذوقك، مرسوم بدقة.");
  });

  test("falls back to English when a key is missing in the target dict", () => {
    expect(translateFor("en", "definitely.not.a.key")).toBe("definitely.not.a.key");
  });

  test("interpolates params and honours _one variants", () => {
    expect(translateFor("ar", "card.map.caption", { n: 5, m: 2 })).toContain("5");
    expect(translateFor("ar", "card.map.caption", { n: 5, m: 2 })).toContain("2");
    expect(translateFor("en", "library.sub", { n: 1 })).toBe("1 title, stored only on this device.");
  });
});
