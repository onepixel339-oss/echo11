/**
 * ECHO — in-memory API rate limiter (server-side only).
 *
 * Protection strategy for launch ("in-memory for now, Redis when it grows"):
 *  - fixed-window counters per client IP, per route budget
 *  - periodic lazy cleanup so the map never grows unbounded
 *  - a GLOBAL ceiling on top of the per-IP budget, so a botnet or an
 *    abusive single IP cannot burn the AI free quota for everyone
 *
 * Scope limits (honest): memory lives per serverless instance, so limits
 * are approximate under multi-instance deploys. When the app outgrows
 * this, set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN and switch
 * the call sites to `await kvRateLimited(...)` (see server/kv.ts — the
 * signature is identical, it falls back to this module automatically).
 *
 * Usage:
 *   const limited = rateLimited(`ask|${ip}`, PER_IP_PER_MIN);
 *   const global  = rateLimited(`ask|__global__`, GLOBAL_PER_MIN);
 *   if (limited || global) return 429;
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

/** True when this key exceeded `limit` events inside `windowMs`. */
export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanup(now);
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/** Remove expired buckets; keep the map O(active clients). */
function cleanup(now: number): void {
  if (buckets.size < 512) return;
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
