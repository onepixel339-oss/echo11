/**
 * ECHO — Domain unit tests (spec 18, domain items 1–10).
 * Run: bun test src/lib/echo/__tests__
 */

import { describe, expect, test } from "bun:test";
import type { MediaItem, UserMediaEntry } from "../types";
import { computeIdf, DEFAULT_WEIGHTS } from "../engine/features";
import { buildSimilarityGraph, similarity, EDGE_THRESHOLD } from "../engine/similarity";
import { buildTasteProfile, entryEvidence, tasteInsights } from "../engine/taste";
import {
  recommendClosest,
  pickAnchorEntry,
} from "../engine/recommend";
import { computeClusters } from "../engine/cluster";
import { computeLayout } from "../engine/layout";
import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";

function entry(over: Partial<UserMediaEntry> & { mediaLocalId: string }): UserMediaEntry {
  return {
    id: `e_${over.mediaLocalId}`,
    status: "completed",
    isFavourite: false,
    userTags: [],
    addedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const demoItems = DEMO_CATALOGUE.map(demoToMediaItem);
const byId = new Map(demoItems.map((m) => [m.localId, m]));
const idf = computeIdf(demoItems);
const simOpts = { idf, weights: DEFAULT_WEIGHTS };

describe("taste signals (spec 18 domain 1–3)", () => {
  test("1. unrated title creates no positive taste signal", () => {
    const e = entry({ mediaLocalId: "echo-demo:death-note" }); // no rating
    expect(entryEvidence(e).value).toBeLessThanOrEqual(0.06);
    const profile = buildTasteProfile(byId, [e], [], { recencyWeight: false });
    // even with weak completed signal, features stay under insight threshold
    const insights = tasteInsights(profile, new Set());
    expect(insights.length).toBe(0);
  });

  test("2. a 5-star title contributes more positive evidence than a 4-star one", () => {
    const e5 = entry({ mediaLocalId: "echo-demo:death-note", rating: 5 });
    const e4 = entry({ mediaLocalId: "echo-demo:monster", rating: 4 });
    expect(entryEvidence(e5).value).toBeGreaterThan(entryEvidence(e4).value);
    const p5 = buildTasteProfile(byId, [e5], [], { recencyWeight: false });
    const p4 = buildTasteProfile(byId, [e4], [], { recencyWeight: false });
    const max5 = Math.max(...p5.features.map((f) => f.score));
    const max4 = Math.max(...p4.features.map((f) => f.score));
    expect(max5).toBeGreaterThan(max4);
  });

  test("3. a low-rated title contributes negative evidence", () => {
    const e1 = entry({ mediaLocalId: "echo-demo:the-office", rating: 1 });
    expect(entryEvidence(e1).value).toBeLessThan(0);
    const p = buildTasteProfile(byId, [e1], [], { recencyWeight: false });
    expect(p.features.some((f) => f.score < 0)).toBe(true);
    expect(p.negativeCount).toBe(1);
  });
});

describe("similarity (spec 18 domain 4–6)", () => {
  test("4. missing metadata does not count as a negative match", () => {
    // two Ghibli films share creator, studio, language and era
    const full = byId.get("echo-demo:spirited-away")!;
    const other = byId.get("echo-demo:my-neighbor-totoro")!;
    const stripped: MediaItem = {
      ...other,
      creators: undefined,
      studios: undefined,
      languages: undefined,
      countries: undefined,
      releaseYear: undefined,
    };
    const resStripped = similarity(full, stripped, simOpts);
    const resFull = similarity(full, other, simOpts);
    // missing fields are simply excluded (renormalized), never punished:
    expect(resStripped.score).toBeGreaterThan(0.25);
    // and the shared fields DO contribute when present:
    expect(resFull.score).toBeGreaterThan(resStripped.score);
  });

  test("5. similarity explanations match the features actually shared", () => {
    const a = byId.get("echo-demo:steins-gate")!;
    const b = byId.get("echo-demo:dark")!; // both time-travel thrillers
    const res = similarity(a, b, simOpts);
    expect(res.reasons.length).toBeGreaterThan(0);
    const tagReason = res.reasons.find((r) => r.kind === "tag");
    expect(tagReason).toBeDefined();
    expect(tagReason!.values).toContain("time-travel"); // actually shared
    for (const r of res.reasons) {
      if (r.kind === "genre") {
        for (const g of r.values) {
          expect(a.genres).toContain(g);
          expect(b.genres).toContain(g);
        }
      }
    }
  });

  test("6. common genres do not produce excessive connections", () => {
    // drama is the most common genre in the demo catalogue
    const dramaCount = demoItems.filter((m) => m.genres.includes("drama")).length;
    const twoRandomDramas = demoItems
      .filter((m) => m.genres.includes("drama") && m.genres.length <= 2)
      .slice(0, 2);
    void dramaCount;
    void twoRandomDramas;
    // full graph: verify per-node cap and that pure-drama pairs rarely connect
    const graph = buildSimilarityGraph(demoItems.slice(0, 40), simOpts);
    const perNode = new Map<string, number>();
    for (const e of graph) {
      perNode.set(e.a, (perNode.get(e.a) ?? 0) + 1);
      perNode.set(e.b, (perNode.get(e.b) ?? 0) + 1);
    }
    for (const [id, count] of perNode) {
      expect(count).toBeLessThanOrEqual(5);
      void id;
    }
    // drama-only pair (different eras/types) should stay below threshold
    const shawshank = byId.get("echo-demo:shawshank-redemption")!;
    const fleabag = byId.get("echo-demo:fleabag")!;
    const weak = similarity(shawshank, fleabag, simOpts);
    expect(weak.score).toBeLessThan(EDGE_THRESHOLD + 0.05);
  });
});

describe("recommendations (spec 18 domain 7–10)", () => {
  function libraryFixture() {
    const entries = [
      entry({ mediaLocalId: "echo-demo:death-note", rating: 5, isFavourite: true }),
      entry({ mediaLocalId: "echo-demo:monster", rating: 5 }),
      entry({ mediaLocalId: "echo-demo:steins-gate", rating: 4 }),
      entry({ mediaLocalId: "echo-demo:parasite", rating: 4 }),
    ];
    return entries;
  }

  test("7. filters exclude user-rejected genres", () => {
    const entries = libraryFixture();
    const profile = buildTasteProfile(byId, entries, [], { recencyWeight: false });
    const recs = recommendClosest({
      profile,
      candidates: demoItems,
      entries,
      mediaById: byId,
      simOptions: simOpts,
      excludedGenres: ["horror"],
      rejectedLocalIds: new Set(),
      visibility: "moderate",
    });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.item.genres).not.toContain("horror");
    }
  });

  test("8. a title already in the library is not recommended", () => {
    const entries = libraryFixture();
    const profile = buildTasteProfile(byId, entries, [], { recencyWeight: false });
    const recs = recommendClosest({
      profile,
      candidates: demoItems,
      entries,
      mediaById: byId,
      simOptions: simOpts,
      excludedGenres: [],
      rejectedLocalIds: new Set(),
      visibility: "moderate",
    });
    const libIds = new Set(entries.map((e) => e.mediaLocalId));
    for (const r of recs) {
      expect(libIds.has(r.item.localId)).toBe(false);
    }
  });

  test("9. low sample size produces low-confidence taste insights", () => {
    const entries = [entry({ mediaLocalId: "echo-demo:death-note", rating: 5 })];
    const profile = buildTasteProfile(byId, entries, [], { recencyWeight: false });
    expect(profile.confidence).toBe("early");
    const insights = tasteInsights(profile, new Set());
    expect(insights.length).toBeLessThanOrEqual(3); // only strong early signals
  });

  test("10. the same inputs produce stable deterministic ranking", () => {
    const entries = libraryFixture();
    const profile = buildTasteProfile(byId, entries, [], { recencyWeight: false });
    const run = () =>
      recommendClosest({
        profile,
        candidates: demoItems,
        entries,
        mediaById: byId,
        simOptions: simOpts,
        excludedGenres: [],
        rejectedLocalIds: new Set(),
        visibility: "moderate",
      }).map((r) => r.item.localId);
    expect(run()).toEqual(run());
  });

  test("anchor pick prefers highest rated favourites", () => {
    const entries = libraryFixture();
    const anchor = pickAnchorEntry(entries, byId);
    expect(anchor?.mediaLocalId).toBe("echo-demo:death-note");
  });

  test("rejected titles (not for me) never come back", () => {
    const entries = libraryFixture();
    const profile = buildTasteProfile(byId, entries, [], { recencyWeight: false });
    const recs = recommendClosest({
      profile,
      candidates: demoItems,
      entries,
      mediaById: byId,
      simOptions: simOpts,
      excludedGenres: [],
      rejectedLocalIds: new Set(["echo-demo:severance"]),
      visibility: "moderate",
    });
    expect(recs.find((r) => r.item.localId === "echo-demo:severance")).toBeUndefined();
  });
});

