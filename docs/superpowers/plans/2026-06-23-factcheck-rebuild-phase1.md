# Fact-Checking Rebuild — Phase 1 (P0 + P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Full design + rationale: `docs/superpowers/specs/2026-06-23-factcheck-rebuild-phase1-design.md`.

**Goal:** Make verifier quality measurable (P0) and replace the quota-bound LLM
support-decision with a local NLI grounding engine (P1), proving the swap is an
accuracy upgrade on a human-labeled gold set.

**Architecture:** Pure scorer + stratified human-corrected gold set + a
`VerifierFn` seam → apples-to-apples backend comparison. A batch-spawn Python NLI
sidecar (mDeBERTa-xnli / MiniCheck) scores `(evidence, claim)` entailment;
`verifyClaimWithNli` mirrors `verifyClaimWithLlm` and plugs into the same seam.

**Tech Stack:** TS/Node + Vitest; Python 3.10 venv (`transformers`, CPU `torch`)
at `~/.local/civicpulse-nli/venv`; existing `src/llm` + `src/scraper`.

## Global Constraints
- Local tooling only; outputs committed as JSON; NOT in nightly CI.
- Libel guards preserved/strengthened: opinativa skip, deterministic-first,
  **NLI is upgrade-only and never emits `contradicho`**, verbatim discipline.
- No quota / no silent metered fallback: missing NLI venv fails loud.
- TDD (RED→GREEN→commit); pure logic in `src/`, spawn/IO only in CLI + client.
- `tsc --noEmit` + ESLint clean; Prettier-format before each commit.
- Branch: `feat/factcheck-rebuild` (already created off `main`).

---

### Task 1: Scorer pure function (P0 core)

**Files:** Create `src/lib/verifier-eval.ts`; Test `src/lib/verifier-eval.test.ts`.
**Interfaces:** Produces `GoldRow`, `Scorecard`, `scoreVerifier(predictions, gold)`
(exact shapes in spec §P0 scorer). Consumed by Task 4 + Task 10.

- [ ] **Step 1 — RED:** write `verifier-eval.test.ts` covering: label accuracy +
  per-verdict P/R/F1 on a 4-row synthetic set; confusion matrix; a row with no
  prediction counts as predicted `sin-datos`; `falseContradichoRate` (pred
  contradicho, gold not); `falseSinDatosRate`; citation micro-P/R on a row with
  `goldEvidenceRefs`; `feverScore` (label match AND `G⊆P`). Example:
  ```ts
  it('scores label accuracy + false-contradicho rate', () => {
    const gold = [
      { claimId:'a', claimType:'afirmacion_numerica', goldVerdict:'verificado', reviewed:true },
      { claimId:'b', claimType:'cita_obra', goldVerdict:'sin-datos', reviewed:true },
    ]
    const preds = new Map([
      ['a', { claimId:'a', verdict:'verificado', evidence:[], checkedAgainst:[] }],
      ['b', { claimId:'b', verdict:'contradicho', evidence:[], checkedAgainst:[] }],
    ])
    const s = scoreVerifier(preds, gold)
    expect(s.n).toBe(2); expect(s.labelAccuracy).toBeCloseTo(0.5)
    expect(s.falseContradichoRate).toBeCloseTo(0.5)
  })
  ```
- [ ] **Step 2:** run `npx vitest run src/lib/verifier-eval.test.ts` → FAIL (no module).
- [ ] **Step 3 — GREEN:** implement `scoreVerifier` per the spec's metric
  definitions (reviewed-only; missing pred = sin-datos; micro-averaged citation;
  FEVER = label match AND gold refs subset of predicted refs).
- [ ] **Step 4:** vitest green; `npm run typecheck`.
- [ ] **Step 5 — Commit:** `test+feat(eval): verifier scorecard scorer (P0)`.

---

### Task 2: Gold-set prefill CLI

**Files:** Create `scripts/eval-gold-prefill.ts`; pure helpers in
`src/lib/gold-prefill.ts`; Test `src/lib/gold-prefill.test.ts`. Add npm script.

