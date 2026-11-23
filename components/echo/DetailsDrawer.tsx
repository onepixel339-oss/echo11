/**
 * ECHO — title details drawer (side on desktop, bottom sheet on mobile).
 * Metadata + user controls + explainable connections.
 */

"use client";

import React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Heart, ExternalLink, Plus, Sparkles, ImageIcon, Loader2, Search, PlayCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import { useActiveLibrary } from "@/lib/echo/store";
import { searchCatalogue } from "@/lib/echo/providers";
import { matchCandidates } from "@/lib/echo/providers/match";
import { providerChipLabel } from "./AddTitleDialog";
import { useArabicTranslation } from "./useSynopsisTranslation";
import { Input } from "@/components/ui/input";
import { similarity } from "@/lib/echo/engine/similarity";
import { computeIdf } from "@/lib/echo/engine/features";
import { DEMO_CATALOGUE, demoToMediaItem } from "@/lib/echo/data/demoCatalogue";
import { relatedWorksForLocalId } from "@/lib/echo/data/curatedLinks";
import type { LibraryStatus, MediaItem, Rating } from "@/lib/echo/types";
import { MediaTypeIcon, PosterTile, RatingStars, STATUS_ORDER, StatusChip, statusLabelKey } from "./bits";
import { useToast } from "@/hooks/use-toast";

const DEMO_BY_ID = new Map(DEMO_CATALOGUE.map((s) => [demoToMediaItem(s).localId, demoToMediaItem(s)]));

