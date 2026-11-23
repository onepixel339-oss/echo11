/**
 * ECHO — IGDB server proxy (license-gated, credential-safe).
 *
 * Why a proxy: the IGDB API requires Twitch OAuth2 client credentials
 * (Client-ID + Client-Secret) and does not support browser-direct calls.
 * The route performs the client-credentials flow server-side and never
 * exposes the credentials or the token to client JavaScript.
 *
 * Behaviour:
 *  - No IGDB_CLIENT_ID / IGDB_CLIENT_SECRET → { configured: false } (the
 *    client adapter reports "not configured"; no upstream call is made).
 *  - IGDB allows 4 req/s per token: the route keeps a 260ms spacing between
 *    upstream calls per instance plus per-IP + global rate limits.
 *  - Responses stay transient: no-store, no persistence anywhere.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  IGDB_CACHE_TTL_MS,
  igdbUpstreamSearch,
  normalizeIgdbResults,
} from "@/lib/echo/providers/igdb";
import { isProviderEnabled } from "@/lib/echo/providers/registry";
import { TTLCache } from "@/lib/echo/providers/cache";
import { clientIp, rateLimited } from "@/lib/echo/server/ratelimit";

export const dynamic = "force-dynamic";

/** Transient per-instance response cache (TTL capped by the registry). */
const cache = new TTLCache<{ configured: true; results: unknown[] }>(IGDB_CACHE_TTL_MS);

/** Simple spacing so the instance stays below IGDB's 4 req/s per token. */
let lastUpstreamAt = 0;
async function igdbPacing(): Promise<void> {
  const minGapMs = 260;
  const wait = lastUpstreamAt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastUpstreamAt = Date.now();
}

export async function GET(req: NextRequest) {
  // license gate: the registry decides (server side uses registry defaults)
  if (!isProviderEnabled("igdb")) {
    return NextResponse.json({ configured: false, results: [] }, { status: 200 });
  }
  const clientId = (process.env.IGDB_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.IGDB_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ configured: false, results: [] });
  }

  // per-IP + global budgets: 30 searches/min per IP, 240/min overall (< 4/s)
  const ip = clientIp(req);
  if (rateLimited(`igdb|${ip}`, 30) || rateLimited("igdb|__global__", 240)) {
    return NextResponse.json(
      { configured: true, results: [], error: "rate_limited", retryAfterMs: 60_000 },
      { status: 200 },
    );
  }

  const params = req.nextUrl.searchParams;
  const id = params.get("id");
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(10, Math.max(1, Number(params.get("limit") ?? 8) || 8));

  if (id) {
    if (!/^\d+$/.test(id)) return NextResponse.json({ configured: true, results: [] });
    try {
      await igdbPacing();
      // details: fetch the single game by id (Apicalypse `where id = …`)
      const token = await (
        await import("@/lib/echo/providers/igdb")
      ).igdbAccessToken(clientId, clientSecret);
      const res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: `fields name,slug,summary,first_release_date,genres.name,platforms.abbreviation,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.image_id; where id = ${id}; limit 1;`,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) return NextResponse.json({ configured: true, results: [] });
      const rows = (await res.json()) as Parameters<typeof normalizeIgdbResults>[0];
      return NextResponse.json(
        { configured: true, results: normalizeIgdbResults(rows, 1) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ configured: true, results: [] });
    }
  }

  if (!query) return NextResponse.json({ configured: true, results: [] });

  const key = `${query}|${limit}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit, { headers: { "Cache-Control": "no-store" } });

  try {
    await igdbPacing();
    const rows = await igdbUpstreamSearch(query, limit, clientId, clientSecret);
    const results = normalizeIgdbResults(rows, limit);
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
