import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseObrasList } from '../src/scraper/obras'
import { parseObraFicha } from '../src/scraper/obras'
import { parseRenoveList, parseRenoveFicha } from '../src/scraper/obras'

const html = readFileSync(join(__dirname, 'fixtures', 'obras-listing_2026-07.html'), 'utf8')

describe('parseObrasList', () => {
  const rows = parseObrasList(html)
  it('extracts the 7 obra fichas with clean names + absolute pdf urls', () => {
    expect(rows.length).toBe(7)
    for (const r of rows) {
      expect(r.fichaUrl).toMatch(/^https?:\/\/.*\.pdf/i)
      expect(r.nombre).not.toMatch(/ficha|^\d+_/i) // "NN_Ficha obra " prefix stripped
      expect(r.nombre.length).toBeGreaterThan(3)
    }
    expect(rows[0].nombre).toBe('Porta del Barranc')
    expect(rows.some((r) => r.nombre.includes('Cementerio'))).toBe(true)
    expect(rows.some((r) => r.nombre.includes('CV-372'))).toBe(true)
  })
})

describe('parseObraFicha', () => {
  const porta = parseObraFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-ficha-porta-del-barranc.txt'), 'utf8'),
  )
  const rotondas = parseObraFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-ficha-rotondas-cv.txt'), 'utf8'),
  )

  it('extracts importes in template order (licitación then adjudicación)', () => {
    expect(porta.importeLicitacion).toBe(925455.74)
    expect(porta.importeAdjudicacion).toBe(668086.5)
    expect(rotondas.importeLicitacion).toBe(1338720.71)
    expect(rotondas.importeAdjudicacion).toBe(1175687.69)
  })

  it('extracts plazo, inicio (ISO), and empresa', () => {
    expect(porta.plazoMeses).toBe(6)
    expect(porta.inicio).toBe('2019-03-25')
    expect(porta.empresa).toBe('LICUAS, S.A.')
  })

  it('omits fields that are absent rather than guessing (rotondas has no inicio)', () => {
    expect(rotondas.inicio).toBeUndefined()
    expect(rotondas.plazoMeses).toBe(7)
  })

  it('NEVER leaks the técnico municipal (libel-adjacent) into any parsed field', () => {
    // The Porta del Barranc ficha names "Ana Teresí Brisa, arquitecta municipal"
    // as the técnico responsable. That named individual must not appear in the
    // parser output — the técnico is deliberately not parsed. Lock the invariant.
    expect(JSON.stringify(porta)).not.toMatch(/Brisa|arquitect|t[eé]cnic/i)
  })
})

// ---------------------------------------------------------------------------
// Plan RENOVE (vías y obras · fichas feb 2024) — second official obra source.
// Same publisher (ribarroja.es), different listing page + ficha template.
// ---------------------------------------------------------------------------

const renoveHtml = readFileSync(join(__dirname, 'fixtures', 'renove-listing_2026-07.html'), 'utf8')

describe('parseRenoveList', () => {
  const rows = parseRenoveList(renoveHtml)

  it('extracts the 7 renove fichas with clean names + absolute pdf urls', () => {
    expect(rows.length).toBe(7)
    for (const r of rows) {
      expect(r.fichaUrl).toMatch(/^https?:\/\/.*\.pdf/i)
      expect(r.nombre).not.toMatch(/^fichas?\b|plan renove/i) // listing prefixes stripped
      expect(r.nombre.length).toBeGreaterThan(3)
    }
    expect(rows.map((r) => r.nombre)).toContain('Asfaltado La Llobatera II')
    expect(rows.map((r) => r.nombre)).toContain('Acera Rosalía de Castro')
    expect(rows.map((r) => r.nombre)).toContain('Aparcamiento Pacadar')
  })

  it('excludes the program overview PDF (not a ficha)', () => {
    expect(rows.some((r) => /adecuaci|viales/i.test(r.nombre))).toBe(false)
  })
})

describe('parseRenoveFicha', () => {
  const llobatera = parseRenoveFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-renove-ficha-llobatera.txt'), 'utf8'),
  )
  const pacadar = parseRenoveFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-renove-ficha-pacadar.txt'), 'utf8'),
  )
  const montealcedo = parseRenoveFicha(
    readFileSync(
      join(__dirname, 'fixtures', 'obra-renove-ficha-accesibilidad-montealcedo.txt'),
      'utf8',
    ),
  )

  it('extracts the single coste total previsto (never fabricates a licitación pair)', () => {
    expect(llobatera.costePrevisto).toBe(22998.47)
    expect(pacadar.costePrevisto).toBe(95565.8) // "IVA incluido" bilingual dup counted once
    expect(montealcedo.costePrevisto).toBe(14534.31)
  })

  it('extracts fecha ejecución as ISO from DD/MM/YYYY', () => {
    expect(llobatera.fechaEjecucion).toBe('2024-02-02')
    expect(pacadar.fechaEjecucion).toBe('2023-12-18')
    expect(montealcedo.fechaEjecucion).toBe('2024-01-19')
  })

  it('extracts the adjudicatario, including companies split across pdf lines', () => {
    expect(llobatera.empresa).toBe('BECSA, S.A.U.')
    expect(pacadar.empresa).toBe('RAYSO SERVICIOS 2014, S.L.')
    expect(montealcedo.empresa).toBe('OBRAS PÚBLICAS MONTANER 1, S.L.')
  })

  it('extracts the zona afectada (the geo-resolution input) and financiación', () => {
    expect(llobatera.zona).toContain('Calle del Rotgle')
    expect(llobatera.zona).toContain('Urb. La Llobatera')
    expect(pacadar.zona).toContain('complejo deportivo La Mallà')
    expect(montealcedo.zona).toContain('C/ Mariano Benlliure')
    expect(llobatera.financiacion).toBe('Fondos propios')
  })

  it('zona never swallows the fecha or the empresa (field boundaries hold)', () => {
    expect(llobatera.zona).not.toMatch(/\d{2}\/\d{2}\/20\d{2}|BECSA/)
    expect(pacadar.zona).not.toMatch(/RAYSO/)
  })
})
