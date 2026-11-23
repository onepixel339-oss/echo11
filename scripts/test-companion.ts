// E2E test for the Taste Companion AI endpoint.
// Simulates a realistic Egyptian user's library snapshot (Arabic).
const snapshot = {
  lang: "ar",
  stats: {
    librarySize: 14,
    rated: 11,
    positive: 9,
    negative: 2,
    confidence: "tentative",
    mix: { anime: 5, movie: 7, series: 2 },
  },
  topGenres: [
    { label: "إثارة نفسية", sampleCount: 5 },
    { label: "جريمة", sampleCount: 4 },
    { label: "دراما", sampleCount: 4 },
    { label: "خيال علمي", sampleCount: 3 },
    { label: "أنمي — شونين", sampleCount: 2 },
  ],
  topTags: [
    { label: "مكيافيلي", sampleCount: 3 },
    { label: "نهاية صادمة", sampleCount: 3 },
    { label: "بطء مُتعمّد", sampleCount: 2 },
  ],
  negativeFeatures: [
    { label: "كوميديا رومانسية", sampleCount: 2, score: -1.2 },
    { label: "إسلاپستيك", sampleCount: 1, score: -0.9 },
  ],
  islands: [
    { label: "إثارة نفسية", size: 5, titles: ["Parasite", "Oldboy", "Zodiac", " Memories of Murder", "Se7en"] },
    { label: "خيال علمي", size: 3, titles: ["Blade Runner 2049", "Arrival", "Annihilation"] },
    { label: "أنمي — شونين", size: 3, titles: ["Hunter x Hunter", "Fullmetal Alchemist: Brotherhood", "Attack on Titan"] },
  ],
  recent: [
    { title: "Blade Runner 2049", rating: 5, status: "completed" },
    { title: "Zodiac", rating: 4, status: "completed" },
    { title: "Attack on Titan", rating: 5, status: "watching" },
    { title: "The Big Sick", rating: 2, status: "dropped" },
  ],
  favourites: ["Oldboy", "Hunter x Hunter", "Arrival"],
  ratingDist: [1, 1, 0, 3, 6],
};

async function main() {
  const started = Date.now();
  const res = await fetch("http://127.0.0.1:3000/api/echo/ai/companion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const ms = Date.now() - started;
  const data = await res.json();
  console.log("status:", res.status, "| time:", ms + "ms");
  console.log(JSON.stringify(data, null, 2));
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

export {};
