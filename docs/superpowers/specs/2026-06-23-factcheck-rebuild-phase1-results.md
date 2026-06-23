# Fact-Checking Rebuild — Phase 1 Results (2026-06-23)

Task 10 run by the assistant. **Important caveat:** the comparison below uses an
**AI-provisional gold** (`tests/fixtures/verifier-gold-ai-provisional.json`),
labeled conservatively/libel-leaning by the model — **NOT human-verified**. The
real gold (`tests/fixtures/verifier-gold.json`) is still `reviewed:false` and
awaits the curator. Numbers are **directional**, not final.

## Bootstrap

✅ `bash scripts/bootstrap-nli.sh` succeeded. mDeBERTa-v3-xnli loads + scores
Spanish correctly — smoke pair (`"…adjudicó la obra…por 482.000 euros"` vs
`"…costó 482000 euros"`) → **entailment 0.983**. venv at
`~/.local/civicpulse-nli/venv`. (MiniCheck not installed — `--minicheck` skipped.)

## Backend comparison (n=50, AI-provisional gold)

Provisional gold spread: sin-datos 36 · parcial 12 · verificado 2 · **contradicho 0**
(I judged all 10 sampled `contradicho` to be over-claims — garbled transcript,
coincidental matches, or accusations).

| verifier | label-acc | fever | **false-contradicho** | false-sin-datos |
|---|---|---|---|---|
| stored (shipped det+LLM) | 48.0% | 48.0% | **20.0%** | 0.0% |
| deterministic (det only) | 70.0% | 70.0% | 0.0% | 57.1% |
| **nli (det + mDeBERTa)** | **72.0%** | **72.0%** | **0.0%** | 42.9% |

Per-verdict (nli): verificado P50/R100/F67 · parcial P46/R42/F44 · sin-datos P83/R81/F82.

### Reading
- **Shipped verdicts over-claim.** `stored` agrees with conservative review only
  48% of the time and shows a **20% false-contradicho rate** — the libel-critical
  finding the audit predicted, now measured. (`stored` was not built to match my
  conservatism, so this disagreement signal is **not circular**.)
- **NLI matches/beats on accuracy and is structurally false-contradicho-proof**
  (it never emits contradicho). The 72%-vs-48% edge is **partly circular** (NLI's
  conservatism aligns with the AI gold), but the **0% false-contradicho is
  structural**, not circular — that's the real libel win.
- NLI ran on **lexical shortlists** (ollama was down) — a floor; semantic
  shortlists should only help.

## Runner validation (real data, 200-claim subset)

`npm run verify:pleno-claims:nli -- --max 200` ran end-to-end: corpus preloaded,
shortlists built, NLI batch scored, `contradicho` preserved at **24**, resumable
(`nliAttempted=200`), chunks refreshed, **$0 / no quota**. Then reverted (no
provisional-gold-based regen committed).

**Upgrades = 0 on the first 200.** At default thresholds (entail 0.55 / high 0.90)
+ lexical shortlist, NLI is very conservative — the safe failure mode. Meaningful
upgrade yield needs (a) ollama up for semantic shortlists and (b) threshold tuning
on the **human** gold.

## Decision / next steps (before a production regen)

1. **Curator reviews the real gold** `tests/fixtures/verifier-gold.json` — set
   `reviewed:true`, correct labels. The `contradicho`/accusation rows are the
   libel-critical judgment and must be human.
2. `ollama serve` + `ollama pull nomic-embed-text`, then re-run
   `npm run eval:verifier -- --verifier nli` (semantic shortlists).
3. Tune `NLI_THRESHOLDS` (`src/scraper/claim-verifier-nli.ts`) on the human gold —
   trade upgrade yield vs precision.
4. If NLI holds up on human gold → `npm run verify:pleno-claims:nli`, confirm the
   24 deterministic `contradicho` survive, `npm test`, commit the regenerated data.

## Verdict on the rebuild

**Validated as working and directionally better**, especially on the
libel-critical axis (false-contradicho: 20% → 0%). The machinery is $0/no-quota
(retires the Antigravity wall). Final accuracy numbers + the production regen
gate on human gold review + threshold tuning.
