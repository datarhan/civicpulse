import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { LibroServicios } from '../../src/components/eficiencia/LibroServicios'

/**
 * Las pastillas de «Ver» del libro de /eficiencia tienen que repartir los
 * servicios que cuenta la primera.
 *
 * La relectura del pre-push lo señaló el 29-09-2026, en el empuje de #165:
 *
 *   Ver  Los 15 · Posición que se distingue · 8 · No se distinguen · 6 ·
 *        Sin cociente · 0          …y encima «coste efectivo de los 15 con cociente»
 *
 * 8 + 6 + 0 = 14, y el lector no sabe dónde está el decimoquinto. Las dos
 * cifras son ciertas y cuentan conjuntos distintos: «Los 15» es el libro
 * entero; las otras tres cuentan los servicios SITUADOS entre sus comparables
 * —de un lado de la mediana o sin distinguirse de ella— y los que no tienen
 * cociente. Entre medias queda una clase que ninguna nombraba: con cociente y
 * sin comparables suficientes para situarlo. Medida ese día, una fila, el
 * transporte colectivo urbano, que en su celda ya decía «no llegan a quince
 * comparables». No lo trajo #161: el hueco está desde que existen las
 * pastillas (26-08-2026: 6 + 6 + 2 = 14 junto a «Los 15»).
 *
 * El puente es la pastilla que faltaba, DERIVADA y CONDICIONAL: el día que ese
 * servicio llegue a quince comparables vale cero y desaparece sola, en vez de
 * quedarse diciendo «· 0».
 */
const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))

// La página le pasa su formateador; aquí basta con que pinte una cifra.
const formateaCon = (unidad) => (v) => `${v.toLocaleString('es-ES')} ${unidad}`

function pintaLibro(indicadores) {
  const { container } = render(
    <LibroServicios
      indicadores={indicadores}
      formateaCon={formateaCon}
      entrega={publicado.anioBase}
    />,
  )
  return container
}

/** Las pastillas de «Ver» como las lee un lector: el total y las que llevan cifra. */
function pastillas() {
  const rotulos = screen.getAllByRole('button').map((b) => b.textContent.trim())
  const total = rotulos.filter((r) => /^Los \d+$/.test(r))
  const conCifra = rotulos.filter((r) => / · \d+$/.test(r))
  return { rotulos: [...total, ...conCifra], total, conCifra }
}

const cifra = (rotulo) => Number(/(\d+)$/.exec(rotulo)[1])

/** Los id de las filas que pinta la tabla. */
const filasPintadas = (container) =>
  [...container.querySelectorAll('.cp-libro tbody .cp-c-servicio a')].map((a) =>
    a.getAttribute('href').replace('/eficiencia/', ''),
  )

describe('/eficiencia · las pastillas de «Ver» reparten el libro publicado', () => {
  it('premisa: hoy hay servicios con cociente y sin comparables, la clase que ninguna pastilla contaba', () => {
    // Medida sobre los campos crudos del snapshot, no con las funciones de la
    // página: si la página y esta cuenta divergen, una de las dos se equivoca.
    // Sin esta premisa, el día que el hueco se cierre las pruebas de abajo
    // seguirían en verde sin haber mirado el caso que existen para mirar.
    const sinComparables = publicado.indicadores.filter((i) => i.valor !== null && !i.pares)
    expect(
      sinComparables.length,
      'ningún servicio con cociente se queda sin comparables: la pastilla ya no se pinta ' +
        'y estas pruebas vigilan un caso que no existe — reléelas',
    ).toBeGreaterThan(0)
  })

  it('las cifras de las pastillas suman el total que dice la primera', () => {
    const container = pintaLibro(publicado.indicadores)
    const { total, conCifra } = pastillas()
    expect(total).toEqual([`Los ${publicado.indicadores.length}`])
    expect(filasPintadas(container)).toHaveLength(publicado.indicadores.length)
    const suma = conCifra.reduce((s, r) => s + cifra(r), 0)
    expect(suma, conCifra.join(' + ')).toBe(publicado.indicadores.length)
  })

  it('«Sin comparables suficientes» enseña exactamente las filas con cociente y sin comparables', () => {
    const container = pintaLibro(publicado.indicadores)
    const esperadas = publicado.indicadores
      .filter((i) => i.valor !== null && !i.pares)
      .map((i) => i.id)
    fireEvent.click(screen.getByRole('button', { name: /^Sin comparables suficientes · \d+$/ }))
    expect(filasPintadas(container).sort()).toEqual([...esperadas].sort())
    // Y cada una lo dice en su celda, con las palabras de la fila.
    for (const fila of container.querySelectorAll('.cp-libro tbody tr')) {
      expect(fila.querySelector('.cp-c-posicion').textContent).toMatch(
        /no llegan a quince comparables/,
      )
    }
  })
})

/**
 * Las cuatro clases a la vez, con las cifras escritas a mano. El snapshot
 * publicado no trae ninguna fila sin cociente desde el 2026-09-02, así que por
 * sí solo no distingue una pastilla que cuente bien de una que se trague
 * también las filas sin cociente.
 */
describe('/eficiencia · una fila de cada clase', () => {
  // Filas reales del publicado, llevadas cada una a su clase: `valor` y
  // `pares` son lo único que decide dónde cae.
  function cuatro() {
    const [lado, cruza, sinPares, sinCociente] = publicado.indicadores
      .filter((i) => i.valor !== null && Array.isArray(i.pares?.percentilBanda))
      .slice(0, 4)
      .map((i) => structuredClone(i))
    lado.pares = { ...lado.pares, percentil: 13, percentilBanda: [3, 27] }
    cruza.pares = { ...cruza.pares, percentil: 64, percentilBanda: [46, 82] }
    sinPares.pares = null
    sinCociente.valor = null
    sinCociente.pares = null
    return { filas: [lado, cruza, sinPares, sinCociente], sinPares }
  }

  it('cada pastilla cuenta la suya, y suman cuatro', () => {
    pintaLibro(cuatro().filas)
    expect(pastillas().rotulos).toEqual([
      'Los 4',
      'Posición que se distingue · 1',
      'No se distinguen · 1',
      'Sin comparables suficientes · 1',
      'Sin cociente · 1',
    ])
  })

  it('«Sin comparables suficientes» no se lleva la fila sin cociente', () => {
    const { filas, sinPares } = cuatro()
    const container = pintaLibro(filas)
    fireEvent.click(screen.getByRole('button', { name: 'Sin comparables suficientes · 1' }))
    expect(filasPintadas(container)).toEqual([sinPares.id])
  })

  it('sin ninguna fila en esa clase la pastilla no se pinta: no dice «· 0»', () => {
    const { filas, sinPares } = cuatro()
    pintaLibro(filas.filter((i) => i !== sinPares))
    expect(pastillas().rotulos).toEqual([
      'Los 3',
      'Posición que se distingue · 1',
      'No se distinguen · 1',
      'Sin cociente · 1',
    ])
  })
})
