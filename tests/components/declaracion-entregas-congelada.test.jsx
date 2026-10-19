import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DeclaracionEntregas } from '../../src/components/eficiencia/DeclaracionEntregas'

/**
 * «5 casillas idénticas debajo de otras que cambian todos los años: eso es el
 * hallazgo, y no hace falta afirmarlo.» Escrita a mano para la basura, donde
 * se leía bien, y pintada en las trece fichas con el denominador congelado. La
 * revisión lectora del 19-10-2026 la señaló en /eficiencia/a1532-150p-coste-
 * unitario: en la fila de m² las casillas de 2015 a 2018 repiten 1.657.441
 * cuatro veces, así que las «otras» que el lector encuentra —las de la misma
 * fila, a la izquierda— no cambian todos los años. La frase quería decir la
 * fila del coste, encima, y no lo decía; y en las trece fichas el tramo de
 * antes también repite alguna cifra, de modo que leída como la leyó el lector
 * era falsa en todas.
 *
 * Ahora la frase sale del dato: nombra la fila del coste, dice si el coste
 * cambia en cada entrega del tramo repetido, y dice si antes ya hubo cifras
 * repetidas o si cambiaron en cada entrega. El oráculo de abajo recorre la
 * serie por su cuenta, sin importar nada del componente.
 */
const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const { entregasPublicadas, entregasNoPresentadas } = publicado.cobertura
const congeladas = publicado.indicadores.filter((i) => i.declaracion?.denominador?.congelada)

const fmt = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
const igual = (a, b) => a.toFixed(4) === b.toFixed(4)

/** Las casillas del denominador que la rejilla pinta con cifra, en orden. */
function casillasConCifra(i) {
  const porAnio = new Map(i.serie.map((p) => [p.anio, p]))
  return [...entregasPublicadas]
    .sort((a, b) => a - b)
    .filter((a) => !entregasNoPresentadas.includes(a))
    .map((a) => ({ anio: a, p: porAnio.get(a) }))
    .filter(({ p }) => typeof p?.denominador === 'number')
    .map(({ anio, p }) => ({ anio, valor: p.denominador, coste: p.numerador }))
}

/** Tramos de cifra repetida (dos o más casillas seguidas iguales). */
function tramos(casillas) {
  const out = []
  let k = 0
  while (k < casillas.length) {
    let j = k
    while (j + 1 < casillas.length && igual(casillas[j + 1].valor, casillas[k].valor)) j++
    out.push({
      valor: casillas[k].valor,
      n: j - k + 1,
      desde: casillas[k].anio,
      hasta: casillas[j].anio,
    })
    k = j + 1
  }
  return out
}

function parrafo(i) {
  const { container } = render(
    <DeclaracionEntregas
      indicador={i}
      entregasPublicadas={entregasPublicadas}
      noPresentadas={entregasNoPresentadas}
    />,
  )
  return container.querySelector('[data-congelacion]')?.textContent ?? ''
}

describe('DeclaracionEntregas — la frase de la cifra repetida sale del dato', () => {
  it('evaluó algo: hay fichas congeladas y alguna repite cifra también antes', () => {
    expect(congeladas.length).toBeGreaterThan(0)
    const conRepeticionAntes = congeladas.filter((i) =>
      tramos(casillasConCifra(i))
        .slice(0, -1)
        .some((t) => t.n >= 2),
    )
    expect(conRepeticionAntes.length).toBeGreaterThan(0)
  })

  it.each(congeladas.map((i) => [i.id, i]))(
    '%s: nada de «otras que cambian todos los años»',
    (_, i) => {
      const texto = parrafo(i)
      expect(texto).not.toBe('')
      expect(texto).not.toMatch(/cambian todos los años/)

      const ts = tramos(casillasConCifra(i))
      const final = ts.at(-1)
      // El tramo que la rejilla enseña es el que el snapshot dice congelado.
      expect(final.n).toBe(i.declaracion.denominador.repeticionesFinales)
      expect(final.desde).toBe(i.declaracion.denominador.desde)

      // Dice de qué fila habla y qué cifra se repite.
      expect(texto).toContain(`«${i.divisor.singular}»`)
      expect(texto).toContain(fmt(final.valor))
      expect(texto).toMatch(/fila del coste|el coste, en la fila de encima/)

      // Y lo que hubo antes, sin elegir lo que conviene.
      const antes = ts.slice(0, -1).filter((t) => t.n >= 2)
      if (antes.length) {
        expect(texto).toMatch(/No es la primera vez/)
        for (const t of antes) {
          expect(texto).toContain(fmt(t.valor))
          expect(texto).toContain(`${t.desde}–${t.hasta}`)
        }
      } else {
        expect(texto).not.toMatch(/No es la primera vez/)
      }
    },
  )

  it('a1532: el caso que leyó el lector', () => {
    const i = congeladas.find((x) => x.id === 'a1532-150p-coste-unitario')
    const texto = parrafo(i)
    expect(texto).toMatch(/1\.066\.694/)
    expect(texto).toMatch(/5 entregas/)
    expect(texto).toMatch(/1\.657\.441 en 4 entregas \(2015–2018\)/)
    // El coste de esas cinco entregas es distinto en cada una.
    expect(texto).toMatch(/cambia en cada una/)
  })

  it('si antes la cifra cambió en cada entrega, lo dice', () => {
    const i = congeladas.find((x) => x.id === 'a1532-150p-coste-unitario')
    const serie = i.serie.map((p, k) =>
      p.anio < 2019 ? { ...p, denominador: 1_000_000 + k * 1000 } : p,
    )
    const texto = parrafo({ ...i, serie })
    expect(texto).not.toMatch(/No es la primera vez/)
    expect(texto).toMatch(/Antes de 2019 la cifra cambió en cada entrega/)
  })

  it('si el coste no cambia en cada entrega del tramo, no dice que cambie', () => {
    const i = congeladas.find((x) => x.id === 'a1532-150p-coste-unitario')
    const serie = i.serie.map((p) => (p.anio >= 2022 ? { ...p, numerador: 300_000 } : p))
    const texto = parrafo({ ...i, serie })
    expect(texto).not.toMatch(/cambia en cada una/)
    expect(texto).toMatch(/toma 3 valores distintos en esas 5/)
  })

  it('la cantidad se pinta con sus decimales: 0,01 no es «0»', () => {
    // a163 declara 0,01 m² en 2014 y 2015. `exacto` redondeaba a entero y la
    // casilla decía «0»: un centinela publicado como valor, y además la
    // cifra que la ficha afirma repetida «hasta el segundo decimal» salía sin
    // ellos (11.059,41 t se pintaba 11.059).
    const i = publicado.indicadores.find((x) => x.id === 'a163-coste-unitario')
    const { container } = render(
      <DeclaracionEntregas
        indicador={i}
        entregasPublicadas={entregasPublicadas}
        noPresentadas={entregasNoPresentadas}
      />,
    )
    expect(container.textContent).toContain('0,01')
    const basura = publicado.indicadores.find((x) => x.id === 'a1621-coste-unitario')
    expect(parrafo(basura)).toContain('11.059,41')
  })
})
