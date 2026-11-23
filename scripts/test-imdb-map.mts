import { ImdbProvider } from "../src/lib/echo/providers/imdb";
async function main() {
  const p = new ImdbProvider();
  const t = Date.now();
  const item = await p.getTitle("tt0468569");
  console.log("title:", item?.title, "| publicScore:", item?.publicScore, `(${Date.now()-t}ms)`);
}
main();
