# Fact-Checking Rebuild — Phase 2 (P2) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.
> Design: `docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md`.

**Goal:** base/overlay file split (fixes R4/B5) + flag-only NLI re-grounding gate
+ curator-apply CLI, so the measured LLM over-claiming can be safely removed by a
human, and re-runs never clobber decisions.

**Tech stack:** TS/Node + Vitest; P1 NLI sidecar; existing scraper/scripts.

## Global Constraints
- Flag-only; `downgrade-verdict` is the ONLY verdict-mutating path; downgrade-only.
- `pleno-claims-verified.json` shape unchanged (consumers untouched) — split is write-side.
- TDD (RED→GREEN→commit); `tsc --noEmit` + ESLint clean; Prettier before commits.
- Branch `feat/factcheck-rebuild-p2` (created off main).

---

### Task 1: verified-merge core
**Files:** Create `src/scraper/verified-merge.ts`; Test `tests/scraper/verified-merge.test.ts`.
**Interfaces:** `VerifiedItem`, `OverlayEntry`, `Overlay`, `mergeVerified(baseItems, overlay): VerifiedItem[]`, `isDowngrade(from, to): boolean` (rank verificado>parcial>sin-datos; contradicho→{parcial,sin-datos} only; same/upgrade=false).
- [ ] RED `verified-merge.test.ts`: overlay entry wins per claimId; base order preserved; overlay entry with claimId not in base is dropped; `isDowngrade('verificado','sin-datos')`=true, `isDowngrade('sin-datos','verificado')`=false, `isDowngrade('contradicho','parcial')`=true, `isDowngrade('parcial','parcial')`=false.
- [ ] `npx vitest run tests/scraper/verified-merge.test.ts` → FAIL.
- [ ] GREEN implement (pure).
- [ ] vitest + `npm run typecheck` green.
- [ ] Commit `test+feat(verify): base/overlay merge + downgrade-rank (P2 T1)`.

### Task 2: overlay validator + apply helper
**Files:** extend `src/scraper/verified-merge.ts`; extend the test.
**Interfaces:** `validateOverlay(o): void` (throws on bad schema), `applyOverlayEntries(overlay, entries: {claimId, verification, source, reason?, editor?}[], stampIso): Overlay` (pure; returns new overlay; curator-downgrade entries require reason ≥20 chars + isDowngrade vs the provided base verdict).
- [ ] RED: `applyOverlayEntries` adds/overwrites entries; a `curator-downgrade` with reason <20 chars throws; `validateOverlay` rejects a missing `verification`/`source`.
- [ ] FAIL → GREEN (pure; pass `stampIso` in — no `new Date()` in the pure fn).
- [ ] vitest + typecheck green.
- [ ] Commit `feat(verify): overlay validate + applyOverlayEntries (P2 T2)`.

### Task 3: rebuildVerified + migration
**Files:** Create `src/scraper/verified-rebuild.ts` (`rebuildVerified()` reads base+overlay → writes verified.json → `rewriteChunksFromMonolith`); Create `scripts/migrate-verified-split.ts` → `npm run migrate:verified-split`.
- [ ] Write `verified-rebuild.ts` (IO; uses `mergeVerified`; stats recompute; writes verified.json then refreshes chunks).
- [ ] Write migration: if base missing, seed `…-base.json` from current `verified.json` items + write empty `…-overlay.json`. Idempotent (no-op if base exists unless `--force`).
- [ ] Add npm scripts. Run `npm run migrate:verified-split` → base seeded, empty overlay; `rebuildVerified()` reproduces the SAME verified.json (diff is empty). Verify: `git diff --stat public/data/pleno-claims-verified.json` shows no change.
- [ ] typecheck + lint green.
- [ ] Commit `feat(verify): rebuildVerified + base/overlay migration (P2 T3)` (incl. the seeded base + empty overlay).

### Task 4: wire deterministic runner + R4/B5 regression test
**Files:** Modify `scripts/verify-pleno-claims.ts`; Test `tests/scraper/verified-overlay-regression.test.ts`.
- [ ] Modify `verify-pleno-claims.ts`: write `…-base.json` (deterministic verdicts), then `rebuildVerified()` (applies existing overlay) instead of writing verified.json directly.
- [ ] RED regression test: given a base + an overlay with one entry, `mergeVerified` keeps the overlay verdict; simulate "deterministic re-run" (rebuild base from a fixture + re-merge overlay) → overlay entry survives. (Asserts the footgun is closed.)
- [ ] FAIL → GREEN (logic already in T1/T3; the test wires it on a fixture).
- [ ] Run `npm run verify:pleno-claims` → verified.json unchanged vs HEAD (overlay empty post-migration), base rewritten. typecheck/lint green.
- [ ] Commit `feat(verify): deterministic runner writes base + re-applies overlay (P2 T4)`.

