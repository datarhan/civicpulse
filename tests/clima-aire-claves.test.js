/**
 * El tiempo y el aire de la cabecera, dichos en el idioma del lector.
 *
 * `describeWmo` devuelve hoy veinte etiquetas en castellano —«Despejado»,
 * «Llovizna intensa»— y `describeAqi` otras seis, escritas dentro del hook. La
 * portada en valencià las pinta igual: castellano en medio de la página, que es
 * exactamente el defecto que `i18n-catalogue.test.ts` existe para cazar, salvo
 * que ese guard sólo ve el catálogo y estas cadenas nunca entraron en él.
 *
 * Así que los dos describen con CLAVES, y el catálogo traduce. Lo que se fija
 * aquí es eso: que lo devuelto sea una clave que exista en LOS DOS idiomas, no
 * una frase. Un `toBeTruthy()` sobre la etiqueta pasaría igual con «Despejado»
 * dentro, que es como no comprobar nada.
 */
import { describe, expect, it } from 'vitest'

import { describeWmo } from '../src/hooks/useLiveWeather'
import { describeAqi } from '../src/hooks/useAirQuality'
import { CATALOGUE, LOCALES } from '../src/i18n'

/** Una clave de verdad: existe, en los dos idiomas, y no está vacía. */
function esClaveTraducida(clave) {
  if (typeof clave !== 'string' || !clave.startsWith('vivo.')) return false
  return LOCALES.every((idioma) => {
    const valor = CATALOGUE[idioma]?.[clave]
    return typeof valor === 'string' && valor.trim().length > 0
  })
}

/** Los códigos WMO que el hook mapea, más uno que no existe (el comodín). */
const CODIGOS = [0, 1, 2, 3, 45, 48, 51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 7777]

describe('describeWmo · describe con claves, no con castellano', () => {
  it('hay códigos que comprobar (si no, esto no mide nada)', () => {
    expect(CODIGOS.length).toBeGreaterThan(20)
  })

  it.each(CODIGOS)('el código %i devuelve emoji y clave traducida', (codigo) => {
    const [emoji, clave] = describeWmo(codigo)
    expect(typeof emoji).toBe('string')
    expect(emoji.length, `el código ${codigo} se queda sin emoji`).toBeGreaterThan(0)
    expect(esClaveTraducida(clave), `${codigo} devuelve «${clave}», que no es una clave`).toBe(true)
  })

  it('un código desconocido cae en el comodín, que también es clave', () => {
    const [, clave] = describeWmo(7777)
    expect(clave).toBe('vivo.wmo.variable')
  })

  it('ninguna etiqueta se cuela en castellano', () => {
    // La ablación de lo de arriba: si alguien devuelve la frase en vez de la
    // clave, `esClaveTraducida` ya lo caza, pero esto lo dice por su nombre.
    const literales = CODIGOS.map((c) => describeWmo(c)[1]).filter((x) => !x.startsWith('vivo.'))
    expect(literales, 'etiquetas sin traducir').toEqual([])
  })
})

describe('describeAqi · la banda es una clave, y el color no', () => {
  const BANDAS = [0, 20, 21, 40, 41, 60, 61, 80, 81, 100, 101, 300]

  it.each(BANDAS)('el EAQI %i devuelve clave, tono y color', (eaqi) => {
    const r = describeAqi(eaqi)
    expect(esClaveTraducida(r.clave), `EAQI ${eaqi} devuelve «${r.clave}»`).toBe(true)
    expect(['ok', 'warn', 'crit', 'neutral']).toContain(r.tone)
    expect(r.color, `EAQI ${eaqi} sin color`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('sin lectura devuelve su propia clave, y no un guion disfrazado de medida', () => {
    // El centinela que ya costó un chip «AQI – —» en la portada: la ausencia
    // tiene nombre propio, y quien la pinte decide, pero nunca se lee como banda.
    const r = describeAqi(null)
    expect(r.clave).toBe('vivo.aqi.sinDato')
    expect(esClaveTraducida(r.clave)).toBe(true)
  })

  it('un EAQI que no es número tampoco inventa banda', () => {
    for (const malo of [undefined, NaN, 'veinte']) {
      expect(describeAqi(malo).clave).toBe('vivo.aqi.sinDato')
    }
  })
})
