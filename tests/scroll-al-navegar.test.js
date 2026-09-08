import { describe, it, expect } from 'vitest'
import { debeVolverArriba } from '../src/hooks/useScrollAlNavegar'

/**
 * El reproductor: /cargos a 3.000 px → «Biografía →» → la biografía abría
 * también a 3.000 px. Medido en producción el 8-09-2026.
 */
describe('debeVolverArriba', () => {
  it('vuelve arriba al cambiar de página con un enlace', () => {
    expect(debeVolverArriba({ tipo: 'PUSH', hash: '', pathnameCambio: true })).toBe(true)
  })

  it('también en un REPLACE, que sigue siendo llegar a otra página', () => {
    expect(debeVolverArriba({ tipo: 'REPLACE', hash: '', pathnameCambio: true })).toBe(true)
  })

  it('NO al volver atrás: ahí el lector espera encontrar la lista donde la dejó', () => {
    expect(debeVolverArriba({ tipo: 'POP', hash: '', pathnameCambio: true })).toBe(false)
  })

  it('NO cuando hay fragmento: de eso manda useHashScroll, con su offset', () => {
    // Pisarlo dejaría todo permalink aterrizando arriba, que es exactamente el
    // defecto que aquel hook vino a arreglar.
    expect(debeVolverArriba({ tipo: 'PUSH', hash: '#f-2026-05-11', pathnameCambio: true })).toBe(
      false,
    )
  })

  it('NO cuando sólo cambia la query: filtrar no es cambiar de página', () => {
    expect(debeVolverArriba({ tipo: 'PUSH', hash: '', pathnameCambio: false })).toBe(false)
  })

  it('NO cuando sólo cambia el hash dentro de la misma página', () => {
    expect(debeVolverArriba({ tipo: 'PUSH', hash: '#citas', pathnameCambio: false })).toBe(false)
  })
})
