/**
 * Live test: Cinemeta trailer mapping (MediaItem.trailerUrl).
 * Run: npx tsx scripts/test-trailer.ts
 */

import { ImdbProvider } from "../src/lib/echo/providers/imdb";

async function main(): Promise<void> {
  const provider = new ImdbProvider();
  // tt1375666 = Inception, tt0468569 = The Dark Knight
  for (const id of ["tt1375666", "tt0468569"]) {
    const item = await provider.getTitle(id);
    console.log(
      `${id} → "${item?.title}" · trailerUrl=${item?.trailerUrl ?? "NONE"}`,
    );
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
