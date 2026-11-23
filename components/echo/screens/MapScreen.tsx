/**
 * ECHO — Map screen: the signature experience.
 * Deterministic graph → islands → surveyor layout; canvas + accessible list.
 */

"use client";

import React from "react";
import {
  Maximize2,
  RefreshCw,
  List,
  Map as MapIcon,
  Search,
  X,
  Heart,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { computeIdf } from "@/lib/echo/engine/features";
import { buildSimilarityGraph } from "@/lib/echo/engine/similarity";
import { computeClusters } from "@/lib/echo/engine/cluster";
import { computeLayout } from "@/lib/echo/engine/layout";
import { DEMO_CATALOGUE, demoToMediaItem } from "@/lib/echo/data/demoCatalogue";
import type { MediaItem, MediaType, UserMediaEntry } from "@/lib/echo/types";
import { MEDIA_TYPES } from "@/lib/echo/types";
import { MapCanvas, type MapFilters } from "../MapCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import {
  EmptyState,
  MediaTypeIcon,
  RatingStars,
  STATUS_ORDER,
  StatusChip,
  statusColorVar,
  PosterTile,
  mapNodeRadius,
} from "../bits";
import { useToast } from "@/hooks/use-toast";
import { canonicalKey } from "@/lib/echo/ids";

