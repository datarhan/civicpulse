/**
 * /plenos/:id con el alias legible de la sesión, «2026-05-11-ordinario», pinta la
 * misma página que con su id, y no pide ningún fichero con un nombre que no
 * existe: las declaraciones se piden por id, en cuanto el índice dice de qué
 * sesión es el alias. Un alias sin sesión dice «Sesión no encontrada», como un id
 * que no existe.
 *
 * La sesión es la de la revisión lectora, real, con sus ficheros publicados.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { aliasDeSesion, rutaDeSesion } from '../../src/scraper/ruta-de-sesion'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const ID = '10yl550'
const SESION = PLENOS.items.find((s) => s.id === ID)
const ENTRADA = lee('pleno-claims/index.json').plenos.find((p) => p.plenoId === ID)

const servido = () => ({
  '/data/plenos.json': PLENOS,
  '/data/plenos-agendas.json': lee('plenos-agendas.json'),
  '/data/pleno-votes.json': lee('pleno-votes.json'),
  '/data/pleno-findings.json': lee('pleno-findings.json'),
  '/data/pleno-videos.json': lee('pleno-videos.json'),
  '/data/pleno-videos-regmeet.json': lee('pleno-videos-regmeet.json'),
  [`/data/pleno-claims/${ID}.json`]: lee(ENTRADA.chunkPath),
})

const laFicha = () => (
  <Routes>
    <Route path="/plenos/:id" element={<PlenoDetalle />} />
  </Routes>
)

/** El título de la sesión, el enlace que comparte y si la página dice que no la encuentra. */
const leeFicha = (c) => [
  c.querySelector('h1')?.textContent ?? '(sin h1)',
  [...c.querySelectorAll('a[href*="wa.me"]')].map((a) => a.getAttribute('href')).join(' ') ||
    '(sin compartir)',
  c.querySelector('[data-no-resuelta]') ? 'no resuelta' : 'resuelta',
]

const escenario = (ruta, extra = {}) => ({
  nombre: ruta,
  ruta,
  fetch: servido(),
  pinta: laFicha,
  listo: (c) =>
    c.querySelector('h1') !== null && c.querySelector('[data-en-breve-bloque]') !== null,
  ...extra,
})

describe('/plenos/:id por el alias legible', () => {
  it('lo publicado da a la sesión un alias que no es su id', () => {
    expect(SESION).toBeTruthy()
    expect(ENTRADA, 'la sesión tiene declaraciones publicadas').toBeTruthy()
    expect(rutaDeSesion(SESION, PLENOS.items)).toBe(`/plenos/${aliasDeSesion(SESION)}`)
  })

  it('pinta la misma sesión que su id, comparte el alias y no pide nada que no exista', async () => {
    const porId = await pintaYLee(escenario(`/plenos/${ID}`), 'es', { lee: leeFicha })
    const porAlias = await pintaYLee(escenario(`/plenos/${aliasDeSesion(SESION)}`), 'es', {
      lee: leeFicha,
    })
    expect(porAlias.pedidasSinServir).toEqual([])
    expect(porAlias.servidasSinPedir).toEqual([])
    expect(porAlias.piezas).toEqual(porId.piezas)
    expect(porAlias.piezas[1]).toContain(encodeURIComponent(aliasDeSesion(SESION)))
    expect(porAlias.piezas[2]).toBe('resuelta')
  }, 60000)

  it('un alias sin sesión dice que no la encuentra', async () => {
    const { piezas } = await pintaYLee(
      {
        ...escenario('/plenos/1999-01-01-ordinario'),
        fetch: { '/data/plenos.json': PLENOS },
        listo: (c) => c.querySelector('[data-no-resuelta]') !== null,
        faltanAdrede: [
          '/data/pleno-claims/1999-01-01-ordinario.json',
          '/data/plenos-agendas.json',
          '/data/pleno-votes.json',
          '/data/pleno-findings.json',
          '/data/pleno-videos.json',
          '/data/pleno-videos-regmeet.json',
        ],
      },
      'es',
      { lee: leeFicha },
    )
    expect(piezas[2]).toBe('no resuelta')
  }, 60000)
})
