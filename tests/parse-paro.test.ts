import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSepeParoMonth } from '../src/scraper/paro'

const FIXTURE = join(__dirname, 'fixtures', 'sepe_CV_enero_2026.xls')

describe('scraper/paro — parseSepeParoMonth', () => {
  let snapshot: ReturnType<typeof parseSepeParoMonth>

  beforeAll(() => {
    const buf = readFileSync(FIXTURE)
    snapshot = parseSepeParoMonth(buf, { municipio: 'Riba-roja de Túria', period: '2026-01' })
  })

  it('returns a non-null snapshot for Riba-roja', () => {
    expect(snapshot).not.toBeNull()
    expect(snapshot!.period).toBe('2026-01')
  })

  it('extracts total + men + women unemployment for that month', () => {
    expect(snapshot!.total).toBeGreaterThan(500)
    expect(snapshot!.total).toBeLessThan(5000)
    expect(snapshot!.men).toBeGreaterThan(100)
    expect(snapshot!.women).toBeGreaterThan(100)
  })

  it('men + women approximately equals total (within ±5 for rounding)', () => {
    const diff = Math.abs(snapshot!.men + snapshot!.women - snapshot!.total)
    expect(diff).toBeLessThanOrEqual(5)
  })

  it('returns null when the municipality is not present', () => {
    const buf = readFileSync(FIXTURE)
    const missing = parseSepeParoMonth(buf, {
      municipio: 'Municipio Inventado',
      period: '2026-01',
    })
    expect(missing).toBeNull()
  })
})
