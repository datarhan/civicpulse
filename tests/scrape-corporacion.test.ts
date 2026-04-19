import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCorporacion } from '../src/scraper/corporacion'

const FIXTURE = join(__dirname, 'fixtures', 'corporacion_2026-04-19.html')

describe('scraper/corporacion — parseCorporacion', () => {
  let html: string
  let officials: ReturnType<typeof parseCorporacion>

  beforeAll(() => {
    html = readFileSync(FIXTURE, 'utf8')
    officials = parseCorporacion(html, { baseUrl: 'http://www.ribarroja.es' })
  })

  it('returns at least 21 officials (the full council + mayor = 21 seats)', () => {
    expect(officials.length).toBeGreaterThanOrEqual(21)
  })

  it('flags exactly one alcalde', () => {
    const mayors = officials.filter((o) => o.role === 'alcalde')
    expect(mayors).toHaveLength(1)
  })

  it('marks Robert Raga Gadea as the mayor', () => {
    const mayor = officials.find((o) => o.role === 'alcalde')!
    expect(mayor.name).toMatch(/Robert Raga Gadea/i)
    expect(mayor.party).toBe('PSOE')
  })

  it('every official has a non-empty name', () => {
    for (const o of officials) {
      expect(o.name.trim().length).toBeGreaterThan(3)
    }
  })

  it('every official has an absolute photo URL served from ribarroja.es', () => {
    for (const o of officials) {
      expect(o.photoUrl).toMatch(/^https?:\/\/.*ribarroja\.es\/.*downloadimg\.action\?id=\d+/)
    }
  })

  it('every official has a recognised party code', () => {
    const allowed = new Set(['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro'])
    for (const o of officials) {
      expect(allowed.has(o.party)).toBe(true)
    }
  })

  it('council composition matches the 2023 election outcome (10 PSOE / 7 PP / 1 VOX / 1 Compromís)', () => {
    const by = (p: string) => officials.filter((o) => o.party === p).length
    expect(by('PSOE')).toBeGreaterThanOrEqual(10)
    expect(by('PP')).toBeGreaterThanOrEqual(7)
    expect(by('VOX')).toBeGreaterThanOrEqual(1)
    expect(by('Compromís')).toBeGreaterThanOrEqual(1)
  })

  it('mayor has both Alcaldía portfolio and a contact email', () => {
    const mayor = officials.find((o) => o.role === 'alcalde')!
    expect(mayor.portfolios.some((p) => /alcaldía/i.test(p))).toBe(true)
    expect(mayor.email).toMatch(/@ribarroja\.es$/)
  })

  it('portfolios are non-empty strings with no leftover HTML entities', () => {
    const withPort = officials.filter((o) => o.portfolios.length > 0)
    expect(withPort.length).toBeGreaterThanOrEqual(10) // at least the governing team
    for (const o of withPort) {
      for (const p of o.portfolios) {
        expect(p).not.toMatch(/&[a-z]+;/i)
        expect(p.length).toBeGreaterThan(2)
      }
    }
  })

  it('produces stable slugs (lowercase, ascii, hyphenated)', () => {
    for (const o of officials) {
      expect(o.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    // Slugs are unique
    const slugs = officials.map((o) => o.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
