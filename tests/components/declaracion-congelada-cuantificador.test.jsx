import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  DeclaracionCongelada,
  cuantificadorCongelacion,
} from '../../src/components/frontera/DeclaracionCongelada'

/**
 * El titular de la declaración congelada decía «Casi nadie vuelve a medir el
 * denominador» sobre un párrafo que, dos líneas más abajo, daba 176 de 282
 * series (62 %). «Casi nadie» es ≈100 %; 106 series (38 %) sí cambian. Y el
 * párrafo cerraba con «las toneladas, los metros cuadrados y los puntos de
 * luz, no», igual de absoluto.
 *
 * El módulo que mide (`declaracion-congelada.ts`) ya avisaba: «este
 * comentario ya publicó un 19 % que llevaba meses siendo un 62 %», y por eso
 * no escribe proporciones a mano. El titular era exactamente esa proporción
 * escrita a mano. Señalado por el barrido lector del 22-09-2026; ahora el
 * cuantificador y el cierre salen del dato.
 */
const base = {
  minEntregas: 4,
  entregas: 10,
  costeSeries: 263,
  costeCongeladas: 4,
  propias: [],
}

describe('DeclaracionCongelada — el cuantificador del titular sale del dato', () => {
  it('a 62 % dice «la mayoría», no «casi nadie»', () => {
    const { container } = render(
      <DeclaracionCongelada declaracion={{ ...base, unidadSeries: 282, unidadCongeladas: 176 }} />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'La mayoría no vuelve a medir el denominador',
    )
    // Y el cierre del párrafo ya no es absoluto: 98 de cada 100 series de
    // coste se actualizan; de unidad física, 38.
    expect(container.textContent).toMatch(
      /El dinero se actualiza en 98 de cada 100 series; las toneladas, los metros cuadrados y los puntos de luz, en 38\./,
    )
    // Midió algo: la cifra del titular es la del párrafo.
    expect(container.textContent).toMatch(/176.*\(62 %\)/)
  })

  it('a 95 % sí dice «casi nadie», y a 30 % «buena parte»', () => {
    expect(cuantificadorCongelacion(95)).toBe('Casi nadie vuelve a medir el denominador')
    expect(cuantificadorCongelacion(90)).toBe('Casi nadie vuelve a medir el denominador')
    expect(cuantificadorCongelacion(62)).toBe('La mayoría no vuelve a medir el denominador')
    expect(cuantificadorCongelacion(50)).toBe('La mayoría no vuelve a medir el denominador')
    expect(cuantificadorCongelacion(30)).toBe('Buena parte no vuelve a medir el denominador')
    expect(cuantificadorCongelacion(10)).toBe('Una minoría no vuelve a medir el denominador')
  })

  it('el titular que pinta es el que devuelve el cuantificador para ese porcentaje', () => {
    render(
      <DeclaracionCongelada declaracion={{ ...base, unidadSeries: 100, unidadCongeladas: 96 }} />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(cuantificadorCongelacion(96))
  })
})
