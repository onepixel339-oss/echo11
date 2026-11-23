/**
 * ECHO — Trakt server proxy (license-gated, credential-safe).
 *
 * Why a proxy: api.trakt.tv CORS is whitelisted per registered app origin,
 * and the client_id must come from a deployment env var. The route keeps
 * TRAKT_CLIENT_ID server-side (never in client JavaScript) and works from
 * any deployment origin.
 *
 * Behaviour:
 *  - No TRAKT_CLIENT_ID → { configured: false } (the client adapter reports
 *    "not configured"; no upstream call is made).
 *  - Per-IP + global rate limits protect the shared quota (see ratelimit.ts).
 *  - Upstream errors map to a typed error envelope; one provider failing
 *    never affects the rest of a federated search.
 *  - Responses stay transient: no-store, no persistence anywhere.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  TRAKT_CACHE_TTL_MS,
  normalizeTraktResults,
  traktUpstreamSearch,
  type TraktSearchRow,
} from "@/lib/echo/providers/trakt";
import { isProviderEnabled } from "@/lib/echo/providers/registry";
import { TTLCache } from "@/lib/echo/providers/cache";
import { clientIp, rateLimited } from "@/lib/echo/server/ratelimit";

export const dynamic = "force-dynamic";

/** Transient per-instance response cache (TTL capped by the registry). */
const cache = new TTLCache<{ configured: true; results: unknown[] }>(TRAKT_CACHE_TTL_MS);

export async function GET(req: NextRequest) {
  // license gate: the registry decides (server side uses registry defaults)
  if (!isProviderEnabled("trakt")) {
    return NextResponse.json({ configured: false, results: [] }, { status: 200 });
  }
  const clientId = (process.env.TRAKT_CLIENT_ID ?? "").trim();
  if (!clientId) {
    return NextResponse.json({ configured: false, results: [] });
  }

  // per-IP + global budgets: 30 searches/min per IP, 300/min overall
  const ip = clientIp(req);
  if (rateLimited(`trakt|${ip}`, 30) || rateLimited("trakt|__global__", 300)) {
    return NextResponse.json(
      { configured: true, results: [], error: "rate_limited", retryAfterMs: 60_000 },
      { status: 200 },
    );
  }

  const params = req.nextUrl.searchParams;
  const id = params.get("id");
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  const type = params.get("type") === "series" ? "series" : "movie";
  const limit = Math.min(10, Math.max(1, Number(params.get("limit") ?? 8) || 8));

  // details refresh: /search/trakt/<id>?type=…
  if (id) {
    const m = id.match(/^(movie|series)\/(\d+)$/);
    if (!m) return NextResponse.json({ configured: true, results: [] });
    const detailsType = m[1] === "series" ? "series" : "movie";
    try {
      const res = await fetch(
        `https://api.trakt.tv/search/trakt/${m[2]}?type=${detailsType === "series" ? "show" : "movie"}`,
        {
          headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId,
          },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        },
      );
      if (!res.ok) return NextResponse.json({ configured: true, results: [] });
      const rows = (await res.json()) as TraktSearchRow[];
      return NextResponse.json(
        { configured: true, results: normalizeTraktResults(rows, detailsType, 1) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ configured: true, results: [] });
    }
  }

  if (!query) return NextResponse.json({ configured: true, results: [] });

  const key = `${type}|${query}|${limit}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit, { headers: { "Cache-Control": "no-store" } });

  try {
    const rows = await traktUpstreamSearch(query, type, limit, clientId);
    const results = normalizeTraktResults(rows, type, limit);
    const payload = { configured: true as const, results };
    if (results.length) cache.set(key, payload);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? String((err as { code?: string }).code) : "unavailable";
    return NextResponse.json(
      {
        configured: true,
        results: [],
        error: code === "rate_limited" ? "rate_limited" : "unavailable",
      },
      { status: 200 },
    );
  }
}
