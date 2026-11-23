import { DEMO_CATALOGUE } from "../src/lib/echo/data/demoCatalogue";
import { CURATED_LINKS } from "../src/lib/echo/data/curatedLinks";
const byType: Record<string, {curated: number; demo: number}> = {};
for (const s of DEMO_CATALOGUE) {
  byType[s.mediaType] = byType[s.mediaType] ?? {curated: 0, demo: 0};
  if (s.collection === "curated") byType[s.mediaType].curated++;
  else byType[s.mediaType].demo++;
}
console.log(JSON.stringify(byType, null, 1));
console.log("TOTAL bundle:", DEMO_CATALOGUE.length, "| shard records: 22 | adaptation links:", CURATED_LINKS.length);
