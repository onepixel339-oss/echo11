/**
 * ECHO — "Ask ECHO" conversational companion (client module).
 *
 * Contract:
 *  - The user chats in natural language (Arabic or English).
 *  - The server classifies the intent, calls REAL catalogue providers when a
 *    search is needed, and the model only narrates the real results.
 *  - Every reply is stamped with its mode so the UI can label the source:
 *      catalogue → real provider results (addable to the library)
 *      library   → grounded in the user's real library digest
 *      general   → AI knowledge, clearly marked, no items
 */

import type { MediaItem } from "../types";

export type AskMode = "catalogue" | "library" | "general";

export interface AskItem {
  item: MediaItem;
  sourceLabel: string;
}

export interface AskReply {
  mode: AskMode;
  text: string;
  items: AskItem[];
}

export interface AskDigest {
  librarySize: number;
  ratedCount: number;
  favouritesCount: number;
  mix: { anime: number; movie: number; series: number; game: number; book: number; manga: number; comics: number };
  topGenres: string[];
  recent: { title: string; status: string; rating?: number }[];
}

export interface AskHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskOutcome {
  reply: AskReply | null;
  /** true when the request was rejected by the app's own AI rate limiter */
  rateLimited: boolean;
}

export async function askEcho(
  history: AskHistoryTurn[],
  lang: "ar" | "en",
  digest: AskDigest | null,
): Promise<AskOutcome> {
  try {
    const res = await fetch("/api/echo/ai/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history, lang, digest }),
    });
    if (res.status === 429) return { reply: null, rateLimited: true };
    if (!res.ok) return { reply: null, rateLimited: false };
    const data = (await res.json()) as {
      ok?: boolean;
      reply?: { mode?: unknown; text?: unknown; items?: unknown };
    };
    if (data?.ok !== true || typeof data.reply?.text !== "string") {
      return { reply: null, rateLimited: false };
    }
    const mode =
      data.reply.mode === "catalogue" || data.reply.mode === "library"
        ? data.reply.mode
        : "general";
    const items = Array.isArray(data.reply.items)
      ? (data.reply.items as AskItem[]).filter(
          (i) => i && typeof i === "object" && i.item && typeof i.item.localId === "string",
        )
      : [];
    return { reply: { mode, text: data.reply.text, items }, rateLimited: false };
  } catch {
    return { reply: null, rateLimited: false };
  }
}
