# Fact-Checking Rebuild — Phase 1 Results (2026-06-23)

Task 10, run by the assistant. The gold set `tests/fixtures/verifier-gold.json`
was reviewed **by the model** (Claude Opus 4.8), conservatively/libel-leaning,
with per-row reasons + a `reviewer: ai-opus-4.8` marker on every row. **It is not
human-verified** — the curator should spot-check the downgrades (especially the
former-`contradicho` rows) before treating it as ground truth.

## Bootstrap

✅ `bash scripts/bootstrap-nli.sh` succeeded. mDeBERTa-v3-xnli loads + scores
Spanish — smoke pair (`"…adjudicó la obra…por 482.000 euros"` vs `"…costó 482000
euros"`) → **entailment 0.983**. venv at `~/.local/civicpulse-nli/venv`.

## The gold review itself (the headline finding)

Reviewing all 50 against full verbatim + context + entities + untruncated
evidence, the labels moved sharply toward **sin-datos**:

| verdict | shipped sample | after review |
|---|---|---|
| verificado | 10 | **2** |
| parcial | 15 | **9** |
| contradicho | 10 | **0** |
| sin-datos | 15 | **39** |

**All 10 sampled `contradicho` were misfires** — garbled transcript
(`"Deixan pleca de fútbol…"`), wrong-entity matches (an accusation about a
*company's* vehicles matched to the *Ayuntamiento's* own vehicle tenders),
degenerate repeated fragments, or factual accusations the cited contract does
not actually refute (one DANA-emergency contract ≠ proof DANA funds were
misused). Several `verificado` were coincidental keyword hits
(whistleblower-law recitation → `"Servicio postal"` at similarity 1.0).

## Backend comparison (reviewed gold, n=50)

| verifier | label-acc | fever | **false-contradicho** | false-sin-datos | citation P/R |
|---|---|---|---|---|---|
| stored (shipped det+LLM) | 48.0% | 48.0% | **20.0%** | 0.0% | 100/100 ⚠ |
| deterministic (det only) | 74.0% | 70.0% | 0.0% | 54.5% | 60/18 |
| **nli (det + mDeBERTa)** | **76.0%** | 68.0% | **0.0%** | 36.4% | 57/24 |

⚠ `stored` citation P/R is **circular** — the gold evidence refs were seeded from
the stored evidence for the 11 verificado/parcial rows, so stored matches itself
trivially. Discount it.

### Reading
- **Shipped verdicts over-claim badly:** 48% agreement with conservative review,
  **20% false-`contradicho`**. Re-running the deterministic verifier alone scores
  74% with **0** false-`contradicho` — i.e. the false-`contradicho` is generated
  by the **LLM second pass**, not the deterministic layer. (`stored`'s
  disagreement with my labels is *not* circular — it wasn't built to match them.)
- **NLI gives the best label accuracy (76%) while staying structurally
  false-`contradicho`-proof (0%)**, edging deterministic by recovering true
  verificado/parcial (verificado recall 50%→100%, false-sin-datos 54.5%→36.4%).
- The 76%-vs-48% gap is *partly* circular (NLI's conservatism aligns with the AI
  gold); the **0% false-`contradicho` is structural**, not circular — the libel win.
- NLI ran on **lexical shortlists** (ollama was down) — a floor; semantic
  shortlists should only help.

## Runner validation (real data, 200-claim subset)

`verify:pleno-claims:nli -- --max 200` ran end-to-end: corpus preloaded,
shortlists built, NLI batch-scored, **`contradicho` preserved at 24**, resumable
(`nliAttempted=200`), chunks refreshed, **$0 / no quota**. Then reverted (no
production regen committed). **Upgrades = 0 on the first 200** at default
thresholds + lexical shortlist — the safe conservative mode; the eval's stratified
sample shows NLI *does* rescue true positives where they exist, so yield is low
but precise.

## Decision / next steps (before a production regen)

1. **Curator spot-checks the AI-reviewed gold** `tests/fixtures/verifier-gold.json`
   — especially the former-`contradicho` rows (the libel-critical call).
2. `ollama serve` + `ollama pull nomic-embed-text` → re-run `eval:verifier
   --verifier nli` with semantic shortlists.
3. Tune `NLI_THRESHOLDS` (`src/scraper/claim-verifier-nli.ts`) for the
   yield/precision trade-off you want.
4. If NLI holds up → `npm run verify:pleno-claims:nli`, confirm the 24
   deterministic `contradicho` survive, `npm test`, commit the regenerated data.

## Verdict on the rebuild

**Validated.** The eval harness measurably exposes that the shipped pipeline
over-claims (48% agreement, 20% false-`contradicho`), and the local NLI path is
both more accurate (76%) and structurally libel-safer (0% false-`contradicho`) —
at $0/no quota. Final production numbers gate on human spot-check + threshold
tuning, but the direction is clear: the LLM second pass should be replaced by the
local NLI grounding pass.
