/**
 * ECHO — tiny in-memory TTL cache shared by the catalogue providers.
 *
 * Purpose: protect the free public APIs (and the shared RAWG key quota)
 * from redundant calls, both in the browser (per session) and on the
 * server (per process — e.g. the "Ask ECHO" route). It is deliberately
 * dependency-free and instance-local: on serverless deploys (Vercel)
 * each lambda instance keeps its own cache, which is already a big win.
 * When growth demands a cross-instance cache, swap this for
 * Upstash/Redis — the call sites do not change.
 *
 * Rules:
 *  - only SUCCESSFUL, NON-EMPTY results are cached (errors retry next time)
 *  - each cache has a max size; the oldest entries are evicted first
 *  - entries expire by TTL and are lazily removed
 */

export class TTLCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 200) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // refresh insertion order so recently-used keys survive eviction
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Drop everything (e.g. when provider toggles change). */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Memoize an async function with a TTL cache. Only fulfilled, non-empty
 * (truthy-resolving) results are stored; rejections are never cached.
 */
export function cached<T>(
  cache: TTLCache<T>,
  key: string,
  fn: () => Promise<T>,
  isEmpty?: (value: T) => boolean,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return fn().then((value) => {
    if (!isEmpty?.(value)) cache.set(key, value);
    return value;
  });
}
