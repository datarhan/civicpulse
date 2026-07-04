import { describe, it, expect } from 'vitest'
import { pressLabSummary } from '../../src/lib/press-lab'

const NOW = new Date('2026-07-03T12:00:00Z').getTime()

function press(id, date) {
  return { id, title: `headline ${id}`, source: 'X', sourceHost: 'x.test', date, fingerprint: `fp-${id}` }
}
function verifiedRow(articleId, verdict) {
  return { claim: { articleId }, verification: { verdict } }
}

describe('lib/press-lab — pressLabSummary', () => {
  it('counts monitored headlines only within the 30-day window', () => {
    const s = pressLabSummary(
      {
        press: [
          press('a', '2026-07-02T10:00:00Z'), // in window
          press('b', '2026-05-01T10:00:00Z'), // >30 days old
        ],
        verified: [],
      },
      NOW,
    )
    expect(s.monitoredCount).toBe(1)
  })

  it('distinguishes audited (has a verified claim) from merely monitored', () => {
    const s = pressLabSummary(
      {
        press: [press('a', '2026-07-02T10:00:00Z'), press('b', '2026-07-01T10:00:00Z')],
        verified: [verifiedRow('a', 'verificado')],
      },
      NOW,
    )
    expect(s.monitoredCount).toBe(2)
    expect(s.auditedCount).toBe(1) // only article 'a' has any verified claim
  })

  it('returns null ratios (not 0) when nothing has been audited', () => {
    const s = pressLabSummary({ press: [press('a', '2026-07-02T10:00:00Z')], verified: [] }, NOW)
    expect(s.totalClaims).toBe(0)
    expect(s.verificadoRatio).toBeNull()
    expect(s.contradichoRatio).toBeNull()
    expect(s.hasEditorialContent).toBe(false)
  })

  it('computes verificado/discrepancy ratios over total claims', () => {
    const s = pressLabSummary(
      {
        press: [press('a', '2026-07-02T10:00:00Z')],
        verified: [
          verifiedRow('a', 'verificado'),
          verifiedRow('a', 'verificado'),
          verifiedRow('a', 'contradicho'),
          verifiedRow('a', 'sin-datos'),
        ],
      },
      NOW,
    )
    expect(s.totalClaims).toBe(4)
    expect(s.verificadoRatio).toBeCloseTo(0.5, 5)
    expect(s.contradichoRatio).toBeCloseTo(0.25, 5)
    expect(s.hasEditorialContent).toBe(true)
    expect(s.auditedCount).toBe(1)
  })

  it('tolerates malformed rows without throwing', () => {
    const s = pressLabSummary(
      {
        press: [press('a', '2026-07-02T10:00:00Z'), { id: 'x', date: 'not-a-date' }],
        verified: [{ claim: {}, verification: {} }],
      },
      NOW,
    )
    expect(s.monitoredCount).toBe(1) // the undated row is excluded
    expect(s.auditedCount).toBe(0)
  })
})
