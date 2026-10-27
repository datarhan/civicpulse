import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { CATALOGUE } from '../src/i18n'
import { fmtDateLong, rellena } from '../src/lib/formatters'
import { tituloDeSesionEs } from '../src/scraper/meta-og'

/**
 * La pestaña de una sesión dice «Pleno del 11 de mayo de 2026», y el HTML que
 * prerender-meta escribe para esa sesión —lo que ve quien recibe el enlace—
 * tiene que decir lo mismo. Se escriben en dos sitios (la página con el
 * catálogo, el script sin dependencias), así que aquí se comparan en cada sesión
 * publicada.
 */
const sesiones = JSON.parse(readFileSync('public/data/plenos.json', 'utf8')).items

describe('el título de una sesión', () => {
  it('el HTML y la pestaña dicen lo mismo, en cada sesión con fecha', () => {
    const conFecha = sesiones.filter((s) => s.date)
    expect(conFecha.length).toBeGreaterThan(10)
    for (const s of conFecha) {
      expect(tituloDeSesionEs(s.date), s.id).toBe(
        rellena(CATALOGUE.es['plenoDetail.tituloPestana'], { fecha: fmtDateLong(s.date, 'es') }),
      )
    }
  })

  it('dice la fecha de la sesión, sin el «Sesión de fecha» de regmeet', () => {
    expect(tituloDeSesionEs('2026-05-11')).toBe('Pleno del 11 de mayo de 2026')
  })

  it('en valenciano, el 1 y el 11 piden «de l’»', () => {
    const vocal = CATALOGUE.ca['plenoDetail.tituloPestana.vocal']
    expect(rellena(vocal, { fecha: fmtDateLong('2026-10-01', 'ca') })).toBe(
      'Ple de l’1 d’octubre del 2026',
    )
    expect(
      rellena(CATALOGUE.ca['plenoDetail.tituloPestana'], {
        fecha: fmtDateLong('2026-05-11', 'ca'),
      }),
    ).toBe('Ple del 11 de maig del 2026')
  })
})
