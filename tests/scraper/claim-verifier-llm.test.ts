/**
 * Tests for the LLM second-pass verifier.
 *
 * We mock the LLM caller — these tests are about correctness of the
 * candidate-shortlist building, the cite-by-index validation, and the
 * verdict-normalisation rules. The mock caller returns deterministic
 * responses so each test scenario is reproducible.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { shortlistCandidates, type VerifierInputs } from '../../src/scraper/claim-verifier'
import { verifyClaimWithLlm } from '../../src/scraper/claim-verifier-llm'
import { ClaimVerifierLlmResponseSchema } from '../../src/llm/schemas'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

const baseClaim: PlenoClaim = {
  id: 'test-claim-1',
  plenoId: 'p1',
  plenoDate: '2026-01-01',
  segmentIndex: 0,
  type: 'afirmacion_numerica',
  topic: 'urbanismo',
  speakerGroup: 'PP',
  verbatim: 'el contrato de alumbrado público costó doscientos mil euros',
  context: 'durante la sesión sobre eficiencia energética del alumbrado',
  entities: { amountEuros: 200_000 },
  confidence: 0.85,
  reasoning: 'precio claramente declarado',
  requiresHumanApproval: true,
}

const tendersFixture = {
  items: [
    {
      permalink: 'https://example.com/tender/123',
      title: 'Suministro y mantenimiento del alumbrado público municipal',
      award_amount_eur: 195_000,
      status: 'awarded',
      date: '2025-09-01',
    },
    {
      permalink: 'https://example.com/tender/999',
      title: 'Limpieza de jardines',
      award_amount_eur: 50_000,
      status: 'awarded',
      date: '2025-04-01',
    },
  ],
}

function mockCaller<T extends z.ZodTypeAny>(payload: unknown) {
  return async (_opts: { schema: T }) => {
    const parsed = ClaimVerifierLlmResponseSchema.safeParse(payload)
    if (!parsed.success) return null
    return parsed.data as z.infer<T>
  }
}

describe('shortlistCandidates', () => {
  it('returns relevant tenders sorted by similarity', () => {
    const inputs: VerifierInputs = { claim: baseClaim, tenders: tendersFixture }
    const list = shortlistCandidates(inputs, 5)
    expect(list.length).toBeGreaterThan(0)
    // First entry should be the alumbrado tender (matches "alumbrado")
    expect(list[0].kind).toBe('tender')
    expect(list[0].snippet).toMatch(/alumbrado/i)
  })

  it('caps at topK', () => {
    const many = {
      items: Array.from({ length: 20 }, (_, i) => ({
        permalink: `https://t/${i}`,
        title: 'Mantenimiento alumbrado y jardines y más alumbrado',
        award_amount_eur: 100 + i,
      })),
    }
    const list = shortlistCandidates({ claim: baseClaim, tenders: many }, 3)
    expect(list).toHaveLength(3)
  })

  it('excludes records below the 0.20 similarity floor', () => {
    const offTopic = {
      items: [
        {
          permalink: 'https://t/1',
          title: 'Festival de música tradicional valenciana',
          award_amount_eur: 5000,
        },
      ],
    }
    const list = shortlistCandidates({ claim: baseClaim, tenders: offTopic }, 5)
    expect(list).toHaveLength(0)
  })
})

describe('verifyClaimWithLlm', () => {
  it('upgrades sin-datos → verificado when LLM cites a valid candidate', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    expect(candidates.length).toBeGreaterThan(0)

    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'verificado',
        summary:
          'El contrato de alumbrado público se adjudicó por €195.000, cercano a los €200.000 declarados.',
        evidence: [
          {
            candidateIndex: 0,
            snippet: 'tender[0].award_amount_eur=195000 · matches the €200k claim',
            isContradiction: false,
          },
        ],
        confidence: 0.85,
      }),
    )

    expect(result).not.toBeNull()
    expect(result!.verification.verdict).toBe('verificado')
    expect(result!.verification.evidence).toHaveLength(1)
    expect(result!.verification.evidence[0].kind).toBe('tender')
    // Critical: ref came from the candidate, NOT from the LLM
    expect(result!.verification.evidence[0].ref).toBe(candidates[0].ref)
    expect(result!.upgraded).toBe(true)
    expect(result!.rejectedIndexes).toHaveLength(0)
  })

  it('rejects out-of-range candidateIndex (libel safety)', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'verificado',
        summary: 'Hallucinated cite outside the list.',
        evidence: [{ candidateIndex: 999, snippet: 'fake tender', isContradiction: false }],
        confidence: 0.9,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.acceptedIndexes).toHaveLength(0)
    expect(result!.rejectedIndexes).toEqual([999])
    // No accepted citations → verdict downgraded to sin-datos
    expect(result!.verification.verdict).toBe('sin-datos')
    expect(result!.upgraded).toBe(false)
  })

  it('downgrades contradicho → parcial when no isContradiction flag is set', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'contradicho',
        summary: 'LLM said contradicho but no contradiction flag.',
        evidence: [
          {
            candidateIndex: 0,
            snippet: 'tender[0].award_amount_eur=195000 · related, not contradicting',
            isContradiction: false,
          },
        ],
        confidence: 0.7,
      }),
    )
    expect(result!.verification.verdict).toBe('parcial')
    expect(result!.upgraded).toBe(true)
  })

  it('keeps contradicho when a contradiction citation is provided', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'contradicho',
        summary: 'Tender amount disagrees with the spoken figure.',
        evidence: [
          {
            candidateIndex: 0,
            snippet: 'tender[0].award_amount_eur=195000 · vs claimed €200k',
            isContradiction: true,
          },
        ],
        confidence: 0.92,
      }),
    )
    expect(result!.verification.verdict).toBe('contradicho')
    expect(result!.upgraded).toBe(true)
  })

  it('skips opinativa accusations entirely', async () => {
    const opinionativeClaim: PlenoClaim = {
      ...baseClaim,
      type: 'acusacion_publica',
      accusationSubtype: 'opinativa',
      verbatim: 'el equipo de gobierno es inútil y mentiroso',
    }
    const result = await verifyClaimWithLlm(
      {
        claim: opinionativeClaim,
        candidates: [{ kind: 'tender', ref: 'r', snippet: 's', similarity: 0.5 }],
      },
      // Mock caller should never be invoked
      async () => {
        throw new Error('LLM should not be called for opinativa')
      },
    )
    expect(result).toBeNull()
  })

  it('returns null when there are no candidates to cite', async () => {
    const result = await verifyClaimWithLlm({ claim: baseClaim, candidates: [] }, async () => {
      throw new Error('caller should not run')
    })
    expect(result).toBeNull()
  })

  it('returns null when LLM returns null', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm({ claim: baseClaim, candidates }, async () => null)
    expect(result).toBeNull()
  })

  it('rejects evidence whose snippet has no structured cite (libel safety)', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'verificado',
        summary: 'LLM emitted a free-text snippet without the structured cite.',
        evidence: [
          {
            candidateIndex: 0,
            snippet: 'tender alumbrado parece coincidir con el discurso',
            isContradiction: false,
          },
        ],
        confidence: 0.8,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.acceptedIndexes).toHaveLength(0)
    expect(result!.rejectedReasons.missingCite).toBe(1)
    expect(result!.verification.verdict).toBe('sin-datos')
    expect(result!.upgraded).toBe(false)
  })

  it('rejects evidence whose cited value is not in the candidate snippet (hallucination)', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'verificado',
        summary: 'LLM cited a value the candidate snippet does not contain.',
        evidence: [
          {
            candidateIndex: 0,
            // Candidate snippet contains 195000, but the LLM cites 999999.
            snippet: 'tender[0].award_amount_eur=999999 · invented amount',
            isContradiction: false,
          },
        ],
        confidence: 0.85,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.acceptedIndexes).toHaveLength(0)
    expect(result!.rejectedReasons.citeNotInSnippet).toBe(1)
    expect(result!.verification.verdict).toBe('sin-datos')
  })

  it('accepts loosely-matching numbers despite formatting differences', async () => {
    const candidates = shortlistCandidates({ claim: baseClaim, tenders: tendersFixture }, 5)
    const result = await verifyClaimWithLlm(
      { claim: baseClaim, candidates },
      mockCaller({
        verdict: 'verificado',
        summary: 'LLM cite uses 195.000 (Spanish grouping) — candidate has 195.000.',
        evidence: [
          {
            candidateIndex: 0,
            // Candidate snippet renders €195.000; the cite uses 195.000
            // — looselyContains strips punctuation so they match.
            snippet: 'tender[0].award_amount_eur=195.000 · matches claim',
            isContradiction: false,
          },
        ],
        confidence: 0.85,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.acceptedIndexes).toEqual([0])
    expect(result!.upgraded).toBe(true)
  })
})
