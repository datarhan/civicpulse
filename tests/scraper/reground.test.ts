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

describe('regroundDecision (calibrated: entail<0.2 → ungrounded; all contradicho flagged)', () => {
  it('flags a verificado whose best evidence does not entail the claim', () => {
    const f = regroundDecision(item('verificado'), [{ entailment: 0.1, contradiction: 0.1 }])
    expect(f?.reason).toBe('ungrounded')
    expect(f?.maxEntail).toBeCloseTo(0.1)
  })

  it('does NOT flag a verificado entailed above the floor', () => {
    expect(
      regroundDecision(item('verificado'), [{ entailment: 0.3, contradiction: 0.1 }]),
    ).toBeNull()
    expect(
      regroundDecision(item('verificado'), [{ entailment: 0.8, contradiction: 0.1 }]),
    ).toBeNull()
  })

  it('flags a parcial below the entail floor', () => {
    expect(
      regroundDecision(item('parcial'), [{ entailment: 0.05, contradiction: 0.0 }])?.reason,
    ).toBe('ungrounded')
  })

  it('flags EVERY contradicho for review regardless of contradiction score', () => {
    // misfire with high surface-contradiction → still flagged (NLI cannot validate it)
    expect(
      regroundDecision(item('contradicho'), [{ entailment: 0.05, contradiction: 0.9 }])?.reason,
    ).toBe('contradicho-review')
    // and one with low contradiction → also flagged
    expect(
      regroundDecision(item('contradicho'), [{ entailment: 0.1, contradiction: 0.1 }])?.reason,
    ).toBe('contradicho-review')
  })

  it('takes the MAX entailment over multiple evidence rows', () => {
    expect(
      regroundDecision(item('verificado', 2), [
        { entailment: 0.1, contradiction: 0.0 },
        { entailment: 0.7, contradiction: 0.0 },
      ]),
    ).toBeNull() // best evidence (0.7) entails → not flagged
  })

  it('returns null for no evidence and for out-of-scope verdicts', () => {
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

  it('exposes the tunable entail threshold', () => {
    expect(REGROUND_THRESHOLDS.entail).toBeGreaterThan(0)
    expect(REGROUND_THRESHOLDS.entail).toBeLessThan(1)
  })
})
