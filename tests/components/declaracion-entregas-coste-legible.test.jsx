import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DeclaracionEntregas } from '../../src/components/eficiencia/DeclaracionEntregas'

/**
 * La fila del coste se abrevia, y abreviar sólo vale mientras se vea que el coste
 * se mueve. En /eficiencia/a164-coste-unitario 55.516,73 € (2019) y 56.256,35 €
 * (2021) salían «56 k» las dos, debajo de la frase «el coste, en la fila de
 * encima, cambia en cada una»: cierta, y la rejilla la desmentía. Lo señaló la
 * revisión lectora del 29-10-2026.
 *
 * El oráculo es el dato: dos casillas de la fila que se leen igual tienen que ser
 * el mismo coste al céntimo, que es como la frase cuenta los costes distintos.
 */
const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const { entregasPublicadas, entregasNoPresentadas } = publicado.cobertura
const conRejilla = publicado.indicadores.filter((i) => (i.serie ?? []).length >= 3)

/** Lo que pinta cada casilla de la fila «coste», con el coste del año al lado. */
function filaDelCoste(i) {
  const { container } = render(
    <DeclaracionEntregas
      indicador={i}
      entregasPublicadas={entregasPublicadas}
      noPresentadas={entregasNoPresentadas}
    />,
  )
  const celdas = [...container.querySelector('[data-rejilla-entregas]').children]
  const anios = [...entregasPublicadas].sort((a, b) => a - b)
  const desde = celdas.findIndex((c) => c.textContent === 'coste') + 1
  const porAnio = new Map(i.serie.map((p) => [p.anio, p]))
  return anios.map((a, k) => ({
    anio: a,
    casilla: celdas[desde + k].textContent,
    coste: noPresentadas(a) ? null : porAnio.get(a)?.numerador,
  }))
}
const noPresentadas = (a) => entregasNoPresentadas.includes(a)
const conCifra = (fila) => fila.filter((c) => typeof c.coste === 'number')

describe('DeclaracionEntregas — la fila del coste deja ver que el coste se mueve', () => {
  it('la premisa, medida: en el cementerio, a cero decimales, dos costes distintos se leían igual', () => {
    const a164 = publicado.indicadores.find((i) => i.id === 'a164-coste-unitario')
    const c = (anio) => a164.serie.find((p) => p.anio === anio).numerador
    expect(c(2019).toFixed(2)).not.toBe(c(2021).toFixed(2))
    const enK = (v) => (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })
    expect(enK(c(2019))).toBe(enK(c(2021)))
    // Y la rejilla ya no: cada uno con su cifra.
    const fila = filaDelCoste(a164)
    const casilla = (anio) => fila.find((x) => x.anio === anio).casilla
    expect(casilla(2019)).not.toBe(casilla(2021))
  })

  it('en todas las fichas, dos casillas que se leen igual son el mismo coste', () => {
    expect(conRejilla.length).toBeGreaterThan(10)
    let casillas = 0
    for (const i of conRejilla) {
      const fila = conCifra(filaDelCoste(i))
      casillas += fila.length
      for (const a of fila) {
        for (const b of fila) {
          if (a.anio >= b.anio || a.casilla !== b.casilla) continue
          expect(a.coste.toFixed(2), `${i.id}: ${a.anio} y ${b.anio} se leen «${a.casilla}»`).toBe(
            b.coste.toFixed(2),
          )
        }
      }
    }
    // Que el bucle leyó casillas, y no pasó en verde por no tener filas.
    expect(casillas).toBeGreaterThan(100)
  })

  it('cada escala gana decimales sola: los millones de la basura, no sus miles', () => {
    // En a1621 chocaban 1.072.702 € y 1.076.527 € («1,1 M»); sus costes en miles
    // no chocan, y siguen sin decimales.
    const a1621 = publicado.indicadores.find((i) => i.id === 'a1621-coste-unitario')
    const casillas = conCifra(filaDelCoste(a1621)).map((c) => c.casilla)
    expect(casillas.length).toBeGreaterThan(5)
    const miles = casillas.filter((t) => t.endsWith(' k'))
    const millones = casillas.filter((t) => t.endsWith(' M'))
    expect(miles.length).toBeGreaterThan(2)
    expect(millones.length).toBeGreaterThan(1)
    for (const t of miles) expect(t, t).toMatch(/^\d+ k$/)
    expect(millones.some((t) => /,\d\d M$/.test(t))).toBe(true)
  })
})
