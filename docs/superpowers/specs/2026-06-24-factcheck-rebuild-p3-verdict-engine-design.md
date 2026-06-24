# Fact-Checking Rebuild — Phase 3: Verdict Engine (design)

> Phase 3 of the decomposed rebuild (option C). Builds on P0–P2 (eval harness,
> local NLI grounding, base/overlay split + re-grounding gate) on `main`.

**Goal:** re-derive the ~426 unreliable LLM-second-pass verdicts
(`verificado`/`parcial`) with a method that does NOT over-claim, using the
2024–2026 SOTA technique stack on a **local, $0** model. Ship only if it beats
the old LLM pass on the 64-row reviewed gold — the eval is a hard gate.

**Why (the findings that motivate this):** the over-claiming is structural —
the deterministic 0.5 overlap floor is loose lexical matching, the old metered-LLM
second pass is over-confident (measured: 20% false-`contradicho`, many coincidental
`verificado`/`parcial`), and NLI-on-snippet is only coarse triage (~0.68 precision).
None of those can fix it precisely. The fix is the technique stack, not the model.

**Tech stack:** TS/Node + Vitest; `qwen2.5:14b-instruct` via ollama (already
installed; `callLLM` already supports the ollama backend, $0/no-quota); the P1
mDeBERTa NLI sidecar (for the consistency gate); existing `src/scraper` + `src/llm`.

## Scope

**In scope:** a `verifyClaimWithEngine` verifier + its eval on the gold + (gated on
a win) a runner that re-derives the 426 LLM verdicts into the overlay
(`source:'verdict-engine'`).

**Out of scope / unchanged:** the deterministic verifier (kept — it's the base);
`contradicho` (engine NEVER emits it — stays deterministic + curator-only);
the sin-datos backlog (genuinely unverifiable; not re-processed); the verdict
taxonomy (keep verificado/parcial/sin-datos; no new labels in v1).

## The engine (`src/scraper/claim-verifier-engine.ts`)

`verifyClaimWithEngine({ claim, candidates }, caller, nliScorer)` →
`EngineResult | null`. Same plug-in contract as `verifyClaimWithLlm` /
`verifyClaimWithNli` (so it drops into the eval seam + a runner). Pipeline:

1. **Skip** opinativa (`shouldSkipLlmVerification`) + empty candidates → null.
2. **Reason-then-format** (the "format tax" fix — reason free-text, THEN extract):
   - Call 1 (reason): local qwen reasons in prose over the shortlist candidates —
     "does any candidate support the claim, and how strongly?" No schema.
   - Call 2 (extract): a cheap structured call turns the reasoning into
     `{ verdict, evidenceIndexes[], snippetCites[] }`.
3. **NEI-by-default:** the extract prompt + the post-rule default to `sin-datos`
   unless ≥1 candidate is cited AND the cite is grounded.
4. **Cite-grounding (reuse P1):** every cited index must be in range and its cited
   value must appear (digit/diacritic-insensitive) in the candidate snippet —
   reuse `parseCite` + `looselyContains` from `claim-verifier-llm.ts`. Ungrounded
   cites are dropped; zero grounded cites → `sin-datos`.
5. **Consistency gate (PCC — the anti-over-confidence lever):** for a would-be
   `verificado`/`parcial`, generate a brief "argue it's sin-datos" rationale and
   score its contradiction with the supporting rationale via the local mDeBERTa
   (`scoreNliPairs`). If the two rationales are NOT contradictory enough (the model
   isn't confident the evidence really supports), force `sin-datos`. Tunable
   threshold; **can be disabled via flag** for a faster first eval pass.
6. **Verdict:** `verificado` only with a strong grounded cite; else `parcial`;
   else `sin-datos`. Never `contradicho`. Confidence = a real score.

Prompts live in `src/llm/prompts.ts` (versioned: `ENGINE_REASON_VERSION`,
`ENGINE_EXTRACT_VERSION`) and forbid inventing facts / citing outside the list.

## Eval (the hard gate)

Add `engine` (+ `engine-no-consistency`) to the `VerifierFn` seam
(`verifier-runner.ts`) and run `npm run eval:verifier -- --verifier engine`
against the 64-row reviewed gold. Ship criteria vs the `current` (LLM) baseline:
- label accuracy ≥ current,
- **false-`sin-datos` and the coincidental-`parcial` rate strictly lower** (the
  point is fewer over-claims),
- 0 false-`contradicho` (structural — engine can't emit it).

If it doesn't clear the bar, we STOP and keep the conservative state — that's a
valid, documented outcome (the honest finding would be "local-LLM-with-stack
doesn't beat the reviewed-downgrade state").

## Production re-derivation (only if the eval wins)

`scripts/verify-pleno-claims-engine.ts` → `npm run verify:pleno-claims:engine`:
re-derive the claims currently carrying a `llm-second-pass` verdict (read from the
overlay's `source:'llm'` entries), write engine verdicts to the overlay
(`source:'verdict-engine'`, replacing the `llm` entries), `rebuildVerified()`.
Chunked + resumable (mirror the NLI runner). Local/$0. The curator-downgrade
overlay entries (the 40 reviewed retractions) are NOT touched (different source).

## Performance note

qwen2.5:14b on Apple Metal is ~seconds/call. The eval (64 claims × ~2–3 calls) is
~minutes. The full 426 re-derivation is a longer local batch (resumable) — an
operator step, like the NLI regen.

## Libel invariants (unchanged)

- Engine never emits `contradicho` (deterministic + curator only).
- Cite-grounding: no fabricated evidence (cite-in-snippet enforced).
- Writes to the overlay (reversible, base-safe); curator downgrades preserved.
- Eval-gated: nothing ships to production verdicts without clearing the gold gate.
- `/metodologia` updated when/if the engine ships.

## Testing
- `claim-verifier-engine.test.ts` — verdict mapping with a mocked caller + mocked
  NLI: grounded strong cite → verificado; grounded weak → parcial; no grounded
  cite → sin-datos; opinativa/empty → null; consistency gate forces sin-datos when
  rationales aren't contradictory; never returns contradicho; ungrounded cite
  dropped (reuse the cite-grounding tests' shape).
- Eval seam wiring (`engine` VerifierFn).

## Self-review
- Reuses P1 cite-grounding + mDeBERTa + the eval seam + the overlay — minimal new
  surface. The one genuinely new piece is the reason-then-format + consistency
  prompts. Eval-gated so a null result is safe. contradicho stays out of the
  engine — the libel boundary holds.
