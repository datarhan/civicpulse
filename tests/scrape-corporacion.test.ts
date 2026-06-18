import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCorporacion, canonicalCvUrl } from '../src/scraper/corporacion'

const FIXTURE = join(__dirname, 'fixtures', 'corporacion_2026-04-19.html')

describe('scraper/corporacion — canonicalCvUrl (biography link repair)', () => {
  const base = 'https://www.ribarroja.es'
  const LIVE =
    'https://www.ribarroja.es/es/portal_de_transparencia/' +
    'informacion_sobre_la_corporacion_municipal/' +
    'datos_biograficos_del_alcalde_sa_y_concejales/contenidos/864708/0835919'

  it('rewrites the dead Valencian/HTTP bio link to the live HTTPS Spanish path', () => {
    const dead =
      'http://www.ribarroja.es/portal_de_transparencia/informacio_sobre_la_corporacio_municipal/' +
      'dades_biografiques_de_lalcalde_sa_i_regidors_es/continguts/864708/0835919'
    expect(canonicalCvUrl(dead, base)).toBe(LIVE)
  })

  it('preserves the content-id regardless of source language/path', () => {
    expect(canonicalCvUrl(LIVE, base)).toBe(LIVE)
  })

  it('returns null when there is no link', () => {
    expect(canonicalCvUrl(null, base)).toBeNull()
    expect(canonicalCvUrl(undefined, base)).toBeNull()
  })

  it('leaves an unrecognised href absolutised but untouched', () => {
    expect(canonicalCvUrl('/es/otra-pagina', base)).toBe('https://www.ribarroja.es/es/otra-pagina')
  })
})

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

  it('every official has either a well-formed photo URL or an empty string (missing on the source site)', () => {
    const valid = /^https?:\/\/.*ribarroja\.es\/.*downloadimg\.action\?id=\d+/
    for (const o of officials) {
      if (o.photoUrl !== '') {
        expect(o.photoUrl).toMatch(valid)
      }
    }
    // At least 90% of councillors must have a photo — the municipal site
    // sometimes leaves one or two blank (known gap as of 2026-04-19).
    const withPhoto = officials.filter((o) => o.photoUrl !== '').length
    expect(withPhoto / officials.length).toBeGreaterThanOrEqual(0.9)
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
