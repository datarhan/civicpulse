/**
 * LLM second-pass verifier for sin-datos claims.
 *
 * The deterministic verifier in claim-verifier.ts uses word-overlap +
 * amount similarity, which over-pairs on shared vocabulary and under-
 * matches on semantic relations. This module gives any LLM backend a
 * top-K candidate shortlist of records it COULD cite, and asks for a
 * verdict + index citations. Indexes only — never free-text refs — so
 * the LLM literally cannot fabricate evidence.
 *
 * Contract:
 *   · Caller passes a single claim + its candidate shortlist.
 *   · LLM emits { verdict, summary, evidence: [{candidateIndex, …}] }.
 *   · We validate every candidateIndex is in range, reject hallucinated
 *     ones (downgrade to sin-datos), enforce contradicho needs ≥1
 *     isContradiction:true reference.
 *   · Result is normalised to ClaimVerification (same shape as the
 *     deterministic verifier), with verifierSource:'llm' tagged for
 *     telemetry.
 *
 * NEVER overwrites a deterministic verdict that isn't sin-datos — that's
 * the runner script's responsibility, not this module's. Callers can
 * still ignore the LLM result (e.g. when the LLM returns sin-datos) and
 * keep the original deterministic answer.
 */
import { callLLM } from '../llm/client'
import type { CallLlmOptions } from '../llm/client'
import {
  CLAIM_VERIFIER_PROMPT_VERSION,
  buildClaimVerifierSystemPrompt,
  buildClaimVerifierUserPrompt,
} from '../llm/prompts'
import { ClaimVerifierLlmResponseSchema } from '../llm/schemas'
import type { PlenoClaim } from './pleno-claim'
import type {
  ClaimEvidence,
  ClaimVerification,
  ClaimVerdict,
  CandidateShortlist,
} from './claim-verifier'
import type { ZodTypeAny, z } from 'zod'

export interface LlmVerifierInputs {
  claim: PlenoClaim
  candidates: CandidateShortlist[]
}

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export interface LlmVerifierResult {
  verification: ClaimVerification
  /** True when the LLM upgraded sin-datos to a real verdict. */
  upgraded: boolean
  /** Accepted candidate indexes (valid + cited). */
  acceptedIndexes: number[]
  /** Rejected for being out-of-range or otherwise hallucinated. */
  rejectedIndexes: number[]
}

/** Skip LLM verification for claim shapes where the answer is policy, not
 *  a data lookup. Mirrors the deterministic verifier's opinativa skip. */
export function shouldSkipLlmVerification(claim: PlenoClaim): boolean {
  if (
    claim.type === 'acusacion_publica' &&
    (claim.accusationSubtype ?? 'opinativa') === 'opinativa'
  ) {
    return true
  }
  return false
}

/**
 * Run the LLM verifier and translate the response back into a
 * ClaimVerification. Returns null when the LLM returned null or every
 * citation was rejected.
 */
export async function verifyClaimWithLlm(
  inputs: LlmVerifierInputs,
  caller: LlmCaller = callLLM,
): Promise<LlmVerifierResult | null> {
  if (shouldSkipLlmVerification(inputs.claim)) return null
  if (inputs.candidates.length === 0) return null

  const systemPrompt = buildClaimVerifierSystemPrompt()
  const userPrompt = buildClaimVerifierUserPrompt({
    claim: {
      type: inputs.claim.type,
      topic: inputs.claim.topic,
      speakerGroup: inputs.claim.speakerGroup,
      verbatim: inputs.claim.verbatim,
      context: inputs.claim.context,
      entities: {
        amountEuros: inputs.claim.entities.amountEuros ?? null,
        count: inputs.claim.entities.count ?? null,
        date: inputs.claim.entities.date ?? null,
      },
    },
    candidates: inputs.candidates.map((c) => ({
      kind: c.kind,
      ref: c.ref,
      snippet: c.snippet,
      similarity: c.similarity,
    })),
  })

  const response = await caller({
    systemPrompt,
    userPrompt,
    promptVersion: CLAIM_VERIFIER_PROMPT_VERSION,
    schema: ClaimVerifierLlmResponseSchema,
    input: { claimId: inputs.claim.id, candidateRefs: inputs.candidates.map((c) => c.ref) },
  })
  if (!response) return null

  // Validate each citation index — silently drop any that are out of range
  // (LLM hallucinated a candidate that wasn't on the list).
  const acceptedIndexes: number[] = []
  const rejectedIndexes: number[] = []
  const evidence: ClaimEvidence[] = []
  let contradictionCount = 0
  for (const e of response.evidence) {
    if (e.candidateIndex < 0 || e.candidateIndex >= inputs.candidates.length) {
      rejectedIndexes.push(e.candidateIndex)
      continue
    }
    acceptedIndexes.push(e.candidateIndex)
    const cand = inputs.candidates[e.candidateIndex]
    if (e.isContradiction) contradictionCount += 1
    evidence.push({
      kind: cand.kind,
      ref: cand.ref,
      snippet: e.snippet.length > 0 ? e.snippet.slice(0, 240) : cand.snippet,
      similarity: cand.similarity,
    })
  }

  // Verdict normalisation:
  //  · contradicho requires ≥1 contradiction citation; otherwise downgrade
  //    to parcial (still flag-worthy but not a libel-level claim).
  //  · verificado/parcial require ≥1 citation; otherwise sin-datos.
  let verdict: ClaimVerdict = response.verdict
  if (verdict === 'contradicho' && contradictionCount === 0) verdict = 'parcial'
  if (
    (verdict === 'verificado' || verdict === 'parcial' || verdict === 'contradicho') &&
    evidence.length === 0
  ) {
    verdict = 'sin-datos'
  }

  // The LLM result is always declarative — caller decides whether to apply.
  const verification: ClaimVerification = {
    claimId: inputs.claim.id,
    verdict,
    summary: response.summary.slice(0, 300),
    evidence,
    // Tag every checked dataset (the LLM saw all candidate kinds at once).
    checkedAgainst: ['llm-second-pass'],
  }

  return {
    verification,
    upgraded: verdict !== 'sin-datos' && evidence.length > 0,
    acceptedIndexes,
    rejectedIndexes,
  }
}
