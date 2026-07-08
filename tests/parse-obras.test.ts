import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseObrasList } from '../src/scraper/obras'

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
