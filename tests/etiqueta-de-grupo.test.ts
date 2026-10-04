import { describe, it, expect } from 'vitest'
import {
  etiquetaDeUnEscano,
  etiquetaSinMapa,
  plenoDeDeclaracion,
  plenosConMapa,
} from '../src/scraper/etiqueta-de-grupo'

/**
 * Las dos reglas que deciden si una declaración puede llevar su grupo sin la
 * firma de una persona, escritas UNA vez.
 *
 * Vivían dentro de la prueba de corpus de #218
 * (tests/declaraciones-escano-unico.test.ts), que las exige sobre lo publicado.
 * `carry:attribution` necesita las mismas para no devolver lo que ellas
 * retiran, y dos copias de una regla son dos reglas el día que una cambia: la
 * regla 1 de docs/DATA_INTEGRITY.md, aplicada a un predicado en vez de a un
 * enum.
 */

describe('plenoDeDeclaracion', () => {
  it('manda el plenoId cuando lo trae', () => {
    expect(plenoDeDeclaracion({ id: 'abc-001-cit-000000', plenoId: 'xyz' })).toBe('xyz')
  })

  it('sin plenoId, es el prefijo del id (<pleno>-<n>-<tipo>-<hash>)', () => {
    expect(plenoDeDeclaracion({ id: '10yl550-106-acu-dd1a86' })).toBe('10yl550')
    expect(plenoDeDeclaracion({ id: '10yl550-106-acu-dd1a86', plenoId: null })).toBe('10yl550')
  })
})

describe('plenosConMapa', () => {
  it('una sesión por fichero .json, sin la extensión', () => {
    expect(plenosConMapa(['10yl550.json', 'rx4hb4.json'])).toEqual(new Set(['10yl550', 'rx4hb4']))
  })

  it('lo que no es un mapa no cuenta', () => {
    expect(plenosConMapa(['README.md', '.DS_Store', 'k4olcs.json.bak', 'k4olcs.json'])).toEqual(
      new Set(['k4olcs']),
    )
  })

  it('sin ficheros no hay ninguna sesión con mapa', () => {
    expect(plenosConMapa([]).size).toBe(0)
  })
})

describe('etiquetaDeUnEscano', () => {
  const UN_ESCANO = ['A', 'B']

  it('un grupo de la lista nombra a su concejal', () => {
    expect(etiquetaDeUnEscano({ speakerGroup: 'A' }, UN_ESCANO)).toBe(true)
  })

  it('uno que no está en ella, no', () => {
    expect(etiquetaDeUnEscano({ speakerGroup: 'C' }, UN_ESCANO)).toBe(false)
  })

  it('sin grupo no hay etiqueta', () => {
    expect(etiquetaDeUnEscano({ speakerGroup: null }, UN_ESCANO)).toBe(false)
    expect(etiquetaDeUnEscano({}, UN_ESCANO)).toBe(false)
  })
})

describe('etiquetaSinMapa', () => {
  const CON_MAPA = new Set(['p1'])

  it('un grupo en una sesión sin mapa de voces', () => {
    expect(etiquetaSinMapa({ id: 'p2-001-cit-000000', speakerGroup: 'A' }, CON_MAPA)).toBe(true)
  })

  it('en una sesión con mapa no se juzga aquí', () => {
    expect(etiquetaSinMapa({ id: 'p1-001-cit-000000', speakerGroup: 'A' }, CON_MAPA)).toBe(false)
  })

  it('la sesión se lee como plenoDeDeclaracion: el plenoId manda', () => {
    expect(
      etiquetaSinMapa({ id: 'p2-001-cit-000000', plenoId: 'p1', speakerGroup: 'A' }, CON_MAPA),
    ).toBe(false)
  })

  it('sin grupo no hay etiqueta', () => {
    expect(etiquetaSinMapa({ id: 'p2-001-cit-000000', speakerGroup: null }, CON_MAPA)).toBe(false)
  })
})