**Interfaces:** `stratifiedSample(items, n, seedFn) → claimIds`,
`mergeGold(existing, freshRows) → GoldRow[]` (idempotent: preserves
`reviewed:true`, refreshes unreviewed, stable claimId sort).

- [ ] **Step 1 — RED:** `gold-prefill.test.ts`: (a) stratification draws across
  `verdict×claimType` buckets proportionally with a deterministic seed (no
  `Math.random`); (b) `mergeGold` keeps a `reviewed:true` row byte-identical even
  when the fresh row disagrees, refreshes an unreviewed row, appends new ones,
  output sorted by claimId.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3 — GREEN:** implement the two pure helpers.
- [ ] **Step 4:** write `scripts/eval-gold-prefill.ts` (reads
  `public/data/pleno-claims-verified.json`, prefills `goldVerdict`/
  `goldEvidenceRefs` from current verification, `reviewed:false`, writes
  `tests/fixtures/verifier-gold.json` via `mergeGold`). Add
  `"eval:gold-prefill": "tsx scripts/eval-gold-prefill.ts"` to package.json.
- [ ] **Step 5:** `npm run eval:gold-prefill -- --sample 50` → inspect the file
  has ~50 stratified unreviewed rows; vitest + typecheck green.
- [ ] **Step 6 — Commit:** `feat(eval): stratified gold-set prefill CLI (P0)`.

---

### Task 3: VerifierFn seam (context loader + stored/deterministic/current)

**Files:** Create `src/scraper/verifier-runner.ts`; Test
`src/scraper/verifier-runner.test.ts`.
**Interfaces:** `VerifierContext`, `VerifierFn`, `loadVerifierContext(opts)`,
`storedVerifier`, `deterministicVerifier`, `currentVerifier` (spec §seam).
`storedVerifier` reads the verdict already in `verified.json` (zero-compute
baseline, no LLM). `loadVerifierContext` loads ALL datasets incl. `tendersTed` +
`priorClaims` (exercises the R3-correct wiring) + optional preloaded corpus.

- [ ] **Step 1 — RED:** test that `deterministicVerifier` returns a
  `ClaimVerification` for a fixture claim+context (reuse existing
  `claim-verifier.test.ts` fixtures), and that `loadVerifierContext` populates
  `tendersTed` + `priorClaims` (non-null when files exist). Use a tmp/fixture
  data dir.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3 — GREEN:** implement. `deterministicVerifier` = `verifyClaim`
  (now passed tendersTed + priorClaims from ctx); `currentVerifier` =
  deterministic then, if `sin-datos`, `verifyClaimWithLlm(getShortlist(...))`;
  `storedVerifier` = lookup by claimId in the loaded snapshot.
- [ ] **Step 4:** vitest + typecheck green.
- [ ] **Step 5 — Commit:** `feat(eval): VerifierFn seam + context loader (P0)`.

---

### Task 4: Eval CLI + P0 baseline

**Files:** Create `scripts/eval-verifier.ts`; add npm script + `eval/` to
`.gitignore`.

- [ ] **Step 1:** write `scripts/eval-verifier.ts`: parse `--verifier
  stored|deterministic|current|nli|nli-minicheck`, `--gold`, `--json`; load gold
  (reviewed rows) + `loadVerifierContext`; run the chosen `VerifierFn`; call
  `scoreVerifier`; print a Markdown scorecard table; write
  `eval/scorecards/<verifier>-<stamp>.json` (stamp passed in / derived, no
  `Date.now()` in pure code). `nli*` with missing venv → exit non-zero + bootstrap
  hint.
- [ ] **Step 2:** add `"eval:verifier": "tsx scripts/eval-verifier.ts"`;
  add `eval/` to `.gitignore`.
- [ ] **Step 3:** (after a few gold rows are marked reviewed — placeholder OK now)
  `npm run eval:verifier -- --verifier stored` runs without error and prints a
  table. typecheck green.
- [ ] **Step 4 — Commit:** `feat(eval): eval:verifier CLI + scorecards (P0)`.

