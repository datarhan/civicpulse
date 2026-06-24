# Phase 3: Verdict Engine — Results (2026-06-24)

## Outcome: SHIPPED. Engine cleared the gold gate and retracted 242 LLM over-claims to sin-datos.

The reason-then-format verdict engine (`claim-verifier-engine.ts`: NEI-default +
cite-grounding + optional PCC consistency gate; never emits `contradicho`) is
built, unit-tested, wired into the eval seam, and **in production** via
`npm run verify:pleno-claims:engine`.

### The detour (and the real cause)

The first attempt looked blocked: `qwen2.5:14b` via ollama ran ~1 min/claim, and
every metered retry "hung." The root cause was **not** the model or hardware — it
was that **the repo loads no `.env`** (no dotenv, no `--env-file`). `npx tsx` /
`npm run` never saw `OPENAI_API_KEY`, so the OpenAI call fell back down the chain
to spawning the gemini CLI, which hung and orphaned 8GB processes that starved RAM
to ~67MB and made every spawn crawl. Two fixes unblocked it:

- `fix(llm)`: omit `temperature`/`seed` for gpt-5.x / o-series reasoning models
  (they 400 on sampling params → retry-burn → fallback). `isReasoningModel()`.
- Run metered commands with `set -a; source <(grep -E '^[A-Za-z_].*=' .env); set +a`.

After OpenAI billing was topped up, `gpt-5.4-mini` ran a claim in ~2.8s.

### Eval (the gate) — CLEARED on gpt-5.4-mini, 64-row gold

| metric              | engine    | deterministic | LLM pass |
| ------------------- | --------- | ------------- | -------- |
| label-accuracy      | **67.2%** | 65.6%         | ~48%     |
| false-sin-datos     | **27.3%** | 54.5%         | —        |
| false-contradicho   | 0%        | 0%            | 20%      |
| sin-datos precision | **~92%**  | 86%           | —        |

The PCC consistency gate was a no-op at τ=0.5 (identical scorecard) → shipped the
cheaper no-consistency config.

### Production re-derivation (downgrade-to-sin-datos ONLY)

Because the engine's `sin-datos` precision is ~92% but its verificado/parcial
precision is weak, the runner trusts **only** its `sin-datos` verdict, as a
retraction of LLM verificado/parcial — never raises, never introduces a verdict.
Re-judged the 387 LLM verdicts → **retracted 242 → sin-datos, kept 145**. Written
as a new `verdict-engine` overlay source (reason≥20, never-contradicho, validated);
the 40 curator downgrades are untouched.

Published verdicts: `verificado 208→157 · parcial 362→171 · sin-datos 4088→4330 ·
contradicho 0`. Shipped in commit `147a72b`; `/metodologia` documents it.

### Post-ship verification (QA)

- **Published-state accuracy on the gold: 95.3%** label-acc via the `stored`
  verifier (up from the ~48% over-claiming state). Caveat: ~40 gold rows had their
  verdict set _from_ the gold review (curator downgrades), so that figure is partly
  circular; the clean independent measure is the engine's 67.2%.
- **51 `verificado→sin-datos` retractions: 0 carry a € amount** — all are
  non-numeric procedural/internal statements the LLM had over-claimed. Clean.
- **15 amount-bearing retractions** (all `parcial→sin-datos`), eyeballed: mostly
  vague/program/penalty figures correctly ruled unverifiable (€24M program totals,
  €143k penalty expedientes). Sound in direction.
- **Lexical-retrieval limitation — CHECKED and resolved.** The production run used
  lexical shortlists, so the 15 amount-bearing retractions were re-run with
  **semantic (hybrid) retrieval** (nomic-embed) to see if any had a real match
  lexical missed. Result: **0/15 recoverable** — semantic retrieval found no
  grounded match either. The figures are spoken investments/penalties/program
  totals with no record in the tenders/BDNS/budget feeds, so `sin-datos` is the
  correct verdict, not a retrieval artifact. The retractions are sound.

### Base re-judging (extension, 2026-06-24)

The engine runner gained a `--base` mode that re-judges the deterministic-base
`verificado`/`parcial` verdicts the LLM-overlay run never touched (same
downgrade-to-sin-datos-only policy). Result: **181 re-judged, 3 retracted, 178
kept** — a 1.7% over-claim rate, vs the LLM layer's ~62%. This confirms the base
is sound and the over-claiming was concentrated in the LLM pass. The 3 retractions
were a biographical claim, a vague operational claim, and a recited legal article
— all correctly ruled unverifiable. Published now: `verificado 155 · parcial 170 ·
sin-datos 4333 · contradicho 0`.

## Optional follow-ups (deferred — NOT libel-blocking)

- A deliberate TED-aware deterministic refresh; full pyserini hybrid retrieval.
  Both are recall refinements; the published state is already conservative and
  honest, and the base/LLM re-judging together leave little over-claiming to chase.

The libel-critical surface is clean (`contradicho 0`) and the published state is
conservative and honest.
