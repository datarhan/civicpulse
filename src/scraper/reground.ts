/**
 * Re-grounding decision (P2, flag-only) — pure.
 *
 * Given an EXISTING published verdict + the NLI scores of its cited evidence
 * (premise = evidence snippet, hypothesis = claim), decide whether the verdict is
 * insufficiently grounded and should be FLAGGED for curator review. It NEVER
 * changes a verdict — the runner writes a review queue; only the curator CLI
 * (downgrade-verdict) mutates anything.
 *
 *   · verificado / parcial → 'ungrounded' if no cited evidence entails the claim
 *   · contradicho          → 'weak-contradicho' if no cited evidence contradicts it
 *   · sin-datos / promesa-repetida → out of scope (null)
 *   · no evidence → null (nothing to re-ground)
 *
 * Thresholds are tunable on the P1 gold set. See
 * docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md.
 */
import type { ClaimVerdict } from './claim-verifier'

// Calibrated on the reviewed gold (scripts/calibrate-reground.ts, 2026-06-24).
// NLI entailment of a 1-line tender snippet vs a spoken claim is a WEAK separator
// (over-claims + genuine verdicts both cluster low; precision tops ~0.68). 0.2 is
// the best recall/precision balance for verificado/parcial. For contradicho the
// signal is inverted (misfires often have HIGH NLI contradiction), and every
// sampled contradicho was a misfire — so we flag ALL of them for human review
// rather than trust a contradiction score. The gate is a coarse triage, not a
// precise filter; the real over-claiming fix is the P3 verdict engine.
export const REGROUND_THRESHOLDS = {
  /** verificado/parcial below this max entailment → ungrounded. */
  entail: 0.2,
}

export interface RegroundItem {
  claim: { id: string; verbatim: string }
  verification: {
    verdict: ClaimVerdict
    evidence: { ref: string; snippet: string }[]
  }
}

export interface RegroundFlag {
  claimId: string
  verbatim: string
  currentVerdict: ClaimVerdict
  reason: 'ungrounded' | 'contradicho-review'
  maxEntail: number
  maxContra: number
  evidence: { ref: string; snippet: string }[]
}

export function regroundDecision(
  item: RegroundItem,
  evidenceScores: { entailment: number; contradiction: number }[],
): RegroundFlag | null {
  const evidence = item.verification.evidence ?? []
  if (evidence.length === 0) return null

  const maxEntail = evidenceScores.reduce((m, s) => Math.max(m, s.entailment), 0)
  const maxContra = evidenceScores.reduce((m, s) => Math.max(m, s.contradiction), 0)
  const verdict = item.verification.verdict

  const base = {
    claimId: item.claim.id,
    verbatim: item.claim.verbatim,
    currentVerdict: verdict,
    maxEntail,
    maxContra,
    evidence,
  }

  if (verdict === 'verificado' || verdict === 'parcial') {
    if (maxEntail < REGROUND_THRESHOLDS.entail) return { ...base, reason: 'ungrounded' }
    return null
  }
  if (verdict === 'contradicho') {
    // Always flag: NLI contradiction can't distinguish a genuine contradicho from
    // a surface-contradiction misfire, and contradicho is the libel boundary.
    return { ...base, reason: 'contradicho-review' }
  }
  return null // sin-datos / promesa-repetida — out of scope
}
