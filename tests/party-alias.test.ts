import { describe, it, expect } from 'vitest'
import { normalizeParty, latestVoteShare } from '../src/lib/party-alias'

/**
 * elections.json records the BALLOT name (PSPV-PSOE, Podem) while officials.json
 * carries the GROUP name a councillor sits under (PSOE, Otro). Twelve elections
 * were scraped nightly and reached no surface at all because nothing bridged
 * the two vocabularies.
 */
const elections = {
  elections: [
    { year: 2019, abstencionPct: 33.1, results: [{ party: 'PSPV-PSOE', pct: 44.2 }] },
    {
      year: 2023,
      abstencionPct: 30.31,
      results: [
        { party: 'PSPV-PSOE', pct: 49.69 },
        { party: 'PP', pct: 30.91 },
        { party: 'VOX', pct: 7.9 },
        { party: 'Podem', pct: 5.77 },
        { party: 'Compromís', pct: 5.73 },
      ],
    },
  ],
}

describe('party-alias', () => {
  it('maps the Valencian federation to the roster label', () => {
    expect(normalizeParty('PSPV-PSOE')).toBe('PSOE')
    expect(normalizeParty('pspv-psoe')).toBe('PSOE')
  })

  it('maps the left coalition to the group it sits under', () => {
    expect(normalizeParty('Podem')).toBe('Otro')
    expect(normalizeParty('EUPV')).toBe('Otro')
  })

  it('refuses an unrecognised ballot label rather than guessing', () => {
    // Forcing an unknown list onto the nearest group would misstate a
    // councillor's mandate.
    expect(normalizeParty('Partido Inventado')).toBeNull()
    expect(normalizeParty('')).toBeNull()
  })

  it('reads the share from the MOST RECENT election', () => {
    expect(latestVoteShare(elections, 'PSOE')).toMatchObject({ year: 2023, pct: 49.69 })
  })

  it('keeps the ballot label so the UI can show what was actually on the paper', () => {
    expect(latestVoteShare(elections, 'PSOE')?.ballotLabel).toBe('PSPV-PSOE')
  })

  it('returns null for a party that did not stand', () => {
    expect(latestVoteShare(elections, 'Ciudadanos')).toBeNull()
  })

  it('tolerates a missing snapshot', () => {
    expect(latestVoteShare(null, 'PSOE')).toBeNull()
  })
})
