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

| metric | engine | deterministic | LLM pass |
|---|---|---|---|
| label-accuracy | **67.2%** | 65.6% | ~48% |
| false-sin-datos | **27.3%** | 54.5% | — |
| false-contradicho | 0% | 0% | 20% |
| sin-datos precision | **~92%** | 86% | — |

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
  verdict set *from* the gold review (curator downgrades), so that figure is partly
  circular; the clean independent measure is the engine's 67.2%.
- **51 `verificado→sin-datos` retractions: 0 carry a € amount** — all are
  non-numeric procedural/internal statements the LLM had over-claimed. Clean.
- **15 amount-bearing retractions** (all `parcial→sin-datos`), eyeballed: mostly
  vague/program/penalty figures correctly ruled unverifiable (€24M program totals,
  €143k penalty expedientes). Sound in direction.
- **Known limitation:** the production run used **lexical** shortlists, so a few
  specific amount claims (e.g. €35,252.87 cartelería, €126k ministry grant) may
  have a real match the lexical retrieval missed. A lexical miss errs **conservative**
  (the verdict honestly says "not attested by the open-data trail" → a recall loss,
  never a false claim about an official).

## Optional follow-ups (deferred — NOT libel-blocking)

- A **semantic/hybrid-shortlist re-check** of the amount-bearing `sin-datos` to
  surface any genuine match lexical missed — but only as curator *suggestions*
  (auto-upgrading is the libel-risky direction; the engine's upgrade precision is
  low). Needs `ollama serve` + nomic-embed.
- A deliberate TED-aware deterministic refresh (tighten the R2 0.5 parcial floor
  first); full pyserini hybrid retrieval.

The libel-critical surface is clean (`contradicho 0`) and the published state is
conservative and honest.
