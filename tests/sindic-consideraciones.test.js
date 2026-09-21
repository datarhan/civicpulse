/**
 * Cuántas resoluciones de consideraciones CONSTAN — no cuántas lista hoy el buscador.
 *
 * La tarjeta del Síndic en /quejas daba dos cifras de dos fuentes y las ponía en
 * la misma frase: las resoluciones de «consideraciones a la Administración»
 * salían del índice raspado del buscador del Síndic, y las fichas firmadas, del
 * registro curado. Mientras las dos fuentes casaron, 14 y 13 cuadraban con la
 * salvedad que las une —una de las 14 fue para la Conselleria—.
 *
 * El 18-09-2026 el Síndic reindexó tres expedientes. A las 06:56 su buscador
 * declaraba 47 resultados en vez de 50 y la página publicó «35 expedientes … 11
 * que terminaron en consideraciones» junto a «13 fichas, una por cada
 * resolución» — trece de once. La revisión lectora lo señaló, y era cierto. A
 * las 09:34 los tres expedientes volvieron, pero el 202600533 volvió SIN sus
 * consideraciones: el buscador sólo lista ya su cierre. Desde entonces la página
 * dice «13 resoluciones», «una fue para la Conselleria» y «13 fichas dirigidas
 * al Ayuntamiento», y quien reste obtiene 12.
 *
 * La resolución no ha desaparecido: la ficha enlaza su PDF y `check:sindic-fichas`
 * la coteja literal cada noche. Lo que ha cambiado es lo que el buscador LISTA. Un
 * índice raspado es un suelo de lo que existe, no un techo; una ficha firmada y
 * cotejada contra su PDF es conocimiento que el índice no puede restar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { contarConsideraciones, TIPO_CONSIDERACIONES } from '../src/lib/sindic-consideraciones'
import { TIPOS_RESOLUCION_CONOCIDOS } from '../src/scraper/sindic-expedientes'

const ROOT = join(__dirname, '..')
const leer = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const FX = leer('tests/fixtures/sindic_buscador_deja_de_listar_2026-09-19.json')

describe('lib/sindic-consideraciones', () => {
  it('el rótulo que busca es uno que el parser conoce — importado, no copiado', () => {
    // Regla 1 de DATA_INTEGRITY: si el Síndic renombra el tipo y el parser lo
    // recoge, esta constante tiene que romperse aquí y no contar cero en la página.
    expect(TIPOS_RESOLUCION_CONOCIDOS).toContain(TIPO_CONSIDERACIONES)
  })

  it('el reproductor se da: el índice del 19-09 no lista las consideraciones del 202600533', () => {
    const fila = FX.indice.find((e) => e.expediente === '202600533')
    expect(fila.resoluciones.map((r) => r.tipo)).toEqual(['Resolución de cierre'])
    const ficha = FX.fichas.find((f) => f.expediente === '202600533')
    expect(ficha.urlPdf).toMatch(/12475700\.pdf$/)
  })

  it('cuenta la resolución que una ficha firmada cita aunque el buscador ya no la liste', () => {
    const c = contarConsideraciones(FX.indice, FX.fichas)
    // Dos listadas (202601067 y la de la Conselleria) + una que sólo consta por su ficha.
    expect(c.enIndice).toBe(2)
    expect(c.fueraDelIndice.map((f) => f.expediente)).toEqual(['202600533'])
    expect(c.total).toBe(3)
  })

  it('la resta que hace el lector vuelve a cuadrar', () => {
    // «N resoluciones, una para la Conselleria, M fichas al Ayuntamiento»: las
    // fichas nunca pueden ser más que las resoluciones, que es lo que la página
    // publicó el 18-09 (13 de 11) y, restando la de la Conselleria, publica hoy.
    const c = contarConsideraciones(FX.indice, FX.fichas)
    const sinFicha = c.total - FX.fichas.length
    expect(sinFicha).toBe(1) // la de la Conselleria
    expect(c.total).toBeGreaterThanOrEqual(FX.fichas.length)
  })

  it('no cuenta dos veces la que está en los dos sitios', () => {
    const soloListadas = FX.fichas.filter((f) => f.expediente === '202601067')
    const c = contarConsideraciones(FX.indice, soloListadas)
    expect(c.fueraDelIndice).toEqual([])
    expect(c.total).toBe(c.enIndice)
  })

  it('sin fichas, cuenta lo que lista el índice — control', () => {
    const c = contarConsideraciones(FX.indice, [])
    expect(c.total).toBe(2)
    expect(c.fueraDelIndice).toEqual([])
  })

  it('aguanta entradas vacías sin inventar nada', () => {
    expect(contarConsideraciones(undefined, undefined)).toEqual({
      enIndice: 0,
      fueraDelIndice: [],
      total: 0,
    })
  })

  it('sobre lo PUBLICADO hoy: ninguna ficha firmada queda fuera de la cuenta', () => {
    // Sin cifras escritas a mano: relaciones. Si el Síndic vuelve a listar la
    // resolución, `fueraDelIndice` se vacía y esto sigue siendo cierto.
    const indice = leer('public/data/sindic-expedientes.json')
    const fichas = leer('public/data/sindic.json').items
    const c = contarConsideraciones(indice.contraAyuntamiento, fichas)
    // La prueba midió algo.
    expect(fichas.length).toBeGreaterThan(0)
    expect(c.enIndice).toBeGreaterThan(0)
    expect(c.total).toBe(c.enIndice + c.fueraDelIndice.length)
    expect(c.total).toBeGreaterThanOrEqual(fichas.length)
    // Y la cifra que la página publicaba —la del bloque `stats`— nunca es mayor
    // que la que consta.
    const delStats = indice.stats.porTipoResolucion[TIPO_CONSIDERACIONES]
    expect(c.total).toBeGreaterThanOrEqual(delStats)
  })
})
