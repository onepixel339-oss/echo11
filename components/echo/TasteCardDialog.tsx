/**
 * ECHO — Taste identity card (the shareable one).
 *
 * Renders the user's taste identity onto a fixed-brand "paper atlas" card
 * (1080×1440, 3:4) on a canvas, then shares it as a single PNG via the
 * Web Share API (falls back to download). Nothing but the image ever
 * leaves the device.
 *
 * Card contents are computed by engine/identityCard.ts from REAL library
 * data only; the map snapshot reuses the same similarity → cluster →
 * layout pipeline as the map screen (deterministic, offline).
 */

"use client";

import React from "react";
import { Download, Share2, ShieldCheck, Languages } from "lucide-react";
import { useI18n, translateFor } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { buildTasteProfile } from "@/lib/echo/engine/taste";
import { buildIdentityCard, cardDateLabel, type IdentityCardData } from "@/lib/echo/engine/identityCard";
import { buildSimilarityGraph } from "@/lib/echo/engine/similarity";
import { computeClusters } from "@/lib/echo/engine/cluster";
import { computeLayout, computeIslandOutline } from "@/lib/echo/engine/layout";
import { computeIdf } from "@/lib/echo/engine/features";
import { DEMO_CATALOGUE, demoToMediaItem } from "@/lib/echo/data/demoCatalogue";
import type { Cluster, MediaItem, UserMediaEntry } from "@/lib/echo/types";
import { mapNodeRadius } from "./bits";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const CARD_W = 1080;
const CARD_H = 1440;

/** fixed brand skin — the card always looks like ECHO, in any app theme */
const SKIN = {
  paper: "#0A0D12",
  paperRaise: "#171C26",
  ink: "#F2F5FA",
  ink2: "rgba(242,245,250,0.62)",
  ink3: "rgba(242,245,250,0.32)",
  line: "rgba(236,240,250,0.14)",
  accent: "#FF7E54",
  island: ["#52C7B0", "#E9C268", "#B58FC8", "#74D693", "#FF7E54"],
};

interface Fonts {
  display: string;
  ui: string;
  ar: string;
}

function resolveFonts(): Fonts {
  if (typeof window === "undefined") return { display: "Georgia, serif", ui: "system-ui, sans-serif", ar: "system-ui" };
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => {
    const val = cs.getPropertyValue(n).trim();
    return val || fb;
  };
  return {
    display: v("--font-display", "Georgia, serif"),
    ui: v("--font-latin", "system-ui, sans-serif"),
    ar: v("--font-arabic", "system-ui, sans-serif"),
  };
}

