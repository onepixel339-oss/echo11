/**
 * Vocabulary coverage check — find genre/tag slugs that CAN appear in the UI
 * but have no Arabic label in data/vocab.ts.
 *
 * Sources of slugs:
 *  - providers/types.ts GENRE_ALIASES values (canonical slugs)
 *  - RAWG's public genre list (slugs as returned by /genres)
 *  - Cinemeta's genre names, fetched LIVE from the top catalogues (movie+series)
 *  - AniList's standard genre set, Open Library SUBJECT_ALIASES values
 */

import { normalizeGenre } from "../src/lib/echo/providers/types";
import { GENRES, TAGS } from "../src/lib/echo/data/vocab";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

// RAWG public genre slugs (api.rawg.io/api/genres)
const RAWG_GENRES = [
  "action", "adventure", "arcade", "board-games", "card", "casual", "educational",
  "family", "fighting", "indie", "massively-multiplayer", "music", "platformer",
  "puzzle", "racing", "racing-sim", "rhythm", "role-playing-games-rpg", "shooter",
  "simulation", "sport", "strategy", "turn-based-strategy", "tactical",
  "hack-and-slash", "quiz-trivia", "moba", "point-and-click",
];

// AniList standard genre set
const ANILIST_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
];

// Open Library subject aliases (values → canonical slugs)
const OL_SUBJECTS = [
  "fantasy", "science-fiction", "mystery", "romance", "horror", "thrillers",
  "historical-fiction", "biography", "poetry", "adventure", "war", "humor",
  "westerns", "dark-fantasy", "classics", "history", "self-help", "non-fiction",
  "short-stories", "dystopian-fiction", "paranormal", "detective-stories",
];

interface CinemetaResp { metas?: { genre?: string[] }[] }

async function cinemetaGenres(kind: "movie" | "series"): Promise<string[]> {
  try {
    const data = await fetchJson<CinemetaResp>(
      `https://v3-cinemeta.strem.io/catalog/${kind}/top.json`,
    );
    return (data.metas ?? []).flatMap((m) => m.genre ?? []);
  } catch (err) {
    console.error(`cinemeta ${kind} fetch failed:`, err);
    return [];
  }
}

async function main(): Promise<void> {
  const slugs = new Set<string>();
  const add = (raw: string) => slugs.add(normalizeGenre(raw));

  RAWG_GENRES.forEach(add);
  ANILIST_GENRES.forEach(add);
  OL_SUBJECTS.forEach(add);

  const [movieG, seriesG] = await Promise.all([cinemetaGenres("movie"), cinemetaGenres("series")]);
  [...movieG, ...seriesG].forEach(add);

  const missing: string[] = [];
  for (const slug of [...slugs].sort()) {
    if (!GENRES[slug] && !TAGS[slug]) missing.push(slug);
  }

  console.log(`total distinct slugs: ${slugs.size}`);
  console.log(`missing Arabic label: ${missing.length}`);
  console.log(missing.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
