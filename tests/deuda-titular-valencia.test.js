/**
 * El titular de la deuda viva de /presupuesto, en los dos idiomas.
 *
 * `tendenciaDeuda` escribe el titular en castellano dentro del módulo del raspador,
 * y sus pruebas lo fijan ahí. La página lo compone ahora con `titularDeuda` y las
 * palabras del catálogo. Esta prueba recorre todas las ramas —sin cambio, sube o
 * baja sin racha, racha que sigue con cada ordinal, racha que se invierte tras uno
 * o varios años con cada cardinal— y exige dos cosas: que en castellano salga
 * EXACTAMENTE el titular del módulo, y que en valencià no salga nada castellano.
 * Si una de las dos redacciones cambia sola, esto lo dice.
 */
import { describe, expect, it } from 'vitest'

import { CATALOGUE } from '../src/i18n'
import { titularDeuda } from '../src/lib/deuda-titular'
import { tendenciaDeuda } from '../src/scraper/presupuesto-lectura'
import { detectorDeCastellano } from './setup/castellano'

const enValenciano = (clave) => CATALOGUE.ca[clave] ?? CATALOGUE.es[clave] ?? clave

/** Una serie que termina en 2025 a partir de sus importes. */
const serie = (importes) =>
  importes.map((deudaEuros, i) => ({ ejercicio: 2025 - (importes.length - 1 - i), deudaEuros }))

/** Una racha de `n` cambios en una dirección, desde 100. */
const racha = (n, paso) => Array.from({ length: n + 1 }, (_, i) => 100 + i * paso)

const CASOS = [
  ['sin cambio', serie([100, 100])],
  ['sube sin racha', serie([100, 110])],
  ['baja sin racha', serie([110, 100])],
  ['sube tras un año igual', serie([100, 100, 110])],
  ['baja tras un año igual', serie([100, 100, 90])],
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => [
    [`sube por ${n + 1}º año`, serie(racha(n + 1, 10))],
    [`baja por ${n + 1}º año`, serie(racha(n + 1, -10))],
  ]),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
    [`bajó ${n} y sube`, serie([...racha(n, -10), 100 - (n - 1) * 10])],
    [`subió ${n} y baja`, serie([...racha(n, 10), 100 + (n - 1) * 10])],
  ]),
]

describe('titularDeuda', () => {
  it('mide algo: cada rama y cada palabra del catálogo sale en algún caso', () => {
    const castellano = CASOS.map(([, s]) => titularDeuda(tendenciaDeuda(s))).join('\n')
    const claves = Object.keys(CATALOGUE.es).filter(
      (k) =>
        k.startsWith('presupuesto.deuda.titular.') ||
        k.startsWith('presupuesto.deuda.ordinal.') ||
        k.startsWith('presupuesto.deuda.cardinal.'),
    )
    expect(claves.length).toBeGreaterThan(15)
    const sinSalir = claves.filter((k) =>
      CATALOGUE.es[k]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !castellano.includes(trozo)),
    )
    expect(sinSalir).toEqual([])
  })

  it.each(CASOS)('%s: en castellano es el titular del módulo', (_, s) => {
    const tendencia = tendenciaDeuda(s)
    expect(tendencia, 'la serie no da tendencia').not.toBeNull()
    expect(titularDeuda(tendencia)).toBe(tendencia.titular)
  })

  it.each(CASOS)('%s: en valencià no queda castellano', (_, s) => {
    const tendencia = tendenciaDeuda(s)
    const ca = titularDeuda(tendencia, enValenciano)
    expect(ca).not.toBe(tendencia.titular)
    expect(detectorDeCastellano([]).castellanoEn(ca)).toEqual([])
  })
})
