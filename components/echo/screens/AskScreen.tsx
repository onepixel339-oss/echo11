/**
 * ECHO — "Ask ECHO" screen: conversational entertainment companion.
 *
 * Every assistant reply is stamped with its source mode:
 *   - catalogue: real provider results, addable to the library in one tap
 *   - library:   grounded in the user's real library digest
 *   - general:   AI knowledge, clearly labelled, no items
 * The chat history lives in component state only (not persisted).
 */

"use client";

import React from "react";
import {
  AlertTriangle,
  Check,
  Compass,
  Lightbulb,
  Loader2,
  LibraryBig,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { buildTasteProfile } from "@/lib/echo/engine/taste";
import { vocabLabel } from "@/lib/echo/data/vocab";
import { askEcho, type AskDigest, type AskItem, type AskMode } from "@/lib/echo/ai/ask";
import type { MediaItem } from "@/lib/echo/types";
import { PosterTile } from "../bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ChatTurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  mode?: AskMode;
  items?: AskItem[];
  failed?: boolean;
  rateLimited?: boolean;
}

const MODE_META: Record<AskMode, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  catalogue: { icon: Compass, cls: "bg-echo-teal/12 text-echo-teal" },
  library: { icon: LibraryBig, cls: "bg-echo-pine/12 text-echo-pine" },
  general: { icon: Lightbulb, cls: "bg-echo-gold/15 text-echo-gold" },
};

let turnSeq = 1;

