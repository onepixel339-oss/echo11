# ECHO — Data Provider Compliance

> This document supersedes all earlier provider/compliance notes for ECHO.
> Decision gate per spec §9.3: **no provider is enabled in a build unless its
> registry entry explicitly allows it — default-deny.** The machine-readable
> source of truth is `src/lib/echo/providers/registry.ts`; this file explains
> it. Last full review: **2026-11-23** (Phase 5 — federated search: Trakt,
> IGDB, MADB, Inventaire and BnF verified and added; see the Phase 5 section).

## How the gate works

- Every provider call (search, Discover pools, coming-soon shelves, metadata
  refresh) passes through `isProviderEnabled()` in the registry.
- A provider runs only when: it has a registry entry **AND** the entry is not
  hard-disabled **AND** it is enabled (registry default, or the user's toggle
  in Settings → Data sources).
- Unknown providers (no registry entry) can never be enabled.
- Hard-gated providers (verification pending) cannot be switched on by anyone.
- When a provider is disabled, its medium degrades gracefully — results are
  simply absent. **A disabled provider is never silently substituted with an
  unverified one.**
- The RAWG API key comes from the deployment environment
  (`NEXT_PUBLIC_RAWG_API_KEY`) only. **No API key ships in client code**, and
  private credentials are never used client-side. Without a key, games search
  and pools report "not configured" and contribute nothing.

## Registry status table

| Provider | Registry id | Serves | License status | Ships | Commercial use | Persistent catalog data | Redistribution | Review date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AniList | `anilist` | anime + **manga** | **restricted** — interactive use only | **enabled** | unverified | **no** (session cache only) | no | 2026-11-23 |
| Kitsu | `kitsu` | anime | **pending** — data-use permissions unverified | **hard-disabled** | unverified | no | no | 2026-11-23 |
| TVMaze | `tvmaze` | series | **restricted** — CC BY-SA, attribution + link back | **enabled** | unverified (CC BY-SA terms) | no | no | 2026-11-23 |
| **Trakt** | `trakt` | movies & series | **approved** — API Use Policy permits discovery apps; no mirroring | enabled (needs deployment key) | **permitted** (standard tier) | no | no | 2026-11-23 |
| IMDb suggestions | `imdb` | movies & series | **unverified** (undocumented endpoint) | **disabled** (user may enable) | unverified | no | no | 2026-11-23 |
| Cinemeta · metahub | `cinemeta` | movies & series | **unverified** | **disabled** (user may enable) | unverified | no | no | 2026-11-23 |
| RAWG | `rawg` | games | **restricted** — key required, no embedded key | enabled (needs deployment key) | **unverified** | no | no | 2026-11-23 |
| **IGDB** | `igdb` | games | **restricted** — free for non-commercial (Twitch DSA); commercial needs partnership | enabled (needs deployment credentials) | unverified | no | no | 2026-11-23 |
| Open Library | `openlib` | books | **restricted** — interactive use, no bulk harvesting | **enabled** | unverified | no | no | 2026-11-23 |
| **Inventaire** | `inventaire` | books | **restricted** — interactive use, attribution | **enabled** | permitted (donation encouraged) | no | no | 2026-11-23 |
| **BnF Catalogue général** | `bnf` | books & comics | **approved** — Licence ouverte de l'État (Etalab 2.0), attribution | **enabled** | **permitted** | no (session cache) | yes (Etalab 2.0) | 2026-11-23 |
| **MADB (Media Arts Database)** | `madb` | manga & anime | **restricted** — site Terms of Use, link policy, no bulk | **enabled** | unverified | no | no | 2026-11-23 |
| **Wikidata** | `wikidata` | **all seven categories** | **approved — CC0 1.0** (structured data) | **enabled** | **permitted** | **yes** | **yes** (CC0) | 2026-11-23 |
| ECHO local catalogue | `echo-demo` | all seven categories | **approved** (original ECHO data) | enabled (local coverage) | permitted | yes | yes | 2026-11-23 |
| Manual entries | `manual` | all seven types | user's own data | always on | n/a | yes (user data) | user's own | n/a |

### Catalog shards (v3, separate from providers)

