import { describe, it, expect } from 'vitest'
import { extractMunicipioEntries, summarize } from '../src/scraper/ispa'

// Real ISPA shape: no header, positional __EMPTY columns, councillors anonymised.
const ROWS = [
  {
    __EMPTY: 'Otra Localidad',
    __EMPTY_1: 'València/Valencia',
    __EMPTY_3: 'Exclusiva',
    __EMPTY_4: 99999,
  },
  {
    __EMPTY: 'Riba-roja de Túria',
    __EMPTY_1: 'València/Valencia',
    __EMPTY_3: 'Exclusiva',
    __EMPTY_4: 43436.42,
  },
  {
    __EMPTY: 'Riba-roja de Túria',
    __EMPTY_1: 'València/Valencia',
    __EMPTY_3: 'Exclusiva',
    __EMPTY_4: 39224.98,
  },
  {
    __EMPTY: 'Riba-roja de Túria',
    __EMPTY_1: 'València/Valencia',
    __EMPTY_3: 'Exclusiva',
    __EMPTY_4: 39224.98,
  },
  {
    __EMPTY: 'Riba-roja de Túria',
    __EMPTY_1: 'València/Valencia',
    __EMPTY_3: 'Sin dedicación',
    __EMPTY_4: 13893.72,
  },
  // column-shifted layout: a leading count column (1) before the amount
  { __EMPTY: 'Riba-roja de Túria', __EMPTY_1: '1', __EMPTY_3: 'Sin dedicación', __EMPTY_4: 6367.9 },
  // a non-retribución row (no dedicación marker) must be ignored
  { __EMPTY: 'Riba-roja de Túria', __EMPTY_1: 'cabecera', __EMPTY_4: 2 },
]

describe('scraper/ispa — extractMunicipioEntries', () => {
  const entries = extractMunicipioEntries(ROWS, 'Riba-roja de Túria')

  it('extracts only the target municipality rows that are real retribuciones', () => {
    expect(entries.length).toBe(5)
  })

  it('classifies dedicación correctly', () => {
    expect(entries.filter((e) => e.dedicacion === 'exclusiva').length).toBe(3)
    expect(entries.filter((e) => e.dedicacion === 'sin-dedicacion').length).toBe(2)
  })

  it('reads the euro amount as the largest numeric in the row (ignores count columns)', () => {
    const amounts = entries.map((e) => e.amountEuros)
    expect(amounts).toContain(43436.42)
    expect(amounts).toContain(6367.9) // column-shifted row still yields the amount, not the count "1"
    expect(amounts).not.toContain(1)
  })

  it('never carries a councillor name (ISPA is anonymised by design)', () => {
    for (const e of entries)
      expect(Object.keys(e)).toEqual(['dedicacion', 'dedicacionLabel', 'amountEuros'])
  })

  it('summarize totals + brackets the distribution', () => {
    const s = summarize(entries)
    expect(s.total).toBe(5)
    expect(s.conDedicacion).toBe(3)
    expect(s.sinDedicacion).toBe(2)
    expect(s.totalAnnualEuros).toBeCloseTo(43436.42 + 39224.98 * 2 + 13893.72 + 6367.9, 1)
    // two councillors share 39224.98 → one bracket with count 2
    const b = s.brackets.find((x) => x.amountEuros === 39224.98)
    expect(b?.count).toBe(2)
  })
})