export function TasteCardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { media: activeMedia, entries, mediaById } = useActiveLibrary();
  const feedback = useEchoStore((s) => s.feedback);
  const recencyWeight = useEchoStore((s) => s.settings.recencyWeight);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = React.useState(false);
  // the shared card can be drawn in EITHER language (interface default,
  // switchable — e.g. an Arabic user sharing with an English-speaking friend)
  const [cardLang, setCardLang] = React.useState<"en" | "ar">(lang);
  React.useEffect(() => {
    if (open) setCardLang(lang); // every open starts from the interface language
  }, [open, lang]);
  const tCard = React.useCallback(
    (k: string, p?: Record<string, string | number>) => translateFor(cardLang, k, p),
    [cardLang],
  );
  void activeMedia;

  // ---- data (recomputed on every open or card-language switch) ----
  const card = React.useMemo<IdentityCardData | null>(() => {
    if (!open || entries.length === 0) return null;
    const profile = buildTasteProfile(mediaById, entries, feedback, { recencyWeight });
    const items = entries
      .map((e) => mediaById.get(e.mediaLocalId))
      .filter((m): m is MediaItem => Boolean(m));
    const userTags: Record<string, string[]> = {};
    for (const e of entries) userTags[e.mediaLocalId] = e.userTags;
    const libIds = new Set(items.map((m) => m.localId));
    const corpus = [...items];
    for (const seed of DEMO_CATALOGUE) {
      const item = demoToMediaItem(seed);
      if (!libIds.has(item.localId)) corpus.push(item);
    }
    const edges = items.length >= 2 ? buildSimilarityGraph(items, { idf: computeIdf(corpus), userTags }) : [];
    const clusters: Cluster[] = computeClusters(items, edges);
    return buildIdentityCard({ mediaById, entries, profile, clusters, lang: cardLang });
  }, [open, entries, mediaById, feedback, recencyWeight, cardLang]);

  // positions for the map snapshot
  const snapshot = React.useMemo(() => {
    if (!open || !card) return null;
    const items = entries
      .map((e) => mediaById.get(e.mediaLocalId))
      .filter((m): m is MediaItem => Boolean(m));
    if (!items.length) return null;
    const userTags: Record<string, string[]> = {};
    for (const e of entries) userTags[e.mediaLocalId] = e.userTags;
    const libIds = new Set(items.map((m) => m.localId));
    const corpus = [...items];
    for (const seed of DEMO_CATALOGUE) {
      const item = demoToMediaItem(seed);
      if (!libIds.has(item.localId)) corpus.push(item);
    }
    const edges = items.length >= 2 ? buildSimilarityGraph(items, { idf: computeIdf(corpus), userTags }) : [];
    const clusters = computeClusters(items, edges);
    const entryBy = new Map(entries.map((e) => [e.mediaLocalId, e]));
    const positions = computeLayout(items, edges, clusters, {
      radiusOf: (item) => mapNodeRadius(item, entryBy.get(item.localId)),
    });
    const outlines = clusters
      .map((c) => {
        const members = c.members.filter((m) => positions[m]);
        return members.length >= 2 ? computeIslandOutline(positions, members, 46) : null;
      })
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
    return { items, positions, outlines, entryBy };
  }, [open, card, entries, mediaById]);

  // ---- render ----
  React.useEffect(() => {
    if (!open || !card) return;
    // Radix mounts the dialog content after this effect first fires — retry
    // on animation frames until the canvas element actually exists.
    let raf = 0;
    let cancelled = false;
    const tryDraw = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(tryDraw);
        return;
      }
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        drawCard(ctx, card, snapshot, cardLang, tCard);
      } catch (err) {
        console.error("[echo] taste card draw failed", err);
      }
    };
    tryDraw();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, card, snapshot, cardLang, tCard]);

  const filename = `echo-taste-card-${new Date().toISOString().slice(0, 10)}.png`;

  const onDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ description: t("card.downloaded") });
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("no blob");
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "ECHO",
            text: cardLang === "ar" ? "بصمة ذوقي على إيكو" : "My ECHO taste identity",
          });
          toast({ description: t("card.shared") });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ description: t("card.shareFallback") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] gap-4 rounded-2xl p-4 sm:max-w-md md:p-6">
        <DialogHeader>
          <DialogTitle className="echo-display">{t("card.title")}</DialogTitle>
          <DialogDescription>{t("card.preview.sub")}</DialogDescription>
        </DialogHeader>

        {/* card language toggle — share with friends in either language */}
        <div className="flex items-center gap-2" role="radiogroup" aria-label={t("card.lang")}>
          <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">{t("card.lang")}:</span>
          {(["ar", "en"] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={cardLang === l}
              onClick={() => setCardLang(l)}
              className={
                "rounded-full border px-3.5 py-1 text-xs font-semibold transition " +
                (cardLang === l
                  ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {l === "ar" ? "العربية" : "English"}
            </button>
          ))}
        </div>

        <div className="echo-scroll max-h-[62vh] overflow-y-auto rounded-xl border border-border bg-secondary/40 p-2">
          <canvas
            ref={canvasRef}
            width={CARD_W}
            height={CARD_H}
            className="h-auto w-full rounded-lg shadow-md"
            aria-label={t("card.title")}
            role="img"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void onShare()} disabled={busy} className="gap-1.5">
              <Share2 className="h-4 w-4" aria-hidden />
              {t("card.share")}
            </Button>
            <Button onClick={() => void onDownload()} disabled={busy} variant="outline" className="gap-1.5">
              <Download className="h-4 w-4" aria-hidden />
              {t("card.download")}
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("card.privacy")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
   The card painter — pure canvas 2D, brand "obsidian" skin.
   ==================================================================== */

