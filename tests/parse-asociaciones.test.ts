import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAsociacionesPdf } from '../src/scraper/asociaciones'

const text = readFileSync(join(__dirname, 'fixtures', 'asociaciones_2026-05-28.txt'), 'utf8')
const doc = parseAsociacionesPdf(text)

describe('parseAsociacionesPdf', () => {
  it('reads the register date', () => {
    expect(doc.fechaRegistro).toMatch(/2026/)
  })

  it('extracts the association rows', () => {
    expect(doc.asociaciones.length).toBeGreaterThanOrEqual(80)
    for (const a of doc.asociaciones) expect(a.nombre.length).toBeGreaterThan(2)
  })

  it('splits nombre / tipo / email on a known row', () => {
    const c = doc.asociaciones.find((a) => a.nombre.startsWith('Centro Cultural Cervantes'))!
    expect(c.tipo).toBe('Cultural')
    expect(c.email).toBe('afacundo@dib.upv.es')
    // most rows classify a tipo from the controlled vocabulary
    const typed = doc.asociaciones.filter((a) => a.tipo).length
    expect(typed).toBeGreaterThan(doc.asociaciones.length * 0.7)
  })
})
