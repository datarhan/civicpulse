# Agent-RAG + Entity Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semantic retrieval over transcripts+press for the journalist agent, and a canonical company/people registry replacing name-string joins — per `docs/superpowers/specs/2026-07-29-agent-rag-and-entities-design.md`.

**Architecture:** W1 mirrors the verifier's embed pattern (own JSONL cache + defensive loader + cosine ranking) and plugs into the agent's existing `local-snapshot` tool with graceful lexical fallback. W2 is a deterministic nightly compute (`entities.json`) + curated `entity-overrides.json` alias file, consumed by an optional resolver in `topContractors` and audited by two new `check:relations` rules.

**Tech Stack:** existing `embed-client` (ollama/openai/gemini), `semantic-shortlist.cosineSimilarity`, `hash.fnv32`, `normalize.ts` fold, tsx CLIs, vitest. No new dependencies.

## Global Constraints

- Machine-written vs curated file contracts preserved (`entities.json` machine; `entity-overrides.json` curated with validator + CLI).
- Agent behavior degrades gracefully: no cache / no backend ⇒ exactly today's lexical behavior, never a crash.
- `topContractors(contracts, n)` without a resolver stays byte-identical (backward compatible).
- `.embed-cache/` stays gitignored; `embed:agent-corpus` NOT in scrape:all (CI has no backend); `compute:entities` IS in scrape:all (deterministic).
- UTE names never merge into member companies; only end-of-name legal-form suffixes strip; anything else via curated overrides.
- Stable IDs via shared `hash.ts` fnv32 — never a local hash fork.

---

### Task 1: `agent-corpus.ts` pure module (chunker + rows + loader + ranking)

**Files:** Create `src/scraper/agent-corpus.ts` · Test `tests/agent-corpus.test.ts`

**Produces:** `AgentCorpusRow`, `chunkTranscript(text, opts?) → {startLine,endLine,text}[]`, `buildAgentCorpusTexts({transcripts: Map<string,string>, press}) → PendingRow[]` (row minus embedding, `textSha256` = sha256 of text), `loadAgentCorpus(path) → {rows, sourcePath}` (defensive, own kind enum `transcript|press`), `rankAgentCorpus(queryVec, rows, topK) → {row, score}[]`.

- [ ] RED: chunker — long transcript → >1 window, each ≤ ~1600 chars, consecutive windows overlap by the configured trailing lines, startLine/endLine 1-based and consistent with input lines; 5-line transcript → single chunk covering all lines. Rows — transcript rows carry `sourceId: 'transcript:<plenoId>#L<start>-L<end>'`, `localPath: 'public/data/pleno-transcripts/<plenoId>.txt'`, `ref: '/plenos/<plenoId>'`; press rows keyed by item id with `ref: item.link`; sha stable across two builds. Loader — skips corrupt line + wrong-kind row, keeps valid. Ranking — 3-dim fixture vectors ordered by cosine, topK honored.
- [ ] GREEN: implement (constants `TARGET_CHARS=1100`, `OVERLAP_LINES=4`; snippet = first 220 chars single-spaced). `npx vitest run tests/agent-corpus.test.ts` PASS; typecheck clean.
- [ ] Commit `feat(agent-rag): agent corpus module (chunker + rows + loader + ranking)`.

### Task 2: `embed:agent-corpus` CLI

**Files:** Create `scripts/embed-agent-corpus.ts` · Modify `package.json` (script after `embed:verifier-corpus`)

Mirror `embed-verifier-corpus.ts` operationally (batch 50 via `embedTexts`, sha-keyed incremental reuse of prior JSONL, SIGINT flush, `--rebuild`, `--dry-run`, exit 2 with clear message when no backend usable). Sources: every `public/data/pleno-transcripts/*.txt` (skip `.orig`/`.refined`) + `press.json` items (`title · source`, id = press id).

- [ ] Implement; `npm run embed:agent-corpus -- --dry-run` prints planned row count without API calls.
- [ ] Commit `feat(agent-rag): embed:agent-corpus CLI (.embed-cache/agent-corpus.jsonl)`.

### Task 3: agent integration (semantic hits in `local-snapshot`)

**Files:** Modify `src/scraper/journalist-tools/local.ts`, `src/scraper/journalist-tools/index` barrel if needed, `src/scraper/journalist-agent.ts:274` area · Test `tests/journalist-semantic-local.test.ts`

**Produces:** `semanticLocalHits(query, {topK=4, cachePath=DEFAULT}) → Promise<LocalHit[]>` — corpus module-cached; embeds query via `embedTexts`; maps rows → `LocalHit {localPath: row.localPath, matchedField: 'semantic', preview: row.snippet, row: {sourceId, ref, score, meta}}`. Missing cache / EmbedError / empty query ⇒ `[]` + single stderr warn (cache the warn so it prints once per process).

