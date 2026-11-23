/**
 * ECHO — Identity resolution tests (Phase 1 rules).
 * Pure logic, no network. Run: bun test src/lib/echo/__tests__
 *
 * Covers the Phase 1 requirements:
 *  - substring-based automatic matching is GONE
 *  - auto-link needs reliable evidence (external ids, or exact normalized
 *    title + compatible type + matching year + no ordinal conflicts)
 *  - ambiguous matches stay separate and are flagged for review
 */

import { describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import {
  evaluateMatch,
  matchCandidates,
  parseOrdinalMarkers,
  shareExternalId,
  strongTitleMatch,
} from "../providers/match";
import {
  crossProviderFixtures,
  editionFixtures,
  exactMatch,
  remakeFixtures,
  sameTitleUnrelated,
  seasonFixtures,
  substringFixtures,
  translationFixtures,
} from "./matchFixtures";

function manual(over: Partial<MediaItem> & { title: string }): MediaItem {
  return {
    localId: `manual:test-${over.title.toLowerCase().replace(/\s+/g, "-")}`,
    provider: "manual",
    providerId: over.title,
    mediaType: "movie",
    format: "film",
    genres: [],
    tags: [],
    ...over,
  };
}

function provider(over: Partial<MediaItem> & { title: string }): MediaItem {
  return {
    localId: over.localId ?? `imdb:tt${Math.abs(over.title.length * 7919)}`,
    provider: "imdb",
    providerId: "tt0000001",
    mediaType: "movie",
    format: "film",
    genres: [],
    tags: [],
    ...over,
  };
}

describe("strong title matching (no substrings)", () => {
  test("exact title matches", () => {
    expect(strongTitleMatch("Inception", "INCEPTION!")).toBe(true);
  });

  test("normalization ignores case, punctuation and accents", () => {
    expect(strongTitleMatch("Amélie  ", "amelie")).toBe(true);
  });

  test("leading articles are ignored", () => {
    expect(strongTitleMatch("The Wire", "Wire")).toBe(true);
  });

  test("a substring is NOT a strong match", () => {
    expect(strongTitleMatch("The Sinner", "The Sinner Season 3")).toBe(false);
    expect(strongTitleMatch("It", "It Chapter Two")).toBe(false);
  });

  test("unrelated titles never match", () => {
    expect(strongTitleMatch("That Obscure 90s OVA", "Titanic")).toBe(false);
  });
});

describe("season / volume / edition markers", () => {
  test("parses season numbers in several notations", () => {
    expect(parseOrdinalMarkers("The Wire Season 2").season).toBe(2);
    expect(parseOrdinalMarkers("Attack on Titan S2").season).toBe(2);
    expect(parseOrdinalMarkers("Show: Part II").season).toBe(2);
    expect(parseOrdinalMarkers("Plain Title").season).toBeUndefined();
  });

  test("parses volumes and editions", () => {
    expect(parseOrdinalMarkers("Berserk Vol. 3").volume).toBe(3);
    expect(parseOrdinalMarkers("Berserk Volume 12").volume).toBe(12);
    expect(parseOrdinalMarkers("Blade Runner (Director's Cut)").edition).toContain("director");
    expect(parseOrdinalMarkers("Blade Runner").edition).toBeUndefined();
  });
});

describe("external identity", () => {
  for (const f of crossProviderFixtures) {
    test(f.name, () => {
      expect(shareExternalId(f.a, f.b)).toBe(f.shareId);
    });
  }

  test("a record's own providerId counts as its external id", () => {
    const a = manual({ title: "X", externalIds: undefined });
    a.provider = "tvmaze";
    a.providerId = "169";
    const b = provider({ title: "Y", externalIds: { tvmaze: "169" }, localId: "x:1" });
    expect(shareExternalId(a, b)).toBe(true);
  });
});

describe("evaluateMatch — automatic-link gate", () => {
  test("exact title + same year + same type is a confident auto-link", () => {
    const v = evaluateMatch(exactMatch.manual, exactMatch.candidate);
    expect(v.verdict).toBe("auto-link");
  });

  test("type mismatch never matches", () => {
    const m = manual({ title: "Inception", mediaType: "movie", format: "film" });
    const c = provider({ title: "Inception", mediaType: "series", format: "series" });
    expect(evaluateMatch(m, c).verdict).toBe("reject");
  });

  test("unrelated titles never match", () => {
    const m = manual({ title: "That Obscure 90s OVA" });
    const c = provider({ title: "Titanic" });
    expect(evaluateMatch(m, c).verdict).toBe("reject");
  });

  test("conflicting years (remakes) reject even on exact titles", () => {
    const m = manual({ title: "The Ring", releaseYear: 1998 });
    const c = provider({ title: "The Ring", releaseYear: 2002 });
    expect(evaluateMatch(m, c).verdict).toBe("reject");
  });

  test("unknown year on one side does not block an exact-title auto-link", () => {
    const m = manual({ title: "Inception" });
    const c = provider({ title: "Inception", releaseYear: 2010 });
    expect(evaluateMatch(m, c).verdict).toBe("auto-link");
  });

  for (const f of seasonFixtures) {
    test(`seasons: ${f.name}`, () => {
      expect(evaluateMatch(f.manual, f.candidate).verdict === "auto-link").toBe(f.autoLinkable);
    });
  }

  for (const f of remakeFixtures) {
    test(`remakes: ${f.name}`, () => {
      expect(evaluateMatch(f.manual, f.candidate).verdict === "auto-link").toBe(f.autoLinkable);
    });
  }

  for (const f of editionFixtures) {
    test(`editions: ${f.name}`, () => {
      expect(evaluateMatch(f.manual, f.candidate).verdict === "auto-link").toBe(f.autoLinkable);
    });
  }

  for (const f of translationFixtures) {
    test(`translations: ${f.name}`, () => {
      expect(evaluateMatch(f.manual, f.candidate).verdict === "auto-link").toBe(f.autoLinkable);
    });
  }

  for (const f of substringFixtures) {
    test(`substring guard: ${f.name}`, () => {
      expect(evaluateMatch(f.manual, f.candidate).verdict === "auto-link").toBe(f.autoLinkable);
    });
  }
});

describe("ambiguity handling", () => {
  test("two distinct same-title works are candidates, never an auto-link pick", () => {
    const { manual: m, candidateA, candidateB } = sameTitleUnrelated;
    const vA = evaluateMatch(m, candidateA);
    const vB = evaluateMatch(m, candidateB);
    // both pass individually…
    expect(vA.verdict).toBe("auto-link");
    expect(vB.verdict).toBe("auto-link");
    // …but they are NOT the same work as each other
    expect(shareExternalId(candidateA, candidateB)).toBe(false);
    // so the picker must surface both, and findBestMatch (integration-tested
    // in search.test.ts) flags the entry instead of linking
    const ranked = matchCandidates(m, [candidateA, candidateB]);
    expect(ranked.length).toBe(2);
  });

  test("matchCandidates ranks the right hit first", () => {
    const m = manual({
      title: "Breaking Bad",
      releaseYear: 2008,
      mediaType: "series",
      format: "series",
    });
    const good = provider({
      title: "Breaking Bad",
      releaseYear: 2008,
      mediaType: "series",
      format: "series",
      localId: "tvmaze:1",
    });
    const weak = provider({
      title: "Breaking In",
      releaseYear: 2011,
      mediaType: "series",
      format: "series",
      localId: "tvmaze:2",
    });
    const ranked = matchCandidates(m, [weak, good]);
    expect(ranked[0].item.localId).toBe(good.localId);
    expect(ranked.length).toBeGreaterThan(0);
  });
});
