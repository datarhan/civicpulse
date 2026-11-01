import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import { EspecificacionCard } from '../../src/components/frontera/EspecificacionCard'

/**
 * «Por debajo de ella · 17 % · 9 de 24 sin nadie por delante» (revisión lectora,
 * 25-10-2026). Tras «Distancia a la frontera», «ella» se leía la frontera, que
 * deja debajo a 15 de las 24 unidades, y la nota daba otro grupo —las 9 de la
 * frontera— cuyo cociente no es el 17 %. El 17 % son las 4 de 24 con una
 * distancia menor que la de Riba-roja. Se comprueba con las cestas publicadas:
 * el recuento de la nota, su denominador y el porcentaje cuadran.
 */
const DEA = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))
const conPropia = DEA.especificaciones.filter((e) => e.propia)

describe('la tarjeta dice por debajo de quién, y sus tres cifras cuadran', () => {
  it('hay cestas publicadas con la cifra propia que comprobar', () => {
    expect(conPropia.length).toBeGreaterThan(0)
  })

  for (const e of conPropia) {
    it(`${e.id}: nombra a Riba-roja y su recuento es el del porcentaje`, () => {
      const texto = render(<EspecificacionCard e={e} />).container.textContent.replace(/\s+/g, ' ')
      expect(texto).not.toContain('Por debajo de ella')
      const n = e.distribucion.n
      const debajo = (e.propia.percentil / 100) * n
      // `percentil` es un recuento entre n: tiene que salir entero.
      expect(Math.abs(debajo - Math.round(debajo))).toBeLessThan(1e-9)
      const m = texto.match(
        /Por debajo de Riba-roja\s*(\d+) %\s*(\d+) de (\d+) unidades, con distancia menor · (\d+) en la frontera/,
      )
      expect(m, texto).not.toBeNull()
      const [, pct, cuenta, total, frontera] = m.map(Number)
      expect(total).toBe(n)
      expect(cuenta).toBe(Math.round(debajo))
      expect(pct).toBe(Math.round((cuenta / total) * 100))
      expect(frontera).toBe(e.distribucion.eficientes)
    })
  }
})
