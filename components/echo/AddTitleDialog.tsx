/**
 * ECHO — Federated search dialog (Phase 5).
 *
 * Searches the world's external catalogues live through the federated
 * engine: category routing, parallel providers, progressive results as each
 * source answers, per-provider status chips, evidence-based dedup (merged
 * results keep every contributing source), and labelled local ECHO content
 * filling coverage gaps. Arabic + English UI; every result keeps its source.
 */

"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Check, PenLine, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import {
  createFederatedSearch,
  resetFederatedCooldowns,
} from "@/lib/echo/federated/engine";
import type {
  FederatedHit,
  FederatedSnapshot,
  ProviderCallState,
} from "@/lib/echo/federated/types";
import type { MediaItem, MediaType } from "@/lib/echo/types";
import { MEDIA_TYPES } from "@/lib/echo/types";
import { MediaTypeIcon, PosterTile } from "./bits";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/lib/echo/ids";
import { cn } from "@/lib/utils";

export function providerChipLabel(provider: string): string {
  switch (provider) {
    case "anilist":
      return "AniList";
    case "kitsu":
      return "Kitsu";
    case "tvmaze":
      return "TVMaze";
    case "trakt":
      return "Trakt";
    case "imdb":
    case "imdb-series":
      return "IMDb";
    case "rawg":
      return "RAWG";
    case "igdb":
      return "IGDB";
    case "openlib":
      return "Open Library";
    case "inventaire":
      return "Inventaire";
    case "bnf":
      return "BnF";
    case "madb":
      return "MADB";
    case "wikidata":
      return "Wikidata";
    case "echo-demo":
    case "echo-catalog":
      return "Sample";
    case "manual":
      return "You";
    default:
      return provider;
  }
}

/* ------------------------------ provider chips ------------------------------ */

function ProviderStatusChip({ state }: { state: ProviderCallState }) {
  const { t } = useI18n();
  const meta: Record<
    ProviderCallState["status"],
    { cls: string; label: string }
  > = {
    pending: { cls: "text-muted-foreground border-border", label: t("fs.provider.pending") },
    ok: { cls: "text-echo-pine border-echo-pine/40", label: t("fs.provider.ok", { count: state.count }) },
    empty: { cls: "text-muted-foreground/70 border-border", label: t("fs.provider.empty") },
    error: { cls: "text-echo-vermilion border-echo-vermilion/40", label: t("fs.provider.error") },
    timeout: { cls: "text-echo-vermilion border-echo-vermilion/40", label: t("fs.provider.timeout") },
    rate_limited: { cls: "text-echo-gold border-echo-gold/40", label: t("fs.provider.rate_limited") },
    unconfigured: { cls: "text-muted-foreground/60 border-dashed", label: t("fs.provider.unconfigured") },
    skipped: { cls: "text-muted-foreground/60 border-dashed", label: t("fs.provider.skipped") },
    cancelled: { cls: "text-muted-foreground/60 border-dashed", label: t("fs.provider.cancelled") },
    offline: { cls: "text-muted-foreground/60 border-dashed", label: t("app.offlineShort") },
  };
  const m = meta[state.status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-tight",
        m.cls,
      )}
      title={`${state.label} — ${state.categories.map((c) => c).join(", ")}`}
    >
      {state.status === "pending" && (
        <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
      )}
      <span className="font-medium">{state.label}</span>
      <span className="opacity-80">· {m.label}</span>
    </span>
  );
}

/* --------------------------------- result row --------------------------------- */

