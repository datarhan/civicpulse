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
  /** Evidence rejections by reason — telemetry for prompt drift. */
  rejectedReasons: {
    outOfRange: number
    missingCite: number
    citeNotInSnippet: number
  }
}

// ─── Cite grounding ─────────────────────────────────────────────────────────
//
// Prompt v2 demands every evidence.snippet begin with a structured cite of
// the form `<dataset>[<index>].<field>=<value> · …`. The runner enforces
// it: the cited value must appear LITERALLY inside the candidate's snippet
// (which is what we showed the LLM in the user prompt). This makes pure
// fabrication mechanically impossible — the LLM can hallucinate a verdict
// but it can't hallucinate a number that isn't in the data we sent it.
//
// Permissive on the cite syntax itself (whitespace, quotes around the
// value, scientific notation) but strict on substring grounding. Returns
// the cited value when the snippet starts with a parseable cite, or null
// when no cite is present.
const CITE_PATTERN =
  /^\s*([a-z][a-z0-9_-]*)\s*\[\s*(\d+)\s*\]\s*\.\s*([a-z][a-z0-9_]*)\s*=\s*"?([^"·|]+?)"?\s*(?:·|$)/i

export function parseCite(snippet: string): { field: string; value: string } | null {
  const m = snippet.match(CITE_PATTERN)
  if (!m) return null
  return { field: m[3], value: m[4].trim() }
}

/**
 * Loose substring match: strip diacritics + non-alphanumerics from both
 * sides so "€482.000" in the candidate matches a cite value of "482000".
 * Numeric grouping (`.` / `,` / non-breaking spaces / euro sign) routinely
 * differs between the LLM output and the snippet we showed it.
 */
export function looselyContains(haystack: string, needle: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '')
  const h = norm(haystack)
  const n = norm(needle)
  if (n.length === 0) return false
  return h.includes(n)
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

  // Validate each citation:
  //   1. candidateIndex must be in range.
  //   2. snippet must begin with a structured field cite (prompt v2).
  //   3. the cited value must appear (loosely) in the candidate's snippet.
  // Anything that fails is a hallucination and gets dropped.
  const acceptedIndexes: number[] = []
  const rejectedIndexes: number[] = []
  const evidence: ClaimEvidence[] = []
  const rejectedReasons = { outOfRange: 0, missingCite: 0, citeNotInSnippet: 0 }
  let contradictionCount = 0
  for (const e of response.evidence) {
    if (e.candidateIndex < 0 || e.candidateIndex >= inputs.candidates.length) {
      rejectedIndexes.push(e.candidateIndex)
      rejectedReasons.outOfRange += 1
      continue
    }
    const cand = inputs.candidates[e.candidateIndex]
    const cite = parseCite(e.snippet)
    if (!cite) {
      rejectedIndexes.push(e.candidateIndex)
      rejectedReasons.missingCite += 1
      continue
    }
    if (!looselyContains(cand.snippet, cite.value)) {
      rejectedIndexes.push(e.candidateIndex)
      rejectedReasons.citeNotInSnippet += 1
      continue
    }
    acceptedIndexes.push(e.candidateIndex)
    if (e.isContradiction) contradictionCount += 1
    evidence.push({
      kind: cand.kind,
      ref: cand.ref,
      snippet: e.snippet.slice(0, 240),
      similarity: cand.similarity,
      // The model was asked, per citation, whether the document contradicts.
      // A "no" is not a "yes, it corroborates" — see EvidenceStance.
      stance: e.isContradiction ? 'contradicts' : 'checked',
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
    rejectedReasons,
  }
}
