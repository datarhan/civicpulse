# Fact-Checking Rebuild — Phase 1 Results

> Fill this in during **Task 10** (operator-run), after `bash scripts/bootstrap-nli.sh`
> and reviewing ≥~40 rows in `tests/fixtures/verifier-gold.json` (`reviewed:true`).
> Paste the scorecards from `npm run eval:verifier` below.

## Gold set

- Reviewed rows: _TBD_ / 50 (run `npm run eval:gold-prefill -- --sample N` to grow)
- Verdict spread of reviewed rows: _TBD_

## Backend comparison (`npm run eval:verifier -- --verifier <X>`)

| verifier | label-acc | fever | false-contradicho | false-sin-datos | citation P / R |
|---|---|---|---|---|---|
| stored (shipped baseline) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| deterministic | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| current (det + LLM) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| nli (mDeBERTa-xnli) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| nli-minicheck | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## Decision

- Chosen NLI model: _TBD_ (mDeBERTa-xnli vs MiniCheck)
- Tuned thresholds (`NLI_THRESHOLDS` in `src/scraper/claim-verifier-nli.ts`):
  entail=_TBD_ · high=_TBD_ · contra=_TBD_
- Does NLI beat `current` on label accuracy AND false-contradicho? _TBD_
- Regenerate verdicts with NLI? _TBD_ (`npm run verify:pleno-claims:nli`)

## Regeneration sanity check (if NLI chosen)

- Verdict mix before / after: _TBD_
- 24 deterministic `contradicho` preserved? _TBD_
- NLI contradiction-flags raised for curator review: _TBD_ (count + ids)
- `npm test` green: _TBD_
