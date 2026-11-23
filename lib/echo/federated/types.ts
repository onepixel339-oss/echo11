/**
 * ECHO — Federated search types.
 *
 * The federated engine searches EXTERNAL catalogues live, on demand, and
 * keeps every result transient (in-memory only). It never persists a copy
 * of a provider's catalogue: IndexedDB stays reserved for the user's own
 * library, and the approved local ECHO content.
 */

import type { MediaItem, MediaType } from "../types";

/** Lifecycle of one provider call within a federated search. */
export type ProviderCallStatus =
  | "pending" // request in flight
  | "ok" // answered with results
  | "empty" // answered, no results
  | "error" // failed (network / invalid response / unavailable)
  | "timeout" // exceeded its independent timeout
  | "rate_limited" // upstream 429 — cooling down
  | "unconfigured" // needs a deployment credential that is absent
  | "skipped" // license-gated or in a rate-limit cooldown
  | "offline" // not attempted: device offline
  | "cancelled"; // aborted because the query changed

/** Status of one provider call, surfaced to the UI per search. */
export interface ProviderCallState {
  /** registry provider id */
  id: string;
  /** display label */
  label: string;
  status: ProviderCallStatus;
  /** categories this call serves */
  categories: MediaType[];
  /** results contributed (after per-provider cap) */
  count: number;
  /** round-trip milliseconds */
  latencyMs?: number;
  /** machine-readable error code */
  errorCode?: string;
  /** human-readable reason (shown in tooltips) */
  detail?: string;
  /** upstream Retry-After hint, ms */
  retryAfterMs?: number;
}

/** One provider's contribution to a merged (deduplicated) result. */
export interface ResultContribution {
  /** registry provider id */
  providerId: string;
  /** display label */
  providerLabel: string;
  /** the provider's own external id for the work */
  externalId?: string;
  /** canonical external page for this record */
  url?: string;
  /** the localId this provider's record would use */
  localId: string;
}

/** How certain the merge of two provider records is. */
export type MergeConfidence = "identifier" | "strong" | "title";

/** A merged, deduplicated federated search result. */
export interface FederatedHit {
  /** the primary record (highest-priority provider wins) */
  item: MediaItem;
  /** every provider that returned this work */
  contributions: ResultContribution[];
  /** merge evidence for the multi-provider case */
  confidence?: MergeConfidence;
  /** shared verified identifiers that proved the merge (if any) */
  matchedIds?: string[];
  /** true for live external results; false for ECHO's local catalogue */
  isLive: boolean;
}

/** Progressive snapshot of a federated search (emitted per provider). */
export interface FederatedSnapshot {
  query: string;
  /** requested categories (may be all seven) */
  categories: MediaType[];
  /** merged results, relevance-ordered, provider-interleaved */
  hits: FederatedHit[];
  /** per-provider call states (live sources) */
  providers: ProviderCallState[];
  /** true once every provider has settled */
  done: boolean;
  /** device reported offline at query time */
  offline: boolean;
  /** true when local (labelled) ECHO content is included */
  usedLocal: boolean;
}

export interface FederatedSearchOptions {
  /** categories to search (default: all seven) */
  categories?: MediaType[];
  /** per-provider result cap (default 8) */
  limitPerProvider?: number;
  /** include ECHO's approved local catalogue as a labelled fill for
   *  categories with no live coverage (default true) */
  includeLocal?: boolean;
  /** interface language — queries are sent as typed; part of the contract */
  lang?: "en" | "ar";
  /** progressive updates as each provider answers */
  onUpdate?: (snapshot: FederatedSnapshot) => void;
  /** abort signal (e.g. the query changed) */
  signal?: AbortSignal;
}

/** Cancellable federated search handle. */
export interface FederatedSearchHandle {
  promise: Promise<FederatedSnapshot>;
  cancel: () => void;
}
