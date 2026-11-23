/**
 * ECHO — Curated cross-media relationships (v3).
 *
 * Explicit, typed relationships between works that exist in the local
 * catalogue — manga → anime, book → film, book → series, novel → game,
 * light novel → anime, game → series. Every link resolves to REAL entries
 * (both sides must exist in DEMO_CATALOGUE); a test enforces that, so a
 * renamed or removed seed id breaks the build rather than the user's data.
 *
 * Semantics (mirrors WorkLink in types.ts):
 *  - `from` = the SOURCE work (the original),
 *  - `to`   = the ADAPTATION (derived work),
 *  - relation "adaptation" never merges the two works: they stay separate
 *    records with separate identities (a manga and its anime adaptation are
 *    different works — see match.ts, which rejects cross-type links).
 *
 * These links are also exportable as WorkLink records (curatedLinksAsWorkLinks)
 * so the export/import path carries relationships alongside user data.
 */

import type { WorkLink, WorkRelation } from "../types";
import { workIdFor } from "../ids";
import { DEMO_CATALOGUE } from "./demoCatalogue";

export interface CuratedLinkSeed {
  /** seed id of the SOURCE work (the original) */
  from: string;
  /** seed id of the ADAPTATION (derived work) */
  to: string;
  relation: WorkRelation;
}

export const CURATED_LINKS: CuratedLinkSeed[] = [
  // ------------------------------------------------- manga → anime (local)
  { from: "cmk-attack-on-titan", to: "attack-on-titan", relation: "adaptation" },
  { from: "cmk-death-note", to: "death-note", relation: "adaptation" },
  { from: "cmk-fullmetal-alchemist", to: "fma-brotherhood", relation: "adaptation" },
  { from: "cmk-demon-slayer", to: "demon-slayer", relation: "adaptation" },
  { from: "cmk-jujutsu-kaisen", to: "jujutsu-kaisen", relation: "adaptation" },
  { from: "cmk-monster", to: "monster", relation: "adaptation" },
  { from: "cmk-hunter-x-hunter", to: "hunter-x-hunter", relation: "adaptation" },
  { from: "cmk-mob-psycho-100", to: "mob-psycho-100", relation: "adaptation" },
  { from: "cmk-frieren", to: "frieren", relation: "adaptation" },
  // ------------------------------------------- books → film / series / game
  { from: "cb-lotr", to: "cm-fellowship-of-the-ring", relation: "adaptation" },
  { from: "cb-game-thrones", to: "game-of-thrones", relation: "adaptation" },
  { from: "cb-last-wish", to: "cg-witcher-3", relation: "adaptation" },
  { from: "cb-violet-evergarden-ln", to: "violet-evergarden", relation: "adaptation" },
  // ----------------------------------------------------- game → series
  { from: "cg-last-of-us", to: "the-last-of-us", relation: "adaptation" },
  // ----------------------------------------------------- comics (model-ready)
  // Comic → screen pairs are fully supported by the relation model; the
  // local catalogue does not yet carry both sides of any comic adaptation,
  // so no comic link is asserted here (no invented relationships).
];

const SEED_IDS = new Set(DEMO_CATALOGUE.map((s) => s.id));

/** Validate that every curated link resolves to real catalogue entries. */
export function curatedLinksValid(): { ok: boolean; broken: string[] } {
  const broken: string[] = [];
  for (const link of CURATED_LINKS) {
    if (!SEED_IDS.has(link.from)) broken.push(`${link.from} (from)`);
    if (!SEED_IDS.has(link.to)) broken.push(`${link.to} (to)`);
  }
  return { ok: broken.length === 0, broken };
}

/** Local catalogue workId for a seed id (matches stampCatalogProvenance). */
function seedWorkId(seedId: string): string {
  return workIdFor("echo-demo", seedId);
}

/** The curated links as v2/v3 WorkLink records (workId = adaptation,
 *  parentWorkId = source — same direction WorkLink uses for seasons). */
export function curatedLinksAsWorkLinks(nowIso: string): WorkLink[] {
  return CURATED_LINKS.map((l, i) => ({
    id: `echo-link-curated-${i}`,
    workId: seedWorkId(l.to),
    parentWorkId: seedWorkId(l.from),
    relation: l.relation,
    createdAt: nowIso,
  }));
}

export interface RelatedWorkRef {
  /** the other work's seed id */
  seedId: string;
  /** how the other work relates to the queried work */
  direction: "adapted-from" | "adapted-into";
  relation: WorkRelation;
}

/** Related works for a seed id, both directions (source: "adapted into X",
 *  adaptation: "adapted from Y"). */
export function relatedWorksForSeed(seedId: string): RelatedWorkRef[] {
  const out: RelatedWorkRef[] = [];
  for (const l of CURATED_LINKS) {
    if (l.from === seedId) {
      out.push({ seedId: l.to, direction: "adapted-into", relation: l.relation });
    } else if (l.to === seedId) {
      out.push({ seedId: l.from, direction: "adapted-from", relation: l.relation });
    }
  }
  return out;
}

/** Related works for a local catalogue localId (`echo-demo:<seedId>`). */
export function relatedWorksForLocalId(localId: string): RelatedWorkRef[] {
  if (!localId.startsWith("echo-demo:")) return [];
  return relatedWorksForSeed(localId.slice("echo-demo:".length));
}