Static, versioned JSON datasets under `public/catalog/`, ingested into a
dedicated IndexedDB `catalog` store (never mixed with user data). Only
content whose storage and redistribution rights are clear ships in shards.
Current shard: `pg-classics-en` (22 public-domain classics, bibliographic
facts + original ECHO descriptions + legal reading links to Project
Gutenberg). Authoring rules: `public/catalog/README.md`.

Unknown permission is a status, not an approval: **`unverified` never becomes
enabled by default.** Re-review requires an explicit entry change in
`registry.ts` plus a dated note below.

## The four rights layers (do not conflate them)

1. **Code license** — the license of ECHO's own source code. Independent of
   any provider. Nothing in this file governs it.
2. **API terms** — the provider's terms for *calling* their service: keys,
   rate limits, permitted clients. Example: RAWG requires an API key;
   Open Library is keyless with documented usage constraints.
3. **Metadata rights** — rights in the *content* of the data returned
   (titles, synopses, genres, ratings). These can be more restrictive than
   the API terms; e.g. a free API may serve data whose reuse requires
   attribution or is restricted to non-commercial use.
4. **Artwork / image rights** — posters, stills, covers. Frequently the most
   restricted layer; ECHO hot-links provider artwork for display only and
   never re-hosts or bundles it. Exports strip image URLs entirely.

Each registry entry records its posture across these layers via license
status, commercial-use status, storage permissions, redistribution flag and
attribution requirements.

## Per-provider notes

### AniList (`anilist`) — restricted, enabled
- **Terms**: https://anilist.gitbook.io/anilist-apiv2-docs/ — free public
  GraphQL API, no key.
- **Allowed**: interactive search, per-title metadata, genre pools for
  Discover, session-scoped response caches.
- **NOT allowed**: persisting returned catalog data as a local catalogue
  mirror; bulk collection or harvesting; redistribution. The registry
  enforces `persistCatalogData: false` — AniList data is stored only as the
  user's own library references (the record of what they added), never as a
  reusable catalogue.
- **Commercial use**: unverified — blocked until confirmed.

### AniList (`anilist`) — manga (v3 extension)

- The same public GraphQL API serves media type `MANGA` (100k+ manga
  entries, including manhwa/manhua via `countryOfOrigin` and one-shots).
  ECHO queries it with `format_not_in: NOVEL` — light novels are BOOKS and
  are served by the book sources; they are never conflated with manga.
- The existing restricted posture extends unchanged: interactive search,
  per-title metadata, Discover pools and the "publishing now" shelf; no
  persistent catalogue mirror, no bulk collection, no redistribution.
- Manga records keep AniList + MyAnimeList external ids; the anime↔manga
  namespace separation is enforced by the identity type gate (a manga never
  auto-links to its anime adaptation).

### Wikidata (`wikidata`) — approved, CC0, enabled

- **Terms**: https://www.wikidata.org/wiki/Wikidata:Licensing — "All
  structured data (i.e. the main, Property, Lexeme, and EntitySchema
  namespaces) is released into the public domain under Creative Commons
  Zero." Verified 2026-11-23.
- **Rights**: commercial use permitted; persistent storage, caching and
  redistribution permitted (CC0); attribution NOT required — ECHO still
  labels every record "Wikidata" as good practice.
- **Artwork**: NOT fetched. Commons images are governed by separate,
  per-file rights that CC0 does not cover — ECHO uses its generated
  placeholders instead.
- **Etiquette**: unauthenticated browser requests are rate-limited
  (≈200/min; 10/min unidentified). ECHO issues at most 3 requests per query
  (entity search → batched claims → batched label resolution, degradable),
  caches per query for the registry-capped 60 minutes, and never bulk
  downloads. `https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits`
- **Role**: the universal live baseline. The router queries Wikidata for
  exactly the requested types that no enabled specialized provider covers —
  comics (its only live source), movies and games with their specialized
  providers gated/unconfigured, manga with AniList off. Specialized
  providers keep precedence (richer data, no duplicate requests).
