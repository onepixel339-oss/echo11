/**
 * ECHO — synopsis translation endpoint (server-side).
 *
 * Free, keyless machine translation for Arabic-interface users. Protected
 * by the same in-memory limiter as the AI routes: a per-IP budget plus a
 * global ceiling, so no client (or botnet) can hammer the free upstreams.
 * The translation service itself caches every successful result for 24 h,
 * so repeated views of the same title cost zero upstream calls.
 *
 * Request:  POST { texts: string[] }        (≤8 texts, each ≤1200 chars)
 * Response: { ok: true, translations: string[] }
 *           — failed entries come back as the ORIGINAL text.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimited, clientIp } from "@/lib/echo/server/ratelimit";
import {
  translateToArabic,
  needsArabic,
  TRANSLATE_MAX_CHARS,
  TRANSLATE_MAX_BATCH,
} from "@/lib/echo/server/translate";

export const runtime = "nodejs";

// Vercel: allow the full AI provider-chain timeout (50s) instead of the
// platform default; harmless on any other host.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PER_IP_PER_MIN = 40;
const GLOBAL_PER_MIN = 240;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (
    rateLimited(`translate|${ip}`, PER_IP_PER_MIN) ||
    rateLimited("translate|__global__", GLOBAL_PER_MIN)
  ) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }

  const raw = (body as Record<string, unknown> | null)?.texts;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > TRANSLATE_MAX_BATCH) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  const texts = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, TRANSLATE_MAX_CHARS))
    .filter((t) => t.length > 0);
  if (!texts.length) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }

  try {
    // already-Arabic text passes through untouched (no upstream call at all)
    const results = await Promise.all(
      texts.map(async (t) => {
        if (!needsArabic(t)) return t;
        const { text } = await translateToArabic(t);
        return text;
      }),
    );
    return NextResponse.json({ ok: true, translations: results });
  } catch (err) {
    console.error("[echo/translate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "translate_failed" });
  }
}