type T = (k: string, p?: Record<string, string | number>) => string;

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: IdentityCardData,
  snapshot: {
    items: MediaItem[];
    positions: Record<string, { x: number; y: number }>;
    outlines: { points: { x: number; y: number }[] }[];
    entryBy: Map<string, UserMediaEntry>;
  } | null,
  lang: "en" | "ar",
  t: T,
) {
  const F = resolveFonts();
  const ar = lang === "ar";
  const rtl = ar;
  ctx.textBaseline = "alphabetic";
  try {
    ctx.direction = rtl ? "rtl" : "ltr";
  } catch {
    /* older browsers: alignment below still works */
  }

  // ---- obsidian ----
  ctx.fillStyle = SKIN.paper;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // faint deterministic starfield dots
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + Math.imul(seed ^ (seed >>> 7), 61 | seed)) ^ seed;
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  ctx.fillStyle = SKIN.ink;
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.02 + rnd() * 0.03;
    ctx.fillRect(rnd() * CARD_W, rnd() * CARD_H, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  // ---- neatline double frame ----
  ctx.strokeStyle = SKIN.ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, CARD_W - 52, CARD_H - 52);
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1;
  ctx.strokeRect(38, 38, CARD_W - 76, CARD_H - 76);
  ctx.globalAlpha = 1;
  // vermilion corner ticks (map-sheet style)
  ctx.strokeStyle = SKIN.accent;
  ctx.lineWidth = 3;
  const tick = 26;
  const corners: [number, number, number, number][] = [
    [26, 26, 1, 1], [CARD_W - 26, 26, -1, 1],
    [26, CARD_H - 26, 1, -1], [CARD_W - 26, CARD_H - 26, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * tick, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * tick);
    ctx.stroke();
  }

  const L = 64; // left margin
  const R = CARD_W - 64; // right margin
  const anchorX = rtl ? R : L; // text anchor (start side)
  const farX = rtl ? L : R;

  const fontUI = (size: number, weight = 400) =>
    `${weight} ${size}px ${ar ? F.ar : F.ui}, ${F.ui}, sans-serif`;
  const fontDisplay = (size: number, weight = 600) =>
    `${weight} ${size}px ${ar ? F.ar : F.display}, ${F.display}, serif`;

  const overline = (text: string, x: number, y: number, color = SKIN.ink2) => {
    ctx.font = fontUI(19, 650);
    trySetLetterSpacing(ctx, ar ? "0.04em" : "0.18em");
    ctx.fillStyle = color;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(text, x, y);
    trySetLetterSpacing(ctx, "0px");
  };

  // ================= header =================
  drawEchoMark(ctx, rtl ? R - 30 : L + 30, 108, 30, SKIN.accent);
  ctx.font = fontUI(30, 650);
  trySetLetterSpacing(ctx, "0.3em");
  ctx.fillStyle = SKIN.ink;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText("ECHO", rtl ? R - 78 : L + 78, 119);
  trySetLetterSpacing(ctx, "0px");

  overline(t("card.overline"), farX, 100);
  ctx.font = fontUI(21, 500);
  ctx.fillStyle = SKIN.ink2;
  ctx.textAlign = rtl ? "left" : "right";
  ctx.fillText(cardDateLabel(card.generatedAt, lang), farX === R ? L : R, 132);

  // ================= archetype =================
  let y = 218;
  overline(t("card.archetype.overline"), anchorX, y);
  y += 62;
  ctx.font = fontDisplay(ar ? 58 : 62, ar ? 700 : 600);
  ctx.fillStyle = SKIN.ink;
  ctx.textAlign = rtl ? "right" : "left";
  const name = ar ? card.archetype.name.ar : card.archetype.name.en;
  ctx.fillText(fitText(ctx, name, CARD_W - 128), anchorX, y);
  y += 46;
  ctx.font = fontUI(24, 400);
  ctx.fillStyle = SKIN.ink2;
  const epithet = ar ? card.archetype.epithet.ar : card.archetype.epithet.en;
  const epLines = wrapText(ctx, epithet, CARD_W - 160);
  for (const line of epLines.slice(0, 2)) {
    ctx.fillText(line, anchorX, y);
    y += 34;
  }

  // early-signals honesty chip
  if (card.confidence !== "established") {
    const chipY = y + 10;
    ctx.font = fontUI(19, 550);
    const label = t("card.early");
    const tw = ctx.measureText(label).width;
    const chipW = tw + 34;
    const chipX = rtl ? anchorX - chipW : anchorX;
    ctx.fillStyle = "rgba(233,194,104,0.12)";
    roundRect(ctx, chipX, chipY, chipW, 38, 19);
    ctx.fill();
    ctx.strokeStyle = "rgba(233,194,104,0.45)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, chipX, chipY, chipW, 38, 19);
    ctx.stroke();
    ctx.fillStyle = "#E9C268";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(label, rtl ? anchorX - 17 : anchorX + 17, chipY + 26);
    y = chipY + 38;
  }

  // ================= map snapshot =================
  const panelY = Math.max(y + 34, 470);
  const panelX = L;
  const panelW = CARD_W - L * 2;

  // ---- space planning: sections must end above the footer rule.
  // The card is a fixed 1080×1440 sheet; when the library is rich (many
  // blend rows + a rating distribution) the sections below would otherwise
  // collide with the footer. Shrink knobs in priority order until it fits.
  const FOOT_BASE = CARD_H - 122; // dashed rule; keeps footer text inside the neatline
  const wantsDist = card.stats.rated > 0;
  const fits = (pH: number, gap: number, nRows: number, rH: number, dH: number) => {
    let b = panelY + pH + gap;
    if (nRows) b += 16 + nRows * rH + 26;
    b += 132; // stats row
    if (dH) b += dH + 72; // rating distribution
    return b + 10 <= FOOT_BASE;
  };
  let panelH = 340;
  let gap = 56;
  let rowH = 52;
  let blendRows = Math.min(card.blend.length, 4);
  let distH = wantsDist ? 96 : 0;
  if (!fits(panelH, gap, blendRows, rowH, distH)) {
    panelH = 304; gap = 46; rowH = 46; if (distH) distH = 88;
    if (!fits(panelH, gap, blendRows, rowH, distH)) {
      blendRows = Math.min(blendRows, 3); if (distH) distH = 80;
      if (!fits(panelH, gap, blendRows, rowH, distH)) {
        if (distH) {
          distH = 0; // drop the distribution first — stats stay
          if (!fits(panelH, gap, blendRows, rowH, distH)) blendRows = Math.min(blendRows, 2);
        } else {
          blendRows = Math.min(blendRows, 2);
        }
      }
    }
  }
  ctx.fillStyle = SKIN.paperRaise;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  ctx.fill();
  ctx.strokeStyle = SKIN.line;
  ctx.lineWidth = 1.4;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  ctx.stroke();

  if (snapshot && Object.keys(snapshot.positions).length) {
    drawMapSnapshot(ctx, snapshot, panelX, panelY, panelW, panelH, card);
    // caption
    ctx.font = fontUI(19, 550);
    ctx.fillStyle = SKIN.ink2;
    ctx.textAlign = rtl ? "right" : "left";
    const capX = rtl ? panelX + panelW - 18 : panelX + 18;
    ctx.fillText(t("card.map.caption", { n: snapshot.items.length, m: card.stats.islands }), capX, panelY + panelH - 16);
    // mix line (real format shares)
    const mixParts: string[] = [];
    if (card.stats.mix.anime) mixParts.push(`${t("card.mix.anime")} ${card.stats.mix.anime}%`);
    if (card.stats.mix.movie) mixParts.push(`${t("card.mix.movie")} ${card.stats.mix.movie}%`);
    if (card.stats.mix.series) mixParts.push(`${t("card.mix.series")} ${card.stats.mix.series}%`);
    if (card.stats.mix.game) mixParts.push(`${t("card.mix.game")} ${card.stats.mix.game}%`);
    if (card.stats.mix.book) mixParts.push(`${t("card.mix.book")} ${card.stats.mix.book}%`);
    if (mixParts.length) {
      ctx.textAlign = rtl ? "left" : "right";
      ctx.fillStyle = SKIN.ink2;
      ctx.fillText(mixParts.join(" · "), rtl ? panelX + 18 : panelX + panelW - 18, panelY + panelH - 16);
    }
  } else {
    ctx.font = fontUI(22, 500);
    ctx.fillStyle = SKIN.ink2;
    ctx.textAlign = "center";
    ctx.fillText(t("card.map.empty"), panelX + panelW / 2, panelY + panelH / 2);
  }

  // ================= blend =================
  let by = panelY + panelH + gap;
  if (blendRows > 0) {
    overline(t("card.blend.title"), anchorX, by);
    by += 16;
    const barX0 = L + 8;
    const barW = CARD_W - L * 2 - 150; // room for % on the far side
    card.blend.slice(0, blendRows).forEach((row, i) => {
      const ry = by + i * rowH + 34;
      ctx.font = fontUI(21, 600);
      ctx.fillStyle = SKIN.ink;
      ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(row.label, rtl ? R : L, ry);
      // track
      const tX = rtl ? L + 64 : R - 64 - barW;
      ctx.fillStyle = "rgba(236,240,250,0.08)";
      roundRect(ctx, tX, ry - 16, barW, 14, 7);
      ctx.fill();
      const color = SKIN.island[i % SKIN.island.length];
      const w = Math.max(20, (barW * row.share) / 100);
      ctx.fillStyle = color;
      if (rtl) roundRect(ctx, tX + barW - w, ry - 16, w, 14, 7);
      else roundRect(ctx, tX, ry - 16, w, 14, 7);
      ctx.fill();
      // share
      ctx.font = fontUI(20, 600);
      ctx.fillStyle = SKIN.ink2;
      ctx.textAlign = rtl ? "left" : "right";
      ctx.fillText(`${row.share}%`, rtl ? L + 40 : R - 40, ry);
    });
    by += blendRows * rowH + 26;
  }

  // ================= stats row =================
  overline(t("card.stats.title"), anchorX, by);
  by += 18;
  const stats: { value: string; label: string }[] = [
    { value: String(card.stats.tracked), label: t("card.stats.tracked") },
    { value: String(card.stats.rated), label: t("card.stats.rated") },
    { value: String(card.stats.favourites), label: t("card.stats.favourites") },
    { value: card.stats.avgRating ? `${card.stats.avgRating}` : "—", label: t("card.stats.avg") },
  ];
  const cellW = (CARD_W - L * 2) / 4;
  stats.forEach((s, i) => {
    const cx = L + cellW * i + cellW / 2;
    const cy = by + 62;
    ctx.textAlign = "center";
    ctx.font = ar
      ? `700 46px ${F.ar}, sans-serif`
      : `600 48px ${F.display}, serif`;
    ctx.fillStyle = i === 3 ? SKIN.accent : SKIN.ink;
    ctx.fillText(s.value, cx, cy);
    ctx.font = fontUI(18, 550);
    ctx.fillStyle = SKIN.ink2;
    ctx.fillText(s.label, cx, cy + 30);
    if (i === 3 && card.stats.avgRating) {
      drawStar(ctx, cx + ctx.measureText(s.value).width / 2 + 18, cy - 14, 9, SKIN.accent);
    }
    if (i > 0) {
      ctx.strokeStyle = SKIN.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L + cellW * i, cy - 40);
      ctx.lineTo(L + cellW * i, cy + 20);
      ctx.stroke();
    }
  });
  by += 132;

  // ================= rating distribution =================
  if (distH > 0) {
    overline(t("card.dist.title"), anchorX, by);
    by += 14;
    const distX0 = L + 10;
    const distW = CARD_W - L * 2 - 20;
    const max = Math.max(1, ...card.ratingDist);
    card.ratingDist.forEach((count, i) => {
      const colW = distW / 5;
      const cx = distX0 + colW * i + colW / 2;
      const h = Math.max(8, (count / max) * distH);
      ctx.fillStyle = i === 4 ? SKIN.accent : "rgba(154,165,184,0.65)";
      roundRect(ctx, cx - 30, by + 18 + (distH - h), 60, h, 8);
      ctx.fill();
      ctx.font = fontUI(17, 550);
      ctx.fillStyle = SKIN.ink2;
      ctx.textAlign = "center";
      ctx.fillText(`${i + 1}★`, cx, by + 18 + distH + 26);
    });
    by += distH + 58;
  }

  // ================= footer =================
  // pinned to the sheet's foot (never below the neatline); hugs content when short
  const footY = Math.min(FOOT_BASE, by + 10);
  ctx.strokeStyle = SKIN.ink3;
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(L, footY);
  ctx.lineTo(R, footY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = fontUI(20, 650);
  trySetLetterSpacing(ctx, "0.14em");
  ctx.fillStyle = SKIN.ink;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(`ECHO · ${card.signature}`, anchorX, footY + 44);
  trySetLetterSpacing(ctx, "0px");

  ctx.textAlign = rtl ? "left" : "right";
  ctx.font = fontDisplay(24, 600);
  ctx.fillStyle = SKIN.accent;
  ctx.fillText(t("card.tagline"), farX, footY + 42);
  ctx.font = fontUI(18, 500);
  ctx.fillStyle = SKIN.ink2;
  ctx.fillText(t("card.invite"), farX, footY + 70);

  ctx.direction = "ltr";
}

