import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { enCastellano } from '../src/scraper/solicitud-enviada'
import { Concesion } from '../src/components/eficiencia/Concesion'

/**
 * La fecha de adjudicación de la concesión del agua en /eficiencia.
 *
 * Las dos fichas del agua (a161, a160) publicaban «adjudicado el 6 de agosto
 * de 2026», y el 6 de agosto es el día en que la Plataforma de Contratación
 * PUBLICÓ el anuncio de adjudicación: el acuerdo es del Pleno del 27 de julio.
 * El `awardDate` de `tenders.json` es ese día de publicación —comprobado en
 * siete fichas de PLACSP de 2018 a 2026—, así que quien copie la fecha del
 * registro de contratos repite el error. El reportaje `coste-efectivo` ya lo
 * había corregido en su propio texto; la ficha seguía con la fecha vieja.
 *
 * Por eso aquí no se escribe ninguna fecha: se leen de las fuentes que el
 * proyecto ya publica, y lo que se fija es que coincidan.
 */
const RAIZ = join(__dirname, '..')
const leer = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), 'utf8'))

const reportaje = leer('public/data/reportajes/coste-efectivo.json').concesion
const tenders = leer('public/data/tenders.json')

const FICHAS = ['a161', 'a160']

describe('concesión del agua · fecha de adjudicación', () => {
  it.each(FICHAS)('%s fecha la adjudicación en el acuerdo, no en el anuncio', (programa) => {
    const c = SERVICIOS[programa].concesion
    expect(c, `${programa} ya no declara concesión`).toBeTruthy()
    // Las dos fechas del reportaje tienen que ser distintas, o el test no
    // distingue nada.
    expect(reportaje.adjudicadaEl).not.toBe(reportaje.publicadaEl)
    expect(c.adjudicadaEl).toBe(reportaje.adjudicadaEl)
  })

  it('ese día hubo Pleno y la adjudicación estaba en su orden del día', () => {
    const { plenos } = leer('public/data/plenos-agendas.json')
    const sesion = plenos.find((p) => p.date === reportaje.adjudicadaEl)
    expect(sesion, `no hay Pleno el ${reportaje.adjudicadaEl}`).toBeTruthy()
    expect(JSON.stringify(sesion)).toMatch(
      /Adjudicación del contrato de concesión del servicio público de abastecimiento de agua potable/,
    )
  })

  it.each(FICHAS)('%s: la nota nombra el mes del acuerdo y no el del anuncio', (programa) => {
    const c = SERVICIOS[programa].concesion
    const mes = (iso) => enCastellano(iso).replace(/^\d+ de /, '')
    expect(c.nota).toContain(mes(reportaje.adjudicadaEl))
    expect(c.nota).not.toContain(mes(reportaje.publicadaEl))
  })
})

describe('concesión del agua · fin del plazo', () => {
  // La fila de `contracts`, nunca la de `tenders`: el mismo id vive en las dos
  // con estados distintos (ver tenders-colision-id.test.ts). Se busca por la
  // ficha de PLACSP que el registro enlaza, que es lo que la ficha cita.
  it.each(FICHAS)('%s termina el día que el registro da desde la formalización', (programa) => {
    const c = SERVICIOS[programa].concesion
    const fila = tenders.contracts.find((r) => r.permalink === c.url)
    expect(fila, 'el expediente ya no está entre los contratos').toBeTruthy()
    expect(fila.formalizedDate, 'el registro aún no trae la formalización').toBeTruthy()
    expect(c.hasta).toBe(fila.endDate)
  })
})

describe('concesión del agua · el snapshot publicado', () => {
  // La página lee `indicadores.json`, no el registro: un registro corregido
  // con el snapshot sin regenerar sigue publicando la fecha vieja.
  const { indicadores } = leer('public/data/indicadores.json')
  it.each(FICHAS)('%s publica la concesión del registro', (programa) => {
    const ficha = indicadores.find((i) => i.id === `${programa}-coste-unitario`)
    expect(ficha, `${programa}-coste-unitario no está en indicadores.json`).toBeTruthy()
    expect(ficha.concesion).toEqual(SERVICIOS[programa].concesion)
  })
})

describe('concesión del agua · la fecha que se pinta', () => {
  // `new Date('2026-07-27')` es la medianoche UTC: en cualquier huso al oeste
  // de Greenwich `toLocaleDateString` la pinta como el día ANTERIOR. Una fecha
  // publicada no puede depender de dónde la lea uno.
  let antes
  beforeEach(() => {
    antes = process.env.TZ
    process.env.TZ = 'America/New_York'
  })
  afterEach(() => {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })

  it.each(FICHAS)('%s pinta el día del acuerdo en cualquier huso', (programa) => {
    const c = SERVICIOS[programa].concesion
    const html = renderToStaticMarkup(createElement(Concesion, { concesion: c }))
    expect(html).toContain(
      `adjudicado el <span class="mono">${enCastellano(c.adjudicadaEl)}</span>`,
    )
  })
})
