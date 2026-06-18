import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOfficialNewsRss, mergeNewsItems } from '../src/scraper/press'

const FIXTURE = join(__dirname, 'fixtures', 'ribarroja_noticias_2026-06-18.xml')

describe('scraper/press — parseOfficialNewsRss (ribarroja.es official feed)', () => {
  let items: ReturnType<typeof parseOfficialNewsRss>

  beforeAll(() => {
    items = parseOfficialNewsRss(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses every <item> from the municipal feed', () => {
    expect(items.length).toBe(3)
  })

  it('stamps every row as the official town-hall source', () => {
    for (const i of items) {
      expect(i.source).toBe('Ayuntamiento de Riba-roja de Túria')
      expect(i.sourceHost).toBe('ribarroja.es')
      expect(i.official).toBe(true)
    }
  })

  it('every item link points into the official site', () => {
    for (const i of items) {
      expect(i.link).toMatch(/^https:\/\/www\.ribarroja\.es\//)
    }
  })

  it('extracts the Sección taxonomy when present, null otherwise', () => {
    const sections = items.map((i) => i.section)
    // two of the three fixture items carry a Sección field
    expect(sections.filter(Boolean).length).toBe(2)
    expect(sections).toContain('Fomento economico y Comercio')
    expect(sections).toContain('Patrimonio y Turismo')
    expect(sections).toContain(null)
  })

  it('does not leak raw HTML markup into title or section', () => {
    for (const i of items) {
      expect(i.title).not.toMatch(/[<>]/)
      if (i.section) expect(i.section).not.toMatch(/[<>]/)
    }
  })

  it('emits ISO dates and sorts newest-first', () => {
    for (const i of items) expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
    for (let k = 0; k < items.length - 1; k++) {
      expect(new Date(items[k].date).getTime()).toBeGreaterThanOrEqual(
        new Date(items[k + 1].date).getTime(),
      )
    }
  })

  it('assigns unique fingerprints + ids', () => {
    expect(new Set(items.map((i) => i.fingerprint)).size).toBe(items.length)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('official rows merge ahead of press rows when fingerprints collide (first-wins)', () => {
    const official = items[0]
    const pressDup = {
      ...official,
      source: 'Levante-EMV',
      sourceHost: 'levante-emv.com',
      official: false as const,
      section: null,
    }
    const merged = mergeNewsItems(items, [pressDup])
    const found = merged.find((m) => m.fingerprint === official.fingerprint)
    expect(found?.source).toBe('Ayuntamiento de Riba-roja de Túria')
    expect(found?.official).toBe(true)
  })
})
