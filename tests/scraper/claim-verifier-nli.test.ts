import { describe, it, expect } from 'vitest'
import { verifyClaimWithNli } from './claim-verifier-nli'
import type { PlenoClaim } from './pleno-claim'
import type { CandidateShortlist } from './claim-verifier'
import type { NliPair, NliScore } from './nli-client'

const claim = (over: Record<string, unknown> = {}): PlenoClaim =>
  ({
    id: 'c1',
    plenoId: 'p1',
    type: 'cita_obra',
    topic: 'urbanismo',
    speakerGroup: 'PP',
    verbatim: 'la obra de la calle Mayor costó 482000 euros',
    context: '',
    entities: {},
    ...over,
  }) as unknown as PlenoClaim

const cands = (n = 2): CandidateShortlist[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'tender',
    ref: `t${i}`,
    snippet: `snippet ${i}`,
    similarity: 0.6,
  })) as unknown as CandidateShortlist[]

/** Fake scorer keyed by candidate index ("0","1",…). Defaults to low scores. */
function fakeScorer(map: Record<string, Partial<NliScore>>) {
  return async (pairs: NliPair[]) => {
    const m = new Map<string, NliScore>()
    for (const p of pairs) {
      const s = map[p.id] ?? {}
      m.set(p.id, {
        id: p.id,
        entailment: s.entailment ?? 0.1,
        neutral: s.neutral ?? 0.8,
        contradiction: s.contradiction ?? 0.1,
        label: s.label ?? 'neutral',
      })
    }
    return m
  }
}

describe('verifyClaimWithNli', () => {
  it('verificado when best entailment ≥ high threshold', async () => {
    const r = await verifyClaimWithNli(
      { claim: claim(), candidates: cands(2) },
      fakeScorer({ '0': { entailment: 0.95 } }),
    )
    expect(r!.verification.verdict).toBe('verificado')
    expect(r!.upgraded).toBe(true)
    expect(r!.verification.confidence).toBeCloseTo(0.95)
    expect(r!.verification.evidence.map((e) => e.ref)).toContain('t0')
    expect(r!.verification.checkedAgainst).toContain('nli-grounding')
  })

  it('parcial when best entailment in [entail, high)', async () => {
    const r = await verifyClaimWithNli(
      { claim: claim(), candidates: cands(2) },
      fakeScorer({ '0': { entailment: 0.7 } }),
    )
    expect(r!.verification.verdict).toBe('parcial')
    expect(r!.upgraded).toBe(true)
  })

  it('sin-datos (no upgrade) when every candidate is below the entail floor', async () => {
    const r = await verifyClaimWithNli({ claim: claim(), candidates: cands(2) }, fakeScorer({}))
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.upgraded).toBe(false)
  })

  it('flags a strong contradiction but NEVER emits contradicho', async () => {
    const r = await verifyClaimWithNli(
      { claim: claim(), candidates: cands(2) },
      fakeScorer({ '0': { contradiction: 0.96 } }),
    )
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.verification.verdict).not.toBe('contradicho')
    expect(r!.nliContradictionFlag).toBe(true)
  })

  it('skips opinativa accusations (returns null)', async () => {
    const op = claim({ type: 'acusacion_publica', accusationSubtype: 'opinativa' })
    const r = await verifyClaimWithNli(
      { claim: op, candidates: cands(2) },
      fakeScorer({ '0': { entailment: 0.99 } }),
    )
    expect(r).toBeNull()
  })

  it('returns null when there are no candidates', async () => {
    expect(await verifyClaimWithNli({ claim: claim(), candidates: [] }, fakeScorer({}))).toBeNull()
  })
})
