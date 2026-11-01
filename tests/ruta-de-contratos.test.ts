import { describe, expect, it } from 'vitest'

import { ANCLAS_DE_CONTRATOS, destinoEnContratos } from '../src/scraper/ruta-de-contratos'

/**
 * Los enlaces viejos. Lo que está en /contratos vivió en /presupuesto hasta el
 * 1-11-2026, y un vecino puede tener guardado el enlace de su barrio.
 */
describe('un enlace viejo a /presupuesto llega a lo que pedía', () => {
  it('cada ancla que se fue con la contratación lleva a la misma ancla', () => {
    expect(ANCLAS_DE_CONTRATOS.length).toBeGreaterThan(0)
    for (const ancla of ANCLAS_DE_CONTRATOS) {
      expect(destinoEnContratos('', ancla)).toBe(`/contratos${ancla}`)
    }
  })

  it('el enlace de un barrio conserva el barrio y el ancla', () => {
    expect(destinoEnContratos('?barrio=l-oliveral', '#mapa-gasto-barrio')).toBe(
      '/contratos?barrio=l-oliveral#mapa-gasto-barrio',
    )
    expect(destinoEnContratos('?barrio=l-oliveral', '')).toBe('/contratos?barrio=l-oliveral')
  })

  it('lo que sigue en /presupuesto no se mueve', () => {
    expect(destinoEnContratos('', '')).toBeNull()
    expect(destinoEnContratos('', '#cascada')).toBeNull()
    expect(destinoEnContratos('', '#deuda')).toBeNull()
    expect(destinoEnContratos('?x=1', '#aprobado')).toBeNull()
  })
})
