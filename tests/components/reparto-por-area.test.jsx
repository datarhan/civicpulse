import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { RepartoPorArea } from '../../src/components/plenos/RepartoPorArea'

/**
 * Cada salvedad del reparto por área, sólo cuando su hueco existe.
 *
 * La nota decía siempre «Son los puntos de las {n} sesiones con orden del día
 * extraído, no de las {total}» y que un área podía tener actividad «en
 * sesiones que aún no hemos procesado». El 24-09-2026 la tubería extrajo el
 * último orden del día que faltaba, y la página pasó a contrastar «62» con
 * «las 62» y a hablar de sesiones sin procesar que ya no había. Señalado por
 * la revisión lectora del 28-09. La otra mitad de la nota —cuántos puntos
 * llevan área— sigue siendo cierta con todas las sesiones leídas, porque el
 * área la asigna nuestro emparejador, no el acta.
 */
const DEPARTAMENTOS = [{ slug: 'hacienda', nombre: 'Hacienda', n: 7, cuota: 1 }]

const pinta = (agenda, sesiones) =>
  render(
    <MemoryRouter>
      <RepartoPorArea departamentos={DEPARTAMENTOS} agenda={agenda} sesiones={sesiones} />
    </MemoryRouter>,
  ).container.textContent

describe('RepartoPorArea — cada salvedad sólo con su hueco', () => {
  it('con todas las sesiones procesadas no contrasta una cifra consigo misma', () => {
    const texto = pinta({ sesiones: 62, sinOrden: 0, puntos: 619, conDepartamento: 219 }, 62)
    expect(texto).not.toMatch(/no de las/)
    expect(texto).not.toMatch(/aún no hemos procesado/)
    // Midió algo: la mitad que sigue siendo cierta sí se pinta.
    expect(texto).toMatch(/Sólo 219 de los 619 puntos llevan área asignada/)
  })

  it('con sesiones sin orden del día lo dice, con los dos números', () => {
    const texto = pinta({ sesiones: 39, sinOrden: 22, puntos: 400, conDepartamento: 150 }, 61)
    expect(texto).toMatch(
      /Son los puntos de las 39 sesiones con orden del día extraído, no de las 61/,
    )
  })

  it('sin ningún hueco no pinta la nota', () => {
    const texto = pinta({ sesiones: 62, sinOrden: 0, puntos: 619, conDepartamento: 619 }, 62)
    expect(texto).not.toMatch(/Son los puntos|llevan área asignada/)
  })
})

/**
 * Las barras son las primeras áreas, no todas: 12 de 24 el 28-09-2026, y
 * sumaban 187 de los 219 puntos con área que la nota anuncia. Sin decirlo, un
 * lector no llegaba a la cifra sumando barras y daba por vacía un área que
 * sólo se había quedado fuera del corte.
 */
describe('RepartoPorArea — lo que queda fuera de las barras', () => {
  const agenda = { sesiones: 62, sinOrden: 0, puntos: 619, conDepartamento: 219 }

  it('dice cuántas áreas no tienen barra y cuántos puntos reúnen', () => {
    const texto = pinta(
      {
        ...agenda,
        fueraDeLasBarras: { dibujadas: 12, areas: 24, resto: 12, puntos: 32, con: 219 },
      },
      62,
    )
    expect(texto).toMatch(
      /Se dibujan 12 de las 24 áreas con algún punto; las 12 que faltan reúnen 32 de los 219 puntos con área\./,
    )
  })

  it('en singular cuando falta una sola', () => {
    const texto = pinta(
      {
        ...agenda,
        fueraDeLasBarras: { dibujadas: 12, areas: 13, resto: 1, puntos: 1, con: 219 },
      },
      62,
    )
    expect(texto).toMatch(/la que falta reúne 1 de los 219 puntos con área/)
    expect(texto).not.toMatch(/las 1 que faltan/)
  })

  it('sin áreas fuera no dice nada del corte', () => {
    const texto = pinta({ ...agenda, fueraDeLasBarras: null }, 62)
    // Midió algo: la nota se pintó por su otra mitad.
    expect(texto).toMatch(/llevan área asignada/)
    expect(texto).not.toMatch(/Se dibujan|que faltan/)
  })

  it('la nota aparece aunque no falte nada más que el corte', () => {
    const texto = pinta(
      {
        sesiones: 62,
        sinOrden: 0,
        puntos: 219,
        conDepartamento: 219,
        fueraDeLasBarras: { dibujadas: 12, areas: 14, resto: 2, puntos: 3, con: 219 },
      },
      62,
    )
    expect(texto).toMatch(/Se dibujan 12 de las 14 áreas con algún punto/)
    expect(texto).not.toMatch(/llevan área asignada/)
  })
})
