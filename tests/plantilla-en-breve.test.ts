/**
 * «¿Cuánta gente trabaja en el Ayuntamiento?» en /empleo-publico: las dos cifras
 * de plantilla.json y qué mitades de la frase tienen dato. Las variantes que
 * fuerzan un caso son copias del fichero publicado con un campo cambiado.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { puenteDePlantilla } from '../src/scraper/plantilla-en-breve'

const PLANTILLA = JSON.parse(readFileSync('public/data/plantilla.json', 'utf8'))

describe('puenteDePlantilla', () => {
  it('mide algo: el fichero publicado trae las dos cifras, cada una con su año', () => {
    const p = puenteDePlantilla(PLANTILLA)!
    expect(p.personas).toEqual({ n: PLANTILLA.total, anio: PLANTILLA.asOf.slice(0, 4) })
    expect(p.plazas).toEqual({
      n: PLANTILLA.authorized.plazas,
      anio: String(PLANTILLA.authorized.asOf).slice(0, 4),
      aprox: PLANTILLA.authorized.approx === true,
    })
  })

  it('las dos cifras son de años distintos: por eso la frase dice que no se restan', () => {
    const p = puenteDePlantilla(PLANTILLA)!
    expect(p.personas!.anio).not.toBe(p.plazas!.anio)
  })

  it('una cifra sin su año no entra en la frase', () => {
    expect(puenteDePlantilla({ ...PLANTILLA, asOf: null })!.personas).toBeNull()
    const sinAnio = { ...PLANTILLA, authorized: { ...PLANTILLA.authorized, asOf: undefined } }
    expect(puenteDePlantilla(sinAnio)!.plazas).toBeNull()
  })

  it('un cero o una casilla vacía no es una cifra', () => {
    expect(puenteDePlantilla({ ...PLANTILLA, total: 0 })!.personas).toBeNull()
    const sinPlazas = { ...PLANTILLA, authorized: { ...PLANTILLA.authorized, plazas: null } }
    expect(puenteDePlantilla(sinPlazas)!.plazas).toBeNull()
  })

  it('«unas» sólo cuando el fichero dice que la suma es aproximada', () => {
    const exacta = { ...PLANTILLA, authorized: { ...PLANTILLA.authorized, approx: false } }
    expect(puenteDePlantilla(exacta)!.plazas!.aprox).toBe(false)
  })

  it('sin ninguna de las dos, no hay frase', () => {
    expect(puenteDePlantilla({ ...PLANTILLA, total: null, authorized: null })).toBeNull()
    expect(puenteDePlantilla(null)).toBeNull()
  })
})
