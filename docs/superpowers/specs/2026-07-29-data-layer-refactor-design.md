# Data-layer deep refactor — keep the flat-file DB, give it a delivery + integrity layer

**Date:** 2026-07-29 · **Status:** approved-by-instruction (see §0) · **Author:** Claude (background session), commissioned by operator

## 0. Provenance / process note

The operator asked (verbatim intent): *does the no-DB decision still hold now that the app
maintains a lot of correlated data (plenos → claims → verdicts like «contradicho» → hallazgos,
contracts, press, quejas), and make a deep refactoring toward the best solution.* This session
runs unattended, so the brainstorming flow was adapted: requirements were derived from the
codebase, git history, and the locked strategy doc
(`2026-07-06-promotion-funding-strategy-design.md`) instead of live Q&A. The refactor executes
in reversible, test-gated commits; this spec is the design record the operator reviews async.

## 1. Evidence (measured 2026-07-29)

**Scale.** `public/data/` = 39 MB on disk, 29.7 MB git-tracked. Dominated by the pleno-claims
pipeline: verified monolith 8.8 MB + suggestions 5.4 MB + base 8.8 MB (gitignored) + 17
per-pleno chunks 6.2 MB + transcripts 5.3 MB. Claim corpus: **5,751 claims across 17 plenos**
(22 more transcripts not yet extracted → corpus will ~2.3× on backlog alone, then ~12–20
plenos/yr). Verifier corpus ≈ 1,500 rows (1,249 tenders + 56 TED + 171 BDNS + 24 promises).

**Growth.** 25.2 → 29.7 MB over the last 90 days (~+18 MB/yr at current pace). Whole git pack:
**11.3 MiB** — git delta-compresses nightly JSON rewrites extremely well.

**Pipeline health.** The correlation machinery is already build-time and disciplined: 4 organic
materialized views exist (`compute-dept-stats` → `plenos-agendas.json.stats`,
`compute-tender-geo` → `tender-geo.json`, queja↔contract relations engine, press-trust
analytics), stable IDs via `fnv32`/`sha256Short`, a base ⊕ overlay verdict merge that survives
re-runs, a re-extract preservation guard that refuses to orphan finding-cited claimIds, and the
2026-05 postmortem fix for snapshot field-name drift.

**The weak layer is client delivery, not storage:**

- `useJsonFetch` (composed by ~42 hooks) is plain `fetch`+`useState` per mount, `cache:
  'no-cache'`, **no module cache, no request dedup**. Landing `/` issues **~43 `/data/`
  requests for ~21 distinct files**: `tenders.json` (183 KB gz) ×4, `geo.json` ×4,
  `promises.json` ×3, `press.json` ×3, `plenos-agendas.json` ×3, `metro-network.json`
  (116 KB gz) ×2… Concurrent same-URL fetches do not coalesce in browsers, so these are real
  duplicate downloads. Every route navigation refetches + re-parses everything.
- `usePlenoClaims` fan-outs manifest + **all 17 chunks (745 KB gz, 6.4 MB parsed)**. Three
  surfaces trigger it: `/declaraciones` (legitimately needs the ledger), `/departamentos`
  (needs only per-department counts), and `/departamentos/:slug` (**twice**: once via
  `useDepartmentStats`, once via `ClaimLedger`) to render ≤10 filtered rows.
- `computeDepartmentStats` consumes exactly `claim.topic × verification.verdict` per item
  (`src/lib/department-stats.js:190-215`) — a cross-tab, not bodies.

**Referential integrity is enforced only at write time** (per-CLI validators, the preservation
guard). Nothing audits the committed snapshot set as a whole, so a cross-file break (orphaned
`sourceClaimIds`, a manifest pointing at a pruned chunk, relations referencing a re-keyed
tender) would ship silently — the class of bug that already happened once (correlator rot,
documented in `scrape-queja-contract-relations.ts:14-16`).

## 2. Assessment: does no-DB still work?

**Yes — and it is load-bearing for the product, not a shortcut.** For this project the
git-versioned flat-file tree *is* the database:

1. **The audit trail is the legal/editorial moat.** Public git history is cited throughout
   CLAUDE.md as the sole audit trail for libel-sensitive mutations (findings, replies,
   corrections). A DB would either lose that or force a second, weaker audit mechanism.
