/**
 * `datosPintados` (tests/setup/castellano.js) decide qué texto de una página es
 * dato —un titular en su idioma de origen— y no rótulo sin traducir. Una cadena
 * larga cuenta entera, dentro de una pieza o recortada con «…».
 *
 * Contaba la recortada SÓLO si no estaba también entera: un `else` separaba las
 * dos ramas. El 08-11-2026 un contrato («REASFALTADO DE VIALES EN
 * URBANIZACIÓN ENTRENARANJOS») pasó a pintarse en /contratos entero en un sitio
 * y cortado a 100 caracteres en el explorador de contratos, y la guarda bilingüe
 * leyó el corte como castellano sin traducir. Lo trajo una nocturna de sólo
 * datos, que no corre ninguna prueba.
 */
import { describe, expect, it } from 'vitest'

import { datosPintados } from './setup/castellano.js'

const TITULO =
  'Contrato administrativo de obras de REASFALTADO DE VIALES a adjudicar mediante procedimiento abierto'

describe('datosPintados', () => {
  it('cuenta el titular recortado aunque también se pinte entero', () => {
    const recorte = TITULO.slice(0, 60) + '…'
    const datos = datosPintados([TITULO, recorte, 'Contractes'], new Set([TITULO]))
    expect(datos).toContain(TITULO)
    expect(datos).toContain(TITULO.slice(0, 60))
  })

  it('sigue contando el recorte cuando sólo se pinta recortado', () => {
    const recorte = TITULO.slice(0, 60) + '…'
    expect(datosPintados([recorte], new Set([TITULO]))).toEqual([TITULO.slice(0, 60)])
  })

  it('una cadena corta sólo cuenta como pieza entera', () => {
    expect(datosPintados(['Obras de la calle'], new Set(['Obras']))).toEqual([])
    expect(datosPintados(['Obras'], new Set(['Obras']))).toEqual(['Obras'])
  })
})
