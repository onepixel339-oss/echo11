# ECHO catalog shards

Static, versioned public-catalog data, distributed separately from the app's
JavaScript bundle and ingested into a dedicated IndexedDB store (`catalog`)
on demand. See `src/lib/echo/catalogShards.ts` for the loader.

## Authoring rules

- `manifest.json` lists every shard with a monotonically increasing
  `version`. Bump a shard's version (and only that) to re-publish it;
  clients re-ingest only shards whose version is newer than what they have.
- Shard JSON carries `shardId`, `version`, `label`, `licenseNote` and
  `records[]`. A shard that fails structural validation is rejected whole —
  never partially ingested.
- Record ids are namespaced (`pg-*` for this shard) and globally unique.
- Fields are bibliographic facts plus ORIGINAL EN descriptions written for
  ECHO. No ratings, no popularity, no artwork, no copied publisher blurbs.
- Only data whose storage and redistribution rights are clear ships here
  (public-domain works, ECHO-authored text). Sources with conditional
  licenses go through the provider registry instead
  (`docs/DATA_PROVIDER_COMPLIANCE.md`), never into shards.
- `freeReadingUrl` points to a legal free reading of the work when one
  exists (Project Gutenberg for this shard). ECHO links; it never hosts or
  bundles content.

## Current shards

| shard | version | content |
| --- | --- | --- |
| `pg-classics-en` | 1 | 22 public-domain classics (1847–1911 originals, plus classic translations of Homer, Plato, Khayyám, Marcus Aurelius, Dostoevsky) with Project Gutenberg reading links. |
