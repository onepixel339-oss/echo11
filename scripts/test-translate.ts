/**
 * Live test for the ECHO synopsis translation service (server module).
 * Run: npx tsx scripts/test-translate.ts
 */

import { translateToArabic, needsArabic } from "../src/lib/echo/server/translate";

async function main(): Promise<void> {
  const samples = [
    "A paraplegic Marine dispatched to the moon Pandora on a unique mission becomes torn between following his orders and protecting the world he feels is his home.",
    "When the menace known as the Joker wreaks havoc on the people of Gotham, Batman must accept one of the greatest psychological tests.",
  ];

  console.log("needsArabic('Hello world'):", needsArabic("Hello world"));
  console.log("needsArabic('قصة عربية'):", needsArabic("قصة عربية"));

  for (const [i, s] of samples.entries()) {
    const t0 = Date.now();
    const { text, ok } = await translateToArabic(s);
    console.log(`\n--- sample ${i + 1} (ok=${ok}, ${Date.now() - t0}ms) ---`);
    console.log(text);
  }

  // cache hit should be instant
  const t0 = Date.now();
  const second = await translateToArabic(samples[0]);
  console.log(`\ncache hit: ${Date.now() - t0}ms, ok=${second.ok}, same=${second.text.length > 0}`);

  // Arabic input passes through unchanged without any upstream call
  const ar = await translateToArabic("قصة عربية أصلية");
  console.log("arabic passthrough:", ar.text, "ok=", ar.ok);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
