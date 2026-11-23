/**
 * ECHO — Local catalogue provider (registry id: "echo-demo").
 * Clearly-labelled local sample content (spec rule 8): the demo universe plus
 * the curated starter collections (movies, games, books). Never presented as
 * live external results; every result it produces is tagged "Sample" in the
 * UI.
 */

import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import type { MediaItem, MediaType } from "../types";
import type { CatalogueProvider, ProviderSearchResult, SearchFilters } from "./types";
import { allowedByVisibility } from "../engine/recommend";
import type { ContentVisibility } from "../types";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Alternate two lists, first-list-first: [a0, b0, a1, b1, …]. */
function weave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/** Alternate a single list from both ends: [first, last, second, …].
 *  Curated collections are stored oldest-first, so a plain order would fill
 *  a single-bucket shelf with nothing but the oldest titles (all-games or
 *  all-books shelves have no demo-universe half to weave against). Taking
 *  turns from the front and the back keeps every starter shelf a mix of
 *  classic and modern works without inventing any ranking. */
function endsAlternate<T>(list: T[]): T[] {
  const out: T[] = [];
  let lo = 0;
  let hi = list.length - 1;
  let takeFront = true;
  while (lo <= hi) {
    out.push(list[takeFront ? lo++ : hi--]);
    takeFront = !takeFront;
  }
  return out;
}

export class DemoProvider implements CatalogueProvider {
  id = "echo-demo";
  label = "ECHO local catalogue";

  capabilities = {
    anime: true,
    movies: true,
    series: true,
    games: true, // Phase 3: curated local games starter collection
    books: true, // Phase 3: curated local books starter collection
    contentRatings: true, // approximate
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  private all(): MediaItem[] {
    return DEMO_CATALOGUE.map(demoToMediaItem);
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = normalize(query);
    if (!q) return [];
    const types = filters?.mediaTypes;
    const scored: { item: MediaItem; score: number }[] = [];
    for (const item of this.all()) {
      if (types?.length && !types.includes(item.mediaType)) continue;
      const title = normalize(item.title);
      const titleAr = item.titleAr ? normalize(item.titleAr) : "";
      const original = item.originalTitle ? normalize(item.originalTitle) : "";
      let score = 0;
      if (title === q || titleAr === q || original === q) score = 100;
      else if (title.startsWith(q) || titleAr.startsWith(q) || original.startsWith(q)) score = 80;
      else if (title.includes(q) || titleAr.includes(q) || original.includes(q)) score = 60;
      else if (normalize(item.genres.join(" ")).includes(q)) score = 25;
      else if (normalize(item.tags.join(" ")).includes(q)) score = 20;
      else if (normalize(item.synopsis ?? "").includes(q)) score = 10;
      if (score > 0) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score || (a.item.title < b.item.title ? -1 : 1));
    return scored.slice(0, filters?.limit ?? 12).map((s) => ({
      item: s.item,
      sourceLabel: "Sample",
    }));
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    return this.all().find((m) => m.providerId === providerId) ?? null;
  }

  /**
   * A deterministic local pool for Discover: items of the requested media
   * types, genre-matched entries first (when genres are given), then a
   * curated-order fill — weaved so curated classics and demo-universe titles
   * alternate (shelves span eras, not just recent releases), and round-robined
   * across the requested types so every uncovered medium gets representation.
   * Visibility-gated exactly like live providers. No popularity claims are
   * made — the order is ECHO's curation.
   */
  poolForTypes(
    mediaTypes: MediaType[],
    opts?: { genres?: string[]; limit?: number; visibility?: ContentVisibility },
  ): MediaItem[] {
    const limit = opts?.limit ?? 20;
    const visibility = opts?.visibility ?? "moderate";
    const genres = new Set(opts?.genres ?? []);
    // per requested type: curated-classic list + demo-universe list
    const byType = new Map<MediaType, { curated: MediaItem[]; demo: MediaItem[] }>();
    for (const seed of DEMO_CATALOGUE) {
      if (!mediaTypes.includes(seed.mediaType)) continue;
      const item = demoToMediaItem(seed);
      if (!allowedByVisibility(item.contentRating, visibility)) continue;
      const bucket =
        byType.get(seed.mediaType) ?? { curated: [] as MediaItem[], demo: [] as MediaItem[] };
      (seed.collection === "curated" ? bucket.curated : bucket.demo).push(item);
      byType.set(seed.mediaType, bucket);
    }
    // per type: genre matches first (curated leading), then the weaved fill —
    // each bucket alternated from both ends so shelves mix eras even when a
    // type has only curated content (games, books) or only demo content
    const lists: MediaItem[][] = [];
    for (const { curated, demo } of byType.values()) {
      const matches = (list: MediaItem[]) =>
        genres.size ? list.filter((m) => m.genres.some((g) => genres.has(g))) : [];
      const rest = (list: MediaItem[], m: MediaItem[]) => list.filter((x) => !m.includes(x));
      const curatedMatched = matches(curated);
      const demoMatched = matches(demo);
      lists.push([
        ...weave(curatedMatched, demoMatched),
        ...weave(endsAlternate(rest(curated, curatedMatched)), endsAlternate(rest(demo, demoMatched))),
      ]);
    }
    // round-robin across types so no single medium hogs the limit
    const out: MediaItem[] = [];
    let i = 0;
    while (out.length < limit) {
      let pushed = false;
      for (const list of lists) {
        if (out.length >= limit) break;
        const item = list[i];
        if (item) {
          out.push(item);
          pushed = true;
        }
      }
      if (!pushed) break;
      i++;
    }
    return out;
  }

  getAttribution() {
    return {
      name: "ECHO local catalogue",
      notice:
        "Offline sample content: the ECHO demo universe and the curated starter collections. Not live external results.",
    };
  }
}
