import { describe, it, expect } from 'vitest'
import { departmentForTenderCategory, TENDER_CATEGORY_DEPARTMENT } from '../src/scraper/departments'
import { ALLOWED_DEPARTMENT_SLUGS } from '../src/scraper/departments'

/**
 * Contracts are the largest money dataset in the project (804 awarded rows) and
 * until now none of them reached a concejalía: `categoryTitle` is an English
 * enum from Gobierto, while `canonicalizeDepartment` only has Spanish keyword
 * rules, so every row returned null.
 *
 * The mapping is deliberately incomplete. "other", "legal", "catering",
 * "textile", "industry" and "electrical" can each belong to several areas, and
 * a wrong owner on a spending figure is worse than an honest blank — the same
 * under-match discipline the tender place-resolver uses.
 */
describe('departments — departmentForTenderCategory', () => {
  it('maps the unambiguous categories to real department slugs', () => {
    expect(departmentForTenderCategory('construction')).toBe('obras-publicas')
    expect(departmentForTenderCategory('architecture')).toBe('urbanismo')
    expect(departmentForTenderCategory('environment')).toBe('medio-ambiente')
    expect(departmentForTenderCategory('transportation')).toBe('movilidad')
    expect(departmentForTenderCategory('health')).toBe('salud')
    expect(departmentForTenderCategory('it')).toBe('innovacion')
    expect(departmentForTenderCategory('agriculture')).toBe('agricultura')
    expect(departmentForTenderCategory('real_estate')).toBe('vivienda')
    expect(departmentForTenderCategory('finance')).toBe('hacienda')
  })

  it('refuses the genuinely ambiguous ones rather than guessing an owner', () => {
    for (const c of ['other', 'legal', 'catering', 'textile', 'industry', 'electrical']) {
      expect(departmentForTenderCategory(c)).toBeNull()
    }
  })

  it('is case- and whitespace-insensitive', () => {
    expect(departmentForTenderCategory('  Construction ')).toBe('obras-publicas')
  })

  it('returns null for unknown, empty or missing input', () => {
    expect(departmentForTenderCategory('bananas')).toBeNull()
    expect(departmentForTenderCategory('')).toBeNull()
    expect(departmentForTenderCategory(undefined)).toBeNull()
  })

  it('every mapped target is a real canonical department', () => {
    const allowed = new Set<string>(ALLOWED_DEPARTMENT_SLUGS)
    for (const [cat, slug] of Object.entries(TENDER_CATEGORY_DEPARTMENT)) {
      expect(allowed.has(slug), `${cat} → ${slug}`).toBe(true)
    }
  })
})
