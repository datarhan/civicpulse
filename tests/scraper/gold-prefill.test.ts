import { describe, it, expect } from 'vitest'
import {
  stratifiedSample,
  mergeGold,
  toGoldRow,
  type VerifiedItemLike,
} from '../../src/scraper/gold-prefill'
import type { ClaimVerdict } from '../../src/scraper/claim-verifier'
import type { GoldRow } from '../../src/scraper/verifier-eval'

function item(
  id: string,
  verdict: ClaimVerdict,
  type: string,
  refs: string[] = [],
): VerifiedItemLike {
  return {
    claim: { id, type, verbatim: 'v' + id },
    verification: { verdict, evidence: refs.map((ref) => ({ ref })) },
  }
}

describe('stratifiedSample', () => {
  it('represents every non-empty verdict×type bucket and is deterministic', () => {
    const items = [
      item('a', 'sin-datos', 'cita_obra'),
      item('b', 'sin-datos', 'cita_obra'),
      item('c', 'sin-datos', 'cita_obra'),
      item('d', 'verificado', 'afirmacion_numerica'),
      item('e', 'contradicho', 'cita_obra'),
    ]
    const s1 = stratifiedSample(items, 3).map((x) => x.claim.id)
    const s2 = stratifiedSample(items, 3).map((x) => x.claim.id)
    expect(s1).toEqual(s2) // stable across runs (no Math.random)
    expect(s1.length).toBe(3)
    const verdicts = new Set(stratifiedSample(items, 3).map((x) => x.verification.verdict))
    expect(verdicts.has('verificado')).toBe(true)
    expect(verdicts.has('contradicho')).toBe(true)
    expect(verdicts.has('sin-datos')).toBe(true)
  })

  it('returns all items when n >= size', () => {
    const items = [item('a', 'sin-datos', 'x'), item('b', 'parcial', 'y')]
    expect(stratifiedSample(items, 5).length).toBe(2)
  })
})

describe('mergeGold', () => {
  it('preserves reviewed rows, refreshes unreviewed, appends new, sorts by claimId', () => {
    const existing: GoldRow[] = [
      { claimId: 'b', goldVerdict: 'verificado', reviewed: true, notes: 'human' },
      { claimId: 'a', goldVerdict: 'sin-datos', reviewed: false },
    ]
    const fresh: GoldRow[] = [
      { claimId: 'b', goldVerdict: 'sin-datos', reviewed: false }, // must NOT overwrite reviewed 'b'
      { claimId: 'a', goldVerdict: 'parcial', reviewed: false }, // refresh 'a'
      { claimId: 'c', goldVerdict: 'contradicho', reviewed: false }, // append
    ]
    const out = mergeGold(existing, fresh)
    expect(out.map((r) => r.claimId)).toEqual(['a', 'b', 'c'])
    const b = out.find((r) => r.claimId === 'b')!
    expect(b.goldVerdict).toBe('verificado')
    expect(b.notes).toBe('human')
    expect(out.find((r) => r.claimId === 'a')!.goldVerdict).toBe('parcial')
  })
})

describe('toGoldRow', () => {
  it('prefills from current verification, reviewed:false, omits empty evidence refs', () => {
    const r = toGoldRow(item('a', 'verificado', 'cita_obra', ['t1']))
    expect(r).toMatchObject({
      claimId: 'a',
      goldVerdict: 'verificado',
      goldEvidenceRefs: ['t1'],
      reviewed: false,
    })
    expect(toGoldRow(item('b', 'sin-datos', 'x')).goldEvidenceRefs).toBeUndefined()
  })
})
