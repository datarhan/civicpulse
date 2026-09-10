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

import { rotuloPlazosVencidos } from '../src/lib/plazos-vencidos'
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
