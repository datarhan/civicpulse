import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseConprelBudget, parseConprelRoster } from '../src/scraper/budget'

const FIXTURE = join(__dirname, 'fixtures', 'conprel_CV_2024.xls')

describe('scraper/budget — parseConprelBudget', () => {
  let budget: ReturnType<typeof parseConprelBudget>

  beforeAll(() => {
    const buf = readFileSync(FIXTURE)
    budget = parseConprelBudget(buf, { ineCode: '46214', year: 2024 })
  })

  it('finds Riba-roja de Túria by INE code 46214', () => {
    expect(budget).not.toBeNull()
    expect(budget!.ineCode).toBe('46214')
    expect(budget!.name).toMatch(/Riba-roja de T[uú]ria/i)
    expect(budget!.year).toBe(2024)
  })

  it('has 9 revenue chapters (economic classification)', () => {
    expect(budget!.revenueByEconomicChapter).toHaveLength(9)
    for (const c of budget!.revenueByEconomicChapter) {
      expect(c.code).toMatch(/^[1-9]$/)
      expect(typeof c.label).toBe('string')
      expect(c.label.length).toBeGreaterThan(3)
      expect(c.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('has 9 expense chapters (economic classification)', () => {
    expect(budget!.expenseByEconomicChapter).toHaveLength(9)
    for (const c of budget!.expenseByEconomicChapter) {
      expect(c.code).toMatch(/^[1-9]$/)
      expect(c.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('has 6 expense groups by program', () => {
    expect(budget!.expenseByProgram).toHaveLength(6)
    for (const g of budget!.expenseByProgram) {
      expect(g.label.length).toBeGreaterThan(3)
      expect(g.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('revenue chapters sum to totalRevenue (±1€)', () => {
    const sum = budget!.revenueByEconomicChapter.reduce((a, c) => a + c.amount, 0)
    expect(Math.abs(sum - budget!.totalRevenue)).toBeLessThanOrEqual(1)
  })

  it('expense economic chapters sum to totalExpense (±1€)', () => {
    const sum = budget!.expenseByEconomicChapter.reduce((a, c) => a + c.amount, 0)
    expect(Math.abs(sum - budget!.totalExpense)).toBeLessThanOrEqual(1)
  })

  it('expense program groups sum to totalExpense (±1€)', () => {
    const sum = budget!.expenseByProgram.reduce((a, g) => a + g.amount, 0)
    expect(Math.abs(sum - budget!.totalExpense)).toBeLessThanOrEqual(1)
  })

  it('reports the 2024 total budget around €39.5M (balanced)', () => {
    expect(budget!.totalRevenue).toBeGreaterThan(35_000_000)
    expect(budget!.totalRevenue).toBeLessThan(50_000_000)
    // Municipal budgets are balanced: revenue ≈ expense
    const balance = budget!.totalRevenue - budget!.totalExpense
    expect(Math.abs(balance)).toBeLessThan(10_000) // <€10k drift
  })

  it('Cap.1 "Gastos de personal" is the largest expense chapter', () => {
    const byAmount = [...budget!.expenseByEconomicChapter].sort((a, b) => b.amount - a.amount)
    expect(byAmount[0].code).toBe('1')
    expect(byAmount[0].label).toMatch(/personal/i)
  })

  it('returns null when INE code is not present', () => {
    const buf = readFileSync(FIXTURE)
    const missing = parseConprelBudget(buf, { ineCode: '00001', year: 2024 })
    expect(missing).toBeNull()
  })
})

// The peer-set sizing dependency for /eficiencia: CESEL carries no population,
// so «municipios de tamaño parecido» has to come from somewhere. It comes from
// the rows parseConprelBudget already walks — column 4 is `Pobla` — so this is
// a second reader over the same sheet, not a second download.
describe('scraper/budget — parseConprelRoster', () => {
  let roster: ReturnType<typeof parseConprelRoster>

  beforeAll(() => {
    roster = parseConprelRoster(readFileSync(FIXTURE))
  })

  it('returns every CV municipality with a positive population', () => {
    expect(roster.length).toBeGreaterThan(400)
    for (const m of roster) {
      expect(m.ine).toMatch(/^\d{5}$/)
      expect(m.nombre.length).toBeGreaterThan(1)
      expect(m.poblacion).toBeGreaterThan(0)
    }
  })

  it('agrees with parseConprelBudget on Riba-roja, so the two readers cannot drift', () => {
    const rr = roster.find((m) => m.ine === '46214')
    const budget = parseConprelBudget(readFileSync(FIXTURE), { ineCode: '46214', year: 2024 })
    expect(rr).toBeDefined()
    expect(rr!.poblacion).toBe(budget!.population)
    expect(rr!.nombre).toBe(budget!.name)
  })

  it('has no duplicate INE codes', () => {
    expect(new Set(roster.map((m) => m.ine)).size).toBe(roster.length)
  })

  it('covers the three CV provinces, not just Valencia', () => {
    const provincias = new Set(roster.map((m) => m.ine.slice(0, 2)))
    expect(provincias).toContain('46') // Valencia
    expect(provincias).toContain('03') // Alicante
    expect(provincias).toContain('12') // Castellón
  })

  it('yields a peer band big enough for the n>=15 floor to survive filtering', () => {
    const band = roster.filter((m) => m.poblacion >= 15_000 && m.poblacion <= 40_000)
    // cv-15k-40k is the committed conjunto; if the source ever shrinks below
    // this the peer comparison silently stops rendering, so pin it here.
    expect(band.length).toBeGreaterThanOrEqual(40)
    expect(band.some((m) => m.ine === '46214')).toBe(true)
  })

  it('returns an empty roster for a sheet that is not there, rather than throwing', () => {
    expect(parseConprelRoster(readFileSync(FIXTURE), { sheetName: 'No existe' })).toEqual([])
  })
})