### Task 5: route NLI (+ LLM) runner upgrades to the overlay
**Files:** Modify `scripts/verify-pleno-claims-nli.ts` (and `…-llm.ts`).
- [ ] Modify the NLI runner: collect upgrades into overlay entries (`source:'nli'`) via `applyOverlayEntries`, write overlay, then `rebuildVerified()` — no direct verified.json write. `nliAttempted` markers go on the base? No — keep resume state in the overlay-free path: track attempted via a sidecar set, OR stamp on the merged read. Simplest: the runner reads verified.json (merged) to find sin-datos; attempted-tracking stays a transient per-run concern (re-runs re-scan; acceptable since NLI is local/fast). Document the change.
- [ ] Mirror for `…-llm.ts` (write to overlay).
- [ ] typecheck + lint green. (End-to-end run optional — covered by P1.)
- [ ] Commit `feat(verify): second-pass runners write to the overlay (P2 T5)`.

### Task 6: re-grounding decision (pure)
**Files:** Create `src/scraper/reground.ts`; Test `tests/scraper/reground.test.ts`.
**Interfaces:** `RegroundFlag`, `REGROUND_THRESHOLDS = {entail:0.5, contra:0.5}`, `regroundDecision(item, nliByEvidenceIndex): RegroundFlag | null`.
- [ ] RED: verificado with maxEntail 0.3 → 'ungrounded'; verificado maxEntail 0.8 → null; contradicho maxContra 0.2 → 'weak-contradicho'; contradicho maxContra 0.9 → null; item with no evidence → null; sin-datos → null (not in scope).
- [ ] FAIL → GREEN (pure).
- [ ] vitest + typecheck green.
- [ ] Commit `test+feat(reground): NLI re-grounding decision (P2 T6)`.

### Task 7: re-grounding runner
**Files:** Create `scripts/reground-verdicts.ts` → `npm run reground:verdicts`.
- [ ] Read verified.json; select verificado/parcial/contradicho with evidence; build NLI pairs (premise=evidence.snippet, hypothesis=verbatim); batch `scoreNliPairs`; `regroundDecision` per item; write `public/data/pleno-claims-regrounding-flags.json`. Fails loud without the venv.
- [ ] Add npm script. `npm run reground:verdicts` (venv present) → flags file written; report counts (ungrounded / weak-contradicho). typecheck/lint green.
- [ ] Commit `feat(reground): flag-only re-grounding runner (P2 T7)` (+ the generated flags file).

### Task 8: curator-apply CLIs
**Files:** Create `scripts/regrounding-review.ts` (`npm run regrounding:review`), `scripts/downgrade-verdict.ts` (`npm run downgrade-verdict`).
- [ ] `regrounding:review`: pretty-print the flags file (claim, verdict, reason, scores, evidence).
- [ ] `downgrade-verdict -- <claimId> <verdict> --reason "≥20" [--editor]`: validate claimId in base, `isDowngrade`, reason length; `applyOverlayEntries` (source:'curator-downgrade'); `rebuildVerified()`. Bail with a clear message on any validation failure.
- [ ] Add npm scripts. Smoke: `downgrade-verdict` on a throwaway claimId with a bad (upgrade) target → rejected; with a valid downgrade → overlay entry written, verified.json reflects it; then revert the test change. typecheck/lint green.
- [ ] Commit `feat(reground): curator review + downgrade-verdict CLIs (P2 T8)`.

### Task 9: /metodologia + finish
**Files:** Modify `src/pages/Metodologia.jsx`.
- [ ] Document the re-grounding gate (flag-only, curator-applied) + the base/overlay contract under the verification section.
- [ ] `npm test` (full) green; `npm run typecheck`; `npm run lint`.
- [ ] Commit `docs(metodologia): re-grounding gate + base/overlay contract (P2 T9)`.
- [ ] superpowers:finishing-a-development-branch (verify tests → options).

## Self-Review
- Pieces → tasks: split (T1–T5), gate (T6–T7), curator-apply (T8), contract (T9).
- `mergeVerified`/`Overlay`/`isDowngrade`/`applyOverlayEntries`/`rebuildVerified`/
  `regroundDecision` consistent across tasks.
- T4 regression test is the explicit guard for the R4/B5 footgun.
- Only `downgrade-verdict` mutates verdicts; downgrade-only + reason-gated.
