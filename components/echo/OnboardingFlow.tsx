/**
 * ECHO — first-run onboarding: welcome → interests → seed taste → reveal.
 * Skippable at every non-essential step; demo path is clearly labelled.
 * Seed search runs against the real catalogue sources (AniList, TVMaze,
 * IMDb); a handful of suggested queries gets people started.
 */

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, ArrowLeft, Search, Star, Heart, FlaskConical, ShieldCheck, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import { searchCatalogue, type CatalogueSearchOutcome } from "@/lib/echo/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaTypeIcon, PosterTile, RatingStars } from "./bits";
import { EchoLogo } from "./EchoLogo";
import { MapCanvas } from "./MapCanvas";
import { computeIdf } from "@/lib/echo/engine/features";
import { buildSimilarityGraph } from "@/lib/echo/engine/similarity";
import { computeClusters } from "@/lib/echo/engine/cluster";
import { computeLayout } from "@/lib/echo/engine/layout";
import type { MediaItem, MediaType, Rating } from "@/lib/echo/types";
import { MEDIA_TYPES } from "@/lib/echo/types";

type Step = "welcome" | "interests" | "seed" | "reveal";

const GENRE_CARDS = [
  "sci-fi",
  "drama",
  "thriller",
  "mystery",
  "comedy",
  "action",
  "romance",
  "fantasy",
  "horror",
  "crime",
  "animation",
  "slice-of-life",
];

const TONE_CARDS: { id: string; tags: string[] }[] = [
  { id: "dark", tags: ["dark", "tense", "gritty"] },
  { id: "warm", tags: ["emotional", "family-bonds", "hopeful"] },
  { id: "light", tags: ["comedic", "whimsical", "high-energy"] },
  { id: "mind", tags: ["mind-bending", "thought-provoking", "nonlinear"] },
];

const PACING_CARDS: { id: string; tags: string[] }[] = [
  { id: "slow", tags: ["slow-burn"] },
  { id: "balanced", tags: [] },
  { id: "fast", tags: ["high-energy", "tense"] },
];

/** Suggested starting queries per interest — real searches, curated prompts. */
const SEED_SUGGESTIONS: Record<MediaType, string[]> = {
  anime: ["Fullmetal Alchemist", "Death Note", "Frieren", "Monster"],
  movie: ["Inception", "Parasite", "The Dark Knight", "Spirited Away"],
  series: ["Breaking Bad", "Severance", "The Office", "Chernobyl"],
  game: ["The Witcher 3", "Elden Ring", "Zelda: Breath of the Wild", "Hades"],
  book: ["Nineteen Eighty-Four", "The Little Prince", "Dune", "Crime and Punishment"],
  manga: ["One Piece", "Berserk", "Dragon Ball", "Frieren"],
  comics: ["Watchmen", "Tintin", "Maus", "Persepolis"],
};

