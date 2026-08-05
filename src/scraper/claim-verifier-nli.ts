/**
 * NLI grounding verifier (P1) — the local, $0, no-quota replacement for the
 * metered LLM support-decision.
 *
 * For each shortlist candidate, an NLI model scores entailment of the claim
 * (hypothesis) by the candidate snippet (premise). Because the model scores a
 * PAIR and generates no text, it cannot fabricate evidence — the cited snippet
 * is always a real corpus row, and the LLM-cite substring trick (audit R6)
 * cannot occur.
 *
 * Contract mirrors verifyClaimWithLlm: upgrade-only (sin-datos → verificado /
 * parcial), cites only real candidates, returns null for opinativa / empty
 * candidates. It NEVER emits `contradicho` — a strong contradiction only raises
 * `nliContradictionFlag` for curator review, preserving the deterministic
 * verifier's refutation authority and the libel boundary.
 */
import type { PlenoClaim } from './pleno-claim'
import type {
  CandidateShortlist,
  ClaimEvidence,
  ClaimVerdict,
  ClaimVerification,
} from './claim-verifier'
import { shouldSkipLlmVerification } from './claim-verifier-llm'
import { scoreNliPairs, type NliPair, type NliScore } from './nli-client'

/** Tunable on the P0 gold set (Task 10). */
export const NLI_THRESHOLDS = {
  /** parcial floor. */
  entail: 0.55,
  /** verificado floor. */
  high: 0.9,
  /** contradiction-flag floor (advisory only). */
  contra: 0.9,
}

export interface NliVerifierResult {
  verification: ClaimVerification
  /** true iff the verdict was upgraded out of sin-datos with ≥1 cited evidence. */
  upgraded: boolean
  /** A candidate contradicted the claim above threshold — for curator review. */
  nliContradictionFlag: boolean
}

export type NliScorer = (pairs: NliPair[]) => Promise<Map<string, NliScore>>

export async function verifyClaimWithNli(
  inputs: { claim: PlenoClaim; candidates: CandidateShortlist[] },
  scorer: NliScorer = scoreNliPairs,
): Promise<NliVerifierResult | null> {
  if (shouldSkipLlmVerification(inputs.claim)) return null
  if (inputs.candidates.length === 0) return null

  const hypothesis = inputs.claim.verbatim
  const pairs: NliPair[] = inputs.candidates.map((c, i) => ({
    id: String(i),
    premise: c.snippet,
    hypothesis,
  }))
  const scores = await scorer(pairs)

  let bestEntail = 0
  let bestContra = 0
  const supports: { idx: number; entail: number }[] = []
  inputs.candidates.forEach((_, i) => {
    const s = scores.get(String(i))
    if (!s) return
    if (s.entailment > bestEntail) bestEntail = s.entailment
    if (s.contradiction > bestContra) bestContra = s.contradiction
    if (s.entailment >= NLI_THRESHOLDS.entail) supports.push({ idx: i, entail: s.entailment })
  })

  const nliContradictionFlag = bestContra >= NLI_THRESHOLDS.contra

  if (supports.length === 0) {
    return {
      verification: {
        claimId: inputs.claim.id,
        verdict: 'sin-datos',
        summary:
          'Sin evidencia que respalde la afirmación en el corpus (NLI por debajo del umbral).',
        evidence: [],
        checkedAgainst: ['nli-grounding'],
        confidence: bestEntail,
      },
      upgraded: false,
      nliContradictionFlag,
    }
  }

  supports.sort((a, b) => b.entail - a.entail)
  const verdict: ClaimVerdict = bestEntail >= NLI_THRESHOLDS.high ? 'verificado' : 'parcial'
  const evidence: ClaimEvidence[] = supports.map(({ idx }) => {
    const c = inputs.candidates[idx]
    // `stance: 'checked'` even at high entailment: this module never emits
    // `contradicho` (see the header), and reground.ts records that the NLI
    // signal is inverted often enough that it is triage, not a finding.
    return {
      kind: c.kind,
      ref: c.ref,
      snippet: c.snippet,
      similarity: c.similarity,
      stance: 'checked' as const,
    }
  })

  return {
    verification: {
      claimId: inputs.claim.id,
      verdict,
      summary:
        verdict === 'verificado'
          ? 'La evidencia citada respalda la afirmación (entailment NLI alto).'
          : 'La evidencia citada respalda parcialmente la afirmación (entailment NLI moderado).',
      evidence,
      checkedAgainst: ['nli-grounding'],
      confidence: bestEntail,
    },
    upgraded: true,
    nliContradictionFlag,
  }
}