> **P0 complete.** The remaining P0 value (real baseline numbers) lands in Task 10
> after the operator marks gold rows reviewed.

---

### Task 5: NLI Python sidecar + bootstrap (operator-run)

**Files:** Create `scripts/nli/nli_score.py`; `scripts/bootstrap-nli.sh`.

- [ ] **Step 1:** write `nli_score.py` per spec §sidecar: stdin JSONL
  `{id,premise,hypothesis}` → stdout JSONL `{id,entailment,neutral,contradiction,
  label}`; load model once (`NLI_MODEL` default mDeBERTa-xnli; `minicheck` path);
  `NLI_BATCH` default 16; flush.
- [ ] **Step 2:** write `bootstrap-nli.sh` (mirror `bootstrap-voice-id.sh`):
  detect python3.10 → venv at `~/.local/civicpulse-nli/venv` → pip install
  `transformers torch sentencepiece` → pre-download model(s) → one-pair smoke
  test → non-zero exit + punch list if missing.
- [ ] **Step 3 — operator:** `bash scripts/bootstrap-nli.sh` on the Mac; confirm
  the smoke test prints an entailment score for a known-true pair.
- [ ] **Step 4 — Commit:** `feat(nli): batch NLI sidecar + bootstrap (P1)`.

---

### Task 6: NLI Node client

**Files:** Create `src/scraper/nli-client.ts`; Test `src/scraper/nli-client.test.ts`.
**Interfaces:** `NliPair`, `NliScore`, `scoreNliPairs(pairs, opts)`,
`NliUnavailableError` (spec §client).

- [ ] **Step 1 — RED:** test with an **injected fake spawn** (or inject a fake
  scorer): N pairs in → JSONL written to stdin → parsed `Map<id,NliScore>` out;
  malformed line skipped/throws per contract; missing-venv path throws
  `NliUnavailableError` with bootstrap hint.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3 — GREEN:** implement spawn-once + JSONL stdin/stdout + error paths
  (follow the existing spawn pattern used by the gemini/agy client).
- [ ] **Step 4:** vitest + typecheck green.
- [ ] **Step 5 — Commit:** `feat(nli): Node client for the NLI sidecar (P1)`.

---

### Task 7: verifyClaimWithNli + wire into the seam

**Files:** Create `src/scraper/claim-verifier-nli.ts`; Test
`src/scraper/claim-verifier-nli.test.ts`; modify `src/scraper/verifier-runner.ts`
(add `nliVerifier`).
**Interfaces:** `verifyClaimWithNli(inputs, scorer)` → `NliVerifierResult`
(spec §verifier variant). Thresholds const: `τ_entail=0.55, τ_high=0.90,
τ_contra=0.90`.

- [ ] **Step 1 — RED:** `claim-verifier-nli.test.ts` with a **mocked scorer**:
  `bestEntail≥τ_high → verificado`; `τ_entail≤best<τ_high → parcial`;
  `best<τ_entail → sin-datos` (no upgrade); opinativa claim → null; empty
  candidates → null; a candidate with `contradiction≥τ_contra` →
  `sin-datos` + `nliContradictionFlag=true` (NOT contradicho); `confidence ===
  bestEntail`; evidence cites only real candidate refs/snippets.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3 — GREEN:** implement (reuse `shouldSkipLlmVerification`;
  hypothesis = `claim.verbatim`, premise = `candidate.snippet`; one pair per
  candidate; map per spec). Add `nliVerifier` to `verifier-runner.ts`
  (deterministic → if sin-datos, `verifyClaimWithNli(getShortlist(...,{corpus}))`).
- [ ] **Step 4:** vitest + typecheck green.
- [ ] **Step 5 — Commit:** `feat(nli): verifyClaimWithNli upgrade-only verifier (P1)`.

---

### Task 8: getShortlist corpus passthrough (fix B1 per-call reparse)

**Files:** Modify `src/scraper/claim-verifier.ts` (`getShortlist` opts.corpus);
Test addition in `src/scraper/claim-verifier-llm.test.ts` or a new case.

