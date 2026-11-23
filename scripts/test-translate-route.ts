/**
 * End-to-end test of the /api/echo/translate route handler:
 *  - happy path (English → Arabic)
 *  - Arabic passthrough (no upstream)
 *  - bad body rejection
 *  - per-IP rate limit → 429
 * Run: npx tsx scripts/test-translate-route.ts
 */

import { NextRequest } from "next/server";
import { POST } from "../src/app/api/echo/translate/route";

function req(texts: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/echo/translate", {
    method: "POST",
    headers: { "x-forwarded-for": "10.9.8.7", "content-type": "application/json" },
    body: JSON.stringify(texts),
  });
}

async function main(): Promise<void> {
  // 1. happy path
  const res = await POST(req({ texts: ["A poor maths genius secretly solves problems in Boston."] }));
  const data = (await res.json()) as { ok?: boolean; translations?: string[] };
  console.log("happy path:", res.status, JSON.stringify(data.translations?.[0]?.slice(0, 80)));
  if (res.status !== 200 || data.ok !== true) throw new Error("happy path failed");

  // 2. Arabic passthrough — must come back identical
  const resAr = await POST(req({ texts: ["قصة عربية أصلية"] }));
  const dataAr = (await resAr.json()) as { ok?: boolean; translations?: string[] };
  console.log("arabic passthrough:", dataAr.translations?.[0]);
  if (dataAr.translations?.[0] !== "قصة عربية أصلية") throw new Error("passthrough failed");

  // 3. bad body
  const resBad = await POST(req({ nope: true }));
  console.log("bad body →", resBad.status);
  if (resBad.status !== 400) throw new Error("bad body should 400");

  // 4. rate limit: 41st request in the same window from the same IP → 429
  let got429 = false;
  for (let i = 0; i < 45; i++) {
    const r = await POST(req({ texts: ["tiny"] }));
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  console.log("rate limit 429 reached:", got429);
  if (!got429) throw new Error("rate limiter did not trigger");

  console.log("\nAll translate route tests passed.");
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});
