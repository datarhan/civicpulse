/**
 * «⚠ 1 plazos vencidos».
 *
 * El número salía de la instantánea y la palabra estaba escrita a mano en dos
 * sitios —el bloque de la portada y el chip del tícker—, en plural y en
 * castellano aunque la página estuviera en valencià. /departamentos ya elegía
 * singular o plural con dos claves del catálogo; ahora los tres sitios piden el
 * rótulo a una sola función.
 */
import { describe, expect, it } from 'vitest'

import { rotuloPlazosVencidos, ariaPlazosVencidos } from '../src/lib/plazos-vencidos'
import { CATALOGUE, LOCALES } from '../src/i18n'

describe('rotuloPlazosVencidos', () => {
  for (const loc of LOCALES) {
    const t = (k) => CATALOGUE[loc][k] ?? k

    it(`${loc}: uno es singular, dos es plural`, () => {
      expect(rotuloPlazosVencidos(1, t)).toBe(CATALOGUE[loc]['departamentos.plazoVencido'])
      expect(rotuloPlazosVencidos(2, t)).toBe(CATALOGUE[loc]['liveTicker.plazosVencidos'])
      // Las dos claves existen y no son la misma palabra: si no, la prueba
      // pasaría con cualquier implementación.
      expect(CATALOGUE[loc]['departamentos.plazoVencido']).toBeTruthy()
      expect(CATALOGUE[loc]['departamentos.plazoVencido']).not.toBe(
        CATALOGUE[loc]['liveTicker.plazosVencidos'],
      )
    })
  }
})

/**
 * El chip del tícker es un botón, y su nombre accesible decía «1 compromisos
 * municipales con plazo vencido» — con la cuenta que de verdad se publicó. El
 * rótulo visible ya distinguía singular de plural; el nombre que oye quien
 * navega con lector de pantalla, no.
 */
describe('ariaPlazosVencidos', () => {
  for (const loc of LOCALES) {
    const t = (k) => CATALOGUE[loc][k] ?? k

    it(`${loc}: el nombre accesible también distingue uno de varios`, () => {
      const uno = ariaPlazosVencidos(1, t)
      const dos = ariaPlazosVencidos(2, t)

      expect(uno).toBe(CATALOGUE[loc]['liveTicker.plazosVencidos.aria.uno'])
      expect(dos).toBe(CATALOGUE[loc]['liveTicker.plazosVencidos.aria'].replace('{n}', '2'))
      // Ninguna deja el hueco sin rellenar ni cuela el plural en el singular.
      expect(uno).not.toContain('{n}')
      expect(dos).not.toContain('{n}')
      expect(dos).toContain('2')

      // Las dos claves existen y son frases distintas: si no, esto pasaría con
      // cualquier implementación.
      expect(CATALOGUE[loc]['liveTicker.plazosVencidos.aria.uno']).toBeTruthy()
      expect(CATALOGUE[loc]['liveTicker.plazosVencidos.aria.uno']).not.toBe(
        CATALOGUE[loc]['liveTicker.plazosVencidos.aria'],
      )
    })
  }
})
