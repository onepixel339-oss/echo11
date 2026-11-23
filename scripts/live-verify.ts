/**
 * LIVE provider verification (Phase 5, final routing) — a small number of
 * carefully controlled requests per provider, within documented limits.
 */
import { MadbProvider } from "/home/z/my-project/src/lib/echo/providers/madb";
import { InventaireProvider } from "/home/z/my-project/src/lib/echo/providers/inventaire";
import { BnfProvider } from "/home/z/my-project/src/lib/echo/providers/bnf";

const madb = new MadbProvider();
const inv = new InventaireProvider();
const bnf = new BnfProvider();

console.log("=== MADB (SPARQL, browser-direct) — manga: 進撃の巨人 ===");
try {
  const r = await madb.search("進撃の巨人", { mediaTypes: ["manga"], limit: 3 });
  for (const { item } of r.slice(0, 3)) {
    console.log(`  ${item.title} | ${item.releaseYear ?? "?"} | vols: ${item.volumeCount ?? "?"} | ${item.creators?.[0] ?? "?"} | ${item.canonicalUrl}`);
  }
  console.log(`  → ${r.length} results`);
} catch (e) {
  console.log("  MADB ERROR:", (e as Error).message);
}

console.log("=== Inventaire (books only) — dune ===");
try {
  const r = await inv.search("dune", { mediaTypes: ["book"], limit: 3 });
  for (const { item } of r.slice(0, 3)) {
    console.log(`  ${item.title} | ${item.releaseYear ?? "?"} | ${item.creators?.[0] ?? "?"} | ${item.canonicalUrl}`);
  }
  console.log(`  → ${r.length} results`);
} catch (e) {
  console.log("  INVENTAIRE ERROR:", (e as Error).message);
}

console.log("=== BnF (SRU, browser-direct, 20s budget) — comics: asterix ===");
const t0 = Date.now();
try {
  const r = await bnf.search("asterix", { mediaTypes: ["comics"], limit: 3 });
  console.log(`  (took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const { item } of r.slice(0, 3)) {
    console.log(`  ${item.title.slice(0, 45)} | ${item.releaseYear ?? "?"} | ${item.subtype} | ${item.creators?.[0] ?? "?"} | ${item.canonicalUrl}`);
  }
  console.log(`  → ${r.length} results`);
} catch (e) {
  console.log(`  BNF ERROR after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, (e as Error).message);
}

console.log("=== ENGINE — anime: cowboy bebop (merge check: AniList + MADB) ===");
const { createFederatedSearch } = await import("/home/z/my-project/src/lib/echo/federated/engine");
const t1 = Date.now();
const handle = createFederatedSearch("cowboy bebop", { categories: ["anime"], limitPerProvider: 4 });
const snap = await handle.promise;
console.log(`  (${((Date.now() - t1) / 1000).toFixed(1)}s) providers: ${snap.providers.map((p) => `${p.id}:${p.status}(${p.count})`).join(" ")}`);
for (const h of snap.hits.slice(0, 6)) {
  console.log(`  ${h.item.title} (${h.item.releaseYear ?? "?"}) ← ${h.contributions.map((c) => c.providerLabel).join(" + ")}${h.confidence ? ` [${h.confidence}]` : ""}`);
}

console.log("=== ENGINE — global: attack on titan (all seven categories) ===");
const t2 = Date.now();
const h2 = createFederatedSearch("attack on titan", {
  categories: ["anime", "manga", "series", "movie", "book", "comics", "game"],
  limitPerProvider: 3,
});
const snap2 = await h2.promise;
console.log(`  (${((Date.now() - t2) / 1000).toFixed(1)}s) providers: ${snap2.providers.map((p) => `${p.id}:${p.status}(${p.count})`).join(" ")}`);
const merged = snap2.hits.filter((h) => h.contributions.length > 1);
console.log(`  hits: ${snap2.hits.length} | merged multi-source: ${merged.length}`);
for (const h of merged.slice(0, 4)) {
  console.log(`    "${h.item.title}" ← ${h.contributions.map((c) => c.providerLabel).join(" + ")} [${h.confidence}]`);
}
process.exit(0);
