# ECHO — Your taste, mapped.

A local-first atlas of your taste. Add the anime, manga, movies, series,
games, comics and books you enjoy, and ECHO charts them into one explorable map — islands of
genres, connections between stories, and recommendations that explain
themselves. **Real catalogue data, no accounts, no setup, no paid AI.**

## What is implemented

| Area | Status |
| --- | --- |
| First-run onboarding (welcome → interests → seed taste → first map reveal) | ✅ skippable at every non-essential step |
| Interest selection (anime / movies / series / games / books / manga / comics) | ✅ |
| Taste seeding: live catalogue search with ratings + favourites **or** quick preference cards | ✅ real results from the enabled providers (see the provider registry) |
| Catalogue search & add — **real sources**, every result labelled with its source | ✅ license-gated per provider: AniList (anime + manga) · TVMaze (series) · Open Library (books) · **Wikidata (all seven categories, CC0)** on by default; IMDb/Cinemeta off by default (user-toggleable); Kitsu disabled pending verification; RAWG needs a deployment key |
| Offline resilience: labelled sample catalogue fallback when the network is down | ✅ |
| Manual title entry fallback — **auto-linked to the catalogue**: a confident match (same normalized title + compatible year + type) adopts the real record, so even manual entries get a real poster on the map; a manual "Attach real artwork" picker exists in the drawer | ✅ |
| Library: statuses, 1–5 ratings, favourites, notes, user tags, search/sort/filter, bulk status, remove | ✅ |
| **ECHO Map**: canvas renderer with real poster art, rating-sized nodes, status rings, favourite hearts, curved similarity lines, cluster **island hulls** with letterpress labels, survey graticule + compass rose, pan/zoom/pinch, fit-all, collision-aware labels, deterministic layout that survives additions, filters, in-map search, accessible list view, legend | ✅ |
| Edge explanations ("why are these two connected?") with real shared features | ✅ |
| Details drawer: metadata, source attribution + canonical link, status/rating/favourite/note/tags, "why it connects to your taste", similar titles | ✅ |
| Library ↔ sources: per-row source chip + external link, **Sync from sources** refreshes every title's metadata (posters, genres, synopsis) and links manual entries | ✅ |
| Discover: **live candidate pools** (AniList genre queries + Cinemeta genre & top-rated catalogues + RAWG genre/tag pools + Open Library subject shelves & weekly trending — each behind the license gate) → 4 shelves (Made for your taste / Because you liked X / A different direction / Explore this island), familiar↔surprising dial, media-type-balanced shelves, every card explains itself, feedback actions | ✅ |
| Taste DNA: confidence tiers, insight cards with sample counts, feature bars, rating distribution, most-influential titles | ✅ |
| Taste identity card — a shareable card distilled from your taste fingerprint | ✅ |
| Ask ECHO — conversational search across every medium (intent routing → real catalogue results → grounded narration), plus library & AI-knowledge answers | ✅ |
| Taste Companion — AI reading of your taste map, grounded in the real engine snapshot, never invents | ✅ |
| Content safety: maturity ceiling; adult content never fetched or recommended | ✅ |
| Local persistence: IndexedDB (library, ratings, notes, feedback, settings, map layout) | ✅ survives refresh & restart |
| Export / import: versioned JSON, schema-validated (zod), merge or replace | ✅ |
| Sample map mode: clearly-labelled, isolated stores, exit with or without keeping titles | ✅ |
| Bilingual UI: English + Arabic with full RTL, proper Arabic typography (IBM Plex Sans Arabic) | ✅ |
| PWA: manifest, generated icons, service worker (network-first) | ✅ opens offline with your library |
| Privacy: no accounts, no analytics, no trackers; provider calls only when you search | ✅ |

## Design language — "The Paper Atlas"

ECHO looks like a printed survey map, not a generic dark app:

- **Palette** — warm paper (`#f5f1e6`) with ink text and a single vermilion
  accent in light mode; warm charcoal + cream in dark mode. Muted atlas tints
  (verdigris, ochre, plum, pine) for islands, statuses and charts.
- **Typography** — Fraunces (display serif) for headlines, wordmark and map
  labels; Instrument Sans for UI; IBM Plex Sans Arabic for Arabic. All
  self-hosted via `next/font/local` (no runtime CDN).
- **The map sheet** — a faint graticule, dashed island hulls padded around
  their members, letterpress small-caps island labels, curved tapered
  connection lines, a compass rose, and a proper legend.
- **Icons, chips and rules** — hairline borders, stamp-like source chips,
  overline section labels. No glassmorphism, no gradients, no glow.

## Real data sources (all attributed)

Search is **federated and live**: each of the seven categories routes to its
own most relevant sources, providers answer in parallel, results stream in
progressively as each source responds, and every result keeps its source
chips. ECHO never copies a provider's catalogue — results stay transient.