export function OnboardingFlow() {
  const { t, tv } = useI18n();
  const [step, setStep] = React.useState<Step>("welcome");
  const [interests, setInterests] = React.useState<MediaType[]>([
    "anime",
    "movie",
    "series",
    "game",
    "book",
    "manga",
    "comics",
  ]);
  const [seedPath, setSeedPath] = React.useState<"a" | "b" | null>(null);

  const completeOnboarding = useEchoStore((s) => s.completeOnboarding);
  const seedFromOnboarding = useEchoStore((s) => s.seedFromOnboarding);
  const startDemo = useEchoStore((s) => s.startDemo);

  // path A state
  const [picks, setPicks] = React.useState<{ item: MediaItem; rating?: Rating; isFavourite?: boolean }[]>([]);
  // path B state
  const [selGenres, setSelGenres] = React.useState<string[]>([]);
  const [selTone, setSelTone] = React.useState<string[]>([]);
  const [selPacing, setSelPacing] = React.useState<string | null>(null);

  const finish = () => {
    if (seedPath === "a" && picks.length) {
      void seedFromOnboarding(picks, []);
    } else if (seedPath === "b") {
      const prefs: { featureKey: string; value: "liked" }[] = [];
      selGenres.forEach((g) => prefs.push({ featureKey: `genre:${g}`, value: "liked" }));
      selTone.forEach((toneId) => {
        const tone = TONE_CARDS.find((x) => x.id === toneId);
        tone?.tags.forEach((tag) => prefs.push({ featureKey: `tag:${tag}`, value: "liked" }));
      });
      if (selPacing) {
        const pacing = PACING_CARDS.find((x) => x.id === selPacing);
        pacing?.tags.forEach((tag) => prefs.push({ featureKey: `tag:${tag}`, value: "liked" }));
      }
      if (prefs.length) void seedFromOnboarding([], prefs);
    }
    setStep("reveal");
  };

  const enterMap = () => void completeOnboarding();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-120px)] w-full max-w-2xl flex-col px-5 py-8 md:justify-center">
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.section
            key="welcome"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center gap-7 text-center"
          >
            <EchoLogo size={76} className="text-echo-accent" />
            <div>
              <p className="echo-overline mb-3">{t("app.tagline")}</p>
              <h1 className="echo-display text-3xl font-semibold leading-tight text-foreground md:text-[2.6rem]">
                {t("onb.welcome.title")}
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
                {t("onb.welcome.sub")}
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2.5">
              <Button size="lg" onClick={() => setStep("interests")} className="h-12 text-base">
                {t("onb.welcome.build")}
                <ArrowRight className="ms-1 h-5 w-5 rtl:rotate-180" aria-hidden />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => void startDemo()}
                className="h-11 gap-2"
              >
                <FlaskConical className="h-4 w-4 text-echo-gold" aria-hidden />
                {t("onb.welcome.demo")}
              </Button>
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-echo-pine" aria-hidden />
              {t("onb.welcome.privacy")}
            </p>
          </motion.section>
        )}

        {step === "interests" && (
          <motion.section
            key="interests"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-6"
          >
            <header>
              <p className="echo-overline mb-1">01 — {t("onb.interests.title")}</p>
              <h1 className="echo-display text-2xl font-semibold">{t("onb.interests.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("onb.interests.sub")}</p>
            </header>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7" role="group">
              {(MEDIA_TYPES as readonly MediaType[]).map((mt) => {
                const active = interests.includes(mt);
                return (
                  <button
                    key={mt}
                    onClick={() =>
                      setInterests((prev) =>
                        prev.includes(mt) ? prev.filter((x) => x !== mt) : [...prev, mt],
                      )
                    }
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-2.5 rounded-xl border p-5 transition",
                      active
                        ? "border-echo-accent/60 bg-echo-accent/8"
                        : "border-border bg-card hover:border-echo-accent/35",
                    )}
                  >
                    <MediaTypeIcon type={mt} className={cn("h-8 w-8", active ? "text-echo-accent" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{t(`media.${mt}`)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep("welcome")}>
                <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden />
                {t("onb.seed.back")}
              </Button>
              <Button onClick={() => setStep("seed")} disabled={interests.length === 0}>
                {t("onb.interests.next")}
                <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          </motion.section>
        )}

        {step === "seed" && (
          <motion.section
            key="seed"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-5"
          >
            <header>
              <p className="echo-overline mb-1">02 — {t("onb.seed.title")}</p>
              <h1 className="echo-display text-2xl font-semibold">{t("onb.seed.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("onb.seed.sub")}</p>
            </header>

            {!seedPath ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setSeedPath("a")}
                  className="flex-1 rounded-xl border border-border bg-card p-5 text-start transition hover:border-echo-accent/50 hover:bg-echo-accent/5"
                >
                  <Star className="mb-2 h-6 w-6 text-echo-gold" aria-hidden />
                  <p className="font-semibold">{t("onb.seed.pathA")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("onb.seed.pathA.sub")}</p>
                </button>
                <button
                  onClick={() => setSeedPath("b")}
                  className="flex-1 rounded-xl border border-border bg-card p-5 text-start transition hover:border-echo-teal/50 hover:bg-echo-teal/5"
                >
                  <Sparkles className="mb-2 h-6 w-6 text-echo-teal" aria-hidden />
                  <p className="font-semibold">{t("onb.seed.pathB")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("onb.seed.pathB.sub")}</p>
                </button>
              </div>
            ) : seedPath === "a" ? (
              <SeedPicker
                interests={interests}
                picks={picks}
                onChange={setPicks}
              />
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="echo-overline mb-2">{t("onb.prefs.genres")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_CARDS.map((g) => {
                      const active = selGenres.includes(g);
                      return (
                        <button
                          key={g}
                          onClick={() =>
                            setSelGenres((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g]))
                          }
                          aria-pressed={active}
                          className={cn(
                            "rounded-md border px-3.5 py-1.5 text-sm transition",
                            active
                              ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {tv(g)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h2 className="echo-overline mb-2">{t("onb.prefs.tone")}</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TONE_CARDS.map((tone) => {
                      const active = selTone.includes(tone.id);
                      return (
                        <button
                          key={tone.id}
                          onClick={() =>
                            setSelTone((prev) =>
                              active ? prev.filter((x) => x !== tone.id) : [...prev, tone.id],
                            )
                          }
                          aria-pressed={active}
                          className={cn(
                            "rounded-md border px-3 py-2.5 text-sm transition",
                            active
                              ? "border-echo-teal/60 bg-echo-teal/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t(`onb.tone.${tone.id}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h2 className="echo-overline mb-2">{t("onb.prefs.pacing")}</h2>
                  <div className="grid grid-cols-3 gap-2">
                    {PACING_CARDS.map((p) => {
                      const active = selPacing === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelPacing(active ? null : p.id)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-md border px-3 py-2.5 text-sm transition",
                            active
                              ? "border-echo-plum/60 bg-echo-plum/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t(`onb.pacing.${p.id}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/80">{t("onb.prefs.sub")}</p>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  if (seedPath) setSeedPath(null);
                  else setStep("interests");
                }}
              >
                <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden />
                {t("onb.seed.back")}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep("reveal")}>
                  {t("onb.seed.skip")}
                </Button>
                <Button onClick={finish}>
                  {seedPath === "b" ? t("onb.prefs.finish") : t("onb.seed.continue")}
                  <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
              </div>
            </div>
          </motion.section>
        )}

        {step === "reveal" && (
          <RevealStep
            onEnter={enterMap}
            onAddMore={() => {
              void useEchoStore.getState().completeOnboarding().then(() => {
                useEchoStore.getState().setAddDialog(true);
              });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------- path A: pick titles (real catalogue search) ----------------

function SeedPicker({
  interests,
  picks,
  onChange,
}: {
  interests: MediaType[];
  picks: { item: MediaItem; rating?: Rating; isFavourite?: boolean }[];
  onChange: (picks: { item: MediaItem; rating?: Rating; isFavourite?: boolean }[]) => void;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<MediaItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [outcome, setOutcome] = React.useState<CatalogueSearchOutcome | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = React.useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        setOutcome(null);
        return;
      }
      setSearching(true);
      try {
        const res = await searchCatalogue(q, {
          mediaTypes: interests,
          limit: 9,
        });
        setResults(res.results.map((r) => r.item));
        setOutcome(res);
      } catch {
        setResults([]);
        setOutcome(null);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    },
    [interests],
  );

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 350);
  };

  const pickedIds = new Set(picks.map((p) => p.item.localId));
  const suggestions = interests.flatMap((mt) => SEED_SUGGESTIONS[mt]).slice(0, 6);

  const toggle = (item: MediaItem) => {
    if (pickedIds.has(item.localId)) {
      onChange(picks.filter((p) => p.item.localId !== item.localId));
    } else {
      onChange([...picks, { item }]);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("onb.seed.searchPlaceholder")}
            className="h-9 bg-card ps-8"
            aria-label={t("onb.seed.searchPlaceholder")}
          />
        </div>
        <span className="echo-chip shrink-0">{t("onb.seed.selected", { n: picks.length })}</span>
      </div>

      {/* suggested starting points (real queries) */}
      {!searched && !query.trim() && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                void runSearch(s);
              }}
              className="echo-chip transition hover:border-echo-accent hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {outcome?.usedFallback && (
        <p className="mb-2 text-[11px] leading-relaxed text-echo-gold">
          {outcome.offline ? t("add.fallbackNotice") : t("add.sampleNotice")}
        </p>
      )}

      <div className="echo-scroll grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
        {results.map((item) => {
          const picked = pickedIds.has(item.localId);
          const pick = picks.find((p) => p.item.localId === item.localId);
          return (
            <div
              key={item.localId}
              className={cn(
                "flex flex-col rounded-xl border p-2 transition",
                picked ? "border-echo-accent/60 bg-echo-accent/8" : "border-border bg-card",
              )}
            >
              <button onClick={() => toggle(item)} className="group text-start" aria-pressed={picked}>
                <div className="relative">
                  <PosterTile item={item} width={999} height={999} className="w-full" />
                  {picked && (
                    <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-echo-accent text-[11px] font-bold text-card">
                      ✓
                    </span>
                  )}
                  <span className="absolute bottom-1.5 start-1.5 rounded-sm bg-card/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {item.releaseYear ?? "—"}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-xs font-medium text-foreground">
                  {lang === "ar" && item.titleAr ? item.titleAr : item.title}
                </p>
              </button>
              {picked && (
                <div className="mt-1 flex items-center justify-between gap-1">
                  <RatingStars
                    value={pick?.rating}
                    onChange={(r) =>
                      onChange(
                        picks.map((p) => (p.item.localId === item.localId ? { ...p, rating: r } : p)),
                      )
                    }
                    size="sm"
                  />
                  <button
                    onClick={() =>
                      onChange(
                        picks.map((p) =>
                          p.item.localId === item.localId
                            ? { ...p, isFavourite: !p.isFavourite }
                            : p,
                        ),
                      )
                    }
                    aria-label={t("onb.seed.markFav")}
                    aria-pressed={Boolean(pick?.isFavourite)}
                    className="rounded p-1 text-muted-foreground transition hover:text-echo-accent"
                  >
                    <Heart className={cn("h-4 w-4", pick?.isFavourite && "fill-echo-accent text-echo-accent")} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {searching && <p className="mt-2 text-[11px] text-muted-foreground">{t("add.searching")}</p>}
      {searched && !searching && results.length === 0 && query.trim() && (
        <p className="mt-2 text-[11px] text-muted-foreground">{t("add.noResults.sub")}</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground/80">{t("onb.seed.rateHint")}</p>
    </div>
  );
}

// ---------------- reveal ----------------

function RevealStep({ onEnter, onAddMore }: { onEnter: () => void; onAddMore: () => void }) {
  const { t } = useI18n();
  const settings = useEchoStore((s) => s.settings);
  const media = useEchoStore((s) => s.media);
  const entries = useEchoStore((s) => s.entries);
  const mediaById = React.useMemo(
    () => new Map(media.map((m) => [m.localId, m])),
    [media],
  );

  const entryByLocalId = React.useMemo(
    () => new Map(entries.map((e) => [e.mediaLocalId, e])),
    [entries],
  );
  const libraryItems = React.useMemo(
    () =>
      entries
        .map((e) => mediaById.get(e.mediaLocalId))
        .filter((m): m is MediaItem => Boolean(m)),
    [entries, mediaById],
  );

  const scene = React.useMemo(() => {
    if (!libraryItems.length) return null;
    const idf = computeIdf(libraryItems);
    const edges = buildSimilarityGraph(libraryItems, { idf });
    const clusters = computeClusters(libraryItems, edges);
    const positions = computeLayout(libraryItems, edges, clusters, {});
    return { edges, clusters, positions };
  }, [libraryItems]);

  const empty = libraryItems.length === 0;
  const small = libraryItems.length > 0 && libraryItems.length < 8;

  return (
    <motion.section
      key="reveal"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45 }}
      className="flex flex-col gap-5"
    >
      <header className="text-center">
        <p className="echo-overline mb-2">{t("onb.reveal.overline")}</p>
        <h1 className="echo-display text-2xl font-semibold">{t("onb.reveal.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("onb.reveal.sub")}</p>
      </header>

      <div className="echo-sheet h-[42dvh] min-h-[280px] overflow-hidden">
        {scene ? (
          <MapCanvas
            items={libraryItems}
            entryByLocalId={entryByLocalId}
            edges={scene.edges}
            clusters={scene.clusters}
            positions={scene.positions}
            filters={{ types: new Set(), statuses: new Set(), favouritesOnly: false, genre: null }}
            labelsOn
            animate={settings.animations}
            themeKey={settings.theme}
            selectedId={null}
            onSelect={() => {}}
            selectedEdge={null}
            onSelectEdge={() => {}}
            focusId={null}
            fitSignal={0}
            revealKey="onboarding"
          />
        ) : (
          <div className="echo-breathe flex h-full items-center justify-center">
            <Compass className="h-12 w-12 text-muted-foreground/50" strokeWidth={1.2} />
          </div>
        )}
      </div>

      <p className={cn("text-center text-sm", small ? "text-echo-gold" : "text-muted-foreground")}>
        {empty ? t("onb.reveal.empty") : small ? t("onb.reveal.small") : ""}
      </p>

      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={onEnter} className="px-8">
          {t("onb.reveal.cta")}
        </Button>
        <Button size="lg" variant="outline" onClick={onAddMore}>
          {t("onb.reveal.addMore")}
        </Button>
      </div>
    </motion.section>
  );
}
