import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseInePadron } from '../src/scraper/padron'

const FIXTURE = join(__dirname, 'fixtures', 'ine_2903_valencia_2026-04-19.csv')

describe('scraper/padron — parseInePadron', () => {
  let series: ReturnType<typeof parseInePadron>

  beforeAll(() => {
    series = parseInePadron(readFileSync(FIXTURE, 'utf8'), { ineCode: '46214' })
  })

  it('returns a non-empty series', () => {
    expect(series).not.toBeNull()
    expect(series!.ineCode).toBe('46214')
    expect(series!.name).toMatch(/Riba-roja/i)
  })

  it('has Total/Hombres/Mujeres breakdowns', () => {
    expect(series!.total.length).toBeGreaterThan(0)
    expect(series!.men.length).toBeGreaterThan(0)
    expect(series!.women.length).toBeGreaterThan(0)
  })

  it('covers at least 20 years of padrón history', () => {
    expect(series!.total.length).toBeGreaterThanOrEqual(20)
  })

  it('is sorted by year ascending', () => {
    for (let i = 0; i < series!.total.length - 1; i++) {
      expect(series!.total[i].year).toBeLessThan(series!.total[i + 1].year)
    }
  })

  it('reports the official 2025 population (24,616) for Riba-roja', () => {
    const latest = series!.total[series!.total.length - 1]
    expect(latest.year).toBeGreaterThanOrEqual(2025)
    expect(latest.value).toBe(24616)
  })

  it('men + women sums equal total for every covered year (±1 for rounding)', () => {
    for (const t of series!.total) {
      const m = series!.men.find((x) => x.year === t.year)?.value || 0
      const w = series!.women.find((x) => x.year === t.year)?.value || 0
      expect(Math.abs(m + w - t.value)).toBeLessThanOrEqual(1)
    }
  })

  it('computes positive growth from 2014 → latest (Riba-roja is growing)', () => {
    const fromYear = 2014
    const start = series!.total.find((t) => t.year === fromYear)
    const end = series!.total[series!.total.length - 1]
    expect(start).toBeDefined()
    const growthPct = ((end.value - start!.value) / start!.value) * 100
    expect(growthPct).toBeGreaterThan(5) // >5% growth over 10+ years
  })

  it('returns null when INE code does not match any row', () => {
    const missing = parseInePadron(readFileSync(FIXTURE, 'utf8'), { ineCode: '99999' })
    expect(missing).toBeNull()
  })
})
