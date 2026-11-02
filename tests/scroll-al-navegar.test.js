// @vitest-environment happy-dom
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

  it('NO por un PUSH que se pinta cuando el navegador ya ha vuelto atrás', () => {
    // El caso medido el 2-11-2026: «Biografía →» en /cargos, atrás mientras
    // React aún pintaba la biografía. Esa biografía llegaba a pintarse DESPUÉS
    // del `popstate`, el reseteo la tomaba por una llegada y mandaba arriba al
    // lector, y el POP que venía detrás ya no lo devolvía a su sitio.
    expect(
      debeVolverArriba({ tipo: 'PUSH', hash: '', pathnameCambio: true, entradaVigente: false }),
    ).toBe(false)
  })

  it('sí, como siempre, cuando lo pintado es la entrada en la que está el navegador', () => {
    expect(
      debeVolverArriba({ tipo: 'PUSH', hash: '', pathnameCambio: true, entradaVigente: true }),
    ).toBe(true)
  })
})
