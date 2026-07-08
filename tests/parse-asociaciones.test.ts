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

  const byName = (needle: string) =>
    doc.asociaciones.find((a) => a.nombre.toLowerCase().includes(needle.toLowerCase()))!

  // Lock the rewritten extractEmail branches (the plan's parser was incomplete;
  // these pin the guarded trims so a monthly re-run can't silently regress).
  it('town-strip removes only a LEADING glued town, never one inside the email', () => {
    // "…de la ciudad de Valencia" glues "Valencia" onto the email; the leading
    // town is stripped but the in-address-part "VALENCIA" is preserved.
    const a = byName('Casa Peru')
    expect(a.tipo).toBe('Cultural')
    expect(a.email).toBe('CASAPERUVALENCIA@GMAIL.COM')
  })

  it('handles the "…s/n" address tail before the email', () => {
    const a = byName('Artistas de Riba-roja')
    expect(a.email).toBe('artistasderibaroja@gmail.com')
  })

  it('reconstructs a wrapped (multi-line) row', () => {
    const a = byName('PARQUE MONTEALCEDO')
    expect(a.tipo).toBe('Vecinal')
    expect(a.email).toBe('asociacionparquemontealcedo@gmail.com')
  })

  it('KNOWN LIMITATION: an internal-word glue yields a wrong email (Wave 3.1 gazetteer)', () => {
    // "Espai Dona" + "donesmediterrania@…" glue across an internal word boundary
    // is deterministically undetectable; documented so a future fix flips this
    // assertion. The email field is OMITTED from the published snapshot for
    // exactly this reason (see scrape-asociaciones.ts).
    const a = byName('Dones de la Mediterránea')
    expect(a.email).toBe('Donadonesmediterrania@gmail.com')
  })
})
