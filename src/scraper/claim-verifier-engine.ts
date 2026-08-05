/**
 * Verdict engine (P3) — reason-then-format over retrieved candidates, with
 * NEI-by-default + cite-grounding + a consistency gate. Re-derives the
 * over-claiming LLM second-pass verdicts with a method designed NOT to
 * over-claim. Local/$0 (qwen via ollama + mDeBERTa). Upgrade-capable but
 * eval-gated; NEVER emits contradicho (that stays deterministic + curator-only).
 *
 * Pure orchestration — the LLM/NLI work is injected (testable). Reuses P1's
 * cite-grounding (parseCite + looselyContains): a cited value must literally
 * appear in the candidate snippet, so evidence can't be fabricated.
 *
 * See docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-verdict-engine-design.md.
 */
import type { PlenoClaim } from './pleno-claim'
import type {
  CandidateShortlist,
  ClaimEvidence,
  ClaimVerdict,
  ClaimVerification,
} from './claim-verifier'
import { shouldSkipLlmVerification, parseCite, looselyContains } from './claim-verifier-llm'

export interface EngineCite {
  candidateIndex: number
  /** structured cite: `<dataset>[i].<field>=<value> · …` (P1 grounding contract). */
  snippet: string
}

export interface EngineExtract {
  verdict: 'verificado' | 'parcial' | 'sin-datos'
  cites: EngineCite[]
}

export interface EngineDeps {
  /** Free-text reasoning over the candidates (no schema — avoids the "format tax"). */
  reasonFn: (claim: PlenoClaim, candidates: CandidateShortlist[]) => Promise<string>
  /** Extract a verdict + grounded cites from the reasoning. */
  extractFn: (
    reasoning: string,
    claim: PlenoClaim,
    candidates: CandidateShortlist[],
  ) => Promise<EngineExtract>
  /** PCC consistency gate: false → the model isn't confident → force sin-datos. */
  consistencyFn?: (
    claim: PlenoClaim,
    candidates: CandidateShortlist[],
    draftVerdict: ClaimVerdict,
  ) => Promise<boolean>
}

export interface EngineResult {
  verification: ClaimVerification
  upgraded: boolean
}

const CONF = { verificado: 0.9, parcial: 0.6, 'sin-datos': 0.2 } as const

export async function verifyClaimWithEngine(
  inputs: { claim: PlenoClaim; candidates: CandidateShortlist[] },
  deps: EngineDeps,
): Promise<EngineResult | null> {
  if (shouldSkipLlmVerification(inputs.claim)) return null
  if (inputs.candidates.length === 0) return null

  const reasoning = await deps.reasonFn(inputs.claim, inputs.candidates)
  const ext = await deps.extractFn(reasoning, inputs.claim, inputs.candidates)

  // Cite-grounding (reuse P1): index in range + value literally in the snippet.
  let evidence: ClaimEvidence[] = []
  for (const c of ext.cites) {
    if (c.candidateIndex < 0 || c.candidateIndex >= inputs.candidates.length) continue
    const cand = inputs.candidates[c.candidateIndex]
    const cite = parseCite(c.snippet)
    if (!cite) continue
    if (!looselyContains(cand.snippet, cite.value)) continue
    evidence.push({
      kind: cand.kind,
      ref: cand.ref,
      snippet: c.snippet.slice(0, 240),
      similarity: cand.similarity,
      // The engine is NEI-by-default and never emits `contradicho`, so it has
      // no directional finding to record.
      stance: 'checked',
    })
  }

  // NEI-by-default + never contradicho.
  let verdict: ClaimVerdict =
    ext.verdict === 'verificado' || ext.verdict === 'parcial' || ext.verdict === 'sin-datos'
      ? ext.verdict
      : 'sin-datos'
  if (evidence.length === 0) verdict = 'sin-datos'

  // PCC consistency gate — only for would-be upgrades.
  if ((verdict === 'verificado' || verdict === 'parcial') && deps.consistencyFn) {
    const ok = await deps.consistencyFn(inputs.claim, inputs.candidates, verdict)
    if (!ok) {
      verdict = 'sin-datos'
      evidence = []
    }
  }

  return {
    verification: {
      claimId: inputs.claim.id,
      verdict,
      summary: reasoning.slice(0, 300),
      evidence,
      checkedAgainst: ['verdict-engine'],
      confidence: CONF[verdict],
    },
    upgraded: verdict !== 'sin-datos' && evidence.length > 0,
  }
}
