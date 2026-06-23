# Fact-Checking Rebuild — Phase 1 (P0 + P1) Design

> Part of the multi-phase fact-checking rebuild (option **C**, decomposed). This
> spec covers **only Phase 1**: the evaluation harness (P0) and the local NLI
> grounding engine (P1), scoped to the **pleno** claim pipeline. Later phases
> (P2 hybrid retrieval, P3 verdict engine, P4 check-worthiness/normalization,
> P5 claim-matching) get their own specs.

**Goal:** Make verdict quality *measurable* (P0), then replace the metered,
quota-bound LLM "does this evidence support this claim?" decision with a
**local, $0, no-quota NLI grounding model** (P1) — proving the swap is an
accuracy upgrade, not just a cost win.

**Architecture:** A pure scorer + a stratified, human-corrected gold set define
an apples-to-apples `VerifierFn` benchmark. A Python NLI sidecar (mirroring the
existing voice-id/pyannote venv pattern) scores `(evidence, claim)` entailment
in batch; a new `verifyClaimWithNli` plugs into the same socket as today's
`verifyClaimWithLlm`, so the eval harness compares them directly.

**Tech stack:** TypeScript/Node (existing), Python 3.10 venv with
`transformers` + CPU `torch` (new, local-only), `mDeBERTa-v3-xnli` (default
model) / `MiniCheck-Flan-T5-Large` (benchmark), Vitest, the existing
`src/llm` + `src/scraper` infrastructure.

## Global Constraints

- **Local tooling only.** All new ML runs on the operator's Mac, invoked
  on-demand by CLIs, outputs committed as JSON. NOT in nightly GitHub Actions
  CI. Mirrors `bash scripts/bootstrap-voice-id.sh` + the
  `~/.local/civicpulse-pyannote/venv` precedent. New venv:
  `~/.local/civicpulse-nli/venv`.
- **Libel discipline is preserved or strengthened, never loosened.** Every
  existing guard stays: `opinativa` short-circuit, deterministic-before-grounding
  ordering, monotonic upgrades (grounding pass may only upgrade `sin-datos`,
  never downgrade a deterministic verdict), verbatim-quote discipline, bloc-level
  attribution, human curator promotion. `contradicho` is NOT auto-assigned by the
  NLI pass in P1 (see §P1 verdict mapping).
- **No new external dependency / no quota.** P1 must not silently fall back to a
  metered LLM; if the NLI venv is missing it fails loud with a bootstrap hint.
- **TDD cadence** (RED → GREEN → wire), pure logic in `src/`, `fetch`/`spawn`
  only in CLI wrappers + the thin client. `tsc --noEmit` + ESLint stay clean.
- **Data contract unchanged in P1.** P1 keeps writing the existing
  `pleno-claims-verified.json` monolith + chunk shape; the deterministic/overlay
  file split (audit R4/B5) is deferred to P2. P1 adds an `nliAttempted` marker
  mirroring `llmAttempted` for resumability.

---

## Context

The audit (verified against code + the live `pleno-claims-verified.json`) found a
strong libel spine bolted onto a verification core that is mis-targeted, blind to
half its evidence, and gated on a quota we do not need:

- **Verified strengths:** index-only citations + structured-cite parse +
  cite-in-snippet grounding + `contradicho`-needs-flag + zero-evidence→`sin-datos`
  (`claim-verifier-llm.ts:84–213`); triple-enforced `opinativa` skip;
  deterministic-before-LLM with monotonic upgrades; end-to-end verbatim schema.
- **Verified defects feeding this rebuild:** the LLM second pass is **0.7% yield**
  (19 upgrades ever) and quota-bound; `looselyContains` collapses numeric scale
  (`"195000"` "grounds" `"195"`, `claim-verifier-llm.ts:96–107`); LLM `confidence`
  is parsed then dropped (0/4658 populated). A full sin-datos re-verify is
  ~5.5k metered calls across multiple quota windows.
- **SOTA convergence (2024–2026):** the support decision should be a **local NLI
  model** (MiniCheck EMNLP'24 at GPT-4-grade grounding ~400× cheaper;
  `mDeBERTa-v3-xnli` for Spanish). NEI-by-default; never trust verbalized
  confidence; evidence grounded in retrieved snippets, not LLM memory.

