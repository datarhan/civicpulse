import { describe, it, expect } from 'vitest'
import { summarizeImpact } from '../src/lib/impact-stats'

describe('summarizeImpact', () => {
  it('returns zeros and null date on empty/missing snapshots', () => {
    const vacio = {
      plenosCount: 0,
      findingsCount: 0,
      quejasCount: 0,
      // Sin `stats` no hay cifra de adjudicados que dar: null, y la página no
      // pinta un número. Decir 0 sería tan falso como decir el total de filas.
      contractsCount: null,
      contractsRows: 0,
      lastFindingAt: null,
    }
    expect(summarizeImpact({})).toEqual(vacio)
    expect(summarizeImpact()).toEqual(vacio)
  })

  it('counts items across the four snapshot shapes', () => {
    const out = summarizeImpact({
      plenos: { items: [{}, {}, {}] },
      findings: { items: [{ publishedAt: '2026-07-01' }] },
      quejas: { items: [{}] },
      tenders: { contracts: [{}, {}], stats: { awardedContracts: 1, totalContracts: 2 } },
    })
    expect(out).toEqual({
      plenosCount: 3,
      findingsCount: 1,
      quejasCount: 1,
      contractsCount: 1,
      contractsRows: 2,
      lastFindingAt: '2026-07-01',
    })
  })

  /**
   * «806 contratos indexados» en la página que habla del impacto de este medio
   * se leía como 806 contratos realmente adjudicados por el ayuntamiento. El
   * total del snapshot incluye anulados, revocados y desistidos: los
   * adjudicados eran 699, un 15 % menos. Es exactamente el señalamiento que
   * /datos ya había recibido y arreglado («N adjudicados · M expedientes»), y
   * que a esta página no llegó — la misma cifra mal leída en dos sitios, una
   * arreglada y la otra no.
   */
  it('cuenta los ADJUDICADOS, no las filas del snapshot', () => {
    const out = summarizeImpact({
      tenders: {
        contracts: new Array(806).fill({}),
        stats: { awardedContracts: 699, totalContracts: 806 },
      },
    })
    expect(out.contractsCount).toBe(699)
    expect(out.contractsRows).toBe(806)
  })

  it('lastFindingAt is the max publishedAt, tolerating rows without one', () => {
    const out = summarizeImpact({
      findings: {
        items: [
          { publishedAt: '2026-07-03' },
          {},
          { publishedAt: '2026-07-06' },
          { publishedAt: '2026-06-01' },
        ],
      },
    })
    expect(out.findingsCount).toBe(4)
    expect(out.lastFindingAt).toBe('2026-07-06')
  })
})
