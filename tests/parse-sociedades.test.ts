import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarSociedades, type SociedadesSnapshot } from '../src/scraper/sociedades'

/**
 * El fichero PUBLICADO es la fixture: validar una copia de laboratorio dejaría
 * el de verdad sin vigilar, que es el fallo nº1 de docs/DATA_INTEGRITY.md. Las
 * inyecciones de fallo van sobre clones.
 */
const RUTA = join(__dirname, '..', 'public/data/sociedades.json')
const real = JSON.parse(readFileSync(RUTA, 'utf8'))
const clon = (): SociedadesSnapshot => JSON.parse(JSON.stringify(real))

describe('sociedades — el fichero publicado valida', () => {
  it('mide algo: hay sociedades con hechos de verdad', () => {
    const v = validarSociedades(real)
    expect(v.sociedades.length).toBeGreaterThan(0)
    expect(v.sociedades[0].hechos.length).toBeGreaterThan(0)
  })

  it('TODO dato publicado lleva su anuncio, su URL y su cita literal', () => {
    const v = validarSociedades(real)
    for (const s of v.sociedades) {
      const fuentes = [
        s.cif?.fuente,
        s.socioUnico?.fuente,
        s.presidencia?.fuente,
        s.auditor?.fuente,
        s.hojaRegistral?.fuente,
        ...s.hechos.map((h) => h.fuente),
      ].filter(Boolean)
      expect(fuentes.length, `${s.id} no publica ningún dato con fuente`).toBeGreaterThan(3)
      for (const f of fuentes) {
        expect(f!.url, `${s.id}: fuente sin URL resoluble`).toMatch(/^https?:\/\//)
        expect(f!.cita.length, `${s.id}: fuente sin cita literal`).toBeGreaterThan(14)
      }
    }
  })

  it('cada ficha declara lo que NO establece', () => {
    for (const s of validarSociedades(real).sociedades) {
      expect(s.limites.length, `${s.id} no declara límites`).toBeGreaterThan(1)
    }
  })

  it('ninguna cita es una paráfrasis: el texto citado es del anuncio', () => {
    // La cita del socio único tiene que ser literal del BORME, no un resumen.
    const h = validarSociedades(real).sociedades.find((s) => s.id === 'hidraqua')!
    expect(h.socioUnico!.fuente.cita).toContain('Socio único')
    expect(h.socioUnico!.fuente.cita).toContain(h.socioUnico!.valor)
  })
})

describe('sociedades — inyecciones de fallo', () => {
  it('un dato sin fuente no publica: es la regla entera de este fichero', () => {
    const c = clon() as unknown as { sociedades: Array<Record<string, unknown>> }
    delete (c.sociedades[0].socioUnico as Record<string, unknown>).fuente
    expect(() => validarSociedades(c)).toThrow(/sin fuente|fuente/)
  })

  it('una fuente sin cita literal no publica: sin verbatim no es comprobable', () => {
    const c = clon()
    c.sociedades[0].socioUnico!.fuente.cita = 'lo dice el BORME'
    expect(() => validarSociedades(c)).toThrow(/cita/)
  })

  it('una fuente sin URL resoluble no publica', () => {
    const c = clon()
    c.sociedades[0].auditor!.fuente.url = 'BORME-A-2026-43-03'
    expect(() => validarSociedades(c)).toThrow(/url/)
  })

  it('una ficha sin límites no publica: fingiría saberlo todo', () => {
    const c = clon()
    c.sociedades[0].limites = []
    expect(() => validarSociedades(c)).toThrow(/limites/)
  })

  it('un campo con forma de juicio no publica: aquí no se valora a nadie', () => {
    const c = clon() as unknown as { sociedades: Array<Record<string, unknown>> }
    c.sociedades[0].sospecha = 'contratos sin concurrencia'
    expect(() => validarSociedades(c)).toThrow(/campo prohibido/)
  })

  it('un campo del esquema de pleno no publica: alguien copió una fila', () => {
    const c = clon() as unknown as { sociedades: Array<Record<string, unknown>> }
    c.sociedades[0].severity = 'critical'
    expect(() => validarSociedades(c)).toThrow(/campo prohibido/)
  })

  it('un método que no explica cómo se obtuvo el material no publica', () => {
    const c = clon()
    c.metodo = 'BORME'
    expect(() => validarSociedades(c)).toThrow(/metodo/)
  })
})