2. **The scaling thesis requires it.** T1 replication to other municipalities = one static
   data tree per town, zero marginal infra. A central DB inverts the cost model and adds an
   ops burden the single-operator nonprofit explicitly cannot carry.
3. **The numbers are nowhere near the ceiling.** 30 MB tracked, 11 MiB pack, +18 MB/yr.
   Whole-corpus scans in the verifier (~8.6 M row-comparisons/run) complete in seconds in
   Node. Even 10× fits comfortably.
4. **What a DB would actually buy — query/delivery ergonomics and referential integrity — can
   be added *to* the flat-file architecture** at build time and in a 100-line client store,
   without giving up any of the above.

**Verdict:** keep no-DB. Refactor the two genuinely weak layers: client delivery and
cross-snapshot integrity.

## 3. Approaches considered

**A (chosen) — delivery + integrity layer on the flat-file DB.** Session-cached single-flight
snapshot store behind the existing `useJsonFetch` API; materialize the department claim
cross-tab into the chunk manifest; add a cross-snapshot referential-integrity checker
(`check:relations`) wired into the nightly. Zero new runtime deps, all hook APIs preserved,
every CLAUDE.md contract untouched.

**B — client query engine (DuckDB-WASM / sql.js over a nightly-built artifact).** Real SQL,
but +1–3 MB WASM on every visit, an opaque binary artifact replacing view-source JSON
transparency, heavier e2e/a11y surface, and no current page needs ad-hoc queries. Rejected —
disproportionate machinery for a cross-tab and a cache.

**C — real backend DB (Supabase/Postgres/managed SQLite).** Directly violates the locked
strategy: no external backend, git as public audit trail, per-town static replication,
zero-infra cost, AGPL contributor simplicity. Would also fork the curated-file legal
contracts. Rejected. Revisit only if a future multi-town aggregation portal (T2/T3 at
province scale) demands server-side auth'd workflows — a different product surface, not this
SPA.

## 4. Design (approach A)

### W1 — client snapshot store (`src/lib/snapshot-store.js`)

Module-level store: `Map<path, entry>`, `entry = { status: 'loading'|'ready'|'missing'|'error',
promise, data, error, listeners }`.

- **Single-flight:** concurrent `ensureSnapshot(path)` calls share one fetch.
- **Session cache:** `ready` (2xx) and `missing` (404) results are cached for the SPA session —
  correct freshness model for nightly-refreshed data. `error` (network / non-ok non-404) is
  **not** cached: delivered to current waiters, entry cleared, so the next mount retries —
  exact parity with today's per-mount retry resilience.
- **React binding:** `useSnapshot(path, fallback)` via `useSyncExternalStore`. Semantics
  identical to today's `useJsonFetch`: `missing` + non-null fallback → `{data: fallback}`;
  `missing` without fallback → error; fallback applied per-caller (the store caches the
  *status*, so two callers with different fallbacks both behave correctly).
- **`useJsonFetch(path, fallback)` becomes a one-line delegate** to `useSnapshot` — all ~42
  domain hooks and their call sites stay byte-identical.
- **Invalidation:** `invalidateSnapshots(path?)` clears one/all entries and notifies
  subscribers (used by tests; available to future curator mutations). `/curator` today talks
  to its local API without `useJsonFetch`, so no invalidation hazard exists.
- **Migrated bespoke loaders:** `usePlenoClaims` (manifest + per-chunk via the store — chunk
  entries then also serve `/plenos/:id` from cache), `usePressLab` (9 files; per-file
  missing/error → `null`, preserving `fetchOptional` semantics), `ReportajeBlockD`'s inline
  loader. **Not migrated:** `useLabHealth` (it measures raw bytes over the network — caching
  would falsify the diagnostic), external-API hooks (`useLiveWeather`, `useAirQuality`).

Effect: landing ~43 requests → ≤21 on first paint and ~0 on route return; the
`/departamentos/:slug` double corpus fan-out collapses to one shared load.

### W2 — materialized department cross-tab in the chunk manifest

