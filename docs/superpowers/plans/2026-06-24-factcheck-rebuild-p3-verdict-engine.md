# Phase 3: Verdict Engine — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. TDD; commit per task.
> Design: `docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-verdict-engine-design.md`.

**Goal:** build `verifyClaimWithEngine` (reason-then-format + NEI-default +
cite-grounding + consistency gate, local qwen via ollama), eval it on the 64-row
gold; re-derive the 426 LLM verdicts only if it beats the LLM pass.

**Constraints:** local/$0 (ollama qwen2.5:14b + mDeBERTa); engine never emits
`contradicho`; writes to the overlay; eval-gated; reuse P1 cite-grounding +
mDeBERTa + eval seam. TDD, typecheck + lint clean. Branch `feat/factcheck-rebuild-p3`.

---

### Task 1: Engine verifier (pure mapping, mocked I/O)
**Files:** Create `src/scraper/claim-verifier-engine.ts`; Test `tests/scraper/claim-verifier-engine.test.ts`.
**Interface:** `verifyClaimWithEngine({claim, candidates}, caller?, nliScorer?) → EngineResult | null`
(EngineResult mirrors NliVerifierResult: `{verification, upgraded}`).
- [ ] RED: mocked `caller` (reason + extract) + mocked `nliScorer`: grounded
  strong cite → verificado; grounded weak → parcial; no grounded cite →
  sin-datos; opinativa → null; empty candidates → null; consistency gate forces
  sin-datos when the argue-both-sides rationales are NOT contradictory; result
  is NEVER contradicho; ungrounded cite (value not in snippet) dropped.
- [ ] FAIL → GREEN. Reuse `parseCite` + `looselyContains` (export them from
  `claim-verifier-llm.ts` if not already). `shouldSkipLlmVerification` for skip.
- [ ] vitest + typecheck green.
- [ ] Commit `test+feat(engine): reason-then-format verdict engine (P3 T1)`.

### Task 2: Prompts
**Files:** Modify `src/llm/prompts.ts` (+ `src/llm/schemas.ts` for the extract schema).
- [ ] Add `buildEngineReasonPrompt` (free-text reasoning over candidates; forbids
  inventing facts / citing outside the list) + `buildEngineExtractPrompt`
  (verdict + cited indexes + structured cites), with `ENGINE_REASON_VERSION` /
  `ENGINE_EXTRACT_VERSION`. Extract schema in `schemas.ts` (Zod).
- [ ] typecheck + the existing prompt/schema tests green.
- [ ] Commit `feat(engine): reason-then-format prompts + extract schema (P3 T2)`.

### Task 3: Wire into the eval seam
**Files:** Modify `src/scraper/verifier-runner.ts` (add `engineVerifier` +
`makeEngineVerifier({consistency})`); modify `scripts/eval-verifier.ts` (dispatch
`engine` / `engine-no-consistency`).
- [ ] deterministic → if sin-datos, engine (like nliVerifier). Uses `callLLM`
  (ollama) + `scoreNliPairs`.
- [ ] typecheck + lint green.
- [ ] Commit `feat(engine): wire engine verifier into the eval seam (P3 T3)`.

### Task 4: EVAL on the gold (the gate) — operator/local
- [ ] `OLLAMA_MODEL=qwen2.5:14b-instruct LLM_BACKEND=ollama npm run eval:verifier -- --verifier engine`
  (and `--verifier current` for the baseline, `engine-no-consistency` for ablation).
- [ ] Record the scorecards in a results doc. **Decision:** does engine beat
  `current` on label accuracy + false-sin-datos + coincidental-parcial, at 0
  false-contradicho? If NO → STOP, document, keep the conservative state.
- [ ] Commit the results doc.

### Task 5 (only if eval wins): production re-derivation
**Files:** Create `scripts/verify-pleno-claims-engine.ts` → `npm run verify:pleno-claims:engine`.
- [ ] Re-derive the overlay's `source:'llm'` claims via the engine; write
  `source:'verdict-engine'` overlay entries; `rebuildVerified()`. Chunked +
  resumable; preserves curator-downgrade entries.
- [ ] Run locally; verify the verdict mix (fewer over-claims, contradicho stays 0,
  the 40 curator downgrades persist); `npm test`.
- [ ] `/metodologia` update. Commit + finishing-a-development-branch.

## Self-Review
- T1–T3 build + wire the engine (no production data touched). T4 is the gate. T5
  ships only on a win. contradicho never enters the engine. Eval-gated throughout.
