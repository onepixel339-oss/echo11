/**
 * ECHO — Library: fast management of the user's titles.
 * Search, sort, filter, bulk status updates, manual add, remove.
 */

"use client";

import React from "react";
import { Search, Plus, PenLine, LibraryBig, X, CheckSquare, Square, Trash2, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { providerChipLabel } from "../AddTitleDialog";
import type { LibraryStatus, MediaItem, UserMediaEntry } from "@/lib/echo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, MediaTypeIcon, PosterTile, RatingStars, STATUS_ORDER, StatusChip } from "../bits";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortKey = "recent" | "title" | "year" | "rating";

export function LibraryScreen() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { entries, mediaById } = useActiveLibrary();
  const select = useEchoStore((s) => s.select);
  const setAddDialog = useEchoStore((s) => s.setAddDialog);
  const removeEntry = useEchoStore((s) => s.removeEntry);
  const updateEntry = useEchoStore((s) => s.updateEntry);
  const refreshLibraryMetadata = useEchoStore((s) => s.refreshLibraryMetadata);
  const [syncing, setSyncing] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [statusFilter, setStatusFilter] = React.useState<LibraryStatus | "all">("all");
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = React.useState<UserMediaEntry | null>(null);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = entries
      .map((e) => ({ entry: e, item: mediaById.get(e.mediaLocalId) }))
      .filter((r): r is { entry: UserMediaEntry; item: MediaItem } => r.item !== undefined)
      .filter(
        (r) =>
          !q ||
          r.item.title.toLowerCase().includes(q) ||
          (r.item.titleAr ?? "").includes(query.trim()) ||
          r.entry.userTags.some((tag) => tag.includes(q)),
      )
      .filter((r) => statusFilter === "all" || r.entry.status === statusFilter);
    switch (sort) {
      case "title":
        list.sort((a, b) => a.item.title.localeCompare(b.item.title));
        break;
      case "year":
        list.sort((a, b) => (b.item.releaseYear ?? 0) - (a.item.releaseYear ?? 0));
        break;
      case "rating":
        list.sort((a, b) => (b.entry.rating ?? 0) - (a.entry.rating ?? 0));
        break;
      default:
        list.sort((a, b) => (a.entry.updatedAt < b.entry.updatedAt ? 1 : -1));
    }
    return list;
  }, [entries, mediaById, query, statusFilter, sort]);

  const toggleSelect = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulk = (status: LibraryStatus) => {
    for (const id of selection) void updateEntry(id, { status });
    setSelection(new Set());
    toast({ description: t("toast.updated") });
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 md:px-8">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="h-9 bg-card ps-8"
            aria-label={t("library.searchPlaceholder")}
          />
          {query && (
            <button
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              aria-label={t("app.close")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[150px] bg-card text-xs" aria-label={t("library.sort.recent")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent" className="text-xs">{t("library.sort.recent")}</SelectItem>
            <SelectItem value="title" className="text-xs">{t("library.sort.title")}</SelectItem>
            <SelectItem value="year" className="text-xs">{t("library.sort.year")}</SelectItem>
            <SelectItem value="rating" className="text-xs">{t("library.sort.rating")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LibraryStatus | "all")}>
          <SelectTrigger className="h-9 w-[140px] bg-card text-xs" aria-label={t("map.filter.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">{t("app.all")}</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{t(`status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ms-auto flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            disabled={syncing || entries.length === 0}
            title={t("library.sync.sub")}
            onClick={() => {
              setSyncing(true);
              toast({ description: t("toast.syncing") });
              void refreshLibraryMetadata()
                .then((res) => {
                  toast({
                    description: t("toast.synced", { n: res.refreshed, linked: res.linked }),
                  });
                })
                .finally(() => setSyncing(false));
            }}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            <span className="hidden sm:inline">{t("library.sync")}</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddDialog(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("library.add")}</span>
          </Button>
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">{t("library.sub", { n: entries.length })}</p>

      {/* bulk bar */}
      {selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-echo-accent/40 bg-echo-accent/8 px-3 py-2">
          <span className="text-xs font-medium text-foreground">{t("library.selected", { n: selection.size })}</span>
          <div className="ms-auto flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => applyBulk(s)}
                className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-[11px] text-foreground transition hover:border-echo-accent/50"
              >
                {t(`status.${s}`)}
              </button>
            ))}
            <button
              onClick={() => setSelection(new Set())}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("app.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* list */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<LibraryBig className="h-12 w-12" strokeWidth={1.2} />}
          title={t("library.empty")}
          sub={t("library.empty.sub")}
        >
          <Button onClick={() => setAddDialog(true)}>
            <Plus className="me-1 h-4 w-4" aria-hidden />
            {t("library.add")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setAddDialog(true);
              // manual tab is reachable inside the dialog
            }}
          >
            <PenLine className="me-1 h-4 w-4" aria-hidden />
            {t("library.manual")}
          </Button>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-1.5 pb-4">
          {rows.map(({ entry, item }) => {
            const isSel = selection.has(entry.id);
            return (
              <li key={entry.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-2 pe-3 transition",
                    isSel ? "border-echo-accent/60 bg-echo-accent/8" : "border-border bg-card/60 hover:border-echo-accent/30",
                  )}
                >
                  <button
                    onClick={() => toggleSelect(entry.id)}
                    className="ms-1 shrink-0 text-muted-foreground transition hover:text-echo-accent"
                    aria-label={t("library.selected", { n: isSel ? 1 : 0 })}
                    aria-pressed={isSel}
                  >
                    {isSel ? (
                      <CheckSquare className="h-4.5 w-4.5 text-echo-accent" aria-hidden />
                    ) : (
                      <Square className="h-4.5 w-4.5" aria-hidden />
                    )}
                  </button>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    onClick={() => select(item.localId)}
                  >
                    <PosterTile item={item} width={36} height={54} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <MediaTypeIcon type={item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {entry.isFavourite && <span className="text-echo-accent">♥</span>}
                        <span className="echo-chip shrink-0" title={t("library.source")}>
                          {providerChipLabel(item.provider)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <StatusChip status={entry.status} mediaType={item.mediaType} />
                        {item.releaseYear}
                        {item.canonicalUrl && (
                          <a
                            href={item.canonicalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-muted-foreground/70 transition hover:text-echo-accent"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`${t("library.source")}: ${providerChipLabel(item.provider)}`}
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                      </span>
                      {entry.personalNote && (
                        <span className="mt-0.5 block truncate text-[11px] italic text-muted-foreground/70">
                          “{entry.personalNote}”
                        </span>
                      )}
                    </span>
                    <span className="shrink-0">
                      <RatingStars value={entry.rating} size="sm" />
                    </span>
                  </button>
                  <button
                    onClick={() => setConfirmRemove(entry)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("library.remove")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* remove confirm */}
      <AlertDialog open={Boolean(confirmRemove)} onOpenChange={(v) => !v && setConfirmRemove(null)}>
        <AlertDialogContent className="echo-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("library.remove")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove
                ? t("library.removeConfirm", {
                    title: mediaById.get(confirmRemove.mediaLocalId)?.title ?? "",
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/85"
              onClick={() => {
                if (confirmRemove) {
                  void removeEntry(confirmRemove.id);
                  toast({ description: t("toast.removed") });
                }
                setConfirmRemove(null);
              }}
            >
              {t("library.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
