/**
 * ECHO — The federated search engine.
 *
 * One normalized request fans out to the category-routed providers in
 * PARALLEL, with:
 *   - independent per-provider timeouts (a slow source never blocks the rest),
 *   - cancellation (the query changed → in-flight calls abort),
 *   - per-provider rate-limit cooldowns with Retry-After support,
 *   - progressive snapshots: results render as each provider answers,
 *   - evidence-based dedup + provider interleaving in the final order,
 *   - the approved local ECHO catalogue as a labelled fill for categories
 *     with no live coverage (live results progressively replace it).
 *
 * ARCHITECTURE: no results are persisted — snapshots live in memory only.
 * IndexedDB remains reserved for the user's own library and ECHO's local
 * content. One failed provider never prevents the others' results.
 */

import type { MediaItem, MediaType } from "../types";
import { MEDIA_TYPES } from "../types";
import { DemoProvider } from "../providers/demo";
import { searchCatalogShards } from "../catalogShards";
import { isProviderEnabled } from "../providers/registry";
import { TTLCache } from "../providers/cache";
import { resolveProviderJobs, type CooldownStore, type ResolvedProviderJob } from "./router";
import { dedupeAndMerge, normalizeTitle, type DedupInput } from "./dedupe";
import type {
  FederatedHit,
  FederatedSearchHandle,
  FederatedSearchOptions,
  FederatedSnapshot,
  ProviderCallState,
} from "./types";

/** All seven categories, in display order (no providers/index import here —
 *  that module re-exports the router and would create a cycle). */
const ALL_MEDIA_TYPES: MediaType[] = MEDIA_TYPES;

/** The local catalogue instance used by the engine (approved ECHO content:
 *  demo universe + curated collections; in-memory search, no network). */
const demoProvider = new DemoProvider();

/* ------------------------------ rate limits ------------------------------ */

interface Cooldown {
  until: number;
  retryAfterMs: number;
}

const cooldowns = new Map<string, Cooldown>();

const cooldownStore: CooldownStore = {
  isCooling(registryId: string, now = Date.now()): boolean {
    const c = cooldowns.get(registryId);
    if (!c) return false;
    if (c.until < now) {
      cooldowns.delete(registryId);
      return false;
    }
    return true;
  },
};

function startCooldown(registryId: string, retryAfterMs?: number): void {
  const ms = Math.min(Math.max(retryAfterMs ?? 60_000, 5_000), 15 * 60_000);
  cooldowns.set(registryId, { until: Date.now() + ms, retryAfterMs: ms });
}

/** Reset all rate-limit cooldowns (tests). */
export function resetFederatedCooldowns(): void {
  cooldowns.clear();
}

/** Active cooldowns, for status display. */
export function federatedCooldowns(): { id: string; until: number }[] {
  const now = Date.now();
  return [...cooldowns.entries()]
    .filter(([, c]) => c.until >= now)
    .map(([id, c]) => ({ id, until: c.until }));
}

/* ------------------------------ ordering ------------------------------ */

/** Exact/prefix title matches float to the top (all variants, incl. Arabic). */
function relevanceOrder(hits: FederatedHit[], query: string): FederatedHit[] {
  const qNorm = normalizeTitle(query);
  if (qNorm.length < 2) return interleaveByProvider(hits);
  const titlesOf = (h: FederatedHit) => {
    const i = h.item;
    return [i.title, i.titleAr, i.originalTitle, ...(i.altTitles ?? [])]
      .filter(Boolean)
      .map((t) => normalizeTitle(t as string));
  };
  const exact = hits.filter((h) => titlesOf(h).some((t) => t === qNorm));
  const starts = hits.filter((h) => {
    const ts = titlesOf(h);
    return !ts.some((t) => t === qNorm) && ts.some((t) => t.startsWith(qNorm) || t.includes(qNorm));
  });
  if (!exact.length && !starts.length) return interleaveByProvider(hits);
  const rest = hits.filter((h) => !exact.includes(h) && !starts.includes(h));
  return [...interleaveByProvider(exact), ...interleaveByProvider(starts), ...interleaveByProvider(rest)];
}