- [ ] RED: with `cachePath` pointing at a fixture JSONL (tiny vectors) and an injected embed fn? — `semanticLocalHits` accepts optional `embedFn` for tests (defaults to `embedTexts`-backed singleton). Assert: returns topK hits in score order with `matchedField:'semantic'`; missing cachePath ⇒ `[]` (no throw).
- [ ] GREEN + wire `journalist-agent.ts` `local-snapshot` case: `const semHits = await semanticLocalHits(q.queryHint ?? subjectName)` then same citation/evidence building over `semHits.slice(0, 3)`; increments `localHitCount`.
- [ ] `npm test` green; commit `feat(agent-rag): journalist local-snapshot tool gains semantic transcript+press recall`.

### Task 4: `entities.ts` pure module

**Files:** Create `src/scraper/entities.ts` · Test `tests/entities.test.ts`

**Produces:** `normalizeCompanyKey(raw) → string`, `companyIdForKey(key) → 'co-'+fnv32(key)`, `validateEntityOverrides(json) → EntityOverrides` (aliases `{variantKey, canonicalKey, note?, curator, addedAt}`; rejects self/cycle), `buildEntityRegistry({tenders, officials, overrides?}) → EntityRegistry` per spec §2.

- [ ] RED (table-driven): `'VARESER 96, S.L.'` ≡ `'VARESER 96 SL'` ≡ `'Vareser 96, Sociedad Limitada'` → same key; `'CONSTRUCCIONES E INFRAESTRUCTURAS EDÁN, S.L.U.'` folds accents+SLU; `'UTE RIBA-ROJA MANTENIMIENTO'` keeps `ute`; two genuinely distinct names stay distinct. Registry: fixture contracts (two variants of one company, one awarded + one in-tender) → single company, variants[2], awardedTotalEur counts awarded row only, contractIds both; canonicalName = most frequent raw (tie → longest); id starts `co-`. Overrides: alias re-keys variant onto canonical (merged company carries both variant sets); self-alias and 2-cycle rejected.
- [ ] GREEN; `npx vitest run tests/entities.test.ts` PASS.
- [ ] Commit `feat(entities): canonical entity registry module (RED+GREEN)`.

### Task 5: compute CLI + overrides CLI + nightly wiring + seed data

**Files:** Create `scripts/compute-entities.ts`, `scripts/entity-alias.ts`, `public/data/entity-overrides.json` (seed `{version:1, generatedAt, aliases: []}`) · Modify `package.json` (`compute:entities`, `entity-alias`), `scripts/scrape-all.sh` (regular step after compute:tender-geo)

- [ ] Implement both CLIs (entity-alias: normalize args, warn when variant unseen in registry, append+validate, then rerun compute). Run `npm run compute:entities` → commit-ready `public/data/entities.json`; sanity: top company by awardedTotalEur printed.
- [ ] Commit `feat(entities): compute:entities nightly + entity-alias curator CLI (+ first registry snapshot)`.

### Task 6: UI — entity-aware contractor leaderboard

**Files:** Modify `src/lib/tender-geo.js` (`topContractors(contracts, n=15, resolver=null)`), Create `src/hooks/useEntities.js` · Modify `src/components/Presupuesto/ContractorLeaderboard.jsx` · Test: extend `tests/` tender-geo unit coverage

- [ ] RED: `topContractors` with resolver merging two variant rows returns one row with summed amount, `canonicalName`, `variantCount:2`; without resolver → unchanged legacy shape.
- [ ] GREEN + leaderboard: build `Map<rawVariant → {key, canonicalName}>` from `useEntities().data?.companies`, memoized resolver; render canonical name + `· N razones sociales` hint when `variantCount>1`. `npm test` + `npx playwright test tests/e2e/presupuesto.spec.ts` green.
- [ ] Commit `feat(entities): /presupuesto leaderboard merges razones sociales via the registry`.

### Task 7: `check:relations` extensions

**Files:** Modify `src/scraper/relations-check.ts` (+ inputs in `scripts/check-relations.ts`) · Test extend `tests/relations-check.test.ts`

- [ ] RED: `entities-contracts` (error) breaks on a company citing an unknown contractId; `entity-overrides-keys` (warn) breaks on alias keys absent from company nameKeys; both `skipped` without inputs.
- [ ] GREEN; live `npm run check:relations` strict exit 0. Commit `feat(entities): relations gate covers registry↔contracts + overrides keys`.

### Task 8: docs + live corpus build + ship

- [ ] CLAUDE.md: commands (`embed:agent-corpus`, `compute:entities`, `entity-alias`), pipeline table rows (entities.json machine · entity-overrides.json curated), journalist tools note (semantic local recall + graceful fallback).
- [ ] Live: run `npm run embed:agent-corpus` with an available backend (ollama daemon, else `.env` key via `set -a; source .env`); record row count + duration.
- [ ] Full gates: `npm test`, typecheck, lint, build, `npm run test:e2e`, `check:relations`.
- [ ] Commit docs `[no-deploy]`; push; confirm CI e2e + Vercel deploy; verify live `entities.json`; update memory.