- **Type detection**: P31 ("instance of") Q-ids verified against the live
  API on 2026-11-23 (film Q11424, television series Q5398426, anime Q1107 /
  Q63952888, manga Q8274 / Q21198342, manhwa Q562214 / Q74262765, comic
  book series Q14406742, comic strip Q838795, graphic novel Q725377, video
  game Q7889, book Q571, novel Q8261, literary work Q7725634, light novel
  Q747381). Items with unmapped P31 values are DROPPED — never guessed into
  a category.
- **No ratings**: Wikidata carries no audience scores; records from it are
  stored without any rating provenance (nothing fabricated).

### Kitsu (`kitsu`) — pending verification, hard-disabled
- **Status**: kitsu.io data-use permissions are not yet verified. The
  registry entry is `hardDisabled: true`: no calls are made, and users cannot
  switch it on. Anime search continues via AniList only.
- **Re-enable condition**: written confirmation of data-use permissions, a
  registry entry change, and a dated review note below.

### TVMaze (`tvmaze`) — restricted, enabled
- **Terms**: https://www.tvmaze.com/api — free public API, no key, with a
  request to link back when used publicly. ECHO attributes every TVMaze
  result and links to its tvmaze.com page.
- **ShareAlike handling**: TVMaze's data may carry ShareAlike-style licensing
  obligations. ECHO's posture: TVMaze data is retained only as the user's
  attributed personal-library references; ECHO does not build a redistributable
  catalogue from it, and exports carry only the user's own backup plus
  provider references. Any future use beyond that (public catalogues, shared
  collections, commercial features) must re-evaluate the ShareAlike terms.
- **What ECHO fetches**: search results (title, genres, rating, runtime,
  premiere year, synopsis, poster, IMDb external id), refreshed metadata by
  stored id.

### IMDb suggestions (`imdb`) — unverified, disabled by default
- The suggestion endpoint (`v2.sg.media-imdb.com`) is an undocumented
  internal API of imdb.com. Its terms for third-party apps are unconfirmed,
  so it ships **off**. A user may switch it on in Settings at their own
  discretion; the registry keeps it off by default.
- **Terms page of record**: https://www.imdb.com/conditions

### Cinemeta · metahub (`cinemeta`) — unverified, disabled by default
- Cinemeta (`v3-cinemeta.strem.io`, the Stremio metadata service) and metahub
  artwork (`images.metahub.space`) have no confirmed third-party usage terms.
  Disabled by default for the same reason as IMDb suggestions; user-toggleable.
- Note: stored `imdb:` / `imdb-series:` library records from earlier versions
  remain fully readable — only live refresh/search is gated.

### RAWG (`rawg`) — restricted, enabled in registry, key-gated
- **Terms**: https://rawg.io/apidocs — API key required.
- **Key policy (Phase 1)**: the previously embedded project key was removed.
  A deployment supplies `NEXT_PUBLIC_RAWG_API_KEY` (public-by-design). No key
  ships in client code, and private credentials are never exposed to the
  client. Without a key the games catalogue is gracefully unavailable.
- **Commercial use**: unverified — do not enable commercial features on RAWG
  data until its applicable terms are confirmed.
- **What ECHO fetches**: search results, detail records (synopsis, developers,
  ESRB, community rating + vote count), most-added genre/tag pools, upcoming
  releases. ESRB-gated by the content-visibility setting.

### Open Library (`openlib`) — restricted, enabled
- **Terms**: https://openlibrary.org/developers/api — Internet Archive's open
  catalogue, keyless, CORS-enabled.
- **Allowed**: interactive use within documented API constraints — work-level
  search, work details, subject shelves, weekly trending, cover hot-linking.
- **NOT allowed**: bulk API harvesting or building a local mirror. Pools are
  fetched on demand and only session-cached.
- Open Library exposes no community rating, so records from it carry no
  rating provenance.

### ECHO local catalogue (`echo-demo`) — approved
- Original compilation made for ECHO: factual metadata reflects widely-known
  public information; synopses are original one-liners; content ratings are
  approximate and labelled. No copyrighted artwork is bundled (placeholder
  art is generated on-device).