/** Round-robin across providers so no single source dominates the list. */
function interleaveByProvider(hits: FederatedHit[]): FederatedHit[] {
  const byProvider = new Map<string, FederatedHit[]>();
  for (const hit of hits) {
    const key = hit.contributions[0]?.providerId ?? hit.item.provider;
    const list = byProvider.get(key) ?? [];
    list.push(hit);
    byProvider.set(key, list);
  }
  if (byProvider.size <= 1) return [...hits];
  const order = [...byProvider.keys()];
  const out: FederatedHit[] = [];
  let i = 0;
  while (out.length < hits.length) {
    let pushed = false;
    for (const key of order) {
      const item = byProvider.get(key)?.[i];
      if (item) {
        out.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
    i++;
  }
  return out;
}

/* ------------------------------ local fill ------------------------------ */

/** Local labelled fill for categories with no live coverage (approved ECHO
 *  content only — demo universe, curated collections, catalog shards). */
async function localFill(
  query: string,
  categories: MediaType[],
  limit: number,
): Promise<DedupInput[]> {
  if (!categories.length || !isProviderEnabled("echo-demo")) return [];
  const results = await demoProvider.search(query, { mediaTypes: categories, limit }).catch(() => []);
  const shardHits = await searchCatalogShards(query, categories, limit).catch(() => []);
  const label = "Sample";
  return [...results, ...shardHits].map((r) => ({
    item: r.item,
    providerId: r.item.provider === "echo-catalog" ? "echo-demo" : r.item.provider,
    providerLabel: r.sourceLabel || label,
    priority: 90, // local content never wins the primary record over live data
    isLive: false,
  }));
}

/* ------------------------------ the engine ------------------------------ */

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Combine an engine signal and a per-job timeout into one signal. */
function jobSignal(engineSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const abort = (reason: "cancelled" | "timeout") => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  if (engineSignal) {
    if (engineSignal.aborted) abort("cancelled");
    else engineSignal.addEventListener("abort", () => abort("cancelled"), { once: true });
  }
  const timer = setTimeout(() => abort("timeout"), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/** Was this error a cancellation (engine abort / query change)? */
function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Was this error caused by the engine signal (not the per-job timeout)? */
function isEngineAbort(err: unknown, engineSignal: AbortSignal | undefined): boolean {
  return isAbort(err) && Boolean(engineSignal?.aborted);
}

/**
 * Run a federated search. Progressive: `onUpdate` fires after EVERY provider
 * settles (or when the local fill changes) so the UI can render results as
 * they arrive instead of waiting for the slowest source.
 */
export function createFederatedSearch(
  query: string,
  options: FederatedSearchOptions = {},
): FederatedSearchHandle {
  const q = query.trim();
  const categories = options.categories?.length
    ? options.categories
    : [...ALL_MEDIA_TYPES];
  const limitPerProvider = options.limitPerProvider ?? 8;
  const includeLocal = options.includeLocal ?? true;
  const onUpdate = options.onUpdate;

  const engine = new AbortController();
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) engine.abort();
    else externalSignal.addEventListener("abort", () => engine.abort(), { once: true });
  }

  const promise = new Promise<FederatedSnapshot>((resolve) => {
    const offline = isOffline();
    const states = new Map<string, ProviderCallState>();
    const liveInputs = new Map<string, DedupInput[]>(); // jobId → results
    let localInputs: DedupInput[] = [];
    let settled = 0;
    let total = 0;
    let finished = false;

    const snapshot = (done: boolean): FederatedSnapshot => {
      // local fill only covers categories with NO live results yet —
      // live data progressively replaces the labelled local content
      const liveCats = new Set<MediaType>();
      for (const inputs of liveInputs.values()) {
        for (const input of inputs) liveCats.add(input.item.mediaType);
      }
      const localKept = localInputs.filter((l) => !liveCats.has(l.item.mediaType));
      const hits = relevanceOrder(
        dedupeAndMerge([...[...liveInputs.values()].flat(), ...localKept]),
        q,
      );
      return {
        query: q,
        categories,
        hits,
        providers: [...states.values()],
        done,
        offline,
        usedLocal: localKept.length > 0,
      };
    };

    const emit = (done: boolean) => {
      if (finished && !done) return; // never "un-finish" after resolution
      onUpdate?.(snapshot(done));
    };

    /** The local fill promise (null when local content is excluded). */
    let localFillPromise: Promise<void> | null = null;

    /** Resolve the search — waits for the local fill so labelled results are
     *  never lost to a race with the (usually faster) live providers. */
    const finish = () => {
      if (finished) return;
      finished = true;
      const complete = () => {
        const final = snapshot(true);
        onUpdate?.(final);
        resolve(final);
      };
      if (localFillPromise) {
        // bound the wait: a wedged local query must not hang the search
        const bounded = Promise.race([
          localFillPromise,
          new Promise<void>((r) => setTimeout(r, 2500)),
        ]);
        void bounded.then(complete, complete);
      } else {
        complete();
      }
    };

    const settle = () => {
      settled++;
      if (settled >= total) finish();
      else emit(false);
    };

    if (!q) {
      resolve(snapshot(true));
      return;
    }

    if (offline) {
      // nothing live is attempted: the request would fail anyway; ECHO goes
      // straight to the approved local catalogue
      if (includeLocal) {
        localFillPromise = localFill(q, categories, limitPerProvider)
          .then((inputs) => {
            localInputs = inputs;
          })
          .catch(() => undefined);
      }
      finish();
      return;
    }

    const jobs = resolveProviderJobs(categories, cooldownStore);
    total = jobs.length;

    for (const job of jobs) {
      states.set(jobKey(job), {
        id: job.registryId,
        label: job.label,
        status: "pending",
        categories: [...job.categories],
        count: 0,
      });
    }

    // kick the local fill early so labelled results appear immediately;
    // it is re-filtered (live replaces local) on every snapshot, and the
    // final resolution waits for it so no local result is ever lost
    if (includeLocal) {
      localFillPromise = localFill(q, categories, limitPerProvider)
        .then((inputs) => {
          localInputs = inputs;
          if (!engine.signal.aborted && !finished) emit(false); // local before the first live answer
        })
        .catch(() => undefined);
    }

    if (!jobs.length) {
      // no provider eligible (all gated/unconfigured/cooling down): the
      // local fill (already in flight) settles the search
      finish();
      return;
    }

    let anyCancelled = false;
    for (const job of jobs) {
      const key = jobKey(job);
      const started = Date.now();
      const signal = jobSignal(engine.signal, job.timeoutMs);
      job
        .run(q, { mediaTypes: [...job.categories], limit: limitPerProvider, signal })
        .then((rows) => {
          if (engine.signal.aborted) return;
          const items = (rows ?? [])
            .map((row) => (row as { item?: MediaItem }).item)
            .filter((item): item is MediaItem => Boolean(item))
            .slice(0, limitPerProvider);
          liveInputs.set(
            key,
            items.map((item) => ({
              item,
              providerId: job.registryId,
              providerLabel: job.label,
              priority: job.priority,
              isLive: true,
            })),
          );
          const state = states.get(key);
          if (state) {
            state.status = items.length ? "ok" : "empty";
            state.count = items.length;
            state.latencyMs = Date.now() - started;
          }
          settle();
        })
        .catch((err: unknown) => {
          if (engine.signal.aborted || anyCancelled) return;
          if (isEngineAbort(err, engine.signal)) {
            anyCancelled = true;
            engine.abort();
            for (const s of states.values()) if (s.status === "pending") s.status = "cancelled";
            resolve(snapshot(false));
            return;
          }
          const state = states.get(key);
          if (state) {
            state.latencyMs = Date.now() - started;
            if (isAbort(err)) {
              state.status = "timeout";
              state.errorCode = "timeout";
            } else if (
              err instanceof Error &&
              (err as { code?: string }).code === "rate_limited"
            ) {
              state.status = "rate_limited";
              state.errorCode = "rate_limited";
              const retryAfterMs = (err as { retryAfterMs?: number }).retryAfterMs;
              state.retryAfterMs = retryAfterMs;
              startCooldown(job.registryId, retryAfterMs);
            } else if (
              err instanceof Error &&
              (err as { code?: string }).code === "missing_key"
            ) {
              state.status = "unconfigured";
              state.errorCode = "missing_key";
            } else {
              state.status = "error";
              state.errorCode =
                err instanceof Error
                  ? String((err as { code?: string }).code ?? "network")
                  : "network";
            }
          }
          settle();
        });
    }

    engine.signal.addEventListener(
      "abort",
      () => {
        // user cancelled: settle with whatever arrived, mark the rest cancelled
        for (const s of states.values()) if (s.status === "pending") s.status = "cancelled";
        resolve(snapshot(false));
      },
      { once: true },
    );
  });

  return {
    promise,
    cancel: () => engine.abort(),
  };
}

function jobKey(job: ResolvedProviderJob): string {
  return `${job.registryId}:${job.provider.id}`;
}

/** Awaitable form without progressive updates (server routes, tests). */
export async function runFederatedSearch(
  query: string,
  options: FederatedSearchOptions = {},
): Promise<FederatedSnapshot> {
  return createFederatedSearch(query, options).promise;
}

/* ------------------- snapshot cache (repeated queries) ------------------- */

const snapshotCache = new TTLCache<FederatedSnapshot>(5 * 60_000);

/** Cached search used by the legacy searchCatalogue API: identical queries
 *  within 5 minutes share one upstream call set. Only non-empty, fully-live
 *  snapshots are cached (offline/local-only results are never cached). */
export async function searchFederatedCached(
  query: string,
  options: FederatedSearchOptions = {},
): Promise<FederatedSnapshot> {
  const q = query.trim();
  if (!q) {
    return {
      query: "",
      categories: options.categories ?? [...ALL_MEDIA_TYPES],
      hits: [],
      providers: [],
      done: true,
      offline: isOffline(),
      usedLocal: false,
    };
  }
  const types = [...(options.categories ?? [])].sort().join(",");
  const limit = options.limitPerProvider ?? 8;
  const key = `${q}|${types}|${limit}`;
  const hit = snapshotCache.get(key);
  if (hit) return hit;
  const snapshot = await runFederatedSearch(q, options);
  if (snapshot.hits.length && !snapshot.usedLocal && !snapshot.offline) {
    snapshotCache.set(key, snapshot);
  }
  return snapshot;
}

/** Drop memoized federated outcomes (provider toggles changed). */
export function clearFederatedCaches(): void {
  snapshotCache.clear();
}
