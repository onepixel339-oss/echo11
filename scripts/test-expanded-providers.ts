/**
 * Live smoke test for the expanded catalogue: Open Library (books, keyless)
 * and RAWG (games — live out of the box via the built-in project key).
 * Run: bun scripts/test-expanded-providers.ts
 */
import { OpenLibraryProvider, openLibrarySubject, openLibraryTrending } from "../src/lib/echo/providers/openlibrary";
import { RawgProvider, rawgByGenre, rawgKeyConfigured } from "../src/lib/echo/providers/rawg";
import { searchCatalogue, fetchCandidatePool } from "../src/lib/echo/providers";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  // ---- Open Library: search ----
  const ol = new OpenLibraryProvider();
  const dune = await ol.search("dune", { limit: 6 });
  assert(dune.length >= 3, `OL search "dune" → ${dune.length} results`);
  const first = dune[0].item;
  assert(first.mediaType === "book" && first.format === "book", "OL item is a book");
  assert(first.localId.startsWith("openlib:"), `localId prefix (${first.localId})`);
  assert(first.genres.length >= 1, `genres mapped: [${first.genres.join(", ")}]`);
  assert(
    !first.genres.some((g) => g.includes("daisy") || g.includes("accessible")),
    "no cataloguing junk in genres",
  );
  console.log(`  → ${first.title} (${first.releaseYear}) by ${first.creators?.join(", ")} · ${first.genres.join("/")}`);

  // ---- Open Library: title refresh ----
  const refreshed = await ol.getTitle(first.providerId);
  assert(Boolean(refreshed?.title), `OL getTitle refresh works (${refreshed?.title})`);
  assert(Boolean(refreshed?.synopsis), "OL getTitle carries a synopsis");
  assert(Boolean(refreshed?.posterUrl), `cover url: ${refreshed?.posterUrl?.slice(0, 60)}…`);

  // ---- Open Library: subject pool + trending ----
  const fantasy = await openLibrarySubject("fantasy", 6);
  assert(fantasy.length >= 3, `OL fantasy subject pool → ${fantasy.length} books`);
  const trending = await openLibraryTrending(6);
  assert(trending.length >= 3, `OL weekly trending → ${trending.length} books`);
  assert(trending.every((b) => b.mediaType === "book"), "trending items are books");

  // ---- RAWG: built-in key → configured out of the box ----
  const rawg = new RawgProvider();
  assert(rawgKeyConfigured() === true, "RAWG is configured out of the box (built-in key)");
  const witcher = await rawg.search("witcher 3", { limit: 4 });
  assert(witcher.length >= 1, `RAWG search → ${witcher.length} games`);
  const w = witcher[0].item;
  assert(w.mediaType === "game" && w.format === "game", "RAWG item is a game");
  assert(w.localId.startsWith("rawg:"), `RAWG localId prefix (${w.localId})`);
  console.log(`  → ${w.title} (${w.releaseYear}) genres=[${w.genres.join(",")}] tags=[${w.tags.join(",")}]`);
  const rpgPool = await rawgByGenre("rpg", 6);
  assert(rpgPool.length >= 3, `RAWG rpg pool → ${rpgPool.length} games`);

  // ---- searchCatalogue: books live, router paths healthy ----
  const outcome = await searchCatalogue("dune", { mediaTypes: ["book"], limit: 5 });
  assert(outcome.results.length >= 3, `router book search → ${outcome.results.length} results`);
  assert(outcome.sources.includes("Open Library"), `sources: ${outcome.sources.join(", ")}`);
  assert(!outcome.usedFallback, "live results (not the demo fallback)");

  // mixed search across movie + book + game (games now live via built-in key)
  const mixed = await searchCatalogue("dune", { mediaTypes: ["movie", "book", "game"], limit: 4 });
  assert(mixed.results.length >= 3, `mixed search incl. games → ${mixed.results.length}`);

  // ---- candidate pool incl. books AND games ----
  const pool = await fetchCandidatePool({
    genres: ["fantasy", "sci-fi"],
    mediaTypes: ["anime", "movie", "series", "book", "game"],
    limitPerSource: 6,
  });
  const books = pool.pool.filter((m) => m.mediaType === "book").length;
  const games = pool.pool.filter((m) => m.mediaType === "game").length;
  assert(books >= 3, `Discover pool contains ${books} books`);
  assert(games >= 1, `Discover pool contains ${games} games (built-in key)`);
  assert(pool.sources.includes("Open Library"), `pool sources: ${pool.sources.join(", ")}`);

  console.log("\nAll expanded-catalogue smoke tests passed.");
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
