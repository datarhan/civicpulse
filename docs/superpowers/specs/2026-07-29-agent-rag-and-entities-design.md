# Agent-RAG corpus + canonical entity registry — design

**Date:** 2026-07-29 · **Status:** approved by operator ("lets implement it", follow-up to the
data-layer refactor spec §6) · **Author:** Claude (background session)

## 0. Context

Follow-up to `2026-07-29-data-layer-refactor-design.md`. The operator asked whether the
"algorithms + LLM agents" workload warrants a graph or vector database; the assessment
(conversation, 2026-07-29) concluded no — but identified the two upgrades that capture the
real value at this scale without any database: semantic retrieval over transcripts+press for
the agents, and a canonical entity registry to replace name-string joins. The operator
approved implementing both.

## 1. W1 — semantic agent corpus (transcripts + press)

**Problem.** The journalist agent's Stage-2 local search (`searchLocalSnapshots`) is lexical
token-matching over 10 JSON snapshots. The 39 pleno transcripts (5.3 MB of `.txt`) are not
JSON — the agent cannot see them at all. Press search is lexical-only. Semantic recall over
"what was said in plenos" is the single highest-value retrieval upgrade for the agent.

**Design — mirror the verifier's proven embed pattern, separate corpus:**

- `src/scraper/agent-corpus.ts` (pure, no I/O beyond caller-supplied data):
  - `AgentCorpusRow { kind: 'transcript'|'press', sourceId, text, textSha256, embedding,
    snippet, ref, localPath, meta }` where `meta` carries `{ plenoId?, startLine?, endLine?,
    pressId?, date? }`. `ref` = `/plenos/<plenoId>` for transcripts, the article link for
    press. `localPath` = the on-disk source (`public/data/pleno-transcripts/<id>.txt` /
    `public/data/press.json`) so the agent's `buildLocalCitation` works unchanged.
  - `chunkTranscript(text, { targetChars≈1100, overlapLines≈4 })` — line-accumulating
    windows with line-range metadata; short transcripts → one chunk. Deterministic.
  - `buildAgentCorpusTexts({ transcripts: Map<plenoId,string>, press })` → rows without
    embeddings (text + sha + meta). Pure; the CLI zips in vectors.
  - `loadAgentCorpus(path)` — defensive JSONL loader (skip corrupt/invalid lines, own kind
    enum), same contract as the verifier's `loadCorpus`.
  - `rankAgentCorpus(queryVec, corpus, topK)` — cosine (reuse `cosineSimilarity`), sorted.
- `scripts/embed-agent-corpus.ts` → `npm run embed:agent-corpus` →
  `.embed-cache/agent-corpus.jsonl` (gitignored, like the verifier cache). Same operational
  contract as `embed-verifier-corpus`: sha-keyed incremental, batch 50, SIGINT flush,
  `--rebuild` on backend switch, `--dry-run`. Backends via the existing `embed-client`
  (ollama default / openai / gemini). NOT in scrape:all (CI has no backend) — curator/pipeline
  run, like the verifier corpus.
- Integration (`src/scraper/journalist-tools/local.ts`):
  `semanticLocalHits(query, { topK=4, cachePath? }): Promise<LocalHit[]>` — module-cached
  corpus load, query embedded via `embedTexts`, rows mapped onto the existing `LocalHit`
  shape (`matchedField: 'semantic'`, `preview` = snippet). **Graceful degrade is the
  contract:** missing cache file, unusable backend, or embed error → `[]` plus one stderr
  warning; the agent never crashes and falls back to today's lexical-only behavior.
- `src/scraper/journalist-agent.ts` `local-snapshot` case: also await `semanticLocalHits`,
  build citations from up to 3 semantic hits alongside the ≤3 lexical ones. No planner
  prompt/tool-surface change (same `local-snapshot` tool, better internals) — no prompt
  version bump needed.

**Why not extend `verifier-corpus.jsonl`:** different chunking (transcript windows vs row
snippets), different consumers/lifecycles, and the verifier's loader hard-validates its kind
enum. Two files, one pattern.

## 2. W2 — canonical entity registry

