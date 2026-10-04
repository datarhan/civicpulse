import { describe, expect, it } from 'vitest'

import { classifyAttribution, tallyProvenance } from '../src/scraper/claim-provenance'

/**
 * Una atribución firmada por una persona no es un partido cambiado que retirar
 * a máquina.
 *
 * `check:claim-provenance` coteja el grupo publicado con el que da HOY el mapa
 * de voces, y `retract-attribution --from-check` retira lo que sale
 * `partido-distinto`. Una firma existe precisamente donde el mapa no acredita
 * quién hablaba —en las seis declaraciones de sesiones con mapa que la
 * motivaron, el mapa no da grupo; en la séptima, no hay mapa—, así que contra el
 * mapa saldría siempre `sin-sosten` o `sin-mapa`, que dicen otra cosa, y si
 * algún día el mapa diera otro grupo, la retirada automática desharía lo que
 * firmó una persona. Su propio desenlace, que no bloquea; el detalle del parte
 * enseña lo que dice el mapa.
 */
describe('classifyAttribution con firma', () => {
  it('una firmada es «firmada» aunque el mapa no le dé grupo', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: null, hasMap: true, firmada: true })).toBe(
      'firmada',
    )
  })

  it('y aunque el mapa le dé otro: no la retira una máquina', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: 'PP', hasMap: true, firmada: true })).toBe(
      'firmada',
    )
  })

  it('y en una sesión sin mapa', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: null, hasMap: false, firmada: true })).toBe(
      'firmada',
    )
  })

  it('sin firma, la escalera de siempre', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: 'PP', hasMap: true })).toBe(
      'partido-distinto',
    )
    expect(classifyAttribution({ stored: 'PSOE', fresh: null, hasMap: true })).toBe('sin-sosten')
  })
})

describe('tallyProvenance con firmadas', () => {
  it('una firmada no bloquea el parte, y se cuenta aparte', () => {
    const t = tallyProvenance([
      { provenance: 'vigente', attribution: 'firmada' },
      { provenance: 'vigente', attribution: 'coincide' },
    ])
    expect(t.ok).toBe(true)
    expect(t.blocking).toBe(0)
    expect(t.attribution.firmada).toBe(1)
  })
})