**Why NLI is a libel upgrade, not just cheaper:** an NLI model scores a *pair*
`(premise, hypothesis)` and **generates no text**, so it cannot fabricate
evidence. The cited snippet is always a real corpus row, and the `looselyContains`
substring trick (R6) disappears entirely — there is no LLM-produced cite string to
parse. The entailment probability is a *real* confidence number (fixes R1).

**Locked decisions (this session):** deployment = local tooling; start = P0+P1;
gold = our-claims-corrected-from-prefill; batch-spawn Python over an always-on
service; mDeBERTa-xnli default with MiniCheck benchmarked; P1 swaps the grounding
engine but keeps today's verdict labels (full taxonomy work is P3).

## Scope

**In scope (Phase 1):**
1. P0 — gold-set tooling, pure scorer, `VerifierFn` seam, `npm run eval:verifier`.
2. P1 — NLI Python sidecar + bootstrap, `nli-client.ts`, `verifyClaimWithNli`,
   `npm run verify:pleno-claims:nli` (corpus-loaded-once, batched), `nliAttempted`
   resumability.

**Out of scope (later phases / deferred):**
- Hybrid BM25+dense retrieval, wiring TED/`priorClaims` into the deterministic
  runner, the deterministic/overlay file split (→ **P2**).
- New verdict taxonomy (conflicting/cherry-picking label), consistency-based
  confidence, re-examining `parcial`, reason-then-format verdict model (→ **P3**).
- Check-worthiness triage + claim normalization (→ **P4**).
- Claim-matching vs prior findings (→ **P5**).
- The press pipeline (inherits the shared core later).
- Any change to `/metodologia` published copy (only update when a *published*
  verdict's behavior changes; P1 is measured offline before any live regen).

---

## P0 — Evaluation harness + gold set

### Gold set

Authoritative labels are *our* claims judged against *our* corpus. External
datasets (X-FACT, CheckThat-ES) do not fit the retrieve-from-curated-corpus
contract and are reserved for P4.

**File:** `tests/fixtures/verifier-gold.json`
```jsonc
{
  "version": 1,
  "generatedAt": "<ISO>",          // stamped by the prefill CLI
  "rows": [
    {
      "claimId": "string",          // must exist in pleno-claims-verified.json
      "verbatim": "string",         // copied in for human readability
      "claimType": "promesa|afirmacion_numerica|cita_obra|cita_convenio|acusacion_publica",
      "goldVerdict": "verificado|parcial|contradicho|sin-datos|promesa-repetida",
      "goldEvidenceRefs": ["string"],// optional; refs that SHOULD be cited
      "reviewed": false,             // ONLY reviewed:true rows are scored
      "notes": "string"              // optional rationale
    }
  ]
}
```

**Prefill helper:** `scripts/eval-gold-prefill.ts` → `npm run eval:gold-prefill -- [--sample 50]`
- Reads `pleno-claims-verified.json`, draws a **stratified** sample across
  `verdict × claimType` buckets (proportional, min 1 per non-empty bucket up to
  `--sample`), writes rows with `goldVerdict`/`goldEvidenceRefs` pre-filled from
  the *current* verification and `reviewed:false`.
- **Idempotent merge by `claimId`:** never overwrites or unsets a row already
  `reviewed:true` (human labels are sacred); refreshes only unreviewed rows; may
  append new unreviewed rows. Deterministic ordering (sort by claimId) for clean
  diffs. Sampling uses a fixed seed passed in (no `Math.random` — seed derived
  from claimId hash) so reruns are stable.
- The curator edits the file, flipping `reviewed:true` and correcting any wrong
  `goldVerdict`/`goldEvidenceRefs`. Correcting-from-prefill is far faster than
  labeling blank.

### Scorer (pure)

**File:** `src/lib/verifier-eval.ts`
```ts
export interface GoldRow { claimId: string; claimType: string; goldVerdict: ClaimVerdict
  goldEvidenceRefs?: string[]; reviewed: boolean }
export interface Scorecard {
  n: number                         // reviewed rows scored
  labelAccuracy: number
  perVerdict: Record<ClaimVerdict, { precision: number; recall: number; f1: number; support: number }>
  confusion: Record<string, Record<string, number>>   // gold → pred → count
  falseContradichoRate: number      // pred=contradicho & gold!=contradicho, over n  (LIBEL-CRITICAL)
  falseSinDatosRate: number         // gold!=sin-datos & pred=sin-datos, over rows with gold!=sin-datos (recall miss)
  citation: { precision: number; recall: number; f1: number; rowsWithGoldRefs: number }
  feverScore: number                // fraction with correct label AND gold refs ⊆ predicted refs
}
export function scoreVerifier(
  predictions: Map<string, ClaimVerification>, gold: GoldRow[],
): Scorecard
```
**Metric definitions (precise):**
- Only `reviewed:true` rows count; a gold row with no matching prediction →
  treated as predicted `sin-datos` with empty evidence (a verifier that skips a
  claim is scored as "no verdict").
- Per-verdict precision/recall/f1 from the confusion matrix; `support` = gold
  count of that verdict.
- **Citation** (rows with `goldEvidenceRefs`, micro-averaged): let `P` = predicted
  evidence refs, `G` = gold refs. precision = `Σ|P∩G| / Σ|P|`, recall =
  `Σ|P∩G| / Σ|G|`, f1 = harmonic mean. Rows with empty `P` contribute 0 to the
  precision numerator and `|P|=0` to its denominator (skip in precision denom;
  count in recall denom).
- **FEVER-style:** a row passes iff `predVerdict == goldVerdict` AND
  (`goldEvidenceRefs` absent/empty OR `G ⊆ P`). `feverScore = passes / n`.

### The VerifierFn seam

**File:** `src/scraper/verifier-runner.ts`
```ts
export interface VerifierContext {   // datasets + corpus, loaded ONCE
  tenders: unknown; tendersTed: unknown; bdns: unknown; budget: unknown
  promises: unknown; priorClaims: PlenoClaim[]
  corpus: import('./semantic-shortlist').Corpus | null   // preloaded; null = lexical-only
}
export type VerifierFn = (claim: PlenoClaim, ctx: VerifierContext) => Promise<ClaimVerification>
export function loadVerifierContext(opts?: { withCorpus?: boolean }): VerifierContext

// Named verifiers under test:
export const deterministicVerifier: VerifierFn   // verifyClaim() only
export const currentVerifier: VerifierFn          // verifyClaim → if sin-datos, verifyClaimWithLlm
export const nliVerifier: VerifierFn              // verifyClaim → if sin-datos, verifyClaimWithNli  (P1)
```
- `loadVerifierContext` loads every dataset (including `tendersTed` +
  `priorClaims`, which the production deterministic runner currently omits — the
  eval exercises the *correct* wiring so P0 also measures the R3 gap) and
  optionally preloads the embedding corpus once.
- `currentVerifier` mirrors today's production 2-pass (deterministic then LLM on
  sin-datos) so the baseline reflects shipped behavior.

