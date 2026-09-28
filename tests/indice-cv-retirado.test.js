import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { INDICE_CV_RETIRADO, enIndiceRetirado } from '../src/lib/indice-cv-retirado'

/**
 * El registro congelado de la página de currículos que el portal retiró.
 *
 * `/cargos/:slug` decía de cada escaño sin currículo que «no se puede decir si
 * se retiró o nunca estuvo», y el registro propio sí lo dice: 67 lecturas de la
 * página vieja, siempre los mismos 17 PDF, y ninguno de los escaños sin ficha
 * en ninguna. Pero la frase tiene que seguir siendo cierta escaño a escaño: a
 * quien sí figuraba no se le puede decir que no estaba. Estas pruebas fijan que
 * el registro es coherente consigo mismo y con el padrón publicado.
 */
const padron = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8'))
const personas = new Set([...padron.officials, ...padron.formerOfficials].map((o) => o.slug))

describe('el índice de currículos retirado, congelado', () => {
  const { presentes, ausentes, documentos, lecturas, primera, ultima } = INDICE_CV_RETIRADO

  it('cada documento del índice es de un escaño, y ningún escaño está en las dos listas', () => {
    expect(presentes).toHaveLength(documentos)
    expect(new Set(presentes).size).toBe(presentes.length)
    expect(presentes.filter((s) => ausentes.includes(s))).toEqual([])
  })

  it('cada slug es de una persona del padrón publicado: una errata no se queda callada', () => {
    const desconocidos = [...presentes, ...ausentes].filter((s) => !personas.has(s))
    expect(desconocidos).toEqual([])
  })

  it('la ventana de lecturas es una ventana', () => {
    expect(lecturas).toBeGreaterThan(0)
    expect(primera < ultima).toBe(true)
  })

  it('hoy lo usa algún escaño: la frase condicional no está escrita para nadie', () => {
    // La premisa, MEDIDA sobre el padrón publicado: hay escaños sin currículo y
    // el registro sabe de ellos. Si todos llegan a tenerlo, la frase deja de
    // pintarse sola y esta prueba se pone roja para que alguien la retire.
    const sinCv = padron.officials.filter((o) => !o.cvUrl).map((o) => o.slug)
    expect(sinCv.filter((s) => ausentes.includes(s)).length).toBeGreaterThan(0)
  })
})

describe('enIndiceRetirado', () => {
  it('distingue a quien figuraba, a quien no, y a quien el registro no alcanza', () => {
    expect(enIndiceRetirado(INDICE_CV_RETIRADO.ausentes[0])).toBe('ausente')
    expect(enIndiceRetirado(INDICE_CV_RETIRADO.presentes[0])).toBe('presente')
    // Dejó el escaño en 2025, antes de la primera lectura: el registro no habla de ella.
    expect(enIndiceRetirado('soraya-trejo-delgado')).toBeNull()
    expect(enIndiceRetirado('quien-llegue-despues')).toBeNull()
    expect(enIndiceRetirado(undefined)).toBeNull()
  })
})