export function MapScreen() {
  const { t, tv } = useI18n();
  const { toast } = useToast();
  const { media: activeMedia, entries, mediaById } = useActiveLibrary();
  const settings = useEchoStore((s) => s.settings);
  const mapLayout = useEchoStore((s) => s.mapLayout);
  const saveMapLayout = useEchoStore((s) => s.saveMapLayout);
  const clearMapLayout = useEchoStore((s) => s.clearMapLayout);
  const setAddDialog = useEchoStore((s) => s.setAddDialog);
  const startDemo = useEchoStore((s) => s.startDemo);
  const selectedId = useEchoStore((s) => s.selectedLocalId);
  const select = useEchoStore((s) => s.select);
  const selectedEdge = useEchoStore((s) => s.selectedEdge);
  const selectEdge = useEchoStore((s) => s.selectEdge);

  const [filters, setFilters] = React.useState<MapFilters>({
    types: new Set(),
    statuses: new Set(),
    favouritesOnly: false,
    genre: null,
  });
  const [search, setSearch] = React.useState("");
  const [listView, setListView] = React.useState(false);
  const [fitSignal, setFitSignal] = React.useState(0);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const [legendOpen, setLegendOpen] = React.useState(false);

  void activeMedia;

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

  const userTags = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of entries) map[e.mediaLocalId] = e.userTags;
    return map;
  }, [entries]);

  // IDF background corpus: library + the built-in sample catalogue keeps
  // "drama"-type common genres from over-connecting small libraries.
  const idf = React.useMemo(() => {
    const corpus = [...libraryItems];
    const libIds = new Set(libraryItems.map((m) => m.localId));
    for (const seed of DEMO_CATALOGUE) {
      const item = demoToMediaItem(seed);
      if (!libIds.has(item.localId)) corpus.push(item);
    }
    return computeIdf(corpus);
  }, [libraryItems]);

  const edges = React.useMemo(
    () =>
      libraryItems.length >= 2
        ? buildSimilarityGraph(libraryItems, { idf, userTags })
        : [],
    [libraryItems, idf, userTags],
  );

  const clusters = React.useMemo(
    () => computeClusters(libraryItems, edges),
    [libraryItems, edges],
  );

  // deterministic recompute on data change; incremental via existing positions
  const dataKey = React.useMemo(
    () =>
      canonicalKey(libraryItems.map((m) => m.localId)) +
      "#" +
      canonicalKey(entries.map((e) => `${e.mediaLocalId}:${e.rating ?? "-"}:${e.isFavourite ? 1 : 0}`)),
    [libraryItems, entries],
  );

  const positions = React.useMemo(() => {
    if (!libraryItems.length) return {};
    const existing =
      layoutVersion === 0 && mapLayout ? mapLayout.positions : undefined;
    return computeLayout(libraryItems, edges, clusters, {
      existing,
      radiusOf: (item) => mapNodeRadius(item, entryByLocalId.get(item.localId)),
    });
  }, [dataKey, layoutVersion]);

  // persist layout (debounced)
  React.useEffect(() => {
    if (!libraryItems.length) return;
    const handle = setTimeout(() => {
      void saveMapLayout({
        positions,
        zoom: 1,
        panX: 0,
        panY: 0,
        activeFilters: {},
        layoutVersion: 2,
        updatedAt: new Date().toISOString(),
      });
    }, 600);
    return () => clearTimeout(handle);
  }, [positions]);

  const genreOptions = React.useMemo(() => {
    const set = new Set<string>();
    libraryItems.forEach((m) => m.genres.forEach((g) => set.add(g)));
    return [...set].sort((a, b) => tv(a).localeCompare(tv(b)));
  }, [libraryItems]);

  const filteredCount = React.useMemo(() => {
    let count = 0;
    for (const m of libraryItems) {
      const e = entryByLocalId.get(m.localId);
      if (!e) continue;
      if (filters.types.size && !filters.types.has(m.mediaType)) continue;
      if (filters.statuses.size && !filters.statuses.has(e.status)) continue;
      if (filters.favouritesOnly && !e.isFavourite) continue;
      if (filters.genre && !m.genres.includes(filters.genre)) continue;
      count++;
    }
    return count;
  }, [libraryItems, entryByLocalId, filters]);

  const searchHits = React.useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return libraryItems.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.titleAr ?? "").includes(search.trim()) ||
        m.genres.some((g) => g.includes(q)),
    );
  }, [search, libraryItems]);

  const islandCount = clusters.filter((c) => c.members.length >= 2).length;

  const edgeInfo = React.useMemo(() => {
    if (!selectedEdge) return null;
    const edge = edges.find(
      (e) =>
        (e.a === selectedEdge.a && e.b === selectedEdge.b) ||
        (e.a === selectedEdge.b && e.b === selectedEdge.a),
    );
    const a = mediaById.get(selectedEdge.a);
    const b = mediaById.get(selectedEdge.b);
    if (!edge || !a || !b) return null;
    return { edge, a, b };
  }, [selectedEdge, edges, mediaById]);

  // ---------------- empty state ----------------
  if (!libraryItems.length) {
    return (
      <div className="px-4 pt-10 md:px-8">
        <EmptyState
          icon={<Compass className="h-12 w-12" strokeWidth={1.2} />}
          title={t("map.empty.title")}
          sub={t("map.empty.sub")}
        >
          <Button onClick={() => setAddDialog(true)}>{t("map.empty.cta")}</Button>
          <Button variant="outline" onClick={() => void startDemo()}>
            {t("map.empty.demo")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-3 pt-3 md:px-6 md:pt-4">
      {/* ---------- toolbar ---------- */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1 md:max-w-[240px]">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("map.searchPlaceholder")}
            className="h-9 bg-card ps-8"
            aria-label={t("map.searchPlaceholder")}
          />
          {search && (
            <button
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label={t("app.close")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* type filters — segmented */}
        <div
          className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
          role="group"
          aria-label={t("map.filter.type")}
        >
          {(MEDIA_TYPES as readonly MediaType[]).map((type) => (
            <Toggle
              key={type}
              size="sm"
              pressed={filters.types.has(type)}
              onPressedChange={(v) => {
                const next = new Set(filters.types);
                if (v) next.add(type);
                else next.delete(type);
                setFilters((f) => ({ ...f, types: next }));
              }}
              aria-label={t(`media.${type}`)}
              className="h-7 gap-1 px-2.5 text-xs data-[state=on]:bg-secondary"
            >
              <MediaTypeIcon type={type} className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t(`media.${type}`)}</span>
            </Toggle>
          ))}
        </div>

        {/* status filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <span className="echo-dot" style={{ background: "var(--echo-accent)" }} aria-hidden />
              {filters.statuses.size ? `${filters.statuses.size}` : t("map.filter.status")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52">
            <div className="flex flex-col gap-1">
              {STATUS_ORDER.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/70">
                  <input
                    type="checkbox"
                    checked={filters.statuses.has(s)}
                    onChange={(e) => {
                      const next = new Set(filters.statuses);
                      if (e.target.checked) next.add(s);
                      else next.delete(s);
                      setFilters((f) => ({ ...f, statuses: next }));
                    }}
                    className="h-4 w-4 accent-[var(--echo-accent)]"
                  />
                  <span className="echo-dot" style={{ background: statusColorVar(s) }} aria-hidden />
                  {t(`status.${s}`)}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* favourites */}
        <Button
          variant={filters.favouritesOnly ? "default" : "outline"}
          size="sm"
          className={cn("h-9 w-9 p-0")}
          onClick={() => setFilters((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))}
          aria-pressed={filters.favouritesOnly}
          aria-label={t("map.filter.favourites")}
          title={t("map.filter.favourites")}
        >
          <Heart
            className={cn("h-4 w-4", filters.favouritesOnly && "fill-current text-primary-foreground")}
            aria-hidden
          />
        </Button>

        {/* genre filter */}
        {genreOptions.length > 1 && (
          <select
            value={filters.genre ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value || null }))}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none"
            aria-label={t("map.filter.genre")}
          >
            <option value="">{t("map.filter.genre")}: {t("app.all")}</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>{tv(g)}</option>
            ))}
          </select>
        )}

        <div className="ms-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setFitSignal((x) => x + 1)}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("map.fit")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              void clearMapLayout();
              setLayoutVersion((v) => v + 1);
              setFitSignal((x) => x + 1);
              toast({ description: t("toast.layoutReset") });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("map.resetLayout")}</span>
          </Button>
          <Button
            variant={listView ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setListView((v) => !v)}
            aria-pressed={listView}
          >
            {listView ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <List className="h-3.5 w-3.5" aria-hidden />}
            <span className="hidden sm:inline">{listView ? t("map.viewMap") : t("map.viewList")}</span>
          </Button>
        </div>
      </div>

      {/* ---------- stats ---------- */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <span className="echo-overline">{t("map.nodes", { n: filteredCount })}</span>
        <span aria-hidden className="text-muted-foreground/50">·</span>
        <span className="echo-overline">{t("map.connections", { n: edges.length })}</span>
        <span aria-hidden className="text-muted-foreground/50">·</span>
        <span className="echo-overline">{t("map.islands", { n: islandCount })}</span>
        {libraryItems.length < 8 && (
          <span className="text-xs text-echo-gold">{t("map.hint.small")}</span>
        )}
      </div>

      {/* search hits */}
      {search.trim() && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {searchHits.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          {searchHits.map((m) => (
            <button
              key={m.localId}
              onClick={() => {
                select(m.localId);
                setFocusId(m.localId);
                setListView(false);
              }}
              className="echo-chip transition hover:border-echo-accent hover:text-foreground"
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {/* ---------- the sheet ---------- */}
      <div className="echo-sheet relative h-[calc(100dvh-348px)] min-h-[360px] overflow-hidden md:h-[calc(100dvh-235px)]">
        {listView ? (
          <MapListTable
            items={libraryItems}
            entryByLocalId={entryByLocalId}
            clusters={clusters}
            onSelect={(id) => select(id)}
          />
        ) : (
          <MapCanvas
            items={libraryItems}
            entryByLocalId={entryByLocalId}
            edges={edges}
            clusters={clusters}
            positions={positions}
            filters={filters}
            labelsOn={settings.mapLabels}
            animate={settings.animations}
            themeKey={settings.theme}
            selectedId={selectedId}
            onSelect={select}
            selectedEdge={selectedEdge}
            onSelectEdge={selectEdge}
            focusId={focusId}
            fitSignal={fitSignal}
            revealKey={dataKey}
          />
        )}

        {/* legend — a real map legend, fixed to the sheet */}
        <div className="absolute bottom-3 end-3 z-10">
          {legendOpen ? (
            <div className="echo-card w-56 rounded-lg p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="echo-overline">{t("map.legend.title")}</h3>
                <button
                  onClick={() => setLegendOpen(false)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={t("app.close")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="flex items-end gap-1" aria-hidden>
                    <span className="h-2 w-2 rounded-sm bg-foreground/80" />
                    <span className="h-3 w-3 rounded-sm bg-foreground/80" />
                    <span className="h-4 w-4 rounded-sm bg-foreground/80" />
                  </span>
                  {t("map.legend.size")}
                </li>
                <li className="flex items-center gap-2">
                  <Heart className="h-3.5 w-3.5 fill-echo-accent text-echo-accent" aria-hidden />
                  {t("map.legend.fav")}
                </li>
                <li className="flex items-center gap-2">
                  <svg width="24" height="10" aria-hidden>
                    <path d="M1 8 Q12 2 23 8" fill="none" stroke="var(--foreground)" strokeOpacity="0.4" strokeWidth="1.4" />
                  </svg>
                  {t("map.legend.edge")}
                </li>
                <li className="mt-1 border-t border-dashed border-border pt-2">{t("map.legend.ring")}</li>
                {STATUS_ORDER.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className="echo-dot" style={{ background: statusColorVar(s) }} aria-hidden />
                    {t(`status.${s}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              onClick={() => setLegendOpen(true)}
              className="echo-card flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground shadow transition hover:text-foreground"
            >
              <Compass className="h-4 w-4" aria-hidden />
              {t("map.legend.title")}
            </button>
          )}
        </div>

        {/* edge explanation */}
        {edgeInfo && !listView && (
          <div className="echo-card echo-scroll absolute bottom-3 start-3 z-10 max-h-[calc(100%-1.5rem)] max-w-xs overflow-y-auto rounded-lg p-4 shadow-xl">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="echo-overline">{t("map.whyEdge")}</h3>
              <button
                onClick={() => selectEdge(null)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={t("app.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-0.5 text-sm font-semibold text-foreground">
              {edgeInfo.a.title}
            </p>
            <p className="mb-3 text-sm font-semibold text-foreground">
              {edgeInfo.b.title}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">{t("map.whyEdge.intro")}</p>
            <ul className="flex flex-col gap-1.5">
              {edgeInfo.edge.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Badge variant="secondary" className="mt-0 shrink-0 text-[10px]">
                    {t(`map.reason.${r.kind}`)}
                  </Badge>
                  <span className="text-foreground/90">
                    {r.values.map((v) => (r.kind === "genre" || r.kind === "tag" ? tv(v) : r.kind === "format" ? t(`media.${v}`) : v)).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-semibold text-echo-accent">
              {t("map.whyEdge.strength", { pct: Math.round(edgeInfo.edge.score * 100) })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="max-w-[120px] truncate" onClick={() => select(edgeInfo.a.localId)}>
                {edgeInfo.a.title}
              </Button>
              <Button size="sm" variant="outline" className="max-w-[120px] truncate" onClick={() => select(edgeInfo.b.localId)}>
                {edgeInfo.b.title}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- accessible list view ----------------

function MapListTable({
  items,
  entryByLocalId,
  clusters,
  onSelect,
}: {
  items: MediaItem[];
  entryByLocalId: Map<string, UserMediaEntry>;
  clusters: { id: string; labelKey: string | null; members: string[] }[];
  onSelect: (id: string) => void;
}) {
  const { t, tv, lang } = useI18n();
  const clusterOf = React.useMemo(() => {
    const map = new Map<string, number>();
    clusters.forEach((c, i) => c.members.forEach((m) => map.set(m, i)));
    return map;
  }, [clusters]);

  const groups = React.useMemo(() => {
    const byCluster = new Map<number, MediaItem[]>();
    for (const m of items) {
      const ci = clusterOf.get(m.localId) ?? -1;
      const list = byCluster.get(ci) ?? [];
      list.push(m);
      byCluster.set(ci, list);
    }
    return [...byCluster.entries()].sort((a, b) => {
      if (a[0] === -1) return 1;
      if (b[0] === -1) return -1;
      return b[1].length - a[1].length;
    });
  }, [items, clusterOf]);

  let neutralCounter = 0;

  return (
    <div className="echo-scroll h-full overflow-y-auto p-4 md:p-6">
      <h2 className="echo-display mb-1 text-base font-semibold">{t("map.listTitle")}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t("map.listSub")}</p>
      {groups.map(([ci, list]) => {
        const cluster = ci >= 0 ? clusters[ci] : null;
        let label: string;
        if (cluster?.labelKey) {
          label = tv(cluster.labelKey.split(":")[1]);
        } else if (list.length >= 2) {
          neutralCounter++;
          label = t("map.cluster.neutral", { n: neutralCounter });
        } else {
          label = "—";
        }
        return (
          <section key={ci} aria-label={label} className="mb-5">
            <h3 className="echo-overline mb-2 border-b border-dashed border-border pb-1">
              {label} · {list.length}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {list.map((m) => {
                const e = entryByLocalId.get(m.localId);
                return (
                  <li key={m.localId}>
                    <button
                      onClick={() => onSelect(m.localId)}
                      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-start transition hover:border-border hover:bg-secondary/50"
                    >
                      <PosterTile item={m} width={30} height={45} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {m.title}
                          </span>
                          <MediaTypeIcon type={m.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {m.genres.slice(0, 3).map((g) => tv(g)).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{m.releaseYear}</span>
                      {e && <StatusChip status={e.status} className="shrink-0" />}
                      <RatingStars value={e?.rating} size="sm" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
