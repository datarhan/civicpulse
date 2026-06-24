import { describe, it, expect } from 'vitest'
import {
  regroundDecision,
  REGROUND_THRESHOLDS,
  type RegroundItem,
} from '../../src/scraper/reground'
import type { ClaimVerdict } from '../../src/scraper/claim-verifier'

function item(verdict: ClaimVerdict, nEvidence = 1): RegroundItem {
  return {
    claim: { id: 'c', verbatim: 'la obra costó 482000 euros' },
    verification: {
      verdict,
      evidence: Array.from({ length: nEvidence }, (_, i) => ({ ref: `r${i}`, snippet: `s${i}` })),
    },
  }
}

describe('regroundDecision', () => {
  it('flags a verificado whose best evidence does not entail the claim', () => {
    const f = regroundDecision(item('verificado'), [{ entailment: 0.3, contradiction: 0.1 }])
    expect(f?.reason).toBe('ungrounded')
    expect(f?.maxEntail).toBeCloseTo(0.3)
  })

  it('does NOT flag a verificado that is genuinely entailed', () => {
    expect(
      regroundDecision(item('verificado'), [{ entailment: 0.8, contradiction: 0.1 }]),
    ).toBeNull()
  })

  it('flags a parcial below the entail floor', () => {
    expect(
      regroundDecision(item('parcial'), [{ entailment: 0.4, contradiction: 0.0 }])?.reason,
    ).toBe('ungrounded')
  })

  it('flags a contradicho whose evidence does not actually contradict', () => {
    const f = regroundDecision(item('contradicho'), [{ entailment: 0.1, contradiction: 0.2 }])
    expect(f?.reason).toBe('weak-contradicho')
    expect(f?.maxContra).toBeCloseTo(0.2)
  })

  it('does NOT flag a contradicho with a genuine contradiction', () => {
    expect(
      regroundDecision(item('contradicho'), [{ entailment: 0.05, contradiction: 0.9 }]),
    ).toBeNull()
  })

  it('takes the MAX over multiple evidence rows', () => {
    // one weak + one strong → entailed → not flagged
    expect(
      regroundDecision(item('verificado', 2), [
        { entailment: 0.2, contradiction: 0.0 },
        { entailment: 0.7, contradiction: 0.0 },
      ]),
    ).toBeNull()
  })

  it('returns null for items with no evidence and for out-of-scope verdicts', () => {
    expect(
      regroundDecision(
        { ...item('verificado'), verification: { verdict: 'verificado', evidence: [] } },
        [],
      ),
    ).toBeNull()
    expect(
      regroundDecision(item('sin-datos'), [{ entailment: 0.1, contradiction: 0.1 }]),
    ).toBeNull()
    expect(
      regroundDecision(item('promesa-repetida'), [{ entailment: 0.1, contradiction: 0.1 }]),
    ).toBeNull()
  })

  it('exposes tunable thresholds', () => {
    expect(REGROUND_THRESHOLDS.entail).toBeGreaterThan(0)
    expect(REGROUND_THRESHOLDS.contra).toBeGreaterThan(0)
  })
})
