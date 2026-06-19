import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTransparencyDocs, type TransparencyDoc } from '../src/scraper/transparency'

const FIXTURE = join(__dirname, 'fixtures', 'ribarroja_transparency_rpt_2026-06-18.html')

describe('scraper/transparency — parseTransparencyDocs', () => {
  let docs: TransparencyDoc[]

  beforeAll(() => {
    docs = parseTransparencyDocs(readFileSync(FIXTURE, 'utf8'), {
      category: 'rpt',
      categoryLabel: 'Relación de puestos de trabajo (RPT) y plantilla',
    })
  })

  it('extracts every PDF anchor on the index page', () => {
    expect(docs.length).toBe(5)
  })

  it('absolutises hrefs to the official files path', () => {
    for (const d of docs) {
      expect(d.url).toMatch(/^https:\/\/www\.ribarroja\.es\/sites\/.*\.pdf$/i)
    }
  })

  it('uses the clean human anchor text as the title (not the mangled filename)', () => {
    expect(docs[0].title).toMatch(/Relació de Llocs de Treball/)
    expect(docs[0].title).not.toMatch(/\.pdf$/i)
  })

  it('lifts the year from the title', () => {
    expect(docs.map((d) => d.year)).toContain(2016)
    for (const d of docs) if (d.year !== null) expect(d.year).toBeGreaterThanOrEqual(2010)
  })

  it('stamps the supplied category on every doc', () => {
    for (const d of docs) {
      expect(d.category).toBe('rpt')
      expect(d.categoryLabel).toMatch(/puestos de trabajo/i)
    }
  })

  it('assigns stable unique ids', () => {
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length)
    for (const d of docs) expect(d.id).toMatch(/^[0-9a-f]{6,}$/)
  })
})
