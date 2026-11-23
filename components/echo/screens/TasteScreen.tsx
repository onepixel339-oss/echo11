/**
 * ECHO — Taste DNA: confidence-labelled insights built from real signals.
 * Every insight carries its sample size; low samples say so honestly.
 */

"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarDays,
  Compass,
  Dna,
  Loader2,
  RefreshCw,
  RotateCcw,
  Scale,
  Shapes,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { buildTasteProfile, tasteInsights, mostInfluentialTitles } from "@/lib/echo/engine/taste";
import {
  buildCompanionSnapshot,
  fetchCompanionReading,
  type CompanionInsight,
  type CompanionReading,
} from "@/lib/echo/ai/companion";
import { buildWeeklyDigest, fetchWeeklyDigest } from "@/lib/echo/ai/weekly";
import type { TasteFeatureStat, TasteProfile } from "@/lib/echo/types";
import { EmptyState, PosterTile, RatingStars } from "../bits";
import { TasteCardDialog } from "../TasteCardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function TasteScreen() {
  const { t, tv, lang } = useI18n();
  const { entries, mediaById } = useActiveLibrary();
  const feedback = useEchoStore((s) => s.feedback);
  const settings = useEchoStore((s) => s.settings);
  const dismissed = useEchoStore((s) => s.settings.dismissedInsights);
  const dismissInsight = useEchoStore((s) => s.dismissInsight);
  const undoDismissInsight = useEchoStore((s) => s.undoDismissInsight);
  const setView = useEchoStore((s) => s.setView);
  const [cardOpen, setCardOpen] = React.useState(false);
  const canShareCard = entries.length > 0;

  // ---- taste companion (optional AI; degrades to nothing on failure)
  const [reading, setReading] = React.useState<CompanionReading | null>(null);
  const [companionBusy, setCompanionBusy] = React.useState(false);
  const [companionError, setCompanionError] = React.useState(false);
  const [companionRateLimited, setCompanionRateLimited] = React.useState(false);
  const canCompanion = entries.length >= 2;

  const runCompanion = React.useCallback(async () => {
    if (companionBusy) return;
    const snap = buildCompanionSnapshot({
      mediaById,
      entries,
      feedback,
      recencyWeight: settings.recencyWeight,
      lang,
    });
    if (!snap) return;
    setCompanionBusy(true);
    setCompanionError(false);
    setCompanionRateLimited(false);
    const res = await fetchCompanionReading(snap);
    setCompanionBusy(false);
    setCompanionRateLimited(res.rateLimited);
    if (res.reading) setReading(res.reading);
    else setCompanionError(true);
  }, [companionBusy, mediaById, entries, feedback, settings.recencyWeight, lang]);

  // ---- weekly library digest (one AI request per ISO week per device) ----
  const [weeklyText, setWeeklyText] = React.useState<string | null>(null);
  const [weeklyBusy, setWeeklyBusy] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState(false);
  const [weeklyRateLimited, setWeeklyRateLimited] = React.useState(false);
  const [weeklyFromCache, setWeeklyFromCache] = React.useState(false);
  const canWeekly = entries.length >= 3;

  const runWeekly = React.useCallback(
    async (force: boolean) => {
      if (weeklyBusy) return;
      const digest = buildWeeklyDigest({
        mediaById,
        entries,
        feedback,
        recencyWeight: settings.recencyWeight,
        lang,
      });
      if (!digest) return;
      setWeeklyBusy(true);
      setWeeklyError(false);
      setWeeklyRateLimited(false);
      setWeeklyFromCache(false);
      const res = await fetchWeeklyDigest(digest, { force });
      setWeeklyBusy(false);
      setWeeklyRateLimited(res.rateLimited);
      setWeeklyFromCache(res.fromCache);
      if (res.text) setWeeklyText(res.text);
      else if (!res.rateLimited) setWeeklyError(true);
    },
    [weeklyBusy, mediaById, entries, feedback, settings.recencyWeight, lang],
  );

  // auto-load: a cached same-week digest returns with ZERO network calls.
  // The ref guard makes the auto-run fire ONCE per mount — without it, the
  // busy-state flip gives runWeekly a new identity, the effect re-runs, and a
  // failing endpoint (e.g. AI unavailable on a keyless deploy) would be
  // re-fetched in an infinite ~4 req/s loop that also saturates the shared
  // rate limits. Manual retry stays available via the button.
  const weeklyAutoTried = React.useRef(false);
  React.useEffect(() => {
    if (!canWeekly || weeklyAutoTried.current) return;
    weeklyAutoTried.current = true;
    void runWeekly(false);
  }, [canWeekly, runWeekly]);

  const profile = React.useMemo(
    () => buildTasteProfile(mediaById, entries, feedback, { recencyWeight: settings.recencyWeight }),
    [mediaById, entries, feedback, settings.recencyWeight],
  );

  const insights = React.useMemo(
    () => tasteInsights(profile, new Set(dismissed)),
    [profile, dismissed],
  );

  const influential = React.useMemo(
    () => mostInfluentialTitles(mediaById, entries, profile, 6),
    [mediaById, entries, profile],
  );

  const ratingDist = React.useMemo(() => {
    const dist = [0, 0, 0, 0, 0];
    for (const e of entries) {
      if (e.rating !== undefined) dist[e.rating - 1]++;
    }
    return dist;
  }, [entries]);

  const byKind = (kind: TasteFeatureStat["kind"], positive: boolean) =>
    profile.features
      .filter((f) => f.kind === kind && (positive ? f.score > 0 : f.score < 0) && f.sampleCount >= 1)
      .sort((a, b) => (positive ? b.score - a.score : a.score - b.score))
      .slice(0, 6);

  if (profile.ratedCount === 0 && entries.length === 0) {
    return (
      <div className="px-4 pt-6 md:px-8">
        <EmptyState
          icon={<Dna className="h-12 w-12" strokeWidth={1.2} />}
          title={t("taste.empty")}
          sub={t("taste.empty.sub")}
        >
          <Button onClick={() => setView("library")} className="bg-echo-teal text-primary-foreground hover:bg-echo-teal/90">
            {t("discover.goLibrary")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  const confidenceLabel = t(`taste.confidence.${profile.confidence}`);

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6 md:px-8">
      {/* header card */}
      <section className="echo-card rounded-xl p-5" aria-label={t("taste.title")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Dna className="h-8 w-8 text-echo-teal" aria-hidden />
            <div>
              <h2 className="echo-display text-lg font-semibold">{t("taste.title")}</h2>
              <p className="text-xs text-muted-foreground">
                {profile.ratedCount === 1
                  ? t("taste.basedOnOne")
                  : t("taste.basedOn", { n: profile.ratedCount })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={cn(
                "gap-1.5",
                profile.confidence === "early" && "bg-echo-gold/15 text-echo-gold hover:bg-echo-gold/25",
                profile.confidence === "tentative" && "bg-echo-teal/15 text-echo-teal hover:bg-echo-teal/25",
                profile.confidence === "established" && "bg-echo-pine/15 text-echo-pine hover:bg-echo-pine/25",
              )}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {confidenceLabel}
            </Badge>
            {canShareCard && (
              <Button
                size="sm"
                onClick={() => setCardOpen(true)}
                className="gap-1.5 bg-echo-accent text-primary-foreground hover:bg-echo-accent/90"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                {t("card.open")}
              </Button>
            )}
          </div>
        </div>
        {profile.confidence !== "established" && (
          <p className="mt-3 rounded-xl bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("taste.developing.sub")}
          </p>
        )}
      </section>

      {/* shareable taste identity card */}
      <TasteCardDialog open={cardOpen} onOpenChange={setCardOpen} />

      {/* taste companion (AI) */}
      <CompanionSection
        reading={reading}
        busy={companionBusy}
        error={companionError}
        rateLimited={companionRateLimited}
        canRun={canCompanion}
        onRun={() => void runCompanion()}
        t={t}
      />

      {/* weekly library digest (AI, once per week) */}
      <WeeklySection
        text={weeklyText}
        busy={weeklyBusy}
        error={weeklyError}
        rateLimited={weeklyRateLimited}
        fromCache={weeklyFromCache}
        canRun={canWeekly}
        onRun={(force) => void runWeekly(force)}
        t={t}
      />

      {/* insights */}
      {insights.length > 0 && (
        <section aria-label={t("taste.topGenres")}>
          <h3 className="echo-overline mb-2">{t("taste.noticed")}</h3>
          <ul className="flex flex-col gap-2">
            {insights.map((ins) => (
              <li
                key={ins.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  ins.positive
                    ? "border-echo-pine/25 bg-echo-pine/8"
                    : "border-destructive/25 bg-destructive/8",
                )}
              >
                {ins.positive ? (
                  <TrendingUp className="h-4 w-4 shrink-0 text-echo-pine" aria-hidden />
                ) : (
                  <TrendingDown className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                )}
                <p className="flex-1 text-sm text-foreground">
                  {ins.positive
                    ? lang === "ar"
                      ? `غالباً تقيّم ${tv(ins.slug)} عالياً`
                      : `You often rate ${tv(ins.slug)} highly`
                    : lang === "ar"
                      ? `${tv(ins.slug)} يفقدك غالباً`
                      : `${tv(ins.slug)} often loses you`}
                  <span className="ms-1.5 text-xs text-muted-foreground">
                    ({t("taste.sampleCount", { n: ins.sampleCount })})
                  </span>
                </p>
                <button
                  onClick={() => void dismissInsight(ins.id)}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={t("taste.dismiss")}
                  title={t("taste.dismiss")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* positive features */}
      <FeatureBlock title={t("taste.topGenres")} features={byKind("genre", true)} tv={tv} t={t} />
      <FeatureBlock title={t("taste.topTags")} features={byKind("tag", true)} tv={tv} t={t} />
      <FeatureBlock title={t("taste.creators")} features={[...byKind("creator", true), ...byKind("studio", true)].slice(0, 6)} tv={tv} t={t} raw />
      {(profile.features.some((f) => f.score < -0.8) || profile.negativeCount > 0) && (
        <FeatureBlock title={t("taste.negative")} features={[...byKind("genre", false), ...byKind("tag", false)].slice(0, 5)} tv={tv} t={t} negative />
      )}

      {/* rating distribution */}
      <section aria-label={t("taste.distribution")}>
        <h3 className="echo-overline mb-2">{t("taste.distribution")}</h3>
        <div className="echo-card rounded-xl p-4">
          <div className="flex items-end gap-3">
            {ratingDist.map((count, i) => {
              const max = Math.max(1, ...ratingDist);
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{count || ""}</span>
                  <div
                    className="w-full rounded-t-md bg-echo-accent"
                    style={{ height: `${Math.max(4, (count / max) * 90)}px` }}
                    role="img"
                    aria-label={`${i + 1} ★: ${count}`}
                  />
                  <span className="text-[11px] text-muted-foreground">{i + 1}★</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* influential titles */}
      {influential.length > 0 && (
        <section aria-label={t("taste.influential")}>
          <h3 className="echo-overline mb-1">{t("taste.influential")}</h3>
          <p className="mb-2 text-xs text-muted-foreground">{t("taste.influential.sub")}</p>
          <div className="echo-scroll flex gap-2.5 overflow-x-auto pb-2">
            {influential.map(({ entry, item }) => (
              <button
                key={entry.id}
                onClick={() => useEchoStore.getState().select(item.localId)}
                className="w-[92px] shrink-0 text-start"
              >
                <PosterTile item={item} width={92} height={138} className="w-full" />
                <p className="mt-1 line-clamp-2 text-[11px] font-medium text-foreground">
                  {item.title}
                </p>
                <RatingStars value={entry.rating} size="sm" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* dismissed insights (undo) */}
      {dismissed.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("taste.dismissed")}</span>
          {dismissed.map((key) => (
            <button
              key={key}
              onClick={() => void undoDismissInsight(key)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 transition hover:border-echo-accent/50 hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {key.includes(":") ? tv(key.split(":")[1]) : key}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

const KIND_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  strength: {
    icon: TrendingUp,
    cls: "border-echo-pine/25 bg-echo-pine/8",
  },
  pattern: {
    icon: Shapes,
    cls: "border-echo-teal/25 bg-echo-teal/8",
  },
  contrast: {
    icon: Scale,
    cls: "border-echo-gold/25 bg-echo-gold/8",
  },
  gap: {
    icon: Compass,
    cls: "border-echo-accent/25 bg-echo-accent/8",
  },
};

function CompanionSection({
  reading,
  busy,
  error,
  rateLimited,
  canRun,
  onRun,
  t,
}: {
  reading: CompanionReading | null;
  busy: boolean;
  error: boolean;
  rateLimited: boolean;
  canRun: boolean;
  onRun: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <section className="echo-card rounded-xl p-5" aria-label={t("companion.title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Compass className="h-8 w-8 text-echo-accent" aria-hidden />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="echo-display text-lg font-semibold">{t("companion.title")}</h2>
              <Badge className="gap-1 bg-echo-accent/15 text-echo-accent hover:bg-echo-accent/25">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("companion.badge")}
              </Badge>
            </div>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("companion.sub")}
            </p>
          </div>
        </div>
        {reading && !busy && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRun}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("companion.regenerate")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        {!canRun && !reading && (
          <p className="rounded-xl bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("companion.needMore")}
          </p>
        )}

        {canRun && !reading && !busy && !error && (
          <div className="flex flex-col items-start gap-2.5">
            <Button
              onClick={onRun}
              className="bg-echo-teal text-primary-foreground hover:bg-echo-teal/90"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {t("companion.cta")}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("companion.note")}
            </p>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4" aria-live="polite">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-echo-accent" aria-hidden />
            <div className="flex-1 space-y-2">
              <span className="block text-sm font-medium">{t("companion.loading")}</span>
              <span className="block h-2 w-3/4 animate-pulse rounded-full bg-secondary" />
              <span className="block h-2 w-1/2 animate-pulse rounded-full bg-secondary" />
            </div>
          </div>
        )}

        {error && !busy && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/8 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="flex-1 text-sm text-foreground">
              {t(rateLimited ? "companion.rateLimited" : "companion.unavailable")}
            </p>
            <Button variant="outline" size="sm" onClick={onRun} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t("companion.retry")}
            </Button>
          </div>
        )}

        {reading && !busy && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-echo-accent/25 bg-echo-accent/5 p-4">
              <p className="echo-overline mb-1">{t("companion.headline")}</p>
              <p className="echo-display text-base font-semibold leading-relaxed">
                {reading.headline}
              </p>
            </div>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {reading.insights.map((ins: CompanionInsight, i: number) => {
                const meta = KIND_META[ins.kind] ?? KIND_META.pattern;
                const Icon = meta.icon;
                return (
                  <li key={i} className={cn("rounded-xl border p-4", meta.cls)}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="echo-overline">{t(`companion.kind.${ins.kind}`)}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{ins.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ins.body}</p>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("companion.note")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Weekly library digest — one AI request per ISO week (device-cached). */
function WeeklySection({
  text,
  busy,
  error,
  rateLimited,
  fromCache,
  canRun,
  onRun,
  t,
}: {
  text: string | null;
  busy: boolean;
  error: boolean;
  rateLimited: boolean;
  fromCache: boolean;
  canRun: boolean;
  onRun: (force: boolean) => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <section className="echo-card rounded-xl p-5" aria-label={t("weekly.title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-8 w-8 text-echo-teal" aria-hidden />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="echo-display text-lg font-semibold">{t("weekly.title")}</h2>
              <Badge className="gap-1 bg-echo-teal/15 text-echo-teal hover:bg-echo-teal/25">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("companion.badge")}
              </Badge>
            </div>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("weekly.sub")}
            </p>
          </div>
        </div>
        {text && !busy && (
          <Button variant="outline" size="sm" onClick={() => onRun(true)} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("weekly.regenerate")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        {!canRun && !text && (
          <p className="rounded-xl bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("weekly.needMore")}
          </p>
        )}

        {canRun && !text && !busy && !error && (
          <div className="flex flex-col items-start gap-2.5">
            <Button
              onClick={() => onRun(false)}
              className="bg-echo-teal text-primary-foreground hover:bg-echo-teal/90"
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              {t("weekly.cta")}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("weekly.note")}
            </p>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4" aria-live="polite">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-echo-teal" aria-hidden />
            <div className="flex-1 space-y-2">
              <span className="block text-sm font-medium">{t("weekly.loading")}</span>
              <span className="block h-2 w-3/4 animate-pulse rounded-full bg-secondary" />
              <span className="block h-2 w-1/2 animate-pulse rounded-full bg-secondary" />
            </div>
          </div>
        )}

        {error && !busy && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/8 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="flex-1 text-sm text-foreground">
              {t(rateLimited ? "weekly.rateLimited" : "weekly.unavailable")}
            </p>
            <Button variant="outline" size="sm" onClick={() => onRun(true)} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t("companion.retry")}
            </Button>
          </div>
        )}

        {text && !busy && (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-xl border border-echo-teal/25 bg-echo-teal/5 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{text}</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {fromCache ? t("weekly.cachedNote") : t("weekly.note")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureBlock({
  title,
  features,
  tv,
  t,
  raw,
  negative,
}: {
  title: string;
  features: TasteFeatureStat[];
  tv: (slug: string) => string;
  t: (k: string, p?: Record<string, string | number>) => string;
  raw?: boolean;
  negative?: boolean;
}) {
  if (!features.length) return null;
  const max = Math.max(...features.map((f) => Math.abs(f.score)));
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="echo-card flex flex-col gap-2 rounded-xl p-4">
        {features.map((f) => {
          const pct = Math.round((Math.abs(f.score) / max) * 100);
          return (
            <li key={f.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground">
                {raw ? f.slug : tv(f.slug)}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span
                  className={cn(
                    "block h-full rounded-full",
                    negative ? "bg-destructive/70" : "bg-echo-accent",
                  )}
                  style={{ width: `${Math.max(6, pct)}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-end text-[10px] text-muted-foreground">
                {t("taste.sampleCount", { n: f.sampleCount })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