- Composition (Phase 2): the demo universe **plus the curated movie starter
  collection** (`src/lib/echo/data/curatedMovies.ts`) — ~50 recognisable
  classics across decades (1920s–2010s), countries and genres.
- Composition (Phase 3): **plus the curated games starter collection**
  (`src/lib/echo/data/curatedGames.ts`, ids `cg-*`, ~35 titles across
  1972–2022, arcade to modern, eight developer regions) **and the curated
  books starter collection** (`src/lib/echo/data/curatedBooks.ts`, ids
  `cb-*`, ~35 works across 1605–2011, ten languages, including Arabic
  literature for the Arabic UI). Editorial rules for all curated
  collections:
  - synopses are original (EN + AR), written for ECHO;
  - **no ratings, popularity figures, awards, vote counts or runtimes are
    stored** — unverifiable fields are omitted, not approximated;
  - content ratings are omitted rather than approximated;
  - ids are namespaced `cm-*` (movies), `cg-*` (games) and `cb-*` (books)
    and never collide with demo-universe ids or each other;
  - game developer credits go to `studios` (matching the RAWG adapter
    mapping) with individual designers in `creators` only where
    unambiguous; book authors go to `creators` (matching the Open Library
    adapter mapping); no player counts, sales figures, playtimes or
    bestseller claims are stored;
  - records carry the curated source attribution
    ("ECHO curated sample collection — original descriptions").
- Role: clearly-labelled **local coverage** ("Sample" chip everywhere) and the
  demo universe. Approved for retention and redistribution.
