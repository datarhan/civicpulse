import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  departmentForCpv,
  departmentForTender,
  departmentForTenderCategory,
} from '../src/scraper/departments'

describe('departmentForCpv', () => {
  it('reads the standard CPV division', () => {
    expect(departmentForCpv('85311100')).toBe('salud')
    expect(departmentForCpv('45233222')).toBe('obras-publicas')
    expect(departmentForCpv('80510000')).toBe('educacion')
    expect(departmentForCpv('90511300')).toBe('medio-ambiente')
  })

  it('prefers the longer prefix, so sport is not filed as culture', () => {
    expect(departmentForCpv('92000000')).toBe('cultura')
    expect(departmentForCpv('92600000')).toBe('deportes')
    // Veterinary is its own concejalía here, not health.
    expect(departmentForCpv('85210000')).toBe('bienestar-animal')
  })

  it('reads catch-all codes as silence, not as an área', () => {
    // 98300000 "miscellaneous services" rides 48 of the 55 contracts Gobierto
    // files under health. Letting it resolve anything just relocates the
    // misattribution.
    expect(departmentForCpv('98300000')).toBeNull()
    expect(departmentForCpv('79900000')).toBeNull()
    expect(departmentForCpv('')).toBeNull()
    expect(departmentForCpv(null)).toBeNull()
  })
})

describe('departmentForTender', () => {
  it('takes the PRIMARY (first) code, treating later ones as ancillary', () => {
    // The town's €17.4M street-cleaning contract files litter collection then
    // technical assistance. Weighing them equally reads as a tie and drops it.
    expect(departmentForTender({ cpvs: ['90511300', '71356200'] })).toBe('medio-ambiente')
    expect(departmentForTender({ cpvs: ['45233222', '34928500'] })).toBe('obras-publicas')
  })

  it('skips a generic primary code and keeps looking', () => {
    expect(departmentForTender({ cpvs: ['98300000', '92000000'] })).toBe('cultura')
  })

  it('returns null when codes were filed but none names an área', () => {
    // Christmas ornamental lighting, filed by Gobierto under "health".
    expect(
      departmentForTender({ categoryTitle: 'health', cpvs: ['98300000', '79900000'] }),
    ).toBeNull()
  })

  it('falls back to the coarse category ONLY when no codes were filed', () => {
    expect(departmentForTender({ categoryTitle: 'construction', cpvs: [] })).toBe('obras-publicas')
    expect(departmentForTender({ categoryTitle: 'construction' })).toBe('obras-publicas')
  })
})

describe('the published tenders snapshot — measured, not assumed', () => {
  const t = JSON.parse(
    readFileSync(join(__dirname, '..', 'public', 'data', 'tenders.json'), 'utf8'),
  ) as { contracts?: Array<Record<string, unknown>> }
  const awarded = (t.contracts ?? []).filter((c) => c.assignee && c.status !== 'revoked')

  it('has contracts to check, so this suite cannot pass by measuring nothing', () => {
    expect(awarded.length).toBeGreaterThan(100)
  })

  it('no longer files non-health spending under Salud', () => {
    const salud = awarded.filter((c) => departmentForTender(c) === 'salud')
    expect(salud.length).toBeGreaterThan(0)
    // Every remaining row must carry a health/social code somewhere.
    for (const c of salud) {
      const codes = (c.cpvs as string[]) ?? []
      expect(codes.some((v) => String(v).startsWith('85'))).toBe(true)
    }
  })

  it('attributes fewer contracts than the coarse category did — under-stating is the safe error', () => {
    const byCategory = awarded.filter((c) => departmentForTenderCategory(c.categoryTitle as string))
    const byCpv = awarded.filter((c) => departmentForTender(c))
    expect(byCpv.length).toBeLessThan(byCategory.length)
    expect(byCpv.length).toBeGreaterThan(byCategory.length * 0.8)
  })
})
