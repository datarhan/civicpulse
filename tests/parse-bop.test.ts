import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBopBulletin, type BopAnuncio } from '../src/scraper/bop'

const FIXTURE = join(__dirname, 'fixtures', 'bop_sumario_2026-06-18.txt')

describe('scraper/bop — parseBopBulletin', () => {
  let anuncios: BopAnuncio[]

  beforeAll(() => {
    anuncios = parseBopBulletin(readFileSync(FIXTURE, 'utf8'), '18/06/2026', '2026-06-18')
  })

  it('extracts the Riba-roja anuncio (and only it) from a mixed sumario', () => {
    expect(anuncios.length).toBe(1)
    expect(anuncios[0].entity).toBe('Ayuntamiento de Riba-roja de Túria')
  })

  it('attributes the correct register number (follows the title, not a neighbour)', () => {
    // The fixture has Rafelbunyol 2026/07381 just before our heading and
    // Sagunto after — the parser must pick Riba-roja's own 2026/07376.
    expect(anuncios[0].regNumber).toBe('2026/07376')
  })

  it('captures the full anuncio title without the trailing reg or period', () => {
    expect(anuncios[0].title).toMatch(/oferta de empleo público/i)
    expect(anuncios[0].title).not.toMatch(/2026\/07376/)
    expect(anuncios[0].title).not.toMatch(/\.$/)
    expect(anuncios[0].title).not.toMatch(/Rafelbunyol|Sagunto/)
  })

  it('builds stable id + per-anuncio + bulletin PDF URLs', () => {
    const a = anuncios[0]
    expect(a.id).toMatch(/^[0-9a-f]{6,}$/)
    expect(a.pdfUrl).toBe('https://bop.dival.es/bop/downloads?anuncioNumReg=2026%2F07376')
    expect(a.bulletinUrl).toBe('https://bop.dival.es/bop/downloads?boletinFecha=18%2F06%2F2026')
    expect(a.date).toBe('2026-06-18')
    expect(a.bulletinDate).toBe('18/06/2026')
  })

  it('returns an empty list for a bulletin with no Riba-roja anuncio', () => {
    const noRiba = 'Ayuntamiento de Sagunto Anuncio sobre algo. 2026/09999 Diputación de València'
    expect(parseBopBulletin(noRiba, '01/01/2026', '2026-01-01')).toEqual([])
  })
})
