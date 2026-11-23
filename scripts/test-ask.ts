// E2E test for the Ask ECHO endpoint — Arabic conversational search.
const body = {
  lang: "ar",
  history: [{ role: "user", content: "عايز أنمي فيه ألعاب عقول ومؤامرات زي مفكرة الموت" }],
  digest: {
    librarySize: 12,
    ratedCount: 9,
    favouritesCount: 3,
    mix: { anime: 4, movie: 6, series: 2 },
    topGenres: ["إثارة نفسية", "خيال علمي", "جريمة"],
    recent: [{ title: "Oldboy", status: "completed", rating: 5 }],
  },
};

async function main() {
  const started = Date.now();
  const res = await fetch("http://127.0.0.1:3000/api/echo/ai/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log("status:", res.status, "| time:", Date.now() - started + "ms");
  if (data?.reply) {
    console.log("mode:", data.reply.mode);
    console.log("text:", data.reply.text);
    console.log("items:", (data.reply.items || []).length);
    for (const it of (data.reply.items || []).slice(0, 8)) {
      console.log(" -", it.item.title, `(${it.item.releaseYear ?? "?"})`, it.item.mediaType, "|", it.sourceLabel, "| poster:", it.item.posterUrl ? "YES" : "no");
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });

export {};
