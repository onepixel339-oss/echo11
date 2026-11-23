/**
 * ECHO — Upstash Redis adapter (server-side only) — GROWTH SWAP POINT.
 *
 * Today everything (rate limits, translation cache) lives in per-instance
 * memory, which is correct and free for launch. When traffic grows across
 * multiple serverless instances, set two env vars:
 *
 *   UPSTASH_REDIS_REST_URL=https://<your-db>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=<token>
 *
 * …and this module becomes live. The free Upstash tier is enough for a long
 * time, and switching requires NO architectural change — only the exact call
 * sites marked below switch from the sync in-memory functions to these
 * awaited ones (two-line change per route).
 *
 * SWAP MAP (what changes when Upstash is configured):
 *   ratelimit.ts   rateLimited(key, n, ms)      → await kvRateLimited(key, n, ms)
 *   translate.ts   const cache = new TTLCache() → await kvGet/kvSet wrappers
 */

/** True when a Upstash REST endpoint is configured (env vars at deploy time). */
export function kvConfigured(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL ?? "").trim() &&
      (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim(),
  );
}

const kvUrl = () => (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
const kvToken = () => (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();

interface UpstashResult {
  result?: unknown;
  error?: string;
}

/** Run one pipeline of commands on Upstash REST. Returns parsed results. */
async function upstashPipeline(commands: (string | number)[][]): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${kvUrl()}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${kvToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands.map((c) => ({ command: c }))),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as UpstashResult[] | UpstashResult;
    const arr = Array.isArray(data) ? data : [data];
    if (arr.some((r) => r && typeof r === "object" && "error" in r && r.error)) return null;
    return arr.map((r) => (r && typeof r === "object" && "result" in r ? r.result : null));
  } catch {
    return null; // Redis down → callers keep their in-memory fallback
  }
}

/**
 * Distributed fixed-window counter: INCR + EXPIRE in one pipeline.
 * Returns the current count for the window, or null when Upstash is not
 * reachable (callers then fall back to the in-memory limiter).
 */
export async function kvIncrWindow(
  key: string,
  windowMs: number,
): Promise<number | null> {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const results = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, ttlSeconds, "NX"], // set TTL only on first increment
  ]);
  if (!results || typeof results[0] !== "number") return null;
  return results[0];
}

/**
 * Distributed rate limiter with the SAME semantics as server/ratelimit.ts
 * (fixed window, true when over budget). Falls back to the in-memory limiter
 * whenever Upstash is missing or unreachable, so the swap is always safe.
 *
 * Swap usage (route files):
 *   if (await kvRateLimited(`ask|${ip}`, 12)) return 429;
 */
export async function kvRateLimited(
  key: string,
  limit: number,
  windowMs = 60_000,
): Promise<boolean> {
  if (!kvConfigured()) {
    // no Upstash configured → the launch-time in-memory limiter stays in charge
    const { rateLimited } = await import("./ratelimit");
    return rateLimited(key, limit, windowMs);
  }
  const count = await kvIncrWindow(`rl:${key}`, windowMs);
  if (count === null) {
    const { rateLimited } = await import("./ratelimit");
    return rateLimited(key, limit, windowMs);
  }
  return count > limit;
}

/** Distributed TTL get (translation cache swap point). */
export async function kvGet(key: string): Promise<string | null> {
  if (!kvConfigured()) return null;
  const results = await upstashPipeline([["GET", key]]);
  const v = results?.[0];
  return typeof v === "string" ? v : null;
}

/** Distributed TTL set (translation cache swap point). */
export async function kvSet(key: string, value: string, ttlMs: number): Promise<void> {
  if (!kvConfigured()) return;
  await upstashPipeline([
    ["SET", key, value, "EX", Math.max(1, Math.ceil(ttlMs / 1000))],
  ]);
}