- `src/scraper/pleno-claims-chunks.ts`: manifest `totals` gains
  `byTopicVerdict: { [topic]: { [verdict]: count } }`, computed by the chunker over the same
  post-`gateItemsForPublic` items it writes into chunks — same writer, same commit, zero
  drift. The chunker stays department-agnostic; topic→department mapping remains solely in
  `src/lib/department-claim-topics.js`.
- `src/lib/department-stats.js`: `computeDepartmentStats` accepts a new optional
  `claimsSummary` (the cross-tab). When present it aggregates from the cross-tab; else it
  falls back to iterating `claims.items` (back-compat for `compute-dept-stats.ts`, which
  passes no claims, and for existing tests).
- `src/hooks/useDepartmentStats.js`: swap `usePlenoClaims()` (manifest + 17 chunks) for
  `usePlenoClaimsManifest()` (12 KB) and pass `claimsSummary`.

Effect: `/departamentos` drops from ~745 KB gz / 6.4 MB parsed to one 12 KB manifest, with
byte-identical counts (same input set, same fields).

### W3 — cross-snapshot referential-integrity gate

- Pure checker `src/scraper/relations-check.ts` (fixture-tested) + CLI
  `scripts/check-relations.ts` → `npm run check:relations`.
- **Error-level checks (exit 1 in strict mode):** every `pleno-findings.json`
  `sourceClaimIds[]` resolves in `pleno-claims-verified.json`; manifest `chunkPath`s exist
  with matching `itemCount` and totals; `pleno-votes` `plenoId` ∈ `plenos.json`;
  `queja-contract-relations` quejaIds ∈ `quejas.json` and contractIds ∈ `tenders.json`;
  approved relations ⊆ relations; `promise-suggestions` `promiseId` ⊆ `promises.json`;
  findings `relatedPromiseId` ⊆ promises; curated `departmentSlug`s ∈
  `ALLOWED_DEPARTMENT_SLUGS`.
- **Warn-level:** overlay claimIds absent from `pleno-claims-verified.json` (the base ⊕
  overlay merge deliberately drops stale overlay entries after a re-extract renames ids —
  debt worth surfacing, not breakage); votes whose `plenoId+itemNumber` lacks a matching
  agenda item (agendas are best-effort upstream); dedicaciones/officials slug drift.
- **Wiring:** `scrape-all.sh` runs it `--soft` (report-only — a partial scrape night must not
  red the commit-then-gate design); strict mode is the default for manual/CI use. Missing
  input files ⇒ that check reports `skipped`, never a false failure on fresh clones.

### W4 — docs

CLAUDE.md gains a short "Data layer" note (snapshot store, manifest cross-tab,
`check:relations`). `/metodologia` needs no change: no editorial behavior, number, or gate
changes — the same counts compute in a different place. This spec is committed.

## 5. Testing

TDD cadence per repo convention (RED fixtures → GREEN → wire):

- `snapshot-store`: unit tests for single-flight dedup, session caching, 404-fallback
  per-caller semantics, error non-caching + retry, invalidation, subscriber notification.
- `pleno-claims-chunks`: extend existing fixtures — manifest cross-tab counts equal a hand
  computation over the same fixture items; empty-corpus shape.
- `department-stats`: `claimsSummary` path produces identical buckets to the legacy items
  path over the same fixture (property: summary(items) ⇒ equal output).
- `relations-check`: fixtures with one broken ref per check class; clean fixture passes;
  missing-file ⇒ skipped.
- Full gates: `npm test`, `npm run typecheck`, `npm run build`, Playwright e2e (unchanged
  UI contract — the suite is the regression net for W1/W2), `npm run check:relations` against
  live data.

## 6. Out of scope (documented levers, deliberately deferred)

- Relocating CLI-only monoliths out of `public/` (~20 script paths churn; deploy-size win
  only; crons must be migrated atomically).
- Per-department claim shards for `/departamentos/:slug` first-visit weight (session cache +
  manifest cross-tab already remove the systematic cost).
- Verifier corpus indexing (amount buckets / token index) — seconds today, revisit at ~10×.
- Any DB / WASM query engine (see §3).
- `/declaraciones` pagination via lazy per-chunk fill (recent-first) — becomes trivial on the
  store if ledger weight ever matters.