### Eval CLI

`scripts/eval-verifier.ts` → `npm run eval:verifier -- --verifier deterministic|current|nli|nli-minicheck [--gold tests/fixtures/verifier-gold.json] [--json]`
- Loads gold + context once, runs the chosen `VerifierFn` over each reviewed
  gold claim, prints a Markdown scorecard table to stdout, and writes
  `eval/scorecards/<verifier>-<stamp>.json`.
- `eval/` is gitignored; the Phase-1 baseline + final comparison numbers are
  recorded in the PR description and `docs/superpowers/specs/.../phase1-results.md`.
- If `--verifier nli*` and the NLI venv is unavailable, exit non-zero with the
  bootstrap hint (do not silently skip).

### P0 testing
- `src/lib/verifier-eval.test.ts` — confusion matrix, per-verdict P/R/F1,
  `falseContradichoRate`, `falseSinDatosRate`, citation micro-P/R, FEVER-score, and
  the "missing prediction = sin-datos" rule, all on synthetic gold+pred fixtures.
- `scripts/eval-gold-prefill` — unit-test stratification proportions + the
  idempotent merge (reviewed rows preserved, unreviewed refreshed, stable order).

---

## P1 — Local NLI grounding engine

### Python sidecar

- **Venv:** `~/.local/civicpulse-nli/venv` (`transformers`, CPU `torch`,
  `sentencepiece`).
- **Bootstrap:** `scripts/bootstrap-nli.sh` — detect `python3.10`; create venv;
  `pip install`; pre-download `NLI_MODEL` (default
  `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`) and, if
  `--minicheck`, `lytang/MiniCheck-Flan-T5-Large`; run a one-pair smoke test;
  exit non-zero with a punch list if anything is missing. Mirrors
  `bootstrap-voice-id.sh`.
