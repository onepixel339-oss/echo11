/**
 * ECHO — Identity-resolution regression fixtures (Phase 1).
 *
 * Pure data: tricky same-title / near-title cases that automatic linking
 * must get RIGHT. Each fixture documents the expected behaviour:
 *  - seasons:  "Show" vs "Show Season 2" — different works, never auto-link
 *  - remakes:  same title, different years — never auto-link
 *  - editions: theatrical vs director's cut — never auto-link
 *  - translations: same external id / same work under a localized title —
 *              MAY auto-link via external-id evidence
 *  - same-title unrelated works: two distinct works sharing a title with
 *              unknown years — ambiguous, flag for review, never auto-link
 *  - exact match: same title, same year, same type — auto-link
 */

import type { MediaItem } from "../../types";

export function fixture(over: Partial<MediaItem> & { title: string }): MediaItem {
  return {
    localId: `fixture:${over.provider ?? "manual"}:${over.title}`,
    provider: "manual",
    providerId: "fixture",
    mediaType: "movie",
    format: "film",
    genres: [],
    tags: [],
    ...over,
  };
}

/* ------------------------------- exact match ------------------------------- */

export const exactMatch = {
  manual: fixture({ title: "Inception", releaseYear: 2010 }),
  candidate: fixture({
    title: "Inception",
    releaseYear: 2010,
    provider: "imdb",
    providerId: "tt1375666",
    localId: "imdb:tt1375666",
  }),
};

/* --------------------------- seasons / volumes ---------------------------- */

export const seasonFixtures = [
  {
    name: "base title vs season 2 (same year range)",
    manual: fixture({ title: "The Wire" }),
    candidate: fixture({
      title: "The Wire Season 2",
      provider: "tvmaze",
      localId: "tvmaze:wire-2",
    }),
    autoLinkable: false,
  },
  {
    name: "season 1 vs season 2",
    manual: fixture({ title: "Attack on Titan Season 1" }),
    candidate: fixture({
      title: "Attack on Titan Season 2",
      provider: "anilist",
      localId: "anilist:aot-2",
    }),
    autoLinkable: false,
  },
  {
    name: "volume 3 vs volume 4",
    manual: fixture({ title: "Berserk Vol. 3", mediaType: "book", format: "book" }),
    candidate: fixture({
      title: "Berserk Vol. 4",
      provider: "openlib",
      localId: "openlib:berserk-4",
      mediaType: "book",
      format: "book",
    }),
    autoLinkable: false,
  },
  {
    name: "identical season markers on both sides can link",
    manual: fixture({ title: "The Wire Season 2", releaseYear: 2003 }),
    candidate: fixture({
      title: "The Wire: Season 2",
      releaseYear: 2003,
      provider: "tvmaze",
      localId: "tvmaze:wire-s2",
    }),
    autoLinkable: true,
  },
];

/* --------------------------------- remakes --------------------------------- */

export const remakeFixtures = [
  {
    name: "same title, different years (classic remake)",
    manual: fixture({ title: "The Ring", releaseYear: 1998 }),
    candidate: fixture({
      title: "The Ring",
      releaseYear: 2002,
      provider: "imdb",
      localId: "imdb:ring-2002",
    }),
    autoLinkable: false,
  },
  {
    name: "same title, years unknown — NOT auto-linkable evidence (ambiguous)",
    manual: fixture({ title: "Dune" }),
    candidate: fixture({ title: "Dune", provider: "imdb", localId: "imdb:dune-1984" }),
    autoLinkable: true, // single candidate IS linkable; ambiguity is decided
    // across candidates (two Dunes → ambiguous), see sameTitleUnrelated below
  },
];

/* -------------------------------- editions --------------------------------- */

