/**
 * ECHO — shared UI atoms: rating stars, status chips, poster tiles,
 * empty states, section headings, media type icons.
 */

"use client";

import React from "react";
import { Star, Clapperboard, Tv, Sparkles, Heart, Gamepad2, BookOpen, ScrollText, Frame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { posterDataUrl } from "@/lib/echo/poster";
import type { LibraryStatus, MediaItem, MediaType, Rating, UserMediaEntry } from "@/lib/echo/types";
import { RATING_MAX } from "@/lib/echo/types";

// ---------- rating stars ----------

export function RatingStars({
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value?: Rating;
  onChange?: (r: Rating) => void;
  size?: "sm" | "md" | "lg";
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const px = size === "sm" ? 14 : size === "md" ? 18 : 24;
  const stars = Array.from({ length: RATING_MAX }, (_, i) => (i + 1) as Rating);
  if (!onChange) {
    if (value === undefined) {
      return (
        <span className="text-muted-foreground text-xs inline-flex items-center gap-1">
          <Star className="w-3.5 h-3.5 opacity-50" aria-hidden />
          {t("rating.unrated")}
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={`${t("rating.label")}: ${value}/${RATING_MAX}`}
      >
        {stars.map((s) => (
          <Star
            key={s}
            style={{ width: px, height: px }}
            className={s <= (value ?? 0) ? "fill-echo-warning text-echo-warning" : "text-muted-foreground/40"}
            aria-hidden
          />
        ))}
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={ariaLabel ?? t("rating.label")}>
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s}`}
          onClick={() => onChange(value === s ? s : s)} // always set; clearing handled elsewhere
          className={cn(
            "rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
            s <= (value ?? 0) ? "text-echo-warning" : "text-muted-foreground/40",
          )}
        >
          <Star
            style={{ width: px, height: px }}
            className={s <= (value ?? 0) ? "fill-echo-warning text-echo-warning" : ""}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

// ---------- status ----------

export const STATUS_ORDER: LibraryStatus[] = ["completed", "watching", "planned", "on_hold", "dropped"];

/**
 * Node radius on the taste map — encodes rating (size = how much you love it).
 * Shared by the layout engine and the canvas renderer so spacing matches
 * what is actually drawn.
 */
export function mapNodeRadius(item: MediaItem, entry?: UserMediaEntry): number {
  const rating = entry?.rating;
  let r = 21;
  if (rating === 3) r = 23;
  if (rating === 4) r = 27;
  if (rating === 5) r = 31;
  if (entry?.isFavourite) r += 2;
  return r;
}

export function statusColorVar(status: LibraryStatus): string {
  switch (status) {
    case "completed":
      return "var(--status-completed)";
    case "watching":
      return "var(--status-watching)";
    case "planned":
      return "var(--status-planned)";
    case "dropped":
      return "var(--status-dropped)";
    case "on_hold":
      return "var(--status-hold)";
  }
}

export function StatusChip({
  status,
  mediaType,
  className,
}: {
  status: LibraryStatus;
  /** optional: "watching" renders as Playing/Reading for games/books */
  mediaType?: MediaItem["mediaType"];
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-xs text-secondary-foreground",
        className,
      )}
    >
      <span className="echo-dot" style={{ background: statusColorVar(status) }} aria-hidden />
      {t(statusLabelKey(status, mediaType))}
    </span>
  );
}

/** i18n key for a status, medium-aware: watching → playing (games) / reading (books, manga, comics). */
export function statusLabelKey(status: LibraryStatus, mediaType?: MediaItem["mediaType"]): string {
  if (status === "watching") {
    if (mediaType === "game") return "status.playing";
    if (mediaType === "book" || mediaType === "manga" || mediaType === "comics") {
      return "status.reading";
    }
  }
  return `status.${status}`;
}

// ---------- media type ----------

export function MediaTypeIcon({ type, className }: { type: MediaType; className?: string }) {
  if (type === "movie") return <Clapperboard className={className} aria-hidden />;
  if (type === "series") return <Tv className={className} aria-hidden />;
  if (type === "game") return <Gamepad2 className={className} aria-hidden />;
  if (type === "book") return <BookOpen className={className} aria-hidden />;
  if (type === "manga") return <ScrollText className={className} aria-hidden />;
  if (type === "comics") return <Frame className={className} aria-hidden />;
  return <Sparkles className={className} aria-hidden />;
}

export function mediaTypeLabel(type: MediaType): string {
  // i18n-free variant for canvas contexts; UI uses t()
  switch (type) {
    case "movie":
      return "Movie";
    case "series":
      return "Series";
    case "game":
      return "Game";
    case "book":
      return "Book";
    case "manga":
      return "Manga";
    case "comics":
      return "Comics";
    default:
      return "Anime";
  }
}

// ---------- poster ----------

export function PosterTile({
  item,
  className,
  width = 96,
  height = 144,
  alt,
}: {
  item: MediaItem;
  className?: string;
  width?: number;
  height?: number;
  alt?: string;
}) {
  const { lang } = useI18n();
  const [src, setSrc] = React.useState<string>(() => item.posterUrl ?? posterDataUrl(item, width, height));
  React.useEffect(() => {
    setSrc(item.posterUrl ?? posterDataUrl(item, width, height));
  }, [item, width, height]);
  const title = lang === "ar" && item.titleAr ? item.titleAr : item.title;
  // broken remote poster → deterministic generated artwork
  const onError = React.useCallback(() => {
    setSrc(posterDataUrl(item, width, height));
  }, [item, width, height]);
  if (!src) {
    // never pass an empty src (forces a full page re-download)
    return (
      <div
        aria-hidden
        className={cn("rounded-lg border border-border bg-secondary select-none", className)}
        style={{ aspectRatio: "2/3", width: width === 999 ? undefined : width }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? title}
      width={width}
      height={height}
      loading="lazy"
      draggable={false}
      onError={onError}
      className={cn("rounded-lg object-cover select-none", className)}
      style={{ aspectRatio: "2/3" }}
    />
  );
}

// ---------- favourite ----------

export function FavouriteMark({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <Heart className="w-3.5 h-3.5 fill-echo-accent text-echo-accent" aria-label="favourite" />
  );
}

// ---------- empty state ----------

export function EmptyState({
  icon,
  title,
  sub,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/30 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground/70">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {sub ? <p className="max-w-sm text-sm text-muted-foreground">{sub}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

// ---------- section ----------

export function SectionHeading({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** A compact card row (poster + meta) used in library rows & drawers. */
export function MediaMetaLine({ item, entry }: { item: MediaItem; entry?: UserMediaEntry }) {
  const { t, lang } = useI18n();
  const title = lang === "ar" && item.titleAr ? item.titleAr : item.title;
  const bits: string[] = [];
  if (item.releaseYear) bits.push(String(item.releaseYear));
  bits.push(t(`media.${item.mediaType}`));
  if (item.volumeCount) bits.push(t("meta.volumes", { n: item.volumeCount }));
  else if (item.episodeCount) bits.push(t("meta.episodes", { n: item.episodeCount }));
  else if (item.runtimeMinutes) {
    bits.push(
      item.mediaType === "game"
        ? t("meta.hours", { n: Math.max(1, Math.round(item.runtimeMinutes / 60)) })
        : t("meta.minutes", { n: item.runtimeMinutes }),
    );
  }
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="truncate font-medium text-foreground">{title}</p>
        {entry?.isFavourite ? <FavouriteMark active /> : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{bits.join(" · ")}</p>
    </div>
  );
}