- **Scorer:** `scripts/nli/nli_score.py`
  - Reads JSONL from stdin: `{"id": str, "premise": str, "hypothesis": str}`.
  - Loads the model **once** (`NLI_MODEL` env; `NLI_BATCH` default 16).
  - mDeBERTa path → emits `{"id", "entailment": float, "neutral": float,
    "contradiction": float, "label": "entailment|neutral|contradiction"}`.
  - MiniCheck path (`NLI_MODEL=minicheck`) → support prob `s`; emit
    `{"id", "entailment": s, "neutral": 1-s, "contradiction": 0.0,
    "label": s>=0.5?"entailment":"neutral"}` (MiniCheck does not model
    contradiction).
  - One JSONL line out per input line; flushes stdout.

### Node client

**File:** `src/scraper/nli-client.ts`
```ts
export interface NliPair { id: string; premise: string; hypothesis: string }
export interface NliScore { id: string; entailment: number; neutral: number; contradiction: number; label: 'entailment'|'neutral'|'contradiction' }
export async function scoreNliPairs(pairs: NliPair[], opts?: { model?: string; venv?: string; timeoutMs?: number }): Promise<Map<string, NliScore>>
```
- Spawns the venv Python once, writes all pairs as JSONL to stdin, parses JSONL
  stdout into a `Map`. (Batch-spawn — one process per run, no ports — consistent
  with `transcribe-pleno.sh`.)
- Venv/model missing → throws `NliUnavailableError` with the bootstrap hint.
  Timeout / non-zero exit → throws. Never falls back to a metered backend.

### Verifier variant

**File:** `src/scraper/claim-verifier-nli.ts`
```ts
export interface NliVerifierResult {
  verification: ClaimVerification       // includes confidence (entailment prob)
  upgraded: boolean
  nliContradictionFlag: boolean         // advisory only; never auto-publishes contradicho
}
export async function verifyClaimWithNli(
  inputs: { claim: PlenoClaim; candidates: CandidateShortlist[] },
  scorer: typeof scoreNliPairs = scoreNliPairs,
): Promise<NliVerifierResult | null>
```
- Reuses `shouldSkipLlmVerification` (opinativa → null). Empty candidates → null.
- **Hypothesis = `claim.verbatim`** (P1; P4 normalization improves this later).
  **Premise = `candidate.snippet`** (a real corpus row). One `NliPair` per
  candidate.
