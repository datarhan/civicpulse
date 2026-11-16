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

import { datosPintados, detectorDeCastellano, masLargasPrimero } from './setup/castellano.js'

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

/** El título del 08-11 entero, que pasa de los 100 caracteres a los que recorta el listado. */
const LARGO =
  'Contrato administrativo de obras de REASFALTADO DE VIALES EN URBANIZACIÓN ENTRENARANJOS a adjudicar mediante procedimiento abierto simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental, contribuyendo al cumplimiento del ODS 11 de Edificios sostenibles y resilientes.'

/** Como recorta el listado de /contratos (`ContractsExplorer`). */
const recorta = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)
const RECORTADO = recorta(LARGO, 100)

/** Las dos guardas, atadas a lo que `datosPintados` reconoce, como en las pruebas de página. */
const detectores = (piezas, cadenas) =>
  detectorDeCastellano(masLargasPrimero(datosPintados(piezas, cadenas)))

describe('datosPintados: recortes de una cadena larga', () => {
  it('el orden de las piezas no cambia lo que se reconoce', () => {
    const datos = datosPintados([LARGO, RECORTADO], new Set([LARGO]))
    expect(datos).toContain(RECORTADO.slice(0, -1))
  })

  it('dos recortes de la misma cadena, a 90 y a 100 caracteres, son dato los dos', () => {
    const a90 = recorta(LARGO, 90)
    const datos = datosPintados([a90, RECORTADO, LARGO], new Set([LARGO]))
    expect(datos).toEqual(expect.arrayContaining([LARGO, a90.slice(0, -1), RECORTADO.slice(0, -1)]))
  })
})

describe('datosPintados: lo que no tapa', () => {
  it('un rótulo castellano recortado que no empieza ninguna cadena servida no es dato', () => {
    const rotulo = 'Contrato administrativo de obras sin título publ…'
    const piezas = [rotulo, LARGO]
    expect(datosPintados(piezas, new Set([LARGO]))).toEqual([LARGO])
    const { sinTraducir, castellanoEn } = detectores(piezas, new Set([LARGO]))
    expect(sinTraducir([[rotulo, rotulo]])).toEqual([rotulo])
    expect(castellanoEn(rotulo)).toEqual(expect.arrayContaining(['contrato', 'administrativo']))
  })

  it('una palabra castellana pegada al recorte sigue saliendo', () => {
    // El recorte quita su parte de dato; lo que se le pegue detrás no lo es.
    const pegado = `${RECORTADO.slice(0, -1)}y más…`
    const piezas = [pegado, LARGO]
    expect(datosPintados(piezas, new Set([LARGO]))).toEqual([LARGO])
    const { castellanoEn } = detectores(piezas, new Set([LARGO]))
    expect(castellanoEn(pegado)).toContain('contrato')
  })

  it('un recorte de menos de doce caracteres no se toma por prefijo', () => {
    expect(datosPintados(['Contrato…', LARGO], new Set([LARGO]))).toEqual([LARGO])
  })
})