export function DetailsDrawer() {
  const { t, tv, lang } = useI18n();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const selectedId = useEchoStore((s) => s.selectedLocalId);
  const select = useEchoStore((s) => s.select);
  const { media, entries, mediaById } = useActiveLibrary();
  const addTitle = useEchoStore((s) => s.addTitle);
  const updateEntry = useEchoStore((s) => s.updateEntry);
  const linkEntryMedia = useEchoStore((s) => s.linkEntryMedia);

  const entry = React.useMemo(
    () => entries.find((e) => e.mediaLocalId === selectedId),
    [entries, selectedId],
  );

  // session-only previews (Discover / coming-soon cards not in the library yet)
  const staged = useEchoStore((s) => s.stagedMedia);
  const stagedById = React.useMemo(
    () => new Map(staged.map((m) => [m.localId, m])),
    [staged],
  );

  const item = React.useMemo(() => {
    if (!selectedId) return null;
    return (
      mediaById.get(selectedId) ??
      stagedById.get(selectedId) ??
      (useEchoStore.getState().settings.demoMode ? DEMO_BY_ID.get(selectedId) : null) ??
      (mediaById.size === 0 ? DEMO_BY_ID.get(selectedId) : null)
    );
  }, [selectedId, mediaById, stagedById]);

  // note/tag local state while editing
  const [note, setNote] = React.useState("");
  const [tagDraft, setTagDraft] = React.useState("");
  React.useEffect(() => {
    setNote(entry?.personalNote ?? "");
  }, [entry?.id, entry?.personalNote]);

  const idf = React.useMemo(() => computeIdf([...media, ...DEMO_BY_ID.values()]), [media]);

  // connections within the user's library
  const connections = React.useMemo(() => {
    if (!item || !entry) return [];
    const libraryItems = entries
      .map((e) => mediaById.get(e.mediaLocalId))
      .filter((m): m is MediaItem => Boolean(m) && m!.localId !== item.localId);
    return libraryItems
      .map((m) => ({ item: m, res: similarity(item, m, { idf }) }))
      .filter((x) => x.res.score >= 0.34)
      .sort((a, b) => b.res.score - a.res.score)
      .slice(0, 3);
  }, [item, entry, entries, mediaById, idf]);

  // best highly-rated match → "why it connects to your taste"
  const tasteAnchor = React.useMemo(() => {
    if (!item) return null;
    const rated = entries
      .filter((e) => e.rating !== undefined && e.rating >= 4 && e.mediaLocalId !== item.localId)
      .map((e) => ({ e, m: mediaById.get(e.mediaLocalId) }))
      .filter((x): x is { e: (typeof entries)[number]; m: MediaItem } => Boolean(x.m));
    let best: { m: MediaItem; rating: number; res: ReturnType<typeof similarity> } | null = null;
    for (const { e, m } of rated) {
      const res = similarity(item, m, { idf });
      if (!best || res.score > best.res.score) best = { m, rating: e.rating!, res };
    }
    return best && best.res.score >= 0.34 ? best : null;
  }, [item, entries, mediaById, idf]);

  // ---- Arabic auto-translation: title + synopsis, ONE request per title
  // (client session cache + server 24h cache; provider Arabic always wins)
  // The machine-translated NAME is shown as a helper line only — it never
  // replaces the original title anywhere (proper nouns must not be mangled).
  const { title: autoTitleAr, synopsis: autoAr, loading: translating } = useArabicTranslation({
    localId: item?.localId ?? null,
    title: item?.title,
    titleAr: item?.titleAr,
    synopsis: item?.synopsis,
    synopsisAr: item?.synopsisAr,
    lang: lang === "ar" ? "ar" : "en",
  });
  const [showOriginal, setShowOriginal] = React.useState(false);
  React.useEffect(() => {
    setShowOriginal(false);
  }, [item?.localId]);

  // cross-media adaptations: typed relationships to other catalogue works
  // (computed before the early return — hooks order must be unconditional)
  const relatedWorks = React.useMemo(() => {
    if (!item) return [];
    const refs = relatedWorksForLocalId(item.localId);
    const bySeed = new Map(DEMO_CATALOGUE.map((s) => [s.id, demoToMediaItem(s)]));
    return refs
      .map((r) => ({ ...r, media: bySeed.get(r.seedId) }))
      .filter((r): r is typeof r & { media: MediaItem } => Boolean(r.media));
  }, [item]);

  if (!item) return null;

  // Titles keep their original identity everywhere (the Netflix/IMDb standard):
  // machine translation never replaces a proper noun as the PRIMARY heading.
  // The Arabic reading (fresh machine translation, or a previously stored one)
  // sits underneath as a helper line; official provider Arabic would arrive as
  // titleAr from a provider that actually ships Arabic names.
  const autoMachineTitle = lang === "ar" && autoTitleAr ? (autoTitleAr as string) : null;
  const machineTitleAr =
    lang === "ar"
      ? (autoMachineTitle ??
        (item.titleAr && item.titleAr !== item.title ? item.titleAr : null))
      : null;
  const title = item.title;
  const originalNameLine =
    item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : null;
  // provider-supplied Arabic > auto translation > original (per interface language)
  const usingAutoAr = lang === "ar" && !item.synopsisAr && Boolean(autoAr) && !showOriginal;
  const synopsis = usingAutoAr ? (autoAr as string) : lang === "ar" && item.synopsisAr ? item.synopsisAr : item.synopsis;
  const canToggleSynopsis = lang === "ar" && !item.synopsisAr && Boolean(autoAr) && Boolean(item.synopsis);
  const metaBits: string[] = [];
  if (item.releaseYear) {
    metaBits.push(
      item.endYear && item.endYear !== item.releaseYear
        ? t("meta.to", { from: item.releaseYear, to: item.endYear })
        : String(item.releaseYear),
    );
  }
  metaBits.push(
    item.subtype && item.mediaType !== "book" && item.subtype !== "manga"
      ? t(`subtype.${item.subtype}`)
      : t(`media.${item.mediaType}`),
  );
  if (item.issueNumber) metaBits.push(t("meta.issue", { n: item.issueNumber }));
  if (item.volumeCount) metaBits.push(t("meta.volumes", { n: item.volumeCount }));
  if (item.chapterCount) metaBits.push(t("meta.chapters", { n: item.chapterCount }));
  if (item.issueCount) metaBits.push(t("meta.issues", { n: item.issueCount }));
  if (item.episodeCount) metaBits.push(t("meta.episodes", { n: item.episodeCount }));
  else if (item.runtimeMinutes) {
    // games store average playtime — show it as hours, not minutes
    metaBits.push(
      item.mediaType === "game"
        ? t("meta.hours", { n: Math.max(1, Math.round(item.runtimeMinutes / 60)) })
        : t("meta.minutes", { n: item.runtimeMinutes }),
    );
  }

  // publication status chip for serialized print media (manga / comics)
  const pubStatusLabel = item.publicationStatus
    ? t(`pub.${item.publicationStatus}`)
    : null;

  const addTag = () => {
    const v = tagDraft.trim().toLowerCase();
    if (!v || !entry) return;
    if (entry.userTags.includes(v)) {
      setTagDraft("");
      return;
    }
    void updateEntry(entry.id, { userTags: [...entry.userTags, v] });
    setTagDraft("");
  };

  return (
    <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && select(null)}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "echo-card overflow-y-auto echo-scroll p-0",
          isMobile ? "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl" : "w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{synopsis ?? title}</SheetDescription>
        </SheetHeader>

        <div className="flex gap-4 p-5 pb-3">
          <PosterTile item={item} width={96} height={144} className="shrink-0 shadow-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
            {(machineTitleAr || originalNameLine) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {machineTitleAr && (
                  <>
                    <span className="text-foreground/75">{machineTitleAr}</span>
                    {autoMachineTitle && (
                      <span className="text-[10px] text-muted-foreground/70">
                        ({t("translate.autoNote")})
                      </span>
                    )}
                  </>
                )}
                {originalNameLine && <span className="truncate">{originalNameLine}</span>}
              </p>
            )}
            {item.trailerUrl && (
              <a
                href={item.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-echo-accent/40 bg-echo-accent/10 px-3 py-1 text-xs font-medium text-echo-accent transition hover:bg-echo-accent/20"
              >
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                {t("details.trailer")}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {metaBits.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {i > 0 && <span aria-hidden>·</span>}
                  {b}
                </span>
              ))}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {pubStatusLabel && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {pubStatusLabel}
                </Badge>
              )}
              {typeof item.publicScore === "number" && item.publicScore > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 border-echo-gold/40 bg-echo-gold/10 text-[10px] font-semibold text-echo-gold"
                >
                  <Star className="h-3 w-3" aria-hidden />
                  {item.publicScore.toFixed(1)}
                  <span className="font-normal text-muted-foreground">/10</span>
                </Badge>
              )}
              {item.contentRating ? (
                <Badge variant="outline" className="text-[10px]">{item.contentRating}</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {t("contentRating.unknown")}
                </Badge>
              )}
              {item.provider === "echo-demo" && (
                <Badge className="bg-echo-gold/15 text-echo-gold hover:bg-echo-gold/25 text-[10px]">
                  {t("demo.catalogueTag")}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.genres.slice(0, 4).map((g) => (
                <Badge key={g} variant="secondary" className="text-[10px]">{tv(g)}</Badge>
              ))}
            </div>
          </div>
        </div>

        {(synopsis || translating) && (
          <div className="px-5 pb-3">
            {synopsis && (
              <p className="text-sm leading-relaxed text-muted-foreground">{synopsis}</p>
            )}
            {!synopsis && translating && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("translate.loading")}
              </p>
            )}
            {canToggleSynopsis && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowOriginal((v) => !v)}
                  className="text-[11px] font-medium text-echo-accent transition hover:underline"
                >
                  {showOriginal ? t("translate.showArabic") : t("translate.showOriginal")}
                </button>
                {!showOriginal && (
                  <span className="text-[10px] text-muted-foreground/70">
                    {t("translate.autoNote")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* user controls */}
        <div className="mx-5 mb-3 rounded-xl border border-border bg-secondary/40 p-4">
          {entry ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="status-select" className="text-xs font-medium text-muted-foreground">
                    {t("details.status")}
                  </label>
                  <Select
                    value={entry.status}
                    onValueChange={(v) => void updateEntry(entry.id, { status: v as LibraryStatus })}
                  >
                    <SelectTrigger id="status-select" className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {t(statusLabelKey(s, item.mediaType))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  onClick={() => void updateEntry(entry.id, { isFavourite: !entry.isFavourite })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    entry.isFavourite
                      ? "border-echo-accent/50 bg-echo-accent/10 text-echo-accent"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={entry.isFavourite}
                >
                  <Heart className={cn("h-3.5 w-3.5", entry.isFavourite && "fill-echo-accent")} aria-hidden />
                  {t("details.fav")}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{t("details.rate")}</span>
                <div className="flex items-center gap-3">
                  <RatingStars
                    value={entry.rating}
                    onChange={(r) => void updateEntry(entry.id, { rating: r })}
                    size="md"
                  />
                  {entry.rating === undefined && (
                    <span className="text-[10px] text-muted-foreground">{t("details.notRatedHint")}</span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="note" className="text-xs font-medium text-muted-foreground">
                  {t("library.note")}
                </label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => note !== (entry.personalNote ?? "") && void updateEntry(entry.id, { personalNote: note })}
                  placeholder={t("library.notePlaceholder")}
                  className="mt-1 min-h-[64px] bg-background/60 text-sm"
                  maxLength={600}
                />
              </div>
              <div className="mt-3">
                <label htmlFor="tags" className="text-xs font-medium text-muted-foreground">
                  {t("library.tags")}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {entry.userTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => void updateEntry(entry.id, { userTags: entry.userTags.filter((x) => x !== tag) })}
                      className="group inline-flex items-center gap-1 rounded-md border border-echo-teal/40 bg-echo-teal/10 px-2.5 py-0.5 text-[11px] text-echo-teal"
                      aria-label={`${t("app.more")}: ${tag}`}
                    >
                      {tag}
                      <span className="opacity-50 group-hover:opacity-100">×</span>
                    </button>
                  ))}
                  <input
                    id="tags"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTag()}
                    placeholder={t("library.tagsPlaceholder")}
                    className="w-36 rounded-md border border-dashed border-border bg-transparent px-2.5 py-0.5 text-[11px] outline-none focus:border-echo-teal/50"
                  />
                </div>
              </div>
            </>
          ) : (
            <Button
              onClick={() => {
                void addTitle(item, { status: "planned" }).then(() =>
                  toast({ description: t("toast.added") }),
                );
              }}
              className="w-full"
            >
              <Plus className="me-1 h-4 w-4" aria-hidden />
              {t("details.addLibrary")}
            </Button>
          )}
        </div>

        {/* manual entry → attach the real catalogue record (poster, genres) */}
        {entry && item.provider === "manual" && (
          <LinkSourceSection
            item={item}
            entryId={entry.id}
            matchReview={entry.matchReview}
            onLinked={(linked) => {
              toast({
                description: t("toast.autoLinked", {
                  title: lang === "ar" && linked.titleAr ? linked.titleAr : linked.title,
                  source: providerChipLabel(linked.provider),
                }),
              });
            }}
          />
        )}

        {/* why it connects to your taste */}
        {tasteAnchor && (
          <div className="mx-5 mb-3 rounded-xl border border-echo-teal/30 bg-echo-teal/6 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-echo-teal" aria-hidden />
              {t("details.whyConnects")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("details.whyConnects.sub", {
                title: lang === "ar" && tasteAnchor.m.titleAr ? tasteAnchor.m.titleAr : tasteAnchor.m.title,
                rating: tasteAnchor.rating,
              })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tasteAnchor.res.reasons.map((r, i) => (
                <li key={i}>
                  <Badge variant="secondary" className="text-[10px]">
                    {r.values.map((v) => (r.kind === "genre" || r.kind === "tag" ? tv(v) : r.kind === "format" ? t(`media.${v}`) : v)).join(", ")}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* adaptations & related works (typed cross-media relationships) */}
        {relatedWorks.length > 0 && (
          <div className="px-5 pb-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-echo-teal" aria-hidden />
              {t("details.related")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {relatedWorks.map((r) => (
                <li key={r.seedId}>
                  <button
                    onClick={() => select(r.media.localId, r.media)}
                    className="flex max-w-[240px] items-center gap-2 rounded-xl border border-border bg-card/60 p-1.5 pe-3 text-start transition hover:border-echo-accent/40"
                    aria-label={`${r.direction === "adapted-from" ? t("details.adaptedFrom") : t("details.adaptedInto")}: ${r.media.title}`}
                  >
                    <PosterTile item={r.media} width={28} height={42} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {lang === "ar" && r.media.titleAr ? r.media.titleAr : r.media.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MediaTypeIcon type={r.media.mediaType} className="h-3 w-3 shrink-0" aria-hidden />
                        {t(`media.${r.media.mediaType}`)}
                        <span aria-hidden>·</span>
                        {r.direction === "adapted-from"
                          ? t("details.adaptedFrom")
                          : t("details.adaptedInto")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* similar in library */}
        <div className="px-5 pb-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {entry ? t("details.similar") : t("details.recommend")}
          </h3>
          {connections.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("details.similar.none")}</p>
          )}
          <ul className="flex flex-col gap-2">
            {connections.map((c) => {
              const cEntry = entries.find((e) => e.mediaLocalId === c.item.localId);
              return (
                <li key={c.item.localId}>
                  <button
                    onClick={() => select(c.item.localId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 p-2 text-start transition hover:border-echo-accent/40"
                  >
                    <PosterTile item={c.item} width={34} height={51} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <span className="truncate">
                          {lang === "ar" && c.item.titleAr ? c.item.titleAr : c.item.title}
                        </span>
                        <MediaTypeIcon type={c.item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {c.res.reasons
                          .slice(0, 2)
                          .map((r) => r.values.map((v) => (r.kind === "genre" || r.kind === "tag" ? tv(v) : r.kind === "format" ? t(`media.${v}`) : v)).join(", "))
                          .join(" · ")}
                      </span>
                    </span>
                    {cEntry && (
                      <StatusChip status={cEntry.status} mediaType={c.item.mediaType} className="shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* source */}
          <div className="mt-5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            <p>
              {t("details.source")}:{" "}
              {item.provider === "echo-demo" ? t("demo.sourceNote") : (item.sourceAttribution ?? item.provider)}
            </p>
            {item.canonicalUrl && (
              <a
                href={item.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-echo-accent hover:underline"
              >
                {item.canonicalUrl}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Manual-entry helper: search the live catalogues and attach the real record
 * (poster, genres, synopsis) to this entry. Shown only for manual items.
 * When identity matching flagged this entry as ambiguous, the flagged
 * candidates are surfaced first so the user can resolve the review.
 */
function LinkSourceSection({
  item,
  entryId,
  matchReview,
  onLinked,
}: {
  item: MediaItem;
  entryId: string;
  matchReview?: { flaggedAt: string; candidates: { localId: string; provider: string; providerId: string; title: string; releaseYear?: number; mediaType: MediaItem["mediaType"] }[] };
  onLinked: (linked: MediaItem) => void;
}) {
  const { t, lang } = useI18n();
  const linkEntryMedia = useEchoStore((s) => s.linkEntryMedia);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(item.title);
  const [results, setResults] = React.useState<MediaItem[]>([]);
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const outcome = await searchCatalogue(q, { mediaTypes: [item.mediaType], limit: 8 });
      if (outcome.usedFallback) {
        setResults([]);
        setState("done");
        return;
      }
      // rank live hits by match confidence; keep every hit pickable
      const ranked = matchCandidates(item, outcome.results.map((r) => r.item), 0);
      const rest = outcome.results
        .map((r) => r.item)
        .filter((m) => !ranked.some((x) => x.item.localId === m.localId));
      setResults([...ranked.map((r) => r.item), ...rest].slice(0, 6));
      setState("done");
    } catch {
      setResults([]);
      setState("done");
    }
  }, [item]);

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 350);
  };

  return (
    <div className="mx-5 mb-3 rounded-xl border border-echo-gold/30 bg-echo-gold/6 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ImageIcon className="h-4 w-4 text-echo-gold" aria-hidden />
        {t("link.title")}
        {matchReview && (
          <span className="echo-chip text-echo-gold">{t("link.review")}</span>
        )}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("link.sub")}</p>
      {matchReview && (
        <p className="mt-1 text-[11px] leading-relaxed text-echo-gold/90">
          {t("link.review.sub", { n: matchReview.candidates.length })}
        </p>
      )}
      {!open ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2.5 gap-1.5"
          onClick={() => {
            setOpen(true);
            void runSearch(query);
          }}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          {t("link.searchPlaceholder")}
        </Button>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("link.searchPlaceholder")}
              className="h-9 bg-background ps-8 text-sm"
              aria-label={t("link.searchPlaceholder")}
            />
            {state === "loading" && (
              <Loader2 className="absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>
          {state === "done" && results.length === 0 && (
            <p className="text-[11px] text-muted-foreground">{t("link.none")}</p>
          )}
          <ul className="flex flex-col gap-1.5" aria-live="polite">
            {results.map((r) => (
              <li key={r.localId}>
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-1.5 pe-2">
                  <PosterTile item={r} width={30} height={45} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {lang === "ar" && r.titleAr ? r.titleAr : r.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {[r.releaseYear, providerChipLabel(r.provider)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2.5 text-[11px]"
                    onClick={() => {
                      void linkEntryMedia(entryId, r).then((ok) => {
                        if (ok) onLinked(r);
                      });
                    }}
                  >
                    {t("link.confirm")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

void RatingStars;
