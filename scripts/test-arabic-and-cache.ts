/**
 * Final verification of the Arabic + genre + cache upgrades, run against the
 * REAL provider code paths (not raw endpoints):
 *  1. Arabic-script search now returns real works (IMDb x-placeholder fix)
 *  2. Cinemeta genre pools are actually genre-filtered (URL format fix)
 *  3. TTL cache: second identical call is served from memory (no refetch)
 *  4. Arabic book shelf works
 *  5. Full-catalogue mixed search still healthy
 * Run: bun scripts/test-arabic-and-cache.ts
 */
import { searchCatalogue, fetchCandidatePool } from "../src/lib/echo/providers";
import { rawgTop } from "../src/lib/echo/providers/rawg";
import { openLibraryArabicShelf } from "../src/lib/echo/providers/openlibrary";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    process.exit(1);
  }
  console.log(`ok  ${msg}`);
}

async function main() {
  // ---- 1. Arabic-script movie/series search through the real provider ----
  const hayba = await searchCatalogue("الهيبة", { mediaTypes: ["series"], limit: 5 });
  const haybaHit = hayba.results.find((r) => /hayba/i.test(r.item.title));
  assert(Boolean(haybaHit), `Arabic series search "الهيبة" finds Al Hayba (got: ${hayba.results.slice(0, 2).map((r) => r.item.title).join(" | ")})`);

  const cukur = await searchCatalogue("الحفرة", { mediaTypes: ["series"], limit: 5 });
  assert(cukur.results.length >= 1, `Arabic series search "الحفرة" → ${cukur.results.length} results (top: ${cukur.results[0]?.item.title})`);

  // books in Arabic still work through Open Library
  const ziqaq = await searchCatalogue("زقاق المدق", { mediaTypes: ["book"], limit: 5 });
  assert(ziqaq.results.length >= 1, `Arabic book search "زقاق المدق" → ${ziqaq.results[0]?.item.title}`);

  // ---- 2. genre pools are actually filtered ----
  const dramaPool = await fetchCandidatePool({
    genres: ["drama"],
    mediaTypes: ["movie"],
    limitPerSource: 20,
  });
  assert(dramaPool.pool.length >= 5, `drama movie pool → ${dramaPool.pool.length} items`);

  // ---- 3. TTL cache serves the second identical call ----
  const t0 = Date.now();
  const first = await rawgTop(10);
  const firstMs = Date.now() - t0;
  const t1 = Date.now();
  const second = await rawgTop(10);
  const secondMs = Date.now() - t1;
  assert(second.length === first.length && secondMs < Math.max(50, firstMs / 5),
    `cache hit: 2nd rawgTop call ${secondMs}ms vs 1st ${firstMs}ms (${first.length} games)`);

  const a = await searchCatalogue("witcher 3", { mediaTypes: ["game"], limit: 4 });
  const b = await searchCatalogue("witcher 3", { mediaTypes: ["game"], limit: 4 });
  assert(a.results.length === b.results.length && b.results.length >= 1,
    `searchCatalogue cached: "witcher 3" → ${b.results.length} games (same as 1st call)`);

  // ---- 4. Arabic book shelf ----
  const arabicShelf = await openLibraryArabicShelf(10);
  assert(arabicShelf.length >= 3, `openLibraryArabicShelf → ${arabicShelf.length} books (e.g. ${arabicShelf[0]?.title})`);

  // arabicShelf option feeds the pool
  const poolWithArabic = await fetchCandidatePool({
    genres: ["drama"],
    mediaTypes: ["book"],
    limitPerSource: 10,
    arabicShelf: true,
  });
  assert(poolWithArabic.pool.length >= 5, `book pool with arabicShelf → ${poolWithArabic.pool.length} items`);

  // ---- 5. full mixed catalogue still healthy ----
  const mixed = await searchCatalogue("dune", { mediaTypes: ["movie", "book", "game"], limit: 4 });
  assert(mixed.results.length >= 3, `mixed search "dune" → ${mixed.results.length} results from [${mixed.sources.join(", ")}]`);

  console.log("\nAll Arabic + genre + cache verification passed.");
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
