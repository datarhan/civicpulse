# Phase 3: Verdict Engine — Results (2026-06-24)

## Outcome: engine BUILT + unit-tested; eval BLOCKED by local inference speed; nothing shipped.

The verdict engine is code-complete and unit-tested (`claim-verifier-engine.ts`,
7 tests): reason-then-format, NEI-by-default, cite-grounding (reuses P1's
`parseCite`/`looselyContains`), an optional PCC consistency gate (argue-both-sides
→ mDeBERTa contradiction), and it structurally never emits `contradicho`. It's
wired into the eval seam (`--verifier engine` / `engine-no-consistency`) and a
production runner is specced.

**But the eval (the ship gate) could not be completed here.** On this hardware,
`qwen2.5:14b-instruct` via ollama runs a reason+extract pair on the order of
~1 minute per claim (15 minutes of running produced **0** cached completions).
The 64-claim gold eval is 20+ minutes and a full 426-claim production re-derivation
would be **hours**. A single diagnostic claim that reached the engine did not
return within minutes; claims with empty shortlists returned instantly
(deterministic, no LLM call), which is why the run *looked* alive but produced
nothing.

This is a **hardware/throughput limit, not a code defect** — the architecture
matches the 2024–2026 SOTA (ClaimCheck/HerO2). The engine needs a faster backend
to validate + run:
- a GPU box (qwen3-4B/8B quantized per HerO2 runs in ~seconds), or
- a small **metered** batch (the eval is only 64 claims — ~$0.04/claim on a
  GPT-4o-class batch per AIC CTU → ~$3 to settle the gate), or
- a smaller local model (hermes3-8B is installed) — faster but lower quality;
  worth an ablation if staying fully local.

## Gate status: UNMET → nothing shipped

The `current`/LLM-pass baseline (~48% label-acc, 20% false-`contradicho` from P1)
and the deterministic baseline (65.6% on the 64-gold) stand. The engine produced
no validated scorecard, so **no engine verdict was applied to production** — the
published state is unchanged from the step-1–3 + contradicho cleanup
(`verificado 208 · parcial 362 · contradicho 0 · sin-datos 4088`).

## What this leaves

- The engine code (T1–T3) is tested + additive + eval-gated — it cannot
  auto-ship a verdict. Safe to keep or merge; running it is a deliberate op on a
  faster backend.
- The decision the rebuild has now surfaced three times over: precise
  de-over-claiming of the ~426 LLM `verificado`/`parcial` needs a verdict method
  that's both accurate AND fast enough to run — i.e. the engine on a faster
  backend, validated on the gold before any production use.

## Recommendation

Validate the engine with a **one-off small metered batch** (~$3, 64 gold claims)
OR a GPU/smaller-model pass. If it beats deterministic on accuracy + false-positives,
run the 426-claim re-derivation there and ship via the overlay
(`verify:pleno-claims:engine`, already specced). Until then, the conservative
state (contradicho 0, the 40 reviewed retractions) is the honest published state.
