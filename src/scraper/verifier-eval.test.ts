import { describe, it, expect } from 'vitest'
import { scoreVerifier, type GoldRow } from './verifier-eval'
import type { ClaimVerdict, ClaimVerification } from './claim-verifier'

function pred(claimId: string, verdict: ClaimVerdict, refs: string[] = []): ClaimVerification {
  return {
    claimId,
    verdict,
    summary: '',
    evidence: refs.map((ref) => ({ kind: 'tender', ref, snippet: ref })),
    checkedAgainst: [],
  }
}

describe('scoreVerifier', () => {
  it('label accuracy, false-contradicho rate, and missing-prediction = sin-datos', () => {
    const gold: GoldRow[] = [
      { claimId: 'a', goldVerdict: 'verificado', reviewed: true },
      { claimId: 'b', goldVerdict: 'sin-datos', reviewed: true },
      { claimId: 'c', goldVerdict: 'parcial', reviewed: true }, // no prediction → scored as sin-datos
      { claimId: 'skip', goldVerdict: 'verificado', reviewed: false }, // unreviewed → excluded
    ]
    const preds = new Map<string, ClaimVerification>([
      ['a', pred('a', 'verificado')], // correct
      ['b', pred('b', 'contradicho')], // wrong + false contradicho
    ])
    const s = scoreVerifier(preds, gold)
    expect(s.n).toBe(3)
    expect(s.labelAccuracy).toBeCloseTo(1 / 3) // only 'a'
    expect(s.falseContradichoRate).toBeCloseTo(1 / 3) // 'b'
    // false sin-datos: denom = gold!=sin-datos = {a,c} = 2; 'c' had no pred → sin-datos → 1
    expect(s.falseSinDatosRate).toBeCloseTo(1 / 2)
  })

  it('citation micro precision/recall, and fever fails when a gold ref is missing', () => {
    const gold: GoldRow[] = [
      { claimId: 'a', goldVerdict: 'verificado', goldEvidenceRefs: ['t1', 't2'], reviewed: true },
    ]
    const preds = new Map<string, ClaimVerification>([
      ['a', pred('a', 'verificado', ['t1', 'x9'])], // 1 of 2 predicted right, 1 of 2 gold found
    ])
    const s = scoreVerifier(preds, gold)
    expect(s.citation.precision).toBeCloseTo(0.5)
    expect(s.citation.recall).toBeCloseTo(0.5)
    expect(s.citation.rowsWithGoldRefs).toBe(1)
    expect(s.feverScore).toBeCloseTo(0) // label matches but t2 missing → G⊄P
  })

  it('fever passes on label match + gold refs ⊆ predicted; per-verdict P/R/support', () => {
    const gold: GoldRow[] = [
      { claimId: 'a', goldVerdict: 'verificado', goldEvidenceRefs: ['t1'], reviewed: true },
      { claimId: 'b', goldVerdict: 'sin-datos', reviewed: true },
    ]
    const preds = new Map<string, ClaimVerification>([
      ['a', pred('a', 'verificado', ['t1', 't2'])], // G ⊆ P
      ['b', pred('b', 'sin-datos')],
    ])
    const s = scoreVerifier(preds, gold)
    expect(s.feverScore).toBeCloseTo(1)
    expect(s.perVerdict.verificado.precision).toBeCloseTo(1)
    expect(s.perVerdict.verificado.recall).toBeCloseTo(1)
    expect(s.perVerdict.verificado.support).toBe(1)
    expect(s.confusion.verificado.verificado).toBe(1)
  })
})
