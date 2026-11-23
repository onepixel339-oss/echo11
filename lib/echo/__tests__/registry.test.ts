/**
 * ECHO — Provider registry & license-gate tests.
 * Pure logic, no network. Run: bun test src/lib/echo/__tests__
 *
 * Phase 1 requirements covered:
 *  - DEFAULT-DENY: unknown providers are never enabled
 *  - IMDb suggestions / Cinemeta / Kitsu ship disabled
 *  - RAWG ships without an embedded key (env-provided only)
 *  - hard-gated providers cannot be toggled on by users
 *  - user enable/disable behaviour + no silent unverified substitution
 *  - storage restrictions (AniList catalog data is never persistable)
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  PROVIDER_REGISTRY,
  canPersistCatalogData,
  isProviderEnabled,
  isProviderUserToggleable,
  listProviderRegistry,
  normalizeUserToggle,
  providerCacheTtlMs,
  providerEntry,
  refreshGateIdsForPrefix,
  setProviderToggles,
} from "../providers/registry";
import { rawgKeyConfigured } from "../providers/rawg";

afterEach(() => {
  setProviderToggles(null); // reset to registry defaults after every test
});

describe("registry shape — every entry carries the required fields", () => {
  test("the registry is non-empty and stable", () => {
    const ids = listProviderRegistry().map((e) => e.id);
    expect(ids).toEqual([
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
    ]);
  });

  for (const entry of Object.values(PROVIDER_REGISTRY)) {
    test(`${entry.id}: has name, content types, operations, license, commercial status, storage, redistribution, attribution, terms URL, verification date, switch`, () => {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.serves.length).toBeGreaterThan(0);
      expect(entry.operations.length).toBeGreaterThan(0);
      expect(["approved", "restricted", "unverified", "pending"]).toContain(entry.licenseStatus);
      expect(["permitted", "prohibited", "unverified"]).toContain(entry.commercialUse);
      expect(entry.storage).toHaveProperty("persistCatalogData");
      expect(typeof entry.redistribution).toBe("boolean");
      // CC0 sources (wikidata) legally require no attribution — the flag
      // records the actual license obligation, and the chip is shown anyway
      expect(typeof entry.attribution.required).toBe("boolean");
      expect(entry.attribution.notice.length).toBeGreaterThan(0);
      expect(entry.termsUrl.startsWith("http")).toBe(true);
      expect(entry.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.defaultEnabled).toBe("boolean");
      expect(typeof entry.userToggleable).toBe("boolean");
    });
  }

  test("wikidata (CC0): approved, permitted for commercial use, persistable, redistributable, attribution not required", () => {
    const wd = providerEntry("wikidata")!;
    expect(wd.licenseStatus).toBe("approved");
    expect(wd.commercialUse).toBe("permitted");
    expect(wd.storage.persistCatalogData).toBe(true);
    expect(wd.redistribution).toBe(true);
    expect(wd.attribution.required).toBe(false); // CC0 — no legal obligation
    expect(wd.serves).toEqual(["anime", "movie", "series", "game", "book", "manga", "comics"]);
    expect(wd.termsUrl).toBe("https://www.wikidata.org/wiki/Wikidata:Licensing");
    expect(isProviderEnabled("wikidata")).toBe(true); // enabled by default
  });

  test("anilist serves anime AND manga under the same restricted posture", () => {
    const anilist = providerEntry("anilist")!;
    expect(anilist.serves).toEqual(["anime", "manga"]);
    expect(anilist.storage.persistCatalogData).toBe(false);
  });

  test("echo-demo serves all seven content types as approved local coverage", () => {
    const demo = providerEntry("echo-demo")!;
    expect(demo.serves).toEqual(["anime", "movie", "series", "game", "book", "manga", "comics"]);
    expect(demo.licenseStatus).toBe("approved");
  });
});

describe("default-deny license gate", () => {
  test("unknown provider ids are NEVER enabled (default-deny)", () => {
    expect(isProviderEnabled("tmdb")).toBe(false);
    expect(isProviderEnabled("")).toBe(false);
    expect(isProviderEnabled("something-new")).toBe(false);
    expect(providerEntry("tmdb")).toBeNull();
  });

  test("IMDb suggestions ship DISABLED by default", () => {
    expect(isProviderEnabled("imdb")).toBe(false);
  });

  test("Cinemeta/metahub ships DISABLED by default", () => {
    expect(isProviderEnabled("cinemeta")).toBe(false);
  });

  test("Kitsu ships HARD-DISABLED pending data-use verification", () => {
    expect(isProviderEnabled("kitsu")).toBe(false);
    expect(PROVIDER_REGISTRY.kitsu.hardDisabled).toBe(true);
    expect(PROVIDER_REGISTRY.kitsu.userToggleable).toBe(false);
  });

  test("approved/restricted interactive providers ship enabled", () => {
    expect(isProviderEnabled("anilist")).toBe(true);
    expect(isProviderEnabled("tvmaze")).toBe(true);
    expect(isProviderEnabled("openlib")).toBe(true);
    expect(isProviderEnabled("echo-demo")).toBe(true);
  });

  test("RAWG is registry-enabled but has NO key without the environment variable", () => {
    expect(isProviderEnabled("rawg")).toBe(true);
    // no NEXT_PUBLIC_RAWG_API_KEY in the test environment → not configured,
    // so the router never queues RAWG jobs despite the registry allow
    if (!process.env.NEXT_PUBLIC_RAWG_API_KEY) {
      expect(rawgKeyConfigured()).toBe(false);
    }
  });

  test("manual records (user's own data) always pass the gate", () => {
    expect(isProviderEnabled("manual")).toBe(true);
  });
});

describe("enable/disable behaviour", () => {
  test("a user can switch IMDb back on (it is unverified but user-toggleable)", () => {
    setProviderToggles({ imdb: true });
    expect(isProviderEnabled("imdb")).toBe(true);
  });

  test("a user can switch an enabled provider off", () => {
    setProviderToggles({ anilist: false });
    expect(isProviderEnabled("anilist")).toBe(false);
  });

  test("toggles for unknown providers are ignored by the gate", () => {
    setProviderToggles({ tmdb: true });
    expect(isProviderEnabled("tmdb")).toBe(false);
  });

  test("hard-gated Kitsu can NEVER be toggled on", () => {
    setProviderToggles({ kitsu: true });
    expect(isProviderEnabled("kitsu")).toBe(false);
    expect(normalizeUserToggle("kitsu", true)).toBeNull();
    expect(isProviderUserToggleable("kitsu")).toBe(false);
  });

  test("normalizeUserToggle refuses unknown providers", () => {
    expect(normalizeUserToggle("tmdb", true)).toBeNull();
  });

  test("normalizeUserToggle stores the effective value for toggleable providers", () => {
    expect(normalizeUserToggle("imdb", true)).toEqual({ id: "imdb", enabled: true });
    expect(normalizeUserToggle("anilist", false)).toEqual({ id: "anilist", enabled: false });
  });

  test("toggling one provider never silently enables another", () => {
    setProviderToggles({ imdb: true });
    // enabling IMDb must not flip Cinemeta (its own registry entry decides)
    expect(isProviderEnabled("cinemeta")).toBe(false);
    setProviderToggles({ anilist: false });
    // disabling AniList must not enable Kitsu as a substitute
    expect(isProviderEnabled("kitsu")).toBe(false);
  });
});

describe("storage restrictions", () => {
  test("AniList catalog data must never be persisted (no catalogue mirror, no bulk collection)", () => {
    expect(canPersistCatalogData("anilist")).toBe(false);
  });

  test("every real provider restricts catalog persistence except the ECHO sample catalogue", () => {
    expect(canPersistCatalogData("kitsu")).toBe(false);
    expect(canPersistCatalogData("tvmaze")).toBe(false);
    expect(canPersistCatalogData("imdb")).toBe(false);
    expect(canPersistCatalogData("cinemeta")).toBe(false);
    expect(canPersistCatalogData("rawg")).toBe(false);
    expect(canPersistCatalogData("openlib")).toBe(false);
    expect(canPersistCatalogData("echo-demo")).toBe(true); // original ECHO data
    expect(canPersistCatalogData("manual")).toBe(true); // user's own records
    expect(canPersistCatalogData("tmdb")).toBe(false); // unknown → deny
  });

  test("session caches are permitted with registry-capped TTLs", () => {
    expect(PROVIDER_REGISTRY.anilist.storage.sessionCache).toBe(true);
    expect(providerCacheTtlMs("anilist")).toBeGreaterThan(0);
    expect(providerCacheTtlMs("tmdb")).toBe(0); // unknown provider → no caching
  });
});

describe("localId prefix → gate mapping", () => {
  test("IMDb record refresh needs Cinemeta alone", () => {
    expect(refreshGateIdsForPrefix("imdb")).toEqual(["cinemeta"]);
    expect(refreshGateIdsForPrefix("imdb-series")).toEqual(["cinemeta"]);
  });

  test("each provider prefix maps to itself for refresh", () => {
    expect(refreshGateIdsForPrefix("anilist")).toEqual(["anilist"]);
    expect(refreshGateIdsForPrefix("tvmaze")).toEqual(["tvmaze"]);
    expect(refreshGateIdsForPrefix("rawg")).toEqual(["rawg"]);
    expect(refreshGateIdsForPrefix("openlib")).toEqual(["openlib"]);
  });

  test("unknown prefixes map to nothing (deny)", () => {
    expect(refreshGateIdsForPrefix("tmdb")).toEqual([]);
    expect(refreshGateIdsForPrefix("weird")).toEqual([]);
  });
});

describe("RAWG embedded key removal", () => {
  test("no API key literal ships in the RAWG adapter source", async () => {
    const source = await Bun.file("src/lib/echo/providers/rawg.ts").text();
    // the previously embedded 32-hex-char key must not appear anywhere
    expect(source).not.toContain("891771e3867e44fba54f16d4b411b1b3");
    // and no other hardcoded 32-hex token is present either
    expect(/[\"']([0-9a-f]{32})[\"']/.test(source)).toBe(false);
  });
});
