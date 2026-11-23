/**
 * Deterministic helpers: IDs, hashing, seeded RNG.
 * Determinism is a spec requirement (stable map layout, stable rankings).
 */

/** RFC4122-ish v4 id (crypto-based, non-deterministic — used for records). */
export function makeId(prefix = "id"): string {
  const c =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${c}`;
}

/** Deterministic localId for a provider item. */
export function providerLocalId(provider: string, providerId: string): string {
  return `${provider}:${providerId}`;
}

/**
 * Stable canonical ECHO work ID (v2 catalog schema).
 * Deterministic from the origin provider record — the same provider item
 * always maps to the same work id, on every device, forever.
 */
export function workIdFor(provider: string, providerId: string): string {
  return `echo-work-${provider}-${providerId}`;
}

/** Stable canonical work ID for a user-authored manual record — derived from
 *  its own localId (which is unique and immutable per record). */
export function manualWorkIdFor(localId: string): string {
  return `echo-work-${localId}`;
}

/** Base36 FNV-1a for compact, readable identifiers. */
function fnv1a36(str: string): string {
  return fnv1a(str).toString(36);
}

/** Short stable key for a normalized title (+ optional year) — used by
 *  identity matching to bucket "same title" candidates for review. */
export function titleKey(title: string, year?: number): string {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${normalized || "untitled"}|${year ?? ""}|${fnv1a36(normalized)}`;
}

/** FNV-1a 32-bit hash → unsigned int. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable string hash for seeds. */
export function hashString(str: string): number {
  return fnv1a(str);
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-node stable pseudo-random in [0,1) derived from its id + salt. */
export function seededUnit(id: string, salt: string): number {
  return mulberry32(fnv1a(salt + "|" + id))();
}

/** Sort keys and join — canonical representation for hashing a set. */
export function canonicalKey(ids: Iterable<string>): string {
  return [...ids].sort().join("|");
}