- **Verdict mapping (P1 — conservative, upgrade-only, mirrors `verifyClaimWithLlm`'s contract):**
  - `supports` = candidates with `entailment ≥ τ_entail`.
  - `bestEntail` = max entailment over candidates.
  - If `supports` non-empty:
    - `verificado` if `bestEntail ≥ τ_high`; else `parcial`.
    - `evidence[]` = the supporting candidates (kind, ref, snippet, similarity),
      sorted by entailment desc.
    - `confidence = bestEntail`.
  - Else → `sin-datos` (no upgrade), `confidence = bestEntail` (low).
  - **`contradicho` is never produced here.** A candidate with
    `contradiction ≥ τ_contra` sets `nliContradictionFlag=true` for curator
    review but leaves the verdict at `sin-datos`. Refutation stays the
    deterministic verifier's job (amount/entity disparity) + P3 — this preserves
    the 24 deterministic `contradicho` verdicts and the libel boundary.
- **Thresholds** `τ_entail` (parcial floor), `τ_high` (verificado floor),
  `τ_contra` (flag) start at `0.55 / 0.90 / 0.90` and are **tuned on the P0 gold
  set** (the harness exists for exactly this). Defaults live in one exported
  const block.

### NLI runner (efficient, resumable)

**File:** `scripts/verify-pleno-claims-nli.ts` → `npm run verify:pleno-claims:nli -- [--concurrency N] [--max N] [--plenoId ID]`
1. Load `pleno-claims-verified.json` + `loadVerifierContext({withCorpus:true})`
   **once** (fixes audit B1 — corpus is no longer re-parsed per claim).
2. Candidates = `sin-datos`, non-`opinativa`, `!nliAttempted` (+ optional
   `--plenoId`).
3. **Batch-embed** all candidate-claim query texts up front (one `embedTexts`
   call set), build each claim's shortlist via `getShortlist` with the
   **preloaded corpus** passed in (see refactor below).
4. Collect **all** `(claimId, candidateIdx, premise, hypothesis)` pairs across all
   claims → **one** `scoreNliPairs` call (single model load, batched inference).
5. Assign verdicts per claim via `verifyClaimWithNli` using the looked-up scores;
   upgrade `sin-datos` only; stamp `nliAttempted=true` on every evaluated claim;
   record `nliContradictionFlag` claims to stderr + a side report for the curator.
6. Checkpoint-flush every 100 claims + on SIGINT/SIGTERM (reuse the existing
   pattern). Refresh chunks at the end (reuse `rewriteChunksFromMonolith`).

**Supporting refactor (minimal):** `getShortlist(inputs, topK, opts)` gains
`opts.corpus?: Corpus` — when provided, it skips `loadCorpus` (the per-call 10 MB
reparse). Backward-compatible; the LLM runner is unchanged.

### P1 testing
- `src/scraper/nli-client.test.ts` — pair → JSONL serialization; JSONL → Map
  parse; `NliUnavailableError` on a stubbed missing venv; timeout path. Python is
  stubbed (spawn a tiny `cat`-like fake or inject a fake scorer).
- `src/scraper/claim-verifier-nli.test.ts` — verdict mapping against mocked
  `NliScore`s: `bestEntail≥τ_high → verificado`; mid → `parcial`; low →
  `sin-datos`; opinativa → null; empty candidates → null; a high-contradiction
  candidate → `sin-datos` + `nliContradictionFlag=true` (NOT contradicho);
  `confidence` equals `bestEntail`; evidence cites only real candidates.
- `getShortlist` corpus-passthrough — preloaded corpus is used, `loadCorpus` not
  called (spy).
- Python smoke covered by `bootstrap-nli.sh` (not a Vitest test).

---

## Data flow (Phase 1)

```
P0:  pleno-claims-verified.json ──prefill──▶ verifier-gold.json ──(human review)──▶ reviewed rows
        │                                                                              │
        └── loadVerifierContext (datasets + corpus, once) ─┐                           │
                                                           ▼                           ▼
                       VerifierFn(deterministic|current|nli) over gold claims ──▶ scoreVerifier ──▶ scorecard
                                                                                       (compare backends → pick model + thresholds)

P1:  sin-datos claims ─shortlist(preloaded corpus)─▶ (premise=snippet, hypothesis=verbatim) pairs
        └─ ONE scoreNliPairs (local mDeBERTa/MiniCheck, $0) ─▶ verifyClaimWithNli ─▶ upgrade sin-datos only
                                                                    │
                                          pleno-claims-verified.json (nliAttempted markers) ─▶ chunks
```

## Error handling
- NLI venv/model missing → `NliUnavailableError` + bootstrap hint; runner and
  `eval --verifier nli` abort loud (never silent LLM fallback → no quota
  surprise).
- Gold file missing/empty/no reviewed rows → eval CLI errors with the
  `eval:gold-prefill` hint.
- Python crash/timeout → propagate; checkpoint already flushed protects progress.
- Corpus missing → `loadVerifierContext({withCorpus:true})` returns `corpus:null`;
  shortlist degrades to lexical (existing behavior).

## Risks & follow-ups
- **Verbatim as NLI hypothesis is noisy** (rambling Spanish quotes). Accepted for
  P1; P4 claim-normalization is the fix. The gold set will reveal how much this
  costs.
- **mDeBERTa Spanish quality on municipal jargon** is unproven — that is *why*
  P0 lands first and benchmarks mDeBERTa vs MiniCheck before any live regen.
- **Single-file mutation footgun (R4/B5)** persists in P1 (nliAttempted mitigates
  re-spend, but a deterministic re-run still rewrites the file). The
  deterministic/overlay split is the first task of **P2**.
- **Thresholds** are data-tuned, not guessed — but a tiny gold set risks
  overfitting; grow it past ~50 reviewed rows before trusting threshold choices.

## Self-review
- *Placeholders:* none — every file path, interface, metric, and threshold is
  concrete.
- *Consistency:* `VerifierFn`/`VerifierContext` names match across P0 and the P1
  runner; `verifyClaimWithNli` mirrors `verifyClaimWithLlm`'s
  null/upgrade-only/return contract; `nliAttempted` mirrors `llmAttempted`.
- *Scope:* P0+P1 only; TED/priorClaims wiring is *exercised in the eval context*
  but the production deterministic-runner fix + file split are explicitly P2.
- *Libel:* the one new verdict-producing path (`verifyClaimWithNli`) is
  upgrade-only, cites real corpus snippets, and cannot emit `contradicho` — a
  strictly smaller hallucination surface than the LLM pass it replaces.
```
