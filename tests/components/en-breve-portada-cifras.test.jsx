/**
 * «Tu ayuntamiento en 30 segundos»: las dos cifras que la revisión lectora leyó
 * mal en la primera versión del bloque (26-10-2026).
 *
 * 1. La tarjeta del dinero ponía el crédito definitivo (67,1 M€) como cifra grande
 *    y la barra «Gastado · 60 %» justo debajo: se leía «67,1 M€ … gastado».
 *    /presupuesto separa las dos cifras en dos tarjetas; aquí, en una, la grande
 *    es lo gastado y el tope va en una frase que lo llama tope.
 * 2. La tarjeta del barrio dice «de cada 100 €, 3 nombran un barrio» a unos
 *    píxeles del mapa de la portada, que sitúa 7 de cada 100 porque mide otra
 *    cosa (los contratos con un sitio). Las dos son ciertas; la tarjeta nombra
 *    las dos y por qué difieren.
 *
 * Se pinta con las instantáneas publicadas: las cifras esperadas salen de las
 * mismas funciones que la página, no escritas aquí.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { EnBrevePortada } from '../../src/variants/direction-d/blocks/EnBrevePortada'
import { enBrevePresupuesto } from '../../src/scraper/en-breve-presupuesto'
import { eurosBreves as eurosBrevesDuro } from '../../src/lib/formatters'

// `porTarjeta` colapsa los espacios, también el duro que va antes del «€».
const eurosBreves = (n) => eurosBrevesDuro(n).replace(/\s+/g, ' ')
import { deCada100DelMapa } from '../../src/components/LiveCity/controls/MoneyCoverage'
import { pintaYLee } from '../setup/pinta-y-lee'

const publicado = (f) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))

const RUTAS = [
  'officials.json',
  'budget.json',
  'budget-execution.json',
  'tender-geo.json',
  'plenos.json',
  'plenos-agendas.json',
  'pleno-votes.json',
]
const DATOS = Object.fromEntries(RUTAS.map((f) => [`/data/${f}`, publicado(f)]))

const presupuesto = enBrevePresupuesto({
  budget: DATOS['/data/budget.json'],
  ejecucion: DATOS['/data/budget-execution.json'],
  deuda: null,
  tenderGeo: DATOS['/data/tender-geo.json'],
})

/** El texto de cada tarjeta, por su `data-en-breve`. */
const porTarjeta = (container) =>
  [...container.querySelectorAll('[data-en-breve]')].map(
    (el) => `${el.getAttribute('data-en-breve')}::${el.textContent.replace(/\s+/g, ' ').trim()}`,
  )

async function tarjetas() {
  const { piezas, pedidasSinServir } = await pintaYLee(
    {
      nombre: 'en breve de la portada',
      fetch: DATOS,
      pinta: () => <EnBrevePortada />,
      listo: (c) =>
        !!c.querySelector('[data-en-breve="dinero"]') &&
        !!c.querySelector('[data-en-breve="barrio"]') &&
        !!c.querySelector('[data-en-breve="pleno"]'),
    },
    'es',
    { lee: porTarjeta },
  )
  expect(pedidasSinServir).toEqual([])
  return Object.fromEntries(
    piezas.map((p) => {
      const i = p.indexOf('::')
      return [p.slice(0, i), p.slice(i + 2)]
    }),
  )
}

describe('«Tu ayuntamiento en 30 segundos»: cifras que no se leen mal', () => {
  it('con lo gastado, la cifra grande es lo gastado y el tope sólo sale como tope', async () => {
    const { limite, gastado } = presupuesto
    // Hoy hay ejecución del mismo año que el tope: si no, esta prueba no mediría nada.
    expect(limite).not.toBeNull()
    expect(gastado?.year).toBe(limite.year)

    const t = await tarjetas()
    const pregunta = `¿Cuánto dinero tuvo en ${limite.year}, y cuánto gastó?`
    expect(t.dinero.startsWith(pregunta)).toBe(true)
    // Lo primero tras la pregunta es la cifra grande.
    expect(t.dinero.slice(pregunta.length).trim().startsWith(eurosBreves(gastado.ejecutado))).toBe(
      true,
    )
    const tope = eurosBreves(limite.definitivo)
    expect(t.dinero).toContain(`Podía gastar ${tope}:`)
    // Una sola vez, y es la de la frase del tope.
    expect(t.dinero.split(tope).length - 1).toBe(1)
  })

  it('la tarjeta del barrio reconcilia su cifra con la del mapa de la portada', async () => {
    const enMapa = deCada100DelMapa(DATOS['/data/tender-geo.json'].universe)
    const aqui = presupuesto.barrio.deCada100
    // Hoy son distintas, y las dos de 1 o más: si coincidieran no habría puente y
    // la prueba no mediría nada.
    expect(enMapa).not.toBeNull()
    expect(enMapa.menosDeUno || presupuesto.barrio.menosDeUno).toBe(false)
    expect(enMapa.deCada100).not.toBe(aqui)

    const t = await tarjetas()
    expect(t.barrio).toContain(`sólo ${aqui} van a contratos que nombran un barrio`)
    expect(t.barrio).toContain(
      `El mapa de esta página sitúa ${enMapa.deCada100} de cada 100 €, y no ${aqui},`,
    )
  })
})