function HitRow({
  hit,
  inLibrary,
  onAdd,
}: {
  hit: FederatedHit;
  inLibrary: boolean;
  onAdd: (item: MediaItem) => void;
}) {
  const { t, tv, lang } = useI18n();
  const item = hit.item;
  const title = lang === "ar" && item.titleAr ? item.titleAr : item.title;
  const sources = hit.contributions.map((c) => c.providerLabel);
  return (
    <li>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition hover:border-echo-accent/40">
        <PosterTile item={item} width={36} height={54} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="min-w-0 flex-1 truncate">
              {title}
              {!hit.isLive && (
                <span className="ms-1.5 rounded border border-echo-gold/40 px-1 text-[9px] uppercase tracking-wide text-echo-gold">
                  {t("fs.sampleChip")}
                </span>
              )}
            </span>
            <MediaTypeIcon type={item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {[
              item.releaseYear,
              t(`media.${item.mediaType}`),
              item.subtype,
              item.contentRating,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
            {item.genres.slice(0, 3).map((g) => tv(g)).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {sources.map((label, i) => (
              <span
                key={`${label}-${i}`}
                className={cn(
                  "echo-chip",
                  hit.isLive ? "" : "border-echo-gold/40 text-echo-gold",
                )}
              >
                {label}
              </span>
            ))}
            {hit.contributions.length > 1 && (
              <span className="text-[9px] text-muted-foreground/70">
                {sources.length === 1 ? "" : "· merged match"}
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={inLibrary ? "outline" : "default"}
          disabled={inLibrary}
          onClick={() => onAdd(item)}
          className="shrink-0"
        >
          {inLibrary ? (
            <>
              <Check className="me-1 h-3.5 w-3.5" aria-hidden />
              {t("add.inLibrary")}
            </>
          ) : (
            <>
              <Plus className="me-1 h-3.5 w-3.5" aria-hidden />
              {t("add.add")}
            </>
          )}
        </Button>
      </div>
    </li>
  );
}

/* ------------------------------- filter facets ------------------------------- */

interface Filters {
  year?: string;
  language?: string;
  country?: string;
  subtype?: string;
}

function facetsOf(hits: FederatedHit[]) {
  const years = new Set<string>();
  const languages = new Set<string>();
  const countries = new Set<string>();
  const subtypes = new Set<string>();
  for (const h of hits) {
    if (h.item.releaseYear) years.add(String(h.item.releaseYear));
    for (const l of h.item.languages ?? []) languages.add(l);
    for (const c of h.item.countries ?? []) countries.add(c);
    if (h.item.subtype) subtypes.add(h.item.subtype);
  }
  const sorted = (s: Set<string>) => [...s].sort();
  return {
    years: sorted(years),
    languages: sorted(languages),
    countries: sorted(countries),
    subtypes: sorted(subtypes),
  };
}

function FilterBar({
  facets,
  filters,
  setFilters,
}: {
  facets: ReturnType<typeof facetsOf>;
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const { t } = useI18n();
  const hasAny =
    facets.years.length > 1 ||
    facets.languages.length > 1 ||
    facets.countries.length > 1 ||
    facets.subtypes.length > 1;
  if (!hasAny) return null;
  const selectCls =
    "h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground max-w-28";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {facets.years.length > 1 && (
        <select
          aria-label={t("fs.filter.year")}
          className={selectCls}
          value={filters.year ?? ""}
          onChange={(e) => setFilters({ ...filters, year: e.target.value || undefined })}
        >
          <option value="">{t("fs.filter.year")} · {t("app.all")}</option>
          {facets.years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {facets.languages.length > 1 && (
        <select
          aria-label={t("fs.filter.language")}
          className={selectCls}
          value={filters.language ?? ""}
          onChange={(e) => setFilters({ ...filters, language: e.target.value || undefined })}
        >
          <option value="">{t("fs.filter.language")} · {t("app.all")}</option>
          {facets.languages.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}
      {facets.countries.length > 1 && (
        <select
          aria-label={t("fs.filter.country")}
          className={selectCls}
          value={filters.country ?? ""}
          onChange={(e) => setFilters({ ...filters, country: e.target.value || undefined })}
        >
          <option value="">{t("fs.filter.country")} · {t("app.all")}</option>
          {facets.countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
      {facets.subtypes.length > 1 && (
        <select
          aria-label={t("fs.filter.subtype")}
          className={selectCls}
          value={filters.subtype ?? ""}
          onChange={(e) => setFilters({ ...filters, subtype: e.target.value || undefined })}
        >
          <option value="">{t("fs.filter.subtype")} · {t("app.all")}</option>
          {facets.subtypes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
      {(filters.year || filters.language || filters.country || filters.subtype) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setFilters({})}
        >
          <X className="me-1 h-3 w-3" aria-hidden />
          {t("fs.filter.clear")}
        </Button>
      )}
    </div>
  );
}

/* --------------------------------- the dialog --------------------------------- */

export function AddTitleDialog() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const open = useEchoStore((s) => s.addDialogOpen);
  const setOpen = useEchoStore((s) => s.setAddDialog);
  const addTitle = useEchoStore((s) => s.addTitle);
  const interests = useEchoStore((s) => s.settings.interests);
  const entries = useEchoStore((s) => s.entries);

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<MediaType | "all">("all");
  const [snapshot, setSnapshot] = React.useState<FederatedSnapshot | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<Filters>({});
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRef = React.useRef<{ cancel: () => void } | null>(null);

  const libraryIds = React.useMemo(() => new Set(entries.map((e) => e.mediaLocalId)), [entries]);

  // categories for this search: the selected category, or the user's interests
  const activeCategories = React.useMemo(
    () => (category === "all" ? (interests.length ? interests : MEDIA_TYPES) : [category]),
    [category, interests],
  );

  const runSearch = React.useCallback(
    (q: string) => {
      // cancel the previous in-flight search (query changed)
      handleRef.current?.cancel();
      handleRef.current = null;
      if (!q.trim()) {
        setSnapshot(null);
        setSearched(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      const handle = createFederatedSearch(q, {
        categories: activeCategories,
        limitPerProvider: 8,
        lang,
        onUpdate: (snap) => setSnapshot(snap), // progressive rendering
      });
      handleRef.current = handle;
      void handle.promise
        .then((snap) => {
          setSnapshot(snap);
          setSearched(true);
        })
        .catch(() => undefined)
        .finally(() => setSearching(false));
    },
    [activeCategories, lang],
  );

  const onQueryChange = (v: string) => {
    setQuery(v);
    setFilters({});
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 350);
  };

  const onCategoryChange = (c: MediaType | "all") => {
    setCategory(c);
    setFilters({});
    if (query.trim()) {
      // re-run immediately with the new routing
      if (debounceRef.current) clearTimeout(debounceRef.current);
      runSearch(query);
    }
  };

  const closeDialog = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
    setQuery("");
    setSnapshot(null);
    setSearched(false);
    setManualOpen(false);
    setFilters({});
    resetFederatedCooldowns();
  };

  React.useEffect(() => {
    return () => {
      // cancel on unmount too
      handleRef.current?.cancel();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const allHits = snapshot?.hits ?? [];

  // client-side facet filters ("when data supports it")
  const filteredHits = React.useMemo(() => {
    return allHits.filter((h) => {
      if (filters.year && String(h.item.releaseYear ?? "") !== filters.year) return false;
      if (filters.language && !(h.item.languages ?? []).includes(filters.language)) return false;
      if (filters.country && !(h.item.countries ?? []).includes(filters.country)) return false;
      if (filters.subtype && h.item.subtype !== filters.subtype) return false;
      return true;
    });
  }, [allHits, filters]);

  // grouped by category in "all" mode; flat within a selected category
  const grouped = React.useMemo(() => {
    const groups: { type: MediaType; hits: FederatedHit[] }[] = [];
    for (const type of MEDIA_TYPES) {
      const hits = filteredHits.filter((h) => h.item.mediaType === type);
      if (hits.length) groups.push({ type, hits });
    }
    return groups;
  }, [filteredHits]);

  // Honest per-provider status: a provider that answered with nothing, or
  // failed / timed out / is cooling down, STAYS visible with its state —
  // users must see what was queried and what happened to it, not only the
  // successes. (Skipped/cancelled entries are engine-internal noise.)
  const liveProviders = (snapshot?.providers ?? []).filter(
    (p) => p.status !== "skipped" && p.status !== "cancelled",
  );
  const answeredProviders = (snapshot?.providers ?? []).filter((p) => p.status === "ok");

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
      <DialogContent className="echo-card max-h-[88dvh] max-w-lg overflow-y-auto echo-scroll">
        <DialogHeader>
          <DialogTitle className="echo-display">{t("add.title")}</DialogTitle>
          <DialogDescription>{t("fs.liveNotice")}</DialogDescription>
        </DialogHeader>

        {!manualOpen ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={t("add.searchPlaceholder")}
                className="h-11 bg-background ps-9"
                aria-label={t("add.searchPlaceholder")}
              />
              {searching && (
                <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              )}
            </div>

            {/* category routing: All + the seven categories */}
            <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("add.searchPlaceholder")}>
              <button
                role="tab"
                aria-selected={category === "all"}
                onClick={() => onCategoryChange("all")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  category === "all"
                    ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t("fs.category.all")}
              </button>
              {MEDIA_TYPES.map((mt) => (
                <button
                  key={mt}
                  role="tab"
                  aria-selected={category === mt}
                  onClick={() => onCategoryChange(mt)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    category === mt
                      ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`media.${mt}`)}
                </button>
              ))}
            </div>

            {/* per-provider status (progressive) */}
            {liveProviders.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-live="polite">
                {liveProviders.map((p) => (
                  <ProviderStatusChip key={`${p.id}-${p.categories.join()}`} state={p} />
                ))}
              </div>
            )}

            {snapshot?.offline && (
              <p className="text-[11px] leading-relaxed text-echo-gold">{t("add.fallbackNotice")}</p>
            )}
            {!snapshot?.offline && snapshot?.usedLocal && (
              <p className="text-[11px] leading-relaxed text-echo-gold">{t("fs.localNotice")}</p>
            )}

            {searched && !searching && filteredHits.length === 0 && query.trim() && (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
                {t("add.noResults", { q: query })}
                <br />
                {t("add.noResults.sub")}
              </p>
            )}

            <FilterBar
              facets={facetsOf(allHits)}
              filters={filters}
              setFilters={setFilters}
            />

            {category === "all" ? (
              <div className="flex flex-col gap-3" aria-live="polite">
                {grouped.map(({ type, hits }) => (
                  <section key={type} aria-label={t(`media.${type}`)}>
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`media.${type}`)}
                      <span className="ms-1 font-normal text-muted-foreground/70">
                        {t("fs.results", { count: hits.length })}
                      </span>
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {hits.map((hit) => (
                        <HitRow
                          key={hit.item.localId}
                          hit={hit}
                          inLibrary={libraryIds.has(hit.item.localId)}
                          onAdd={(item) =>
                            void addTitle(item, { status: "planned" }).then(() =>
                              toast({ description: t("toast.added") }),
                            )
                          }
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5" aria-live="polite">
                {filteredHits.map((hit) => (
                  <HitRow
                    key={hit.item.localId}
                    hit={hit}
                    inLibrary={libraryIds.has(hit.item.localId)}
                    onAdd={(item) =>
                      void addTitle(item, { status: "planned" }).then(() =>
                        toast({ description: t("toast.added") }),
                      )
                    }
                  />
                ))}
              </ul>
            )}

            {/* sources note */}
            {snapshot && answeredProviders.length > 0 && (
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t("fs.sourcesCount", { count: answeredProviders.length })} ·{" "}
                {answeredProviders.map((p) => p.label).join(" · ")}
              </p>
            )}

            <Button variant="outline" onClick={() => setManualOpen(true)} className="gap-2">
              <PenLine className="h-4 w-4" aria-hidden />
              {t("add.manualFallback")}
            </Button>
          </>
        ) : (
          <ManualEntryForm
            onDone={(item) => {
              void addTitle(item, { status: "planned" }).then(async (entry) => {
                toast({ description: t("toast.added") });
                closeDialog();
                // background: attach the real catalogue record (poster, genres,
                // synopsis) when a confident match exists
                const linked = await useEchoStore.getState().autoLinkEntry(entry.id);
                if (linked) {
                  toast({
                    description: t("toast.autoLinked", {
                      title: lang === "ar" && linked.titleAr ? linked.titleAr : linked.title,
                      source: providerChipLabel(linked.provider),
                    }),
                  });
                }
              });
            }}
            onCancel={() => setManualOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryForm({
  onDone,
  onCancel,
}: {
  onDone: (item: MediaItem) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<MediaType>("movie");
  const [year, setYear] = React.useState("");
  const [genres, setGenres] = React.useState("");
  const [synopsis, setSynopsis] = React.useState("");

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const name = title.trim();
    if (!name) return;
    const y = parseInt(year, 10);
    const item: MediaItem = {
      localId: `manual:${makeId("m")}`,
      provider: "manual",
      providerId: name,
      mediaType: type,
      format:
        type === "movie"
          ? "film"
          : type === "game"
            ? "game"
            : type === "book" || type === "manga" || type === "comics"
              ? "book"
              : "series",
      title: name,
      releaseYear: y >= 1900 && y <= 2100 ? y : undefined,
      genres: genres
        .split(",")
        .map((g) => g.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 5),
      tags: [],
      synopsis: synopsis.trim() || undefined,
      sourceAttribution: "Added manually by you",
    };
    onDone(item);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="m-title" className="text-xs font-medium text-muted-foreground">
          {t("manual.name")} *
        </label>
        <Input
          id="m-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("manual.namePlaceholder")}
          className="mt-1 bg-background"
          required
          maxLength={120}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="m-type" className="text-xs font-medium text-muted-foreground">
            {t("manual.type")} *
          </label>
          <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label={t("manual.type")}>
            {(MEDIA_TYPES as readonly MediaType[]).map((mt) => (
              <button
                key={mt}
                type="button"
                role="radio"
                aria-checked={type === mt}
                onClick={() => setType(mt)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition",
                  type === mt
                    ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`media.${mt}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="w-28">
          <label htmlFor="m-year" className="text-xs font-medium text-muted-foreground">
            {t("manual.year")}
          </label>
          <Input
            id="m-year"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="1998"
            className="mt-1 bg-background"
          />
        </div>
      </div>
      <div>
        <label htmlFor="m-genres" className="text-xs font-medium text-muted-foreground">
          {t("manual.genres")}
        </label>
        <Input
          id="m-genres"
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
          placeholder="sci-fi, drama"
          className="mt-1 bg-background"
          maxLength={120}
        />
      </div>
      <div>
        <label htmlFor="m-synopsis" className="text-xs font-medium text-muted-foreground">
          {t("manual.synopsis")}
        </label>
        <Textarea
          id="m-synopsis"
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          className="mt-1 min-h-[70px] bg-background"
          maxLength={400}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("app.cancel")}
        </Button>
        <Button type="submit">{t("manual.add")}</Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">{t("manual.autoLinkHint")}</p>
    </form>
  );
}