export const editionFixtures = [
  {
    name: "theatrical vs director's cut",
    manual: fixture({ title: "Blade Runner" }),
    candidate: fixture({
      title: "Blade Runner (Director's Cut)",
      provider: "imdb",
      localId: "imdb:br-dc",
    }),
    autoLinkable: false,
  },
  {
    name: "same edition label on both sides can link",
    manual: fixture({ title: "Blade Runner: The Final Cut", releaseYear: 2007 }),
    candidate: fixture({
      title: "Blade Runner - Final Cut",
      releaseYear: 2007,
      provider: "imdb",
      localId: "imdb:br-fc",
    }),
    autoLinkable: true,
  },
  {
    name: "different editions never link even with a shared external id",
    manual: fixture({
      title: "Blade Runner",
      externalIds: { imdb: "tt0083658" },
    }),
    candidate: fixture({
      title: "Blade Runner (Director's Cut)",
      externalIds: { imdb: "tt0083658" },
      provider: "imdb",
      providerId: "tt0083658",
      localId: "imdb:br",
    }),
    autoLinkable: false, // shared id BUT conflicting edition markers
  },
];

/* ------------------------------- translations ------------------------------ */

export const translationFixtures = [
  {
    name: "localized title with a shared external id links by id evidence",
    manual: fixture({
      title: "الهيبة", // Arabic title, no year
      mediaType: "series",
      format: "series",
      externalIds: { imdb: "tt7702346" },
    }),
    candidate: fixture({
      title: "Al Hayba",
      releaseYear: 2017,
      mediaType: "series",
      format: "series",
      provider: "imdb-series",
      providerId: "tt7702346",
      localId: "imdb-series:tt7702346",
    }),
    autoLinkable: true,
  },
  {
    name: "translated title WITHOUT shared ids never auto-links",
    manual: fixture({ title: "الهيبة", mediaType: "series", format: "series" }),
    candidate: fixture({
      title: "Al Hayba",
      mediaType: "series",
      format: "series",
      provider: "tvmaze",
      localId: "tvmaze:hayba",
    }),
    autoLinkable: false,
  },
];

/* ----------------------- same-title unrelated works ----------------------- */

export const sameTitleUnrelated = {
  // two distinct works sharing one title; years unknown on the manual side
  manual: fixture({ title: "The Host" }),
  candidateA: fixture({
    title: "The Host",
    releaseYear: 2006,
    provider: "imdb",
    providerId: "tt0468492",
    localId: "imdb:host-2006",
  }),
  candidateB: fixture({
    title: "The Host",
    releaseYear: 2013,
    provider: "imdb",
    providerId: "tt1517489",
    localId: "imdb:host-2013",
  }),
};

/* ------------------------------ cross-provider ----------------------------- */

export const crossProviderFixtures = [
  {
    name: "TVMaze record and IMDb record of the same show share the IMDb id",
    a: fixture({
      title: "Breaking Bad",
      releaseYear: 2008,
      mediaType: "series",
      format: "series",
      provider: "tvmaze",
      providerId: "169",
      localId: "tvmaze:169",
      externalIds: { imdb: "tt0903747" },
    }),
    b: fixture({
      title: "Breaking Bad",
      releaseYear: 2008,
      mediaType: "series",
      format: "series",
      provider: "imdb-series",
      providerId: "tt0903747",
      localId: "imdb-series:tt0903747",
    }),
    shareId: true,
  },
  {
    name: "records of different shows never share ids",
    a: fixture({
      title: "Better Call Saul",
      provider: "tvmaze",
      providerId: "170",
      localId: "tvmaze:170",
      externalIds: { imdb: "tt3032476" },
    }),
    b: fixture({
      title: "Breaking Bad",
      provider: "imdb-series",
      providerId: "tt0903747",
      localId: "imdb-series:tt0903747",
    }),
    shareId: false,
  },
];

/* ------------------------- substring regression guard ---------------------- */

export const substringFixtures = [
  {
    name: "'Show' vs 'Show Season 2' — substring containment is not evidence",
    manual: fixture({ title: "The Sinner" }),
    candidate: fixture({
      title: "The Sinner: The Sinner Season 3",
      provider: "tvmaze",
      localId: "tvmaze:sinner-3",
    }),
    autoLinkable: false,
  },
  {
    name: "'It' vs 'It Chapter Two' — different works despite shared tokens",
    manual: fixture({ title: "It", releaseYear: 2017 }),
    candidate: fixture({
      title: "It Chapter Two",
      releaseYear: 2019,
      provider: "imdb",
      localId: "imdb:it-2",
    }),
    autoLinkable: false,
  },
];
