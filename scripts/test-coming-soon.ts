/**
 * Live test for the "coming soon" shelf + weekly digest + ESRB gate.
 * Run: npx tsx scripts/test-coming-soon.ts
 */

import { rawgUpcoming, rawgByGenre } from "../src/lib/echo/providers/rawg";
import { AniListProvider } from "../src/lib/echo/providers/anilist";
import { fetchComingSoon } from "../src/lib/echo/providers/index";
import { buildWeeklyDigest, weekKeyOf } from "../src/lib/echo/ai/weekly";
import type { MediaItem, UserMediaEntry } from "../src/lib/echo/types";

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // ---- RAWG upcoming games ----
  console.log("=== RAWG upcoming (moderate) ===");
  const upcoming = await rawgUpcoming(12, "moderate");
  console.log(`count=${upcoming.length}`);
  for (const g of upcoming.slice(0, 5)) {
    console.log(
      `- ${g.title} · ${g.releaseDate} · esrb=${g.contentRating ?? "—"} · future=${(g.releaseDate ?? "") > today}`,
    );
  }
  const allFuture = upcoming.every((g) => (g.releaseDate ?? "") > today);
  console.log("all strictly upcoming:", allFuture);

  // ---- ESRB visibility gate ----
  console.log("\n=== ESRB gate sanity ===");
  const horrorPool = await rawgByGenre("horror", 20, "safe");
  const hasMature = horrorPool.some((g) => g.contentRating === "Mature" || g.contentRating === "Adults Only");
  console.log(`horror pool (safe): count=${horrorPool.length}, has Mature/AO=${hasMature} (expect false)`);
  const moderatePool = await rawgByGenre("horror", 20, "moderate");
  const moderateAO = moderatePool.some((g) => g.contentRating === "Adults Only");
  console.log(`horror pool (moderate): count=${moderatePool.length}, has AO=${moderateAO} (expect false)`);

  // ---- AniList airing now ----
  console.log("\n=== AniList airing now ===");
  const airing = await new AniListProvider().airingNow(12, false);
  console.log(`count=${airing.length}`);
  for (const a of airing.slice(0, 5)) {
    console.log(`- ${a.title} (${a.releaseYear ?? "?"}) · ${a.genres.slice(0, 3).join(", ")}`);
  }
  const noneAdult = airing.every((a) => a.contentRating !== "18+");
  console.log("no adult flags:", noneAdult);

  // ---- combined shelf ----
  console.log("\n=== fetchComingSoon (anime+game, moderate) ===");
  const shelf = await fetchComingSoon({ mediaTypes: ["anime", "game"], visibility: "moderate", limitPerShelf: 10 });
  console.log(`games=${shelf.games.length} airingAnime=${shelf.airingAnime.length}`);

  // cache-hit timing (second call must be instant)
  const t0 = Date.now();
  const shelf2 = await fetchComingSoon({ mediaTypes: ["anime", "game"], visibility: "moderate", limitPerShelf: 10 });
  console.log(`cached second call: ${Date.now() - t0}ms, games=${shelf2.games.length}`);

  // ---- weekly digest builder (pure, deterministic) ----
  console.log("\n=== weekly digest builder ===");
  console.log("weekKeyOf(now):", weekKeyOf());
  console.log("weekKeyOf(2026-11-21):", weekKeyOf(new Date("2026-11-21T12:00:00Z")));
  console.log("weekKeyOf(2027-01-01):", weekKeyOf(new Date("2027-01-01T12:00:00Z")));

  const mediaById = new Map<string, MediaItem>();
  const media: MediaItem[] = [
    {
      localId: "anilist:1", provider: "anilist", providerId: "1", mediaType: "anime", format: "series",
      title: "Death Note", genres: ["mystery", "thriller"], tags: [],
    },
    {
      localId: "imdb:2", provider: "imdb", providerId: "2", mediaType: "movie", format: "film",
      title: "Inception", genres: ["sci-fi"], tags: [],
    },
    {
      localId: "rawg:3", provider: "rawg", providerId: "3", mediaType: "game", format: "game",
      title: "Hollow Knight", genres: ["indie"], tags: [],
    },
  ];
  for (const m of media) mediaById.set(m.localId, m);
  const nowIso = new Date().toISOString();
  const entries: UserMediaEntry[] = [
    { id: "e1", mediaLocalId: "anilist:1", status: "completed", rating: 5, isFavourite: true, userTags: [], addedAt: nowIso, updatedAt: nowIso, completedAt: nowIso },
    { id: "e2", mediaLocalId: "imdb:2", status: "watching", rating: 4, isFavourite: false, userTags: [], addedAt: nowIso, updatedAt: nowIso },
    { id: "e3", mediaLocalId: "rawg:3", status: "planned", isFavourite: false, userTags: [], addedAt: nowIso, updatedAt: nowIso },
  ];
  const digest = buildWeeklyDigest({ mediaById, entries, feedback: [], recencyWeight: true, lang: "ar" });
  console.log("digest null?", digest === null);
  if (digest) {
    console.log(JSON.stringify(digest, null, 2).slice(0, 900));
  }

  // too few entries → null (honesty gate)
  const tiny = buildWeeklyDigest({ mediaById, entries: entries.slice(0, 2), feedback: [], recencyWeight: true, lang: "ar" });
  console.log("2-entry digest is null:", tiny === null, "(expect true)");

  console.log("\nALL COMING-SOON / WEEKLY CHECKS DONE");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
