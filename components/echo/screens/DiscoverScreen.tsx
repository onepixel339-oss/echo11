/**
 * ECHO — Discover: explainable recommendation shelves over a REAL candidate
 * pool (AniList + IMDb/Cinemeta, fetched by your top taste genres).
 * Every card shows the actual shared features. No fake percentages.
 */

"use client";

import React from "react";
import { Compass, ThumbsUp, ThumbsDown, Check, Plus, SlidersHorizontal, Info, Loader2, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { computeIdf } from "@/lib/echo/engine/features";
import { buildTasteProfile } from "@/lib/echo/engine/taste";
import {
  recommendClosest,
  recommendAdjacent,
  recommendBecause,
  recommendExplore,
  recommendIsland,
  pickAnchorEntry,
} from "@/lib/echo/engine/recommend";
import { computeClusters } from "@/lib/echo/engine/cluster";
import { buildSimilarityGraph } from "@/lib/echo/engine/similarity";
import { fetchCandidatePool, fetchComingSoon, demoProvider, type ComingSoonShelf } from "@/lib/echo/providers";
import { ALL_MEDIA_TYPES } from "@/lib/echo/providers";
import { DEMO_CATALOGUE, demoToMediaItem } from "@/lib/echo/data/demoCatalogue";
import { vocabLabel } from "@/lib/echo/data/vocab";
import type { MediaItem, Recommendation } from "@/lib/echo/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { EmptyState, MediaTypeIcon, PosterTile } from "../bits";
import { useToast } from "@/hooks/use-toast";

const DEMO_ITEMS: MediaItem[] = DEMO_CATALOGUE.map(demoToMediaItem);

export function DiscoverScreen() {
  const { t, tv, lang } = useI18n();
  const { toast } = useToast();
  const { entries, mediaById } = useActiveLibrary();
  const settings = useEchoStore((s) => s.settings);
  const addTitle = useEchoStore((s) => s.addTitle);
  const recordFeedback = useEchoStore((s) => s.recordFeedback);
  const setView = useEchoStore((s) => s.setView);
  const select = useEchoStore((s) => s.select);
  const feedback = useEchoStore((s) => s.feedback);

  const [dial, setDial] = React.useState(30); // familiar ↔ surprising
  const [types, setTypes] = React.useState<Set<string>>(new Set());

  // ---- coming soon: upcoming games + airing anime (a calendar, not a rec) ----
  const [comingSoon, setComingSoon] = React.useState<ComingSoonShelf | null>(null);

  React.useEffect(() => {
    const wants = settings.interests.filter(
      (mt) => mt === "anime" || mt === "game" || mt === "manga",
    );
    if (!wants.length) return;
    let cancelled = false;
    fetchComingSoon({
      mediaTypes: wants,
      visibility: settings.contentVisibility,
      limitPerShelf: 12,
    })
      .then((res) => {
        if (!cancelled) setComingSoon(res);
      })
      .catch(() => undefined); // the shelf simply stays hidden on failure
    return () => {
      cancelled = true;
    };
  }, [settings.interests, settings.contentVisibility]);

  // ---- real candidate pool state ----
  const [pool, setPool] = React.useState<MediaItem[] | null>(null);
  const [poolState, setPoolState] = React.useState<"idle" | "loading" | "ready" | "error" | "no-coverage">("idle");
  const [poolSources, setPoolSources] = React.useState<string[]>([]);
  const [poolUsedSample, setPoolUsedSample] = React.useState(false);
  const [poolNonce, setPoolNonce] = React.useState(0);

  const profile = React.useMemo(
    () => buildTasteProfile(mediaById, entries, feedback, { recencyWeight: settings.recencyWeight }),
    [mediaById, entries, feedback, settings.recencyWeight],
  );

  const rejectedLocalIds = React.useMemo(
    () =>
      new Set(
        feedback.filter((f) => f.value === "not_for_me" && f.mediaLocalId).map((f) => f.mediaLocalId!),
      ),
    [feedback],
  );

  const libraryItems = React.useMemo(
    () =>
      entries
        .map((e) => mediaById.get(e.mediaLocalId))
        .filter((m): m is MediaItem => Boolean(m)),
    [entries, mediaById],
  );

  /** top genre slugs from the taste profile (falls back to interests) */
  const topGenres = React.useMemo(() => {
    const genres = profile.features
      .filter((f) => f.kind === "genre" && f.score > 0)
      .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))
      .map((f) => f.slug);
    if (genres.length >= 2) return genres.slice(0, 3);
    // not enough rated signal yet → seed from library genres by frequency
    const freq = new Map<string, number>();
    for (const m of libraryItems) for (const g of m.genres) freq.set(g, (freq.get(g) ?? 0) + 1);
    const byFreq = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    return [...genres, ...byFreq].slice(0, 3);
  }, [profile, libraryItems]);

  const interests: MediaItem["mediaType"][] = settings.interests.length
    ? settings.interests
    : ALL_MEDIA_TYPES;
  const poolKey = React.useMemo(
    () => `${topGenres.join("+")}|${[...interests].sort().join(",")}|${poolNonce}`,
    [topGenres, interests, poolNonce],
  );

  // fetch the real pool when the taste signal is ready
  React.useEffect(() => {
    if (profile.ratedCount < 3 && libraryItems.length < 3) return;
    let cancelled = false;
    setPoolState("loading");
    const includeMature = settings.contentVisibility === "all";
    fetchCandidatePool({
      genres: topGenres.length ? topGenres : ["drama"],
      mediaTypes: interests,
      includeMature,
      limitPerSource: 20,
      arabicShelf: settings.language === "ar",
    })
      .then((res) => {
        if (cancelled) return;
        // the router already mixes in labelled local items for any media
        // type without live coverage (res.usedSample) — no empty shelves
        setPool(res.pool);
        setPoolSources(res.sources);
        setPoolUsedSample(res.usedSample);
        if (res.pool.length) setPoolState("ready");
        // empty: distinguish "live sources failed" from "nothing enabled
        // covers these types at all"
        else setPoolState(res.errors.length ? "error" : "no-coverage");
      })
      .catch(() => {
        if (cancelled) return;
        setPool([]);
        setPoolState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [poolKey]);

  const idf = React.useMemo(() => {
    const libIds = new Set(libraryItems.map((m) => m.localId));
    const corpus = [...libraryItems, ...DEMO_ITEMS.filter((m) => !libIds.has(m.localId))];
    return computeIdf(corpus);
  }, [libraryItems]);

  const candidates = React.useMemo(() => {
    if (!pool) return [];
    const libraryIds = new Set(entries.map((e) => e.mediaLocalId));
    return pool.filter(
      (m) =>
        !libraryIds.has(m.localId) &&
        (!types.size || types.has(m.mediaType)),
    );
  }, [pool, types, entries]);

  const baseOpts = React.useMemo(
    () => ({
      profile,
      candidates,
      entries,
      mediaById,
      simOptions: { idf },
      excludedGenres: settings.excludedGenres,
      rejectedLocalIds,
      visibility: settings.contentVisibility,
      maxShelf: 10,
    }),
    [profile, candidates, entries, mediaById, idf, settings.excludedGenres, settings.contentVisibility, rejectedLocalIds],
  );

  const anchorEntry = React.useMemo(() => pickAnchorEntry(entries, mediaById), [entries, mediaById]);

  // clusters for the "explore this island" shelf
  const clusters = React.useMemo(() => {
    if (libraryItems.length < 3) return [];
    const edges = buildSimilarityGraph(libraryItems, { idf });
    return computeClusters(libraryItems, edges);
  }, [libraryItems, idf]);
  const biggestCluster = React.useMemo(
    () => clusters.filter((c) => c.members.length >= 2).sort((a, b) => b.members.length - a.members.length)[0],
    [clusters],
  );

  const shelves = React.useMemo(() => {
    if (profile.ratedCount < 3 || !candidates.length) return null;
    const w = dial / 100;
    const list: { id: string; title: string; sub: string; recs: Recommendation[] }[] = [];
    // cross-shelf dedupe: a work appears on at most one shelf per page load
    const shown = new Set<string>();
    const fresh = (recs: Recommendation[], max: number) =>
      recs.filter((r) => !shown.has(r.item.localId)).slice(0, max);
    const markShown = (recs: Recommendation[]) =>
      recs.forEach((r) => shown.add(r.item.localId));
    const closest = recommendClosest(baseOpts);
    if (w > 0.55) {
      // surprising side: blend in adjacent ranking
      const adjacent = recommendAdjacent(baseOpts);
      const merged = [...closest.map((r) => ({ ...r, score: r.score * (1 - w * 0.7) })), ...adjacent.map((r) => ({ ...r, score: r.score * (0.35 + w * 0.65), mode: "adjacent" as const }))]
        .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
      const main = mixByType(dedupe(merged), 10);
      markShown(main);
      list.push({
        id: "main",
        title: w > 0.8 ? t("discover.explore") : t("discover.adjacent"),
        sub: w > 0.8 ? t("discover.explore.sub") : t("discover.adjacent.sub"),
        recs: main,
      });
    } else {
      const main = mixByType(closest, 10);
      markShown(main);
      list.push({
        id: "main",
        title: t("discover.closest"),
        sub: t("discover.closest.sub"),
        recs: main,
      });
    }
    if (anchorEntry) {
      const anchorItem = mediaById.get(anchorEntry.mediaLocalId);
      if (anchorItem) {
        const because = fresh(recommendBecause(baseOpts, anchorEntry.mediaLocalId, 16), 8);
        markShown(because);
        list.push({
          id: "because",
          title: t("discover.because", {
            title: anchorItem.title,
          }),
          sub: t("discover.because.sub"),
          recs: because,
        });
      }
    }
    if (w <= 0.55) {
      const adjacent = fresh(recommendAdjacent(baseOpts, 16), 8);
      markShown(adjacent);
      list.push({
        id: "adjacent",
        title: t("discover.adjacent"),
        sub: t("discover.adjacent.sub"),
        recs: adjacent,
      });
    }
    if (biggestCluster) {
      const labelKey = biggestCluster.labelKey;
      const name = labelKey ? tv(labelKey.split(":")[1]) : t("map.cluster.island");
      const island = fresh(recommendIsland(baseOpts, biggestCluster.members, 16), 8);
      markShown(island);
      list.push({
        id: "island",
        title: t("discover.island", { name }),
        sub: t("discover.island.sub"),
        recs: island,
      });
    }
    if (w > 0.55) {
      const explore = fresh(recommendExplore(baseOpts, 16), 8);
      markShown(explore);
      list.push({
        id: "explore",
        title: t("discover.explore"),
        sub: t("discover.explore.sub"),
        recs: explore,
      });
    }
    return list.filter((s) => s.recs.length > 0);
  }, [baseOpts, dial, anchorEntry, biggestCluster, profile.ratedCount, candidates.length, t, tv, mediaById]);

  const libraryIds = React.useMemo(() => new Set(entries.map((e) => e.mediaLocalId)), [entries]);

  // ---- fresh-library starter shelves (Phase 2): approved local content so
  // Discover is useful before the user has rated 3 titles. Clearly labelled
  // "Sample" — no live requests are made for these shelves.
  const starterShelves = React.useMemo(() => {
    const visibleTypes = types.size
      ? interests.filter((mt) => types.has(mt))
      : interests;
    const excluded = new Set(settings.excludedGenres);
    return visibleTypes
      .map((mt) => ({
        type: mt,
        items: demoProvider
          .poolForTypes([mt], { limit: 12, visibility: settings.contentVisibility })
          .filter((m) => !m.genres.some((g) => excluded.has(g))
            && !entries.some((e) => e.mediaLocalId === m.localId)),
      }))
      .filter((s) => s.items.length >= 4);
  }, [interests, types, settings.excludedGenres, settings.contentVisibility, entries]);

  if (profile.ratedCount < 3) {
    return (
      <div className="px-4 pt-6 md:px-8">
        <ComingSoonSection shelf={comingSoon} lang={lang} t={t} onSelect={(item) => select(item.localId, item)} />
        {starterShelves.map((s) => (
          <section key={`starter-${s.type}`} aria-label={t("discover.starter.type", { type: t(`media.${s.type}`) })} className="flex flex-col gap-2.5">
            <div>
              <h2 className="echo-display text-base font-semibold text-foreground">
                {t("discover.starter.type", { type: t(`media.${s.type}`) })}
              </h2>
              <p className="text-xs text-muted-foreground">{t("discover.starter.sub")}</p>
            </div>
            <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {s.items.map((item) => (
                <ComingTile key={item.localId} item={item} chip={t("discover.starter.chip")} lang={lang} onSelect={(item2) => select(item2.localId, item2)} />
              ))}
            </div>
          </section>
        ))}
        <EmptyState
          icon={<Compass className="h-12 w-12" strokeWidth={1.2} />}
          title={t("discover.needData")}
          sub={t("discover.needData.sub")}
        >
          <Button onClick={() => setView("library")}>{t("discover.goLibrary")}</Button>
        </EmptyState>
      </div>
    );
  }

  if (poolState === "loading" && !pool) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-20 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("discover.loading")}</p>
      </div>
    );
  }

  if (!shelves && poolState === "error") {
    return (
      <div className="px-4 pt-10 md:px-8">
        <EmptyState
          icon={<WifiOff className="h-12 w-12" strokeWidth={1.2} />}
          title={t("discover.offlineTitle")}
          sub={t("discover.offlineSub")}
        >
          <Button variant="outline" onClick={() => setPoolNonce((n) => n + 1)}>
            <RefreshCw className="me-1.5 h-4 w-4" aria-hidden />
            {t("discover.retry")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (!shelves && poolState === "no-coverage") {
    return (
      <div className="px-4 pt-10 md:px-8">
        <EmptyState
          icon={<Compass className="h-12 w-12" strokeWidth={1.2} />}
          title={t("discover.noCoverage.title")}
          sub={t("discover.noCoverage.sub")}
        >
          <Button variant="outline" onClick={() => setView("settings")}>
            {t("discover.noCoverage.cta")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (!shelves) {
    return (
      <div className="px-4 pt-10 md:px-8">
        <EmptyState icon={<Compass className="h-12 w-12" strokeWidth={1.2} />} title={t("discover.empty")} sub={t("discover.empty.sub")}>
          <Button variant="outline" onClick={() => setPoolNonce((n) => n + 1)}>
            <RefreshCw className="me-1.5 h-4 w-4" aria-hidden />
            {t("discover.retry")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 md:px-8">
      <ComingSoonSection shelf={comingSoon} lang={lang} t={t} onSelect={(item) => select(item.localId, item)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="max-w-md text-sm text-muted-foreground">{t("discover.sub")}</p>
          {poolSources.length > 0 && (
            <p className="echo-overline mt-1.5">
              {t("discover.liveFrom", { sources: poolSources.join(" · ") })}
            </p>
          )}
          {poolUsedSample && (
            <p className="echo-overline mt-1 text-echo-gold/90">
              {t("discover.sampleFrom")}
            </p>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {t("discover.controls")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  {t("discover.similarity")}
                </label>
                <Slider
                  value={[dial]}
                  onValueChange={(v) => setDial(v[0])}
                  min={0}
                  max={100}
                  step={10}
                  aria-label={t("discover.similarity")}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">{t("discover.types")}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(ALL_MEDIA_TYPES as readonly MediaItem["mediaType"][]).map((mt) => (
                    <button
                      key={mt}
                      onClick={() =>
                        setTypes((prev) => {
                          const next = new Set(prev);
                          if (next.has(mt)) next.delete(mt);
                          else next.add(mt);
                          return next;
                        })
                      }
                      aria-pressed={types.has(mt)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs transition",
                        types.has(mt)
                          ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`media.${mt}`)}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPoolNonce((n) => n + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {t("discover.refreshPool")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {shelves.map((shelf) => (
        <section key={shelf.id} aria-label={shelf.title}>
          <div className="mb-2.5">
            <h2 className="echo-display text-base font-semibold text-foreground">{shelf.title}</h2>
            <p className="text-xs text-muted-foreground">{shelf.sub}</p>
          </div>
          <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {shelf.recs.map((rec) => (
              <RecCard
                key={`${shelf.id}-${rec.item.localId}`}
                rec={rec}
                inLibrary={libraryIds.has(rec.item.localId)}
                lang={lang}
                tv={tv}
                t={t}
                onInterested={() => {
                  void recordFeedback(rec.item.localId, "interested", "recommendation");
                  toast({ description: t("discover.feedbackNote") });
                }}
                onNotForMe={() => {
                  void recordFeedback(rec.item.localId, "not_for_me", "recommendation");
                  toast({ description: t("discover.feedbackNote") });
                }}
                onWatched={() => {
                  void addTitle(rec.item, { status: "completed" }).then(() =>
                    toast({ description: t("toast.added") }),
                  );
                }}
                onPlanned={() => {
                  void addTitle(rec.item, { status: "planned" }).then(() =>
                    toast({ description: t("toast.added") }),
                  );
                }}
                onDetails={() => select(rec.item.localId, rec.item)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** generic "matches your taste" reasons go last; specific shared features lead */
function reasonRank(key: string): number {
  switch (key) {
    case "shared_creator":
      return 5;
    case "shared_genre":
    case "shared_tag":
      return 4;
    case "adjacentNew":
      return 3;
    case "sharedAnchor":
      return 2;
    default:
      return 1; // tasteMatch
  }
}

/**
 * "Coming soon" shelves: unreleased games (RAWG) + anime airing right now
 * (AniList). A calendar, not a recommendation — shown before the taste
 * shelves so a fresh library still sees something alive.
 */
function ComingSoonSection({
  shelf,
  lang,
  t,
  onSelect,
}: {
  shelf: ComingSoonShelf | null;
  lang: "ar" | "en";
  t: (k: string, p?: Record<string, string | number>) => string;
  onSelect: (item: MediaItem) => void;
}) {
  if (!shelf) return null;
  const shelves: { id: string; title: string; sub: string; items: MediaItem[]; chip: string }[] = [];
  if (shelf.games.length) {
    shelves.push({
      id: "games",
      title: t("coming.games.title"),
      sub: t("coming.games.sub"),
      items: shelf.games,
      chip: t("coming.chip.soon"),
    });
  }
  if (shelf.airingAnime.length) {
    shelves.push({
      id: "airing",
      title: t("coming.anime.title"),
      sub: t("coming.anime.sub"),
      items: shelf.airingAnime,
      chip: t("coming.chip.airing"),
    });
  }
  if (shelf.publishingManga.length) {
    shelves.push({
      id: "publishing-manga",
      title: t("coming.manga.title"),
      sub: t("coming.manga.sub"),
      items: shelf.publishingManga,
      chip: t("coming.chip.publishing"),
    });
  }
  if (!shelves.length) return null;

  return (
    <>
      {shelves.map((s) => (
        <section key={s.id} aria-label={s.title} className="flex flex-col gap-2.5">
          <div>
            <h2 className="echo-display text-base font-semibold text-foreground">{s.title}</h2>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
          <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {s.items.map((item) => (
              <ComingTile key={item.localId} item={item} chip={s.chip} lang={lang} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ComingTile({
  item,
  chip,
  lang,
  onSelect,
}: {
  item: MediaItem;
  chip: string;
  lang: "ar" | "en";
  onSelect: (item: MediaItem) => void;
}) {
  const title = item.title;
  const dateLabel = item.releaseDate
    ? new Date(item.releaseDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en", {
        month: "short",
        year: "numeric",
      })
    : item.releaseYear
      ? String(item.releaseYear)
      : "";
  return (
    <button
      onClick={() => onSelect(item)}
      className="echo-card relative flex w-[170px] shrink-0 snap-start flex-col overflow-hidden rounded-xl text-start transition hover:border-echo-accent/50"
      aria-label={title}
    >
      <PosterTile item={item} width={170} height={210} className="w-full rounded-none rounded-t-xl" />
      <span className="echo-chip absolute start-2 top-2 !bg-card/90">{chip}</span>
      <span className="flex items-center gap-1 px-2.5 pt-2 text-sm font-semibold text-foreground">
        <MediaTypeIcon type={item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{title}</span>
      </span>
      <span className="px-2.5 pb-2.5 pt-0.5 font-mono text-[11px] text-muted-foreground">
        {dateLabel || "—"}
        {item.genres[0] ? ` · ${vocabLabel(item.genres[0], lang)}` : ""}
      </span>
    </button>
  );
}

/** round-robin by media type so one kind of title never fills the shelf */
function mixByType(recs: Recommendation[], max: number): Recommendation[] {
  const buckets = new Map<string, Recommendation[]>();
  for (const r of recs) {
    const k = r.item.mediaType;
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  const keys = [...buckets.keys()];
  const out: Recommendation[] = [];
  let i = 0;
  while (out.length < max) {
    let pushed = false;
    for (const k of keys) {
      const item = buckets.get(k)?.[i];
      if (item && out.length < max) {
        out.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
    i++;
  }
  return out;
}

function dedupe(recs: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const r of recs) {
    if (seen.has(r.item.localId)) continue;
    seen.add(r.item.localId);
    out.push(r);
  }
  return out;
}

function sourceChipLabel(provider: string): string {
  switch (provider) {
    case "anilist":
      return "AniList";
    case "kitsu":
      return "Kitsu";
    case "tvmaze":
      return "TVMaze";
    case "imdb":
    case "imdb-series":
      return "IMDb";
    case "wikidata":
      return "Wikidata";
    case "echo-demo":
    case "echo-catalog":
      return "Sample";
    default:
      return provider;
  }
}

function RecCard({
  rec,
  inLibrary,
  lang,
  t,
  tv,
  onInterested,
  onNotForMe,
  onWatched,
  onPlanned,
  onDetails,
}: {
  rec: Recommendation;
  inLibrary: boolean;
  lang: "en" | "ar";
  t: (k: string, p?: Record<string, string | number>) => string;
  tv: (slug: string) => string;
  onInterested: () => void;
  onNotForMe: () => void;
  onWatched: () => void;
  onPlanned: () => void;
  onDetails: () => void;
}) {
  const { item, reasonData } = rec;
  const title = item.title;
  const reasonLine = [...reasonData]
    .sort((a, b) => reasonRank(b.key) - reasonRank(a.key))
    .map((r) =>
      t(`discover.reason.${r.key}`, {
        values: r.values.map((v) => tv(v)).join(" · "),
      }),
    )
    .filter(Boolean)
    .slice(0, 2);

  return (
    <article className="echo-card relative flex w-[230px] shrink-0 snap-start flex-col overflow-hidden rounded-xl transition hover:border-echo-accent/50">
      <button onClick={onDetails} className="relative text-start" aria-label={title}>
        <PosterTile item={item} width={230} height={280} className="w-full rounded-none rounded-t-xl" />
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-sm bg-card/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <MediaTypeIcon type={item.mediaType} className="h-3 w-3" aria-hidden />
          {t(`media.${item.mediaType}`)}
        </span>
        <span className="echo-chip absolute end-2 top-2 !bg-card/90">{sourceChipLabel(item.provider)}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">
          {item.releaseYear ?? "—"}
          {item.contentRating ? ` · ${item.contentRating}` : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {item.genres.slice(0, 2).map((g) => (
            <Badge key={g} variant="secondary" className="text-[9px]">{tv(g)}</Badge>
          ))}
        </div>
        {/* explanation — always the real shared features */}
        <ul className="mt-0.5 flex flex-col gap-1">
          {reasonLine.map((line, i) => (
            <li key={i} className="flex items-start gap-1 break-words text-[11px] leading-snug text-echo-teal line-clamp-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
          <ActionBtn label={t("discover.addPlanned")} onClick={onPlanned} icon={<Plus className="h-3 w-3" />} primary />
          <ActionBtn label={t("discover.interested")} onClick={onInterested} icon={<ThumbsUp className="h-3 w-3" />} />
          <ActionBtn label={t("discover.notForMe")} onClick={onNotForMe} icon={<ThumbsDown className="h-3 w-3" />} />
          <ActionBtn label={t("discover.alreadyWatched")} onClick={onWatched} icon={<Check className="h-3 w-3" />} />
        </div>
      </div>
      {inLibrary && (
        <span className="absolute" data-in-library aria-hidden />
      )}
    </article>
  );
}

function ActionBtn({
  label,
  onClick,
  icon,
  primary,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium transition",
        primary
          ? "border-echo-accent/50 bg-echo-accent/10 text-foreground hover:bg-echo-accent/20"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
