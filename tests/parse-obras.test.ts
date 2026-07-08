import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseObrasList } from '../src/scraper/obras'
import { parseObraFicha } from '../src/scraper/obras'

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
})