export function AskScreen() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { entries, mediaById } = useActiveLibrary();
  const feedback = useEchoStore((s) => s.feedback);
  const settings = useEchoStore((s) => s.settings);
  const addTitle = useEchoStore((s) => s.addTitle);

  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  // ---- anonymous digest of the REAL library (engine output) ----
  const digest = React.useMemo<AskDigest>(() => {
    const profile = buildTasteProfile(mediaById, entries, feedback, {
      recencyWeight: settings.recencyWeight,
    });
    const topGenres = profile.features
      .filter((f) => f.kind === "genre" && f.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((f) => vocabLabel(f.slug, lang));
    const mix: AskDigest["mix"] = { anime: 0, movie: 0, series: 0, game: 0, book: 0, manga: 0, comics: 0 };
    const recent: AskDigest["recent"] = [];
    for (const e of [...entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))) {
      const item = mediaById.get(e.mediaLocalId);
      if (!item) continue;
      if (recent.length < 5) {
        recent.push({
          title: item.title,
          status: e.status,
          ...(e.rating !== undefined ? { rating: e.rating } : {}),
        });
      }
      if (item.mediaType in mix) mix[item.mediaType as keyof typeof mix]++;
    }
    return {
      librarySize: entries.length,
      ratedCount: profile.ratedCount,
      favouritesCount: entries.filter((e) => e.isFavourite).length,
      mix,
      topGenres,
      recent,
    };
  }, [mediaById, entries, feedback, settings.recencyWeight, lang]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  const runAsk = React.useCallback(
    async (history: ChatTurn[]) => {
      setBusy(true);
      const wire = history
        .filter((h) => !h.failed)
        .slice(-10)
        .map((h) => ({ role: h.role, content: h.text }));
      const res = await askEcho(wire, lang === "ar" ? "ar" : "en", digest);
      setBusy(false);
      setTurns((prev) => [
        ...prev,
        res.reply
          ? {
              id: turnSeq++,
              role: "assistant",
              text: res.reply.text,
              mode: res.reply.mode,
              items: res.reply.items,
            }
          : { id: turnSeq++, role: "assistant", text: "", failed: true, rateLimited: res.rateLimited },
      ]);
    },
    [digest, lang],
  );

  const send = React.useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      const next: ChatTurn[] = [...turns, { id: turnSeq++, role: "user", text }];
      setTurns(next);
      void runAsk(next);
    },
    [busy, runAsk, turns],
  );

  const retry = React.useCallback(() => {
    const lastUser = [...turns].reverse().find((h) => h.role === "user");
    const trimmed = turns.filter((h, i) => !(h.failed && i === turns.length - 1));
    if (!lastUser) return;
    setTurns(trimmed);
    void runAsk(trimmed);
  }, [turns, runAsk]);

  const addToLibrary = React.useCallback(
    (item: MediaItem) => {
      if (addedIds.has(item.localId)) return;
      void addTitle(item, { status: "planned" }).then(() => {
        setAddedIds((prev) => new Set(prev).add(item.localId));
        toast({ description: t("toast.added") });
      });
    },
    [addedIds, addTitle, t, toast],
  );

  const suggestions = [t("ask.sug1"), t("ask.sug2"), t("ask.sug3"), t("ask.sug4")];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-165px)] w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-8 md:min-h-[calc(100dvh-135px)] md:px-8">
      {/* header */}
      <section className="echo-card rounded-xl p-5" aria-label={t("ask.title")}>
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-8 w-8 text-echo-accent" aria-hidden />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="echo-display text-lg font-semibold">{t("ask.title")}</h1>
              <Badge className="gap-1 bg-echo-accent/15 text-echo-accent hover:bg-echo-accent/25">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("ask.badge")}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("ask.sub")}</p>
          </div>
        </div>
      </section>

      {/* conversation — the empty state centres vertically so desktop never
          shows a dead band between the suggestions and the composer */}
      <div className="flex flex-1 flex-col gap-3 pb-20" aria-live="polite">
        {turns.length === 0 && !busy && (
          <section className="echo-card flex flex-1 flex-col items-center justify-center rounded-xl p-6 text-center">
            <p className="echo-display text-base font-semibold">{t("ask.empty.title")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("ask.empty.sub")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-secondary/40 px-3.5 py-1.5 text-xs font-medium text-foreground transition hover:border-echo-accent/50 hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-es-md bg-echo-accent/15 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                {turn.text}
              </div>
            </div>
          ) : turn.failed ? (
            <div
              key={turn.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/8 p-4"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p className="flex-1 text-sm text-foreground">
                {t(turn.rateLimited ? "ask.rateLimited" : "ask.error")}
              </p>
              <Button variant="outline" size="sm" onClick={retry} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t("ask.retry")}
              </Button>
            </div>
          ) : (
            <div key={turn.id} className="echo-card rounded-2xl rounded-ss-md p-4">
              {turn.mode && (
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      MODE_META[turn.mode].cls,
                    )}
                  >
                    {React.createElement(MODE_META[turn.mode].icon, { className: "h-3 w-3" })}
                    {t(`ask.mode.${turn.mode}`)}
                  </span>
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {turn.text}
              </p>
              {turn.items && turn.items.length > 0 && (
                <div className="echo-scroll mt-3 flex gap-2.5 overflow-x-auto pb-1">
                  {turn.items.map(({ item, sourceLabel }) => {
                    const added = addedIds.has(item.localId);
                    return (
                      <div key={item.localId} className="w-[100px] shrink-0">
                        <PosterTile item={item} width={96} height={144} className="w-full" />
                        <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.releaseYear ? `${item.releaseYear} · ` : ""}
                          {t(`media.${item.mediaType}`)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{sourceLabel}</p>
                        <Button
                          size="sm"
                          variant={added ? "secondary" : "outline"}
                          disabled={added}
                          onClick={() => addToLibrary(item)}
                          className="mt-1.5 h-7 w-full gap-1 px-2 text-[11px]"
                        >
                          {added ? (
                            <Check className="h-3 w-3" aria-hidden />
                          ) : (
                            <Plus className="h-3 w-3" aria-hidden />
                          )}
                          {added ? t("ask.added") : t("ask.add")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="echo-card flex items-center gap-3 self-start rounded-2xl rounded-ss-md p-4">
            <Loader2 className="h-4 w-4 animate-spin text-echo-accent" aria-hidden />
            <span className="text-sm text-muted-foreground">{t("ask.thinking")}</span>
            <span className="flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-echo-accent/60" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-echo-accent/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-echo-accent/60 [animation-delay:300ms]" />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 z-10 flex items-center gap-2 rounded-2xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur md:bottom-4"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("ask.placeholder")}
          disabled={busy}
          maxLength={1600}
          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label={t("ask.placeholder")}
        />
        <Button type="submit" disabled={busy || !input.trim()} className="gap-1.5 bg-echo-teal text-primary-foreground hover:bg-echo-teal/90">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          )}
          <span className="hidden sm:inline">{t("ask.send")}</span>
        </Button>
      </form>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("ask.note")}</p>
    </div>
  );
}
