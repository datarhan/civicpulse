import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePlenoAgenda } from '../src/scraper/pleno-agenda'

const FIXTURE = join(__dirname, 'fixtures', 'rr_pleno_20_abril_2026.html')

describe('scraper/pleno-agenda — parsePlenoAgenda', () => {
  let result: ReturnType<typeof parsePlenoAgenda>

  beforeAll(() => {
    // HTML is latin-1 encoded on ribarroja.es; readFileSync returns a Buffer
    // that the parser normalises internally.
    const buf = readFileSync(FIXTURE)
    result = parsePlenoAgenda(buf)
  })

  it('returns a non-null agenda', () => {
    expect(result).not.toBeNull()
  })

  it('extracts the full agenda (at least 8 items for this fixture)', () => {
    expect(result!.items.length).toBeGreaterThanOrEqual(8)
  })

  it('every agenda item has a number, title, and optional dept/expediente', () => {
    for (const it of result!.items) {
      expect(typeof it.number).toBe('number')
      expect(it.number).toBeGreaterThan(0)
      expect(it.title.length).toBeGreaterThan(3)
      if (it.expediente) expect(it.expediente).toMatch(/\d+\/\d{4}/)
    }
  })

  it('recognises the classic pleno sections (resolutiva, informativa, ruegos)', () => {
    const sections = new Set(result!.items.map((i) => i.section))
    // At least one of these three known sections should appear
    expect(
      sections.has('resolutiva') || sections.has('informativa') || sections.has('ruegos'),
    ).toBe(true)
  })

  it('captures the "Ruegos y preguntas" item when present', () => {
    const has = result!.items.some((i) => /ruegos y preguntas/i.test(i.title))
    expect(has).toBe(true)
  })

  it('numbers are strictly increasing and unique', () => {
    const nums = result!.items.map((i) => i.number)
    const sorted = [...nums].sort((a, b) => a - b)
    expect(nums).toEqual(sorted)
    expect(new Set(nums).size).toBe(nums.length)
  })

  it('extracts at least one department label (TRANSPARENCIA / URBANISMO / INTEGRIDAD / ...)', () => {
    const withDept = result!.items.filter((i) => i.department)
    expect(withDept.length).toBeGreaterThanOrEqual(1)
    for (const it of withDept) {
      expect(it.department!.length).toBeGreaterThan(2)
      // Department is uppercase in source HTML; parser should preserve or normalise consistently.
      expect(it.department).toMatch(/^[A-ZÁÉÍÓÚÑ\s]+$/i)
    }
  })

  it('resolves a canonical departmentSlug for every recognised raw department', () => {
    const withDept = result!.items.filter((i) => i.department)
    for (const it of withDept) {
      // Every recognised uppercase department in the acta should map to a
      // canonical slug. If a new department appears on the fixture that
      // canonicalizeDepartment doesn't know about, extend departments.ts —
      // don't silently drop it.
      expect(it.departmentSlug, `no canonical slug for ${it.department}`).not.toBeNull()
      expect(it.departmentSlug).toMatch(/^[a-z-]+$/)
    }
  })

  it('items without a raw department leave departmentSlug null (never fabricated)', () => {
    const withoutDept = result!.items.filter((i) => !i.department)
    for (const it of withoutDept) {
      expect(it.departmentSlug).toBeNull()
    }
  })
})