**Problem.** Company identity exists only as raw `assignee` strings ("VARESER 96, S.L." vs
"VARESER 96 SL" are two contractors). Gobierto provides no winner NIF; TED notices carry no
winner name at all (checked 2026-07-29). Every join and the /presupuesto leaderboard
under-merge.

**Design — machine-derived registry + curated alias overrides (the place-suggestions →
place-overrides pattern, minus the LLM layer):**

- `src/scraper/entities.ts` (pure):
  - `normalizeCompanyKey(raw)` — diacritics fold, lowercase, punctuation → space, collapse
    whitespace, then strip trailing legal-form token sequences only at the END of the name:
    `sl, s l, slu, sll, sa, s a, sau, sociedad limitada, sociedad limitada unipersonal,
    sociedad anonima, s coop, coop v, sccl, cb, scp, aie`. **UTE names are never merged into
    member companies** (joint ventures are distinct legal entities). Conservative by design;
    anything cleverer goes through the overrides file.
  - Company id: `co-<fnv32(nameKey)>` via the shared `hash.ts` (stable-ID discipline).
  - `buildEntityRegistry({ tenders, officials, overrides })` →
    `{ generatedAt, source, stats, companies[], people[] }`. Companies from every contract
    with an `assignee`: `{ id, nameKey, canonicalName (most frequent raw variant, ties →
    longest), variants[], contractIds[], contractCount, awardedTotalEur (awarded-status
    rows via contractAmount semantics), firstAwardDate, lastAwardDate }`, sorted by
    awardedTotalEur desc. People projected from officials.json (slug, name, party) — a
    reference block so future edges (dedicaciones, ispa) key on one file.
  - Overrides applied after normalization: alias rows re-key a variant onto a canonical key
    (single-hop; cycles and self-references rejected by the validator).
- `public/data/entities.json` — **machine-written** (nightly). `public/data/entity-overrides.json`
  — **curated** (schema-validated, starts empty), mutated via
  `npm run entity-alias -- "<variant>" "<canonical>" [--note …] [--curator …]`, which
  normalizes both sides, appends, re-validates, and rebuilds the registry.
- `scripts/compute-entities.ts` → `npm run compute:entities`, wired into `scrape-all.sh`
  after `compute:tender-geo` (regular step — deterministic, no network).
- UI: `useEntities` hook + `topContractors(contracts, n, resolver?)` gains an optional
  resolver `(rawName) => { key, canonicalName } | null` (default null → today's behavior,
  fully backward-compatible). `ContractorLeaderboard` builds the resolver from
  entities.json variants and renders the canonical name, with a "· N razones sociales"
  hint when variants merged.
- `check:relations` extension: error-level `entities-contracts` (every
  `companies[].contractIds[]` ∈ tenders ids); warn-level `entity-overrides-keys` (every
  alias variantKey/canonicalKey appears among company nameKeys — a stale alias is debt,
  not breakage).

**Honesty note:** merging razones sociales changes /presupuesto leaderboard aggregation.
The merge is deterministic (suffix normalization) or curator-signed (overrides file, public
git history) — no fuzzy/LLM matching touches the published surface.

## 3. Testing

TDD per repo cadence. W1: chunker windows/overlap/offsets, corpus-row build (sha stability,
press rows), defensive loader, ranking, `semanticLocalHits` degrade-to-empty (missing cache
path). W2: normalization table (S.L./accents/& variants merge; UTE preserved; distinct
companies stay distinct), registry build over fixture tenders (variant merge, awarded-only
money, id stability), overrides application + cycle rejection, resolver-aware
`topContractors`, relations-check extensions. Full gates: vitest, typecheck, lint, build,
e2e (presupuesto especially), `check:relations` strict, live corpus + registry builds.

## 4. Out of scope (explicit)

- No vector/graph database, embedded or server (assessment stands; entities.json is the
  bulk-load-ready artifact if traversal queries ever materialize).
- No LLM alias suggestions for entities (deterministic + curated only, V1).
- Verifier shortlist unchanged (its corpus already covers its needs).
- BOE/BOP in the agent corpus (add later if agent usage shows gaps).