/** islands + nodes fitted inside the snapshot panel */
function drawMapSnapshot(
  ctx: CanvasRenderingContext2D,
  snapshot: {
    items: MediaItem[];
    positions: Record<string, { x: number; y: number }>;
    outlines: { points: { x: number; y: number }[] }[];
    entryBy: Map<string, UserMediaEntry>;
  },
  px: number,
  py: number,
  pw: number,
  ph: number,
  card: IdentityCardData,
) {
  const pad = 30;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of Object.values(snapshot.positions)) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const k = Math.min((pw - pad * 2) / w, (ph - pad * 2 - 26) / h);
  const ox = px + pw / 2 - ((minX + maxX) / 2) * k;
  const oy = py + (ph - 26) / 2 - ((minY + maxY) / 2) * k;
  const P = (p: { x: number; y: number }) => ({ x: p.x * k + ox, y: p.y * k + oy });

  // graticule dots
  ctx.fillStyle = SKIN.ink;
  for (let gx = px + 24; gx < px + pw - 12; gx += 44) {
    for (let gy = py + 20; gy < py + ph - 40; gy += 44) {
      ctx.globalAlpha = 0.08;
      ctx.fillRect(gx, gy, 1.6, 1.6);
    }
  }
  ctx.globalAlpha = 1;

  // islands
  snapshot.outlines.forEach((o, i) => {
    const color = SKIN.island[i % SKIN.island.length];
    if (o.points.length < 3) return;
    const pts = o.points.map(P);
    ctx.beginPath();
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let m0 = mid(pts[pts.length - 1], pts[0]);
    ctx.moveTo(m0.x, m0.y);
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      const nx = pts[(j + 1) % pts.length];
      const m = mid(p, nx);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  // nodes
  for (const item of snapshot.items) {
    const p = snapshot.positions[item.localId];
    if (!p) continue;
    const e = snapshot.entryBy.get(item.localId);
    const S = P(p);
    const r = clamp(mapNodeRadius(item, e) * k * 0.85, 3.5, 11);
    ctx.fillStyle = SKIN.paperRaise;
    ctx.beginPath();
    ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
    ctx.fill();
    const ci = islandColorIndexFor(snapshot.outlines, snapshot.positions, item.localId, SKIN.island.length);
    ctx.fillStyle = SKIN.island[ci];
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(S.x, S.y, Math.max(2, r - 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (e?.isFavourite) {
      ctx.strokeStyle = SKIN.accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(S.x, S.y, r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  void card;
}

function islandColorIndexFor(
  outlines: { points: { x: number; y: number }[] }[],
  positions: Record<string, { x: number; y: number }>,
  id: string,
  n: number,
): number {
  const p = positions[id];
  if (!p) return 4;
  // pick the first outline that contains the point (even-odd ray cast)
  for (let i = 0; i < outlines.length; i++) {
    const pts = outlines[i].points;
    let inside = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const A = pts[a];
      const B = pts[b];
      if (A.y > p.y !== B.y > p.y && p.x < ((B.x - A.x) * (p.y - A.y)) / (B.y - A.y) + A.x) {
        inside = !inside;
      }
    }
    if (inside) return i % n;
  }
  return 4;
}

/** sonar-style brand mark */
function drawEchoMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.28, Math.PI * 1.72);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, Math.PI * 0.45, Math.PI * 1.55);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? s : s * 0.45;
    const fn = i === 0 ? "moveTo" : "lineTo";
    ctx[fn](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function trySetLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
  } catch {
    /* not supported */
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
