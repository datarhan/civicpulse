import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseCorporacion,
  canonicalCvUrl,
  stripLeadingListConjunction,
  PARTIES,
} from '../src/scraper/corporacion'

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

describe('scraper/corporacion — stripLeadingListConjunction', () => {
  // Exported so the area-fit migration applies the parser's own rule instead of
  // a second copy of it, which makes this its own published contract.
  it('drops a leading "y"', () => {
    expect(stripLeadingListConjunction('y Comercio')).toBe('Comercio')
  })

  it('drops a leading "e" — the same conjunction before an i-/hi- sound', () => {
    // No committed fixture exercises this branch yet ("…, e Igualdad" is the
    // form it would take), so it is pinned here rather than left unmeasured.
    expect(stripLeadingListConjunction('e Igualdad')).toBe('Igualdad')
  })

  it('leaves a word that merely starts with y/e alone', () => {
    for (const s of ['Igualdad', 'Educación', 'Empleo y Emprendimiento', 'Economía', 'Yacimientos'])
      expect(stripLeadingListConjunction(s)).toBe(s)
  })

  it('leaves an internal " y " phrase intact', () => {
    for (const s of ['Áreas Industriales y Cementerio', 'Finanzas públicas y recaudación'])
      expect(stripLeadingListConjunction(s)).toBe(s)
  })

  it('needs whitespace after the conjunction, not just the letter', () => {
    expect(stripLeadingListConjunction('ycomercio')).toBe('ycomercio')
    expect(stripLeadingListConjunction('y')).toBe('y')
  })

  it('does not strip Valencian "i" — only the Castilian page is scraped', () => {
    expect(stripLeadingListConjunction('i Comerç')).toBe('i Comerç')
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
    for (const o of officials) {
      expect(PARTIES).toContain(o.party)
    }
  })

  it('no councillor sits under the unnamed "Otro" fallback', () => {
    // `Otro` doubles as the LLM's "cannot tell which group is speaking"
    // sentinel downstream, and this corporación had exactly one councillor
    // under it — so publishing «el grupo Otro» named him by elimination.
    // Every seat here belongs to a group the acta de organización names.
    expect(officials.filter((o) => o.party === 'Otro')).toEqual([])
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

  it('drops the list conjunction from the last área ("…, y Comercio." → "Comercio")', () => {
    // The source prints the Áreas block as Spanish prose, so the final item is
    // introduced by «y». Splitting on comma alone published an área literally
    // named «y Comercio» on /cargos and keyed a curated area-fit row by it.
    const c = officials.find((o) => o.slug === 'jose-angel-hernandez-carrizosa')!
    expect(c.portfolios).toContain('Comercio')
    expect(c.portfolios).not.toContain('y Comercio')
  })

  it('no portfolio anywhere begins with a list conjunction', () => {
    // Measured on this fixture: exactly one did. Assert the class, not the row —
    // the next councillor to gain an área inherits the same prose. `y`/`e` only:
    // the scraped page is the Castilian one.
    const offenders = officials.flatMap((o) =>
      o.portfolios.filter((p) => /^(?:y|e)\s/i.test(p)).map((p) => `${o.slug}: ${p}`),
    )
    expect(offenders).toEqual([])
  })

  it('keeps áreas that merely START with those letters', () => {
    // «Igualdad» / «Educación» must survive: the rule is a standalone
    // conjunction followed by a space, not a leading letter.
    const strip = (raw: string) =>
      parseCorporacion(
        html.replace('Empleo y Emprendimiento, y Comercio.', `Empleo y Emprendimiento, ${raw}.`),
        { baseUrl: 'http://www.ribarroja.es' },
      ).find((o) => o.slug === 'jose-angel-hernandez-carrizosa')!.portfolios
    expect(strip('Igualdad')).toContain('Igualdad')
    expect(strip('Educaci&oacute;n')).toContain('Educación')
    expect(strip('Infancia y Adolescencia')).toContain('Infancia y Adolescencia')
  })

  it('keeps a multi-word " y " phrase inside an área intact', () => {
    // Only a LEADING conjunction is a list artifact. «Empleo y Emprendimiento»
    // and «Finanzas públicas y recaudación» are single áreas that happen to
    // contain the word.
    const c = officials.find((o) => o.slug === 'jose-angel-hernandez-carrizosa')!
    expect(c.portfolios).toContain('Empleo y Emprendimiento')
    expect(c.portfolios).toContain('Finanzas públicas y recaudación')
    expect(c.portfolios).toContain('Administración y Servicios Generales')
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