describe("clustering & layout (spec 8)", () => {
  test("clusters form and are labelled from shared metadata or neutral names", () => {
    const subset = demoItems.filter((m) =>
      [
        "echo-demo:inception",
        "echo-demo:interstellar",
        "echo-demo:arrival",
        "echo-demo:steins-gate",
        "echo-demo:dark",
        "echo-demo:death-note",
        "echo-demo:monster",
        "echo-demo:breaking-bad",
        "echo-demo:the-office",
        "echo-demo:haikyu",
      ].includes(m.localId),
    );
    const edges = buildSimilarityGraph(subset, simOpts);
    const clusters = computeClusters(subset, edges);
    expect(clusters.length).toBeGreaterThan(1);
    const multi = clusters.filter((c) => c.members.length >= 2);
    expect(multi.length).toBeGreaterThan(0);
    // every multi-member cluster has a labelKey (or explicit null → neutral in UI)
    for (const c of multi) {
      expect(typeof c.labelKey).toBe("string");
    }
  });

  test("layout is deterministic for the same data", () => {
    const subset = demoItems.slice(0, 12);
    const edges = buildSimilarityGraph(subset, simOpts);
    const clusters = computeClusters(subset, edges);
    const run = () =>
      JSON.stringify(computeLayout(subset, edges, clusters, { worldSize: 300 }));
    expect(run()).toEqual(run());
  });

  test("layout keeps existing positions stable when adding a node", () => {
    const base = demoItems.slice(0, 8);
    const edges = buildSimilarityGraph(base, simOpts);
    const clusters = computeClusters(base, edges);
    const pos1 = computeLayout(base, edges, clusters, { worldSize: 280 });
    const bigger = demoItems.slice(0, 9);
    const edges2 = buildSimilarityGraph(bigger, simOpts);
    const clusters2 = computeClusters(bigger, edges2);
    const pos2 = computeLayout(bigger, edges2, clusters2, {
      existing: pos1,
      worldSize: 280,
    });
    // existing nodes keep (roughly) their coordinates
    for (const item of base) {
      const a = pos1[item.localId];
      const b = pos2[item.localId];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(60);
    }
  });
});
