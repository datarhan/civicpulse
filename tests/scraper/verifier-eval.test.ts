import { describe, it, expect } from 'vitest'
import { scoreVerifier, formatLabelProvenance, type GoldRow } from '../../src/scraper/verifier-eval'
import type { ClaimVerdict, ClaimVerification } from '../../src/scraper/claim-verifier'

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

// Who labelled the gold. `reviewed:true` only says a row is scored: the 64 rows
// of verifier-gold.json carry it and every one was labelled by a model
// (ai-opus-4.8), while /metodologia called the set «etiquetada a mano». The
// scorecard has to say whose labels it is agreeing with.
describe('labelledBy', () => {
  it('counts the scored rows by who signed them, and leaves unreviewed rows out', () => {
    const gold: GoldRow[] = [
      { claimId: 'a', goldVerdict: 'sin-datos', reviewed: true, reviewer: 'ai-opus-4.8' },
      { claimId: 'b', goldVerdict: 'parcial', reviewed: true, reviewer: 'ai-opus-4.8' },
      { claimId: 'c', goldVerdict: 'verificado', reviewed: true, reviewer: 'Sergei Lutchenko' },
      { claimId: 'd', goldVerdict: 'sin-datos', reviewed: true }, // no signature
      { claimId: 'e', goldVerdict: 'sin-datos', reviewed: false, reviewer: 'Ana Pérez García' },
    ]
    const s = scoreVerifier(new Map(), gold)
    expect(s.labelledBy).toEqual({
      byClass: { persona: 1, automatica: 2, 'no-consta': 1 },
      byReviewer: { 'ai-opus-4.8': 2, 'Sergei Lutchenko': 1, '(none)': 1 },
    })
  })
})

describe('formatLabelProvenance', () => {
  it('warns that every figure is agreement when no scored row was labelled by a person', () => {
    const out = formatLabelProvenance({
      byClass: { persona: 0, automatica: 64, 'no-consta': 0 },
      byReviewer: { 'ai-opus-4.8': 64 },
    }).join('\n')
    expect(out).toContain('a person 0 · a model or process 64 · not stated 0')
    expect(out).toContain('ai-opus-4.8 ×64')
    expect(out).toContain('no scored row was labelled by a person')
    expect(out).toContain('agreement with those labels, not accuracy')
  })

  it('says how many rows a person did not label when the labels are mixed', () => {
    const out = formatLabelProvenance({
      byClass: { persona: 3, automatica: 60, 'no-consta': 1 },
      byReviewer: { 'Sergei Lutchenko': 3, 'ai-opus-4.8': 60, '(none)': 1 },
    }).join('\n')
    expect(out).toContain('61 of 64 scored rows were not labelled by a person')
  })

  it('has no warning when a person labelled every scored row', () => {
    const out = formatLabelProvenance({
      byClass: { persona: 5, automatica: 0, 'no-consta': 0 },
      byReviewer: { 'Sergei Lutchenko': 5 },
    }).join('\n')
    expect(out).toContain('a person 5')
    expect(out).not.toContain('⚠')
  })
})
