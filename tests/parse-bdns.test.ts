import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBdnsConvocatorias } from '../src/scraper/bdns'

const FIXTURE = join(__dirname, 'fixtures', 'bdns_riba-roja_2026-04-19.json')

describe('scraper/bdns — parseBdnsConvocatorias', () => {
  let items: ReturnType<typeof parseBdnsConvocatorias>

  beforeAll(() => {
    items = parseBdnsConvocatorias(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses every convocatoria in the paginated dump (~170)', () => {
    expect(items.length).toBeGreaterThanOrEqual(150)
    expect(items.length).toBeLessThanOrEqual(300)
  })

  it('every item has a BDNS code, description, date, and source URL', () => {
    for (const it of items) {
      expect(it.bdnsCode.length).toBeGreaterThan(2)
      expect(it.description.length).toBeGreaterThan(5)
      expect(it.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(it.sourceUrl).toMatch(/^https?:\/\/.*pap\.hacienda\.gob\.es/)
    }
  })

  it('classifies items as municipal (granted by the Ayuntamiento) vs received', () => {
    const muni = items.filter((i) => i.direction === 'granted')
    const received = items.filter((i) => i.direction === 'received')
    // At least some of each should exist in a 2-year window
    expect(muni.length + received.length).toBe(items.length)
    expect(muni.length).toBeGreaterThan(10)
  })

  it('every BDNS code is unique', () => {
    const codes = items.map((i) => i.bdnsCode)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('is sorted newest-first', () => {
    for (let i = 0; i < items.length - 1; i++) {
      const a = new Date(items[i].date).getTime()
      const b = new Date(items[i + 1].date).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })

  it('includes at least one 2026 convocatoria from the Ayuntamiento', () => {
    const recent = items.filter(
      (i) => i.direction === 'granted' && i.date.startsWith('2026')
    )
    expect(recent.length).toBeGreaterThanOrEqual(1)
  })
})
