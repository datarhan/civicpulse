/**
 * `datosPintados` (tests/setup/castellano.js): qué de lo que pinta una página es
 * dato servido y qué es rótulo.
 *
 * La nocturna del 08-11-2026 puso roja la guarda de /contratos en valencià sin que
 * la página cambiara. Un título de contrato se pintaba a la vez ENTERO —en el
 * detalle de la primera zona del medidor— y recortado a 100 caracteres con «…»
 * —en el listado de contratos—. La nocturna movió la fila de la 21 a la 20 del
 * fichero, que es la segunda página del listado, la que la guarda recorre. La
 * cadena servida casaba como pieza entera, y la rama que busca sus recortes estaba
 * en un `else`: la pieza recortada quedó por rótulo, y su «Contrato
 * administrativo…» por castellano dentro del valencià.
 *
 * El título es el del dato de ese día, tal cual: la forma es la que importa, y es
 * la que se tiene que poder repetir con cualquier otro.
 */
import { describe, expect, it } from 'vitest'

import { datosPintados, detectorDeCastellano, masLargasPrimero } from './setup/castellano'

const TITULO =
  'Contrato administrativo de obras de REASFALTADO DE VIALES EN URBANIZACIÓN ENTRENARANJOS a adjudicar mediante procedimiento abierto simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental, contribuyendo al cumplimiento del ODS 11 de Edificios sostenibles y resilientes.'

/** Como recorta el listado de /contratos (`ContractsExplorer`). */
const recorta = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)
const RECORTADO = recorta(TITULO, 100)

/** Las dos guardas, atadas a lo que `datosPintados` reconoce, como en las pruebas de página. */
const detectores = (piezas, cadenas) =>
  detectorDeCastellano(masLargasPrimero(datosPintados(piezas, cadenas)))

describe('datosPintados: una cadena servida, pintada entera y recortada', () => {
  it('el recorte de una cadena que también se pinta entera es dato', () => {
    // La forma del 08-11: el recorte acaba en un espacio y en «…».
    expect(RECORTADO.endsWith(' …')).toBe(true)
    const piezas = ['Formalizado', RECORTADO, 'Urbanització Entretarongers', TITULO]
    const datos = datosPintados(piezas, new Set([TITULO]))
    expect(datos).toContain(TITULO)
    expect(datos).toContain(RECORTADO.slice(0, -1))

    const { sinTraducir, castellanoEn } = detectores(piezas, new Set([TITULO]))
    expect(sinTraducir([[RECORTADO, RECORTADO]])).toEqual([])
    expect(castellanoEn(RECORTADO)).toEqual([])
  })

  it('el orden de las piezas no cambia lo que se reconoce', () => {
    const datos = datosPintados([TITULO, RECORTADO], new Set([TITULO]))
    expect(datos).toContain(RECORTADO.slice(0, -1))
  })

  it('sigue reconociendo el recorte cuando la cadena no se pinta entera', () => {
    expect(datosPintados([RECORTADO], new Set([TITULO]))).toEqual([RECORTADO.slice(0, -1)])
  })

  it('dos recortes de la misma cadena, a 90 y a 100 caracteres, son dato los dos', () => {
    const a90 = recorta(TITULO, 90)
    const datos = datosPintados([a90, RECORTADO, TITULO], new Set([TITULO]))
    expect(datos).toEqual(
      expect.arrayContaining([TITULO, a90.slice(0, -1), RECORTADO.slice(0, -1)]),
    )
  })
})

describe('datosPintados: lo que no tapa', () => {
  it('un rótulo castellano recortado que no empieza ninguna cadena servida no es dato', () => {
    const rotulo = 'Contrato administrativo de obras sin título publ…'
    const piezas = [rotulo, TITULO]
    expect(datosPintados(piezas, new Set([TITULO]))).toEqual([TITULO])
    const { sinTraducir, castellanoEn } = detectores(piezas, new Set([TITULO]))
    expect(sinTraducir([[rotulo, rotulo]])).toEqual([rotulo])
    expect(castellanoEn(rotulo)).toEqual(expect.arrayContaining(['contrato', 'administrativo']))
  })

  it('una palabra castellana pegada al recorte sigue saliendo', () => {
    // El recorte quita su parte de dato; lo que se le pegue detrás no lo es.
    const pegado = `${RECORTADO.slice(0, -1)}y más…`
    const piezas = [pegado, TITULO]
    expect(datosPintados(piezas, new Set([TITULO]))).toEqual([TITULO])
    const { castellanoEn } = detectores(piezas, new Set([TITULO]))
    expect(castellanoEn(pegado)).toContain('contrato')
  })

  it('una cadena corta servida sólo cuenta como pieza entera, aunque también se pinte', () => {
    // «Obras» como categoría no tapa un rótulo «Obras de urbanización».
    const datos = datosPintados(['Obras', 'Obras de urbanización'], new Set(['Obras']))
    expect(datos).toEqual(['Obras'])
  })

  it('un recorte de menos de doce caracteres no se toma por prefijo', () => {
    expect(datosPintados(['Contrato…', TITULO], new Set([TITULO]))).toEqual([TITULO])
  })
})