| Source | Serves | Notes |
| --- | --- | --- |
| [AniList](https://anilist.co/) | Anime + Manga | Public GraphQL API; genres, community tags, studios, artwork |
| [TVMaze](https://www.tvmaze.com/) | Series | Free public API (CC BY-SA, attributed); genres, ratings, artwork |
| [Trakt](https://trakt.tv/) | Movies & Series | API Use Policy permits discovery apps; needs `TRAKT_CLIENT_ID` + `NEXT_PUBLIC_TRAKT_ENABLED=1` from the deployment (server proxy) |
| [MADB](https://mediaarts-db.artmuseums.go.jp/) | Manga & Anime | Japan's official Media Arts Database SPARQL service; series-level records, volume counts, romanized titles |
| [BnF](https://catalogue.bnf.fr/) | Books & Comics (FR) | Catalogue général SRU, Licence ouverte (Etalab 2.0); bibliographic editions |
| [Inventaire](https://inventaire.io/) | Books | Open book-catalogue API; Wikidata-mirrored work entities |
| [Wikidata](https://www.wikidata.org/) | All seven categories (CC0 baseline) | Universal live baseline for categories without a specialized source |
| [Open Library](https://openlibrary.org/) | Books | Internet Archive's open catalogue; keyless, CORS-enabled |
| [IGDB](https://www.igdb.com/) | Games | Twitch OAuth2 (server proxy); needs `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` + `NEXT_PUBLIC_IGDB_ENABLED=1` |
| [RAWG](https://rawg.io/) | Games | Free API — **no key ships in client code**; deployments provide `NEXT_PUBLIC_RAWG_API_KEY` |
| IMDb suggestions + [Cinemeta](https://github.com/Stremio/) | Movies **and series** | Disabled by default (terms unverified); user-toggleable in Settings |
| [Kitsu](https://kitsu.app/) | Anime | Disabled pending data-use verification (registry-hard-gated) |

Every search result carries a source chip; every title's drawer links back to
its canonical page; Settings → Data sources lists all of them with their
license status and an on/off switch (default-deny registry gate). When you're
offline, search falls back to the labelled sample catalogue. See
`docs/DATA_PROVIDER_COMPLIANCE.md` for the full compliance table.

## Stack

- **Next.js 16 (App Router) + TypeScript** — typed, component-based, PWA.
- **Tailwind CSS 4 + shadcn/ui** — accessible components on the atlas tokens.
- **Zustand** — tiny client state with write-through IndexedDB persistence.
- **Canvas 2D map renderer (custom)** — full control over the cartographic
  aesthetic and mobile performance (poster image cache, no heavy DOM).
- **zod** — strict import validation. **bun test** — domain unit tests.

No database server, no paid AI API, no runtime CDN fetches (fonts ship with
the app). Everything ECHO needs either ships with it or comes from the
attributed public APIs above.

## Architecture

```
src/
  app/                     # Next.js shell (single route), self-hosted fonts, global styles
  lib/echo/
    types.ts               # normalized domain model (spec §11)
    localdb.ts             # IndexedDB layer (no dependencies)
    store.ts               # zustand store + write-through persistence + sample-map mode
    i18n.tsx               # EN/AR dictionaries, RTL, singular/plural handling
    exportimport.ts        # versioned backup validation (zod) + merge/replace
    poster.ts              # deterministic generated artwork (paper/ink style)
    ids.ts                 # hashing + seeded RNG (determinism)
    data/
      demoCatalogue.ts     # 64-title labelled offline sample catalogue
      vocab.ts             # genre/tag vocabulary (EN/AR) + provider slug mapping
    engine/                # pure, deterministic, unit-tested
      features.ts          # feature extraction + IDF
      similarity.ts        # weighted overlap, missing-field renormalization, reasons
      taste.ts             # taste profile from real signals, confidence tiers
      recommend.ts         # closest / because / adjacent / explore / island shelves
      cluster.ts           # label-propagation islands, named from shared metadata
      layout.ts            # island-surveyor layout: circle-packed island centroids,
                           #   ellipse collision (2r×3r tiles), adaptive spacing,
                           #   rigid shape preservation, convex-hull outlines
      identityCard.ts      # shareable taste identity card (distilled fingerprint)
    ai/                    # AI features (same-origin routes, graceful degradation)
      llm.ts               # provider chain: Gemini (env key, e.g. on Vercel) → platform AI
      ask.ts / companion.ts# client halves of Ask ECHO + Taste Companion
    providers/             # real catalogue sources + offline fallback
      anilist.ts           # anime + manga (GraphQL search, genre pools, publishing-now)
      tvmaze.ts            # series
      imdb.ts              # movies & series (IMDb suggestions + Cinemeta meta & catalogues)
      kitsu.ts             # anime (JSON:API: search, trending, categories)
      rawg.ts              # games (env-provided key only: search, details, pools)
      registry.ts          # provider registry + default-deny license gate
      provenance.ts        # v2 catalog provenance stamping shared by adapters
      openlibrary.ts       # books (keyless: search, works, subject shelves, trending)
      wikidata.ts          # ALL categories (CC0: search, details, universal id hub)
      match.ts             # evidence-based identity resolution (no substring auto-links)
      index.ts             # router: gated multi-source search, pools, refresh
      demo.ts              # labelled offline fallback
  components/echo/         # app shell, onboarding, map canvas, screens, drawer, dialog
docs/DATA_PROVIDER_COMPLIANCE.md
```

## Engines in one paragraph each

- **Similarity** — weighted components (genres 30%, tags 25%, format 10%,
  creators/studios 10%, era 5%, language/country 5%, cast 5%, user tags 10%).
  Missing fields renormalize instead of counting as mismatches. Genre/tag
  overlap is IDF-weighted so "Drama" cannot connect everything. Every edge
  carries its top-3 shared-feature reasons.
- **Taste profile** — only explicit signals count: ratings (4–5 positive,
  1–2 negative, 3 ≈ neutral), favourites amplify but never override. Insights
  carry sample counts and confidence tiers (<5 rated = early signals).
- **Recommendations** — deterministic scoring against the profile with
  IDF-weighted matches over a **live candidate pool** (AniList + Kitsu genre
  queries, Kitsu trending, Cinemeta genre & top-rated catalogues, RAWG
  genre/tag pools, Open Library subject shelves + weekly trending —
  interleaved so no single source dominates);
  shelves for closest / because-you-liked / adjacent / island neighbours;
  franchise and first-genre diversity caps; rejected titles never return.
- **Layout (island surveyor)** — clusters become landmasses: centroids are
  circle-packed with inter-island gaps, nodes relax inside their island with
  ellipse-aware collision (poster tiles are 2r × 3r), cross-island pairs
  repel harder than same-island pairs, and existing maps keep their shape
  (rigid offsets + capped centroid drift). Islands render as padded convex
  hulls with letterpress labels that dodge nodes and labels.

## Run

```bash
bun install
bun run dev        # http://localhost:3000
bun run lint       # eslint
bun run test       # domain unit tests (registry gate, migration, identity, export/import)
# live provider smoke tests are NOT run automatically — they need explicit authorization
```

Optional configuration: set `NEXT_PUBLIC_RAWG_API_KEY` to enable the games
catalogue (no key ships in client code). Anime, series and books work out of
the box via the enabled providers; inside this sandbox the AI features use
the platform AI automatically. On an external
deploy (e.g. Vercel) set `GEMINI_API_KEY` (free key:
https://aistudio.google.com/apikey) to enable the AI features; see
`.env.example` for every optional variable.

## Tests

The domain unit tests cover the spec's domain test plan plus the Phase 1
safety suite (license gate default-deny, provider enable/disable, storage
restrictions, IndexedDB migration + rollback, export/import compatibility,
identity matching with conflict fixtures, rating provenance, search routing
and provider failures): unrated titles create
no positive signal, 5★ > 4★ evidence, low ratings are negative evidence,
missing metadata isn't punished, explanations match actually-shared features,
common genres don't over-connect, filters and rejections are respected,
library titles aren't re-recommended, low samples → low confidence,
deterministic ranking, cluster naming, layout determinism and layout
stability on additions (≤ 60px drift).

End-to-end flows (onboarding → first map, live search from all six catalogue
sources, rating updates the map, edge explanation, feedback loops, offline
fallback, RTL, dark/light themes) were verified in a real browser during
development.

## Known limitations

- Games need a deployment-provided RAWG key (`NEXT_PUBLIC_RAWG_API_KEY`);
  without it the games catalogue is gracefully unavailable. Commercial use
  of RAWG data is pending terms confirmation.
- On external deploys, the AI features (Ask ECHO, Taste Companion) need a
  `GEMINI_API_KEY` env var; without it they degrade gracefully and the rest
  of the app is unaffected.
- Cinemeta does not provide per-region certifications; movie maturity data is
  coarse (adult content is filtered, everything else shows as unrated).
- Metadata refresh re-fetches by stored provider id after an online session;
  the sample catalogue needs no refresh.
- Import/export covers library, feedback and non-secret settings; provider
  artwork URLs are excluded by design.
- The map is optimised for personal libraries (up to a few hundred titles).

## Privacy summary

No account. No analytics, ads or trackers. Your library lives in your
browser's IndexedDB. Catalogue queries go to the active public providers
only when you search or open Discover. The AI features call a same-origin
route that receives only an anonymous statistical digest of your library —
never your notes, tags or personal data. Export gives you every byte ECHO
stores.
