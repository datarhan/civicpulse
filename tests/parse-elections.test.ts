import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEleccionesLocales, ELECTION_PARTY_LABEL } from '../src/scraper/elections'

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'gva_elecciones_locales_2026-07.csv'),
  'utf8',
)

describe('parseEleccionesLocales', () => {
  it('extracts the Riba-roja series with per-party percentages, newest election first', () => {
    const snap = parseEleccionesLocales(FIXTURE, '46214')
    expect(snap.municipality.ine).toBe('46214')
    expect(snap.municipality.poblacion).toBeGreaterThan(20000)
    expect(snap.elections[0].year).toBe(2023)
    expect(snap.elections[0].type).toBe('municipales')
    expect(snap.elections[0].abstencionPct).toBeCloseTo(30.31, 2)
    const r23 = Object.fromEntries(snap.elections[0].results.map((p) => [p.party, p.pct]))
    expect(r23['PSPV-PSOE']).toBeCloseTo(49.69, 2)
    expect(r23['PP']).toBeCloseTo(30.91, 2)
    expect(r23['VOX']).toBeCloseTo(7.9, 2)
    // zero-share parties are dropped from results (honest empty)
    expect(r23['Ciudadanos']).toBeUndefined()
    // results sorted by share desc
    const pcts = snap.elections[0].results.map((p) => p.pct)
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts)
  })

  it('parses the full multi-election series back to 2003', () => {
    const snap = parseEleccionesLocales(FIXTURE, '46214')
    const years = snap.elections.map((e) => e.year)
    expect(years).toEqual([2023, 2019, 2015, 2011, 2007, 2003])
    const r19 = Object.fromEntries(snap.elections[1].results.map((p) => [p.party, p.pct]))
    expect(r19['PSPV-PSOE']).toBeCloseTo(45.92, 2)
    expect(r19['PP']).toBeCloseTo(18.88, 2)
  })

  it('throws a clear error when the municipality is absent', () => {
    expect(() => parseEleccionesLocales(FIXTURE, '99999')).toThrow(/99999/)
  })

  it('maps every column party key to a display label', () => {
    for (const key of ['pp', 'pspv', 'compr', 'cs', 'pod', 'vox', 'eupv']) {
      expect(ELECTION_PARTY_LABEL[key]).toBeTruthy()
    }
  })
})
