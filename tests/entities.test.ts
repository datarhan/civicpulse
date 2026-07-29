import { describe, it, expect } from 'vitest'
import {
  normalizeCompanyKey,
  companyIdForKey,
  validateEntityOverrides,
  buildEntityRegistry,
} from '../src/scraper/entities'

describe('normalizeCompanyKey', () => {
  const same = (a: string, b: string) => expect(normalizeCompanyKey(a)).toBe(normalizeCompanyKey(b))

  it('merges legal-form suffix variants of the same company', () => {
    same('VARESER 96, S.L.', 'VARESER 96 SL')
    same('VARESER 96, S.L.', 'Vareser 96, Sociedad Limitada')
    same('SACECA GESTION Y SERVICIOS SL', 'Saceca Gestión y Servicios, S.L.U.')
    same('OBRAS PUBLICAS MONTANER 1 SA', 'Obras Públicas Montaner 1, S.A.')
  })

  it('folds diacritics and punctuation', () => {
    same('CONSTRUCCIONES EDÁN, S.L.U.', 'construcciones edan slu')
    expect(normalizeCompanyKey('Ferrovial & Cía.')).toBe(normalizeCompanyKey('FERROVIAL & CIA'))
  })

  it('keeps UTE names distinct from member companies', () => {
    const ute = normalizeCompanyKey('UTE RIBA-ROJA MANTENIMIENTO')
    expect(ute).toContain('ute')
    expect(ute).not.toBe(normalizeCompanyKey('RIBA-ROJA MANTENIMIENTO SL'))
  })

  it('keeps genuinely distinct companies distinct', () => {
    expect(normalizeCompanyKey('INSDAGAR SL')).not.toBe(normalizeCompanyKey('VARESER 96 SL'))
  })

  it('only strips legal forms at the END of the name', () => {
    // "SA" as an interior word must survive (e.g. a name starting with it).
    expect(normalizeCompanyKey('SA PALOMA CATERING')).toContain('sa paloma')
  })
})

describe('companyIdForKey', () => {
  it('is stable and co-prefixed', () => {
    const a = companyIdForKey('vareser 96')
    expect(a).toMatch(/^co-[a-z0-9]+$/)
    expect(companyIdForKey('vareser 96')).toBe(a)
    expect(companyIdForKey('otra cosa')).not.toBe(a)
  })
})

describe('validateEntityOverrides', () => {
  const base = {
    version: 1,
    generatedAt: '2026-07-29T00:00:00Z',
    aliases: [
      {
        variantKey: 'vareser noventa y seis',
        canonicalKey: 'vareser 96',
        curator: 'Sergei Lutchenko',
        addedAt: '2026-07-29',
      },
    ],
  }

  it('round-trips a valid overrides file', () => {
    const v = validateEntityOverrides(JSON.stringify(base))
    expect(v.aliases).toHaveLength(1)
  })

  it('rejects a self-alias', () => {
    const bad = {
      ...base,
      aliases: [{ ...base.aliases[0], canonicalKey: 'vareser noventa y seis' }],
    }
    expect(() => validateEntityOverrides(JSON.stringify(bad))).toThrow(/self/)
  })

  it('rejects a two-step chain (canonicalKey that is itself re-aliased)', () => {
    const bad = {
      ...base,
      aliases: [
        base.aliases[0],
        { variantKey: 'vareser 96', canonicalKey: 'vareser', curator: 'x', addedAt: '2026-07-29' },
      ],
    }
    expect(() => validateEntityOverrides(JSON.stringify(bad))).toThrow(/chain/)
  })
})

describe('buildEntityRegistry', () => {
  const tenders = {
    contracts: [
      {
        id: 'c-1',
        status: 'awarded',
        assignee: 'VARESER 96, S.L.',
        finalAmountNoTaxes: 1000,
        awardDate: '2024-01-10',
      },
      {
        id: 'c-2',
        status: 'awarded',
        assignee: 'VARESER 96 SL',
        finalAmountNoTaxes: 500,
        awardDate: '2025-03-02',
      },
      { id: 'c-3', status: 'in-tender', assignee: 'VARESER 96 SL' },
      {
        id: 'c-4',
        status: 'awarded',
        assignee: 'INSDAGAR SOCIEDAD LIMITADA',
        finalAmountNoTaxes: 200,
        awardDate: '2023-06-01',
      },
      { id: 'c-5', status: 'awarded', assignee: null },
    ],
    tenders: [],
  }
  const officials = {
    officials: [{ slug: 'robert-raga-gadea', name: 'Robert Raga Gadea', party: 'PSOE' }],
  }

  it('merges name variants into one company with combined edges', () => {
    const reg = buildEntityRegistry({ tenders, officials })
    const vareser = reg.companies.find((c) => c.nameKey === normalizeCompanyKey('VARESER 96 SL'))
    expect(vareser).toBeDefined()
    expect(vareser!.variants.sort()).toEqual(['VARESER 96 SL', 'VARESER 96, S.L.'])
    expect(vareser!.contractIds.sort()).toEqual(['c-1', 'c-2', 'c-3'])
    expect(vareser!.contractCount).toBe(3)
    expect(vareser!.awardedTotalEur).toBe(1500) // awarded rows only
    expect(vareser!.firstAwardDate).toBe('2024-01-10')
    expect(vareser!.lastAwardDate).toBe('2025-03-02')
    expect(vareser!.id).toMatch(/^co-/)
  })

  it('canonicalName is the most frequent raw variant (tie → longest)', () => {
    const reg = buildEntityRegistry({ tenders, officials })
    const vareser = reg.companies.find((c) => c.nameKey === normalizeCompanyKey('VARESER 96 SL'))
    // Tie (1× each raw across awarded+in-tender: 'VARESER 96 SL' appears 2×) → most frequent wins
    expect(vareser!.canonicalName).toBe('VARESER 96 SL')
  })

  it('sorts companies by awardedTotalEur desc and projects people', () => {
    const reg = buildEntityRegistry({ tenders, officials })
    expect(reg.companies[0].awardedTotalEur).toBeGreaterThanOrEqual(
      reg.companies[reg.companies.length - 1].awardedTotalEur,
    )
    expect(reg.people[0]).toMatchObject({ slug: 'robert-raga-gadea', party: 'PSOE' })
    expect(reg.stats.companies).toBe(reg.companies.length)
  })

  it('applies overrides to merge distinct keys', () => {
    const overrides = {
      version: 1,
      generatedAt: '2026-07-29T00:00:00Z',
      aliases: [
        {
          variantKey: normalizeCompanyKey('INSDAGAR SOCIEDAD LIMITADA'),
          canonicalKey: normalizeCompanyKey('VARESER 96 SL'),
          curator: 'test',
          addedAt: '2026-07-29',
        },
      ],
    }
    const reg = buildEntityRegistry({ tenders, officials, overrides })
    const merged = reg.companies.find((c) => c.nameKey === normalizeCompanyKey('VARESER 96 SL'))
    expect(merged!.contractIds).toContain('c-4')
    expect(merged!.awardedTotalEur).toBe(1700)
    expect(reg.companies.some((c) => c.nameKey === normalizeCompanyKey('INSDAGAR SL'))).toBe(false)
  })
})