- [ ] **Step 1 — RED:** test that when `opts.corpus` is provided, `getShortlist`
  uses it and does NOT call `loadCorpus` (spy/mock the semantic module).
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3 — GREEN:** add `opts.corpus?: Corpus`; skip `loadCorpus` when
  present. Backward compatible (LLM runner unchanged).
- [ ] **Step 4:** vitest + typecheck green.
- [ ] **Step 5 — Commit:** `perf(verifier): getShortlist accepts a preloaded corpus (P1)`.

---

### Task 9: NLI runner (batched, resumable)

**Files:** Create `scripts/verify-pleno-claims-nli.ts`; modify
`src/scraper/claim-verifier.ts` (add `llmAttempted`'s sibling `nliAttempted?:
boolean` to `ClaimVerification`); add npm script.

- [ ] **Step 1:** add `nliAttempted?: boolean` to `ClaimVerification`.
- [ ] **Step 2:** write `scripts/verify-pleno-claims-nli.ts` per spec §runner:
  load snapshot + `loadVerifierContext({withCorpus:true})` once; candidates =
  sin-datos & !opinativa & !nliAttempted; batch-embed queries; build each
  shortlist with the preloaded corpus; collect ALL pairs → ONE `scoreNliPairs`;
  `verifyClaimWithNli` per claim; upgrade sin-datos only; stamp `nliAttempted`;
  contradiction-flag claims → stderr + side report; checkpoint every 100 +
  SIGINT/SIGTERM flush; refresh chunks via `rewriteChunksFromMonolith`.
- [ ] **Step 3:** add `"verify:pleno-claims:nli": "tsx
  scripts/verify-pleno-claims-nli.ts"`.
- [ ] **Step 4:** `npm run typecheck` + `npm run lint` clean. (End-to-end run is
  Task 10 — needs the venv.)
- [ ] **Step 5 — Commit:** `feat(nli): batched resumable NLI verify runner (P1)`.

---

### Task 10: Baseline + NLI comparison (operator-run) + finish

**Prereqs:** Task 5 venv bootstrapped; operator has marked ≥~40 gold rows
`reviewed:true` in `tests/fixtures/verifier-gold.json`.

- [ ] **Step 1:** `npm run eval:verifier -- --verifier stored` → record baseline.
- [ ] **Step 2:** `npm run eval:verifier -- --verifier nli` and `-- --verifier
  nli-minicheck` → compare label accuracy, false-contradicho rate, citation P/R.
- [ ] **Step 3:** pick the better model + tune `τ_entail/τ_high` on the gold set;
  update the threshold const if needed (re-commit).
- [ ] **Step 4:** record baseline vs NLI numbers in
  `docs/superpowers/specs/2026-06-23-factcheck-rebuild-phase1-results.md`; commit.
- [ ] **Step 5:** if NLI wins → `npm run verify:pleno-claims:nli` to regenerate
  the sin-datos upgrades locally ($0); sanity-check verdict mix (24 contradicho
  preserved); `npm test`; commit regenerated data.
- [ ] **Step 6:** finishing-a-development-branch (verify tests, present options).

---

## Self-Review
- **Spec coverage:** P0 (gold prefill T2, scorer T1, seam T3, CLI T4) + P1
  (sidecar T5, client T6, verifier T7, B1 fix T8, runner T9) + measurement (T10).
  All spec interfaces map to a task.
- **Placeholders:** none — each task has files, a RED test description, a GREEN
  pointer, a verify command, and a commit.
- **Type consistency:** `VerifierFn`/`VerifierContext` (T3) reused by T4/T7/T9;
  `verifyClaimWithNli` return (T7) mirrors `verifyClaimWithLlm`; `nliAttempted`
  (T9) mirrors `llmAttempted`; thresholds defined once (T7) and tuned (T10).
- **Human steps isolated:** T5 (bootstrap) + T10 (label + run) are the only
  operator-dependent tasks; all other code+tests run without the venv (mocked).
```
