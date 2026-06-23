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

export const REGROUND_THRESHOLDS = {
  /** verificado/parcial below this max entailment → ungrounded. */
  entail: 0.5,
  /** contradicho below this max contradiction → weak-contradicho. */
  contra: 0.5,
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
  reason: 'ungrounded' | 'weak-contradicho'
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
    if (maxContra < REGROUND_THRESHOLDS.contra) return { ...base, reason: 'weak-contradicho' }
    return null
  }
  return null // sin-datos / promesa-repetida — out of scope
}