- Local coverage semantics (Phase 2): the local catalogue fills any requested
  media type that **no enabled live provider covers** — gated, unconfigured,
  failed, or offline. Rules:
  - live results for a type always suppress the local fill for that type
    (local content never replaces or mixes into live results);
  - a disabled provider is never substituted by a different unverified
    provider — only by this approved, labelled compilation;
  - every outcome carries `usedFallback` / `usedSample` so the UI can
    disclose the mix (notices in Search + Discover);
  - sample results never drive automatic identity linking (`findBestMatch`
    refuses to link from sample outcomes);
  - it is a curated starter collection, not a database of movies, games or
    books — the UI says so ("Sample", "not live results or a full
    catalogue").

### Curated manga & comics collections (part of `echo-demo`)

- `data/curatedManga.ts` (ids `cmk-*`, 33 works, 1935–2020): manga, manhwa
  and manhua across shōnen/shōjo/seinen/josei demographics; volume/chapter
  counts only for completed runs; publication status, start/end years.
- `data/curatedComics.ts` (ids `cc-*`, 28 works, 1905–2012): comic strips,
  comic series, graphic novels, collected editions and one landmark
  individual issue (Amazing Fantasy #15) — the model distinguishes a series
  from its issues and collected editions.
- Cross-media adaptation relationships (manga→anime, book→film/series/game,
  light-novel→anime, game→series) live in `data/curatedLinks.ts` as typed
  `adaptation` links; both sides must exist in the catalogue (tested).
  Related works never merge: identity matching keeps rejecting cross-type
  and ordinal-conflicting matches.

### Evaluated but NOT integrated (2026-11-23 review)

| Source | Category | License found | Verdict |
| --- | --- | --- | --- |
| Grand Comics Database (comics.org) | comics | CC BY-SA 4.0 (per-page footers: "licensed under a Creative Commons Attribution-ShareAlike 4.0 International License") | **CONDITIONAL** — attribution + ShareAlike obligations on the DATA; also no public REST API (database dumps only). Not integrated: a live adapter is impossible and a dump import would need a ShareAlike-compliant release plan first. |
| Project Gutenberg | books | Texts are public domain (US); robot policy restricts automated access; official access is via offline catalog downloads; no JSON API | **CONDITIONAL** — usable via the official offline catalog, but the site was in maintenance at review time so current terms could not be re-verified from the source. NOT integrated as a provider. ECHO ships an original-content shard of 22 public-domain classics with links to gutenberg.org (facts + original descriptions only). |
| MangaDex | manga | Terms page behind bot verification; service hosts fan translations | **UNVERIFIED/REJECTED** — no verifiable metadata license; content rights are questionable for a commercial-leaning product. Never called. |
| MyAnimeList API | anime/manga | API requires per-application approval; terms restrict unapproved clients | **REJECTED** — no approval; never called. |
| Comic Vine | comics | API key required; terms restrict use to non-commercial/aligned purposes | **REJECTED** — conflicts with intended use; never called. |

Unknown permission is a status, not an approval. Each of the above requires
an explicit registry entry change plus a dated note here before any use.

### Manual entries (`manual`)
- The user's own authored records: their data, always enabled, exportable.
  Identity matching may link them to provider records, but only with reliable
  evidence (see below).

## Phase 5 — Federated search: verified providers, connections and limits

ECHO searches the providers live, on demand, through a category-routed
federated engine (`src/lib/echo/federated/`). **No provider's catalogue is
copied, mirrored or persisted**: results are transient in memory (session
caches only, TTL-capped per registry entry), and IndexedDB stays reserved
for the user's own library and ECHO's approved local content.

### Connection map (browser-direct vs server proxy)

| Provider | Connection | Why | CORS verified |
| --- | --- | --- | --- |
| AniList | browser-direct | public GraphQL, CORS open, keyless | yes (existing) |
| TVMaze | browser-direct | "All endpoints are CORS enabled" (official API docs) | yes (existing) |
| Open Library | browser-direct | keyless, CORS open | yes (existing) |
| Wikidata | browser-direct | `origin=*` anonymous CORS (CC0) | yes (existing) |
| MADB | browser-direct | official SPARQL endpoint, `Access-Control-Allow-Origin: *` | **yes — live 2026-11-23** |
| Inventaire | browser-direct | `access-control-allow-origin: *` on api paths | **yes — live 2026-11-23** |
| BnF | browser-direct | SRU endpoint, `Access-Control-Allow-Origin: *` | **yes — live 2026-11-23** |
| Trakt | **server proxy** (`/api/echo/providers/trakt`) | CORS origins are whitelisted per registered app; client_id stays server-side | n/a (proxy) |
| IGDB | **server proxy** (`/api/echo/providers/igdb`) | requires Twitch OAuth2 client credentials; no browser-direct support | n/a (proxy) |
| RAWG | browser-direct | keyless CORS, but needs `NEXT_PUBLIC_RAWG_API_KEY` from the deployment | yes (existing) |

**No private key ships in client JavaScript.** Trakt/IGDB credentials
(`TRAKT_CLIENT_ID`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`) are read only
inside the server routes; deployments additionally set
`NEXT_PUBLIC_TRAKT_ENABLED=1` / `NEXT_PUBLIC_IGDB_ENABLED=1` to activate the
client adapters (without the flags, the adapters never call the proxy — the
providers simply report "needs a deployment key").

### Rate limits and restrictions (as documented/observed, 2026-11-23)

| Provider | Documented limit | ECHO behaviour |
| --- | --- | --- |
| AniList | 30 req/min (degraded state; normally 90) | 1 request per search per type; 30-min session cache |
| TVMaze | ≥ 20 calls / 10 s per IP | 1 request per search; 30-min cache |
| Open Library | 1 req/s unidentified, 3 req/s with User-Agent | 1 request per search; 60-min cache |
| Wikidata | ~200 req/min unauthenticated browser | ≤ 3 requests per query; 60-min cache; engine honors 429 cooldowns |
| MADB | 300 requests per window (`x-ratelimit-*` headers) | 1 SPARQL request per search; 30-min cache |
| Inventaire | unspecified (fair use, unique User-Agent requested) | 2 requests per search (search + claims); 30-min cache |
| BnF | unspecified (SRU; can take 15–20 s under load — verified live) | 1 request per search; 60-min cache; 22 s independent timeout |
| Trakt | ~500 GET / 5 min per client_id + `Retry-After` | proxy: 30 req/min per IP, 300/min global, 10-min cache |
| IGDB | 4 req/s per token | proxy: 260 ms spacing + 30 req/min per IP + 240/min global |

The engine additionally applies **per-provider cooldowns** on HTTP 429
(honoring `Retry-After`): a rate-limited provider is skipped (status
"rate limited — cooling down") until its cooldown expires. One provider
failing, timing out or being rate-limited never blocks the others.

### Restricted candidates — evaluated, NOT integrated (2026-11-23)

| Source | Verdict | Reason (verified) |
| --- | --- | --- |
| Grand Comics Database (GCD) | **blocked** | No public API host (`api.comics.org` does not resolve); `/api/` endpoints sit behind Cloudflare bot protection and return **no CORS headers** (browser-direct impossible); the wiki states anonymous API access is "for testing only" (30 req/h) and may be disabled; registered tier needs Basic-Auth credentials; data format explicitly unstable. Comics coverage is served by Wikidata + BnF instead. |
| Comic Vine | **rejected** | "The API is strictly for non-commercial use only. Commercial use will result in your API key being revoked." (comicvine.gamespot.com/api) + key required. |
| Google Books | **rejected** | Google Books API ToS: charging users requires separate written permission; data attribution/removal obligations; caching restrictions. Books are covered by Open Library, Inventaire, BnF and Wikidata. |
| VNDB | **rejected** | "This service is free for non-commercial use" + separate Data License restrictions (api.vndb.org/kana). |
| Bangumi (bgm.tv) | **not integrated** | API docs primarily Chinese; access-token oriented; server AGPL; no verified third-party/commercial-use permission for catalog reuse. |
| MangaUpdates | **not integrated** | community-contributed data without verified licensing permission for third-party catalog reuse. |
| MangaBaka | **not integrated** | unofficial aggregator site; no public API or documented licensing. |
| Metron (metron.cloud) | **not integrated** | no verified API terms/licensing found for third-party reuse; comics covered by approved sources. |
| AniList | **kept, restricted** | interactive use only; no persistence of catalog data; rate limit currently degraded to 30/min. |
| RAWG | **kept, restricted** | works only with a deployment-provided key; commercial use stays unverified. |

### Artwork rights (unchanged strategy, restated for Phase 5)

1. **Independently licensed artwork** — provider-served posters/covers from
   AniList, TVMaze, RAWG, IGDB, Open Library, Cinemeta: hot-linked for
   display only, never persisted, never re-hosted, stripped from exports.
2. **Official merchant/product widgets** — evaluated (Trakt artwork, TVmaze
   artwork, CDJapan affiliate cards, Bookshop.org widgets, Steam store
   widgets): none integrated; CDJapan/Bookshop require affiliate accounts
   ECHO does not ship, and widget images may never be extracted as general
   posters. A deployment can add them later under their own terms.
3. **Original ECHO-generated cards and placeholders** — the only artwork
   ECHO itself ships; used for every result whose source has no cleared
   artwork (MADB, Inventaire, BnF results render with generated
   placeholders — their book-cover/magazine images carry publisher rights
   ECHO has not been granted).

**Wikimedia Commons assets** are deliberately NOT used as a poster source:
rights vary per file (CC BY / CC BY-SA / public domain) and CC0 does not
cover them; verifying per-file rights at search time is not feasible.

### Live-search verification (2026-11-23, controlled requests)

- MADB SPARQL: manga 進撃の巨人 → the real series (27 volumes, 2010,
  讲谈社, English title "attack on titan"); English query works via
  `schema:name` matching; anime query works (movie + series classes).
- Inventaire: books → Dune (1965, Frank Herbert, wd:Q190192) ✓; inv:
  edition entities lack P31 claims → routed to books only.
- BnF SRU: comics asterix → real album editions (French, publisher,
  creators) ✓; books → real records ✓; latency 0.7–20 s (fluctuates).
- Full engine (all seven categories): parallel providers, progressive
  updates, merged multi-source hits (Open Library + Inventaire "Dune"),
  BnF editions kept separate from works, per-provider statuses rendered.
- Browser (EN + AR): Arabic-script query «المواطن كين» → Citizen Kane
  (1941) via live Wikidata in the fully RTL Arabic interface.

## Identity resolution policy (Phase 1)

Automatic linking of a manual entry to a provider record requires **all** of:

1. A shared external identifier (strongest evidence), **or** a strong
   normalized title match — exact equality after normalization (case,
   diacritics, punctuation, articles). **Substrings and token overlap are no
   longer automatic-link evidence.**
2. Compatible content type.
3. Matching release year whenever both sides are known.
4. No conflicting season / edition / volume / issue information.

Cross-media adaptations (a manga and its anime, a book and its film) are
never linked as the same work: the content-type gate rejects them outright,
and their relationship is represented by explicit typed `adaptation`
WorkLinks (see `data/curatedLinks.ts`).

Ambiguous cases — several distinct plausible works — are **not** linked: the
entry keeps its own record and is flagged for review (Settings → the entry's
"attach artwork" panel shows the candidates). Regression fixtures for
seasons, remakes, editions, translations and same-title unrelated works live
in `src/lib/echo/__tests__/matchFixtures.ts`.

## Catalog schema (IndexedDB v3) and export compatibility

- DB version 2 added `works` (canonical ECHO work ids + external id
  mappings) and `workLinks` (explicit season / edition / volume / series /
  translation / remake / **adaptation** relationships) and stamped existing
  records additively with `workId`, `externalIds`, field-level
  `provenance`, `providerRef` (license reference) and `rating` (rating
  provenance: source, scale, votes).
- DB version 3 adds the `catalog` store (versioned public catalog shards)
  and the v3 print-media record fields (`subtype`, `publicationStatus`,
  `volumeCount`, `chapterCount`, `issueCount`, `issueNumber`, `endYear`).
  Both migrations are additive and idempotent: no earlier field is modified,
  no record or store is deleted.
- Export bundles are version 3 and carry works/links; **version-1 and
  version-2 bundles remain importable forever** (missing fields are filled
  lazily by the enrichment, never guessed).

## Privacy summary

All provider calls happen client-side, only when the user searches or opens
Discover, and only through providers enabled above. Library contents, ratings
and notes never leave the device. Exports contain the user's own library
records plus provider references — no secrets, no image URLs.

## Review log

| Date | Reviewer | Change |
| --- | --- | --- |
| 2026-11-23 | Phase 1 authorization (ECHO) | Registry introduced; default-deny gate; IMDb/Cinemeta disabled by default; Kitsu hard-disabled pending verification; embedded RAWG key removed; AniList no-persistence policy; TVMaze ShareAlike posture documented; Open Library interactive-use constraints; sample catalogue approved; IndexedDB v2 catalog schema; identity-resolution rewrite (no substring auto-links). |
| 2026-11-23 | Phase 2 authorization (ECHO) | Local coverage: curated movie starter collection added to the approved local catalogue (original descriptions, no ratings/awards/runtimes, ids `cm-*`); per-type local fill in search + Discover pools when no enabled live provider covers a type; Discover starter shelves for fresh libraries; registry entry renamed "ECHO local catalogue" with `catalogue-pools` operation; vocab additions (western/musical genres, 3 tags). |
| 2026-11-23 | Phase 3 authorization (ECHO) | Local starter catalogue completed for all five supported content types: curated games (`cg-*`, ~35 titles) and books (`cb-*`, ~35 works) collections added with the same editorial rules (original bilingual descriptions, verified factual fields only, no ratings/popularity/playtimes/sales, no artwork, stable namespaced ids); `echo-demo` registry entry now serves game + book; DemoProvider capabilities expanded; Discover starter shelves and search per-type fill extended to games and books. |
| 2026-11-23 | Phase 5 authorization (ECHO) | Federated search engine added (category routing, parallel providers, per-provider timeouts, cancellation, Retry-After cooldowns, progressive snapshots, evidence-based dedup). Providers verified and added: Trakt (API Use Policy — approved; server proxy), IGDB (Twitch DSA — restricted; server proxy), MADB (official SPARQL — restricted; browser-direct), Inventaire (books only — restricted; browser-direct), BnF (Licence ouverte — approved; browser-direct). GCD evaluated and blocked (no CORS, Cloudflare, anonymous tier testing-only). Comic Vine / Google Books / VNDB rejected on terms; Bangumi / MangaUpdates / MangaBaka / Metron not integrated (unverified permissions). No catalog database introduced; external results remain transient. |
