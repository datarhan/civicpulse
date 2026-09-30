import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { gateForDisplay, sortSignalFirst } from '../../src/lib/claim-ledger'
import { deptSlugToClaimTopics } from '../../src/lib/department-claim-topics'
import { CATALOGUE } from '../../src/i18n'

/**
 * El registro de declaraciones pide el corpus sólo cuando no le dan las suyas.
 *
 * `ClaimLedger` llamaba a `usePlenoClaims()` siempre, y ese hook pide el manifiesto
 * de pleno-claims y, detrás, cada fragmento que lista. En /plenos/:id la página ya
 * tiene el fragmento de su sesión (`usePlenoChunk`) y se lo pasa en `items`, así que
 * el corpus se descargaba para no pintarse: medido el 29-09-2026 sobre una build de
 * producción con las banderas, abrir «Declaraciones contrastadas» en /plenos/k4olcs
 * pidió index.json y los 23 fragmentos, unos 7 MB, el mayor de 1,4 MB.
 *
 * /departamentos/:slug no pasa `items`: allí el corpus ES la fuente, filtrada por
 * tema. Es el control, y no está de adorno: demuestra que esta prueba ve una descarga
 * del corpus cuando la hay, así que la lista vacía de /plenos/:id es una medida y no
 * un silencio.
 *
 * El corpus se sirve entero en las dos páginas: si una lo pide, la petición prospera
 * y queda contada, en vez de morir en un 404 que nadie mira. Los datos salen de las
 * instantáneas publicadas, como en pleno-detalle-pestanas.test.jsx.
 */

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const MANIFIESTO = lee('pleno-claims/index.json')
const PLENOS = lee('plenos.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const AGENDAS = lee('plenos-agendas.json')

const INDICE = '/data/pleno-claims/index.json'
const urlDe = (p) => `/data/${p.chunkPath}`

/** Lo que la página ha pedido de pleno-claims, en el orden en que lo pidió. */
const pedidasDeDeclaraciones = (fetchFn) =>
  fetchFn.mock.calls
    .map(([input]) => String(input).replace(/^https?:\/\/[^/]+/, ''))
    .filter((ruta) => ruta.startsWith('/data/pleno-claims/'))

/** La cita que el registro pinta primero: la misma puerta y el mismo orden que usa él. */
const primeraCita = (items) => `«${sortSignalFirst(gateForDisplay(items))[0].claim.verbatim}»`

/** Las citas pintadas en las tarjetas del registro. */
const citas = () => [...document.querySelectorAll('blockquote')].map((b) => b.textContent)

/**
 * Deja correr lo que el montaje del registro haya puesto en marcha: con el defecto,
 * el manifiesto llega y detrás salen las peticiones de sus fragmentos.
 */
async function reposa() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

describe('/plenos/:id · la pestaña de declaraciones no descarga el corpus', () => {
  const ID = 'p1'
  const PROPIO = MANIFIESTO.plenos[0]
  const AJENOS = MANIFIESTO.plenos.slice(1, 3)
  const FRAGMENTO = `/data/pleno-claims/${ID}.json`
  const DECLARACIONES = CATALOGUE.es['plenoDetail.declarations']

  function monta() {
    const fetchFn = installFetchMock({
      '/data/plenos.json': { ...PLENOS, items: [{ ...PLENOS.items[0], id: ID }] },
      '/data/pleno-votes.json': { ...VOTOS, items: [] },
      '/data/pleno-findings.json': { ...HALLAZGOS, items: [] },
      '/data/pleno-videos.json': { ...VIDEOS, items: [] },
      '/data/plenos-agendas.json': { ...AGENDAS, plenos: [] },
      [FRAGMENTO]: lee(PROPIO.chunkPath),
      [INDICE]: {
        ...MANIFIESTO,
        plenos: [{ ...PROPIO, plenoId: ID, chunkPath: `pleno-claims/${ID}.json` }, ...AJENOS],
      },
      ...Object.fromEntries(AJENOS.map((p) => [urlDe(p), lee(p.chunkPath)])),
    })
    render(
      <MemoryRouter initialEntries={[`/plenos/${ID}`]}>
        <Routes>
          <Route path="/plenos/:id" element={<PlenoDetalle />} />
        </Routes>
      </MemoryRouter>,
    )
    return fetchFn
  }

  it('mide algo: hay fragmentos ajenos que pedir y el propio trae citas que pintar', () => {
    expect(AJENOS).toHaveLength(2)
    expect(gateForDisplay(lee(PROPIO.chunkPath).items).length).toBeGreaterThan(0)
  })

  it('abrirla pide sólo el fragmento de la sesión: ni el manifiesto ni los demás', async () => {
    const fetchFn = monta()
    const pestaña = await waitFor(() => {
      const botones = screen
        .getAllByRole('button')
        .filter((b) => b.textContent.startsWith(DECLARACIONES))
      expect(botones, `pestañas «${DECLARACIONES}»`).toHaveLength(1)
      return botones[0]
    })
    fireEvent.click(pestaña)
    // El registro está montado y pinta el fragmento de la sesión: sin esto, «no pidió
    // nada» también sería verdad con la pestaña cerrada.
    const esperada = primeraCita(lee(PROPIO.chunkPath).items)
    await waitFor(() => expect(citas()).toContain(esperada))
    await reposa()
    expect(pedidasDeDeclaraciones(fetchFn)).toEqual([FRAGMENTO])
  })
})

describe('/departamentos/:slug · EL CONTROL: sin `items`, el registro lee el corpus', () => {
  const SLUG = 'urbanismo'
  const TEMAS = deptSlugToClaimTopics(SLUG)
  // Dos fragmentos que, según el manifiesto, traen declaraciones de los temas del área.
  const CON_TEMA = MANIFIESTO.plenos
    .filter((p) => [...TEMAS].some((t) => (p.byTopic?.[t] ?? 0) > 0))
    .slice(0, 2)

  function monta() {
    const fetchFn = installFetchMock({
      '/data/officials.json': { officials: [] },
      '/data/promises.json': { items: [] },
      '/data/plenos-agendas.json': { plenos: [] },
      '/data/pleno-votes.json': { items: [] },
      '/data/quejas.json': { stats: { total: 0 }, items: [] },
      [INDICE]: { ...MANIFIESTO, plenos: CON_TEMA },
      ...Object.fromEntries(CON_TEMA.map((p) => [urlDe(p), lee(p.chunkPath)])),
    })
    render(
      <MemoryRouter initialEntries={[`/departamentos/${SLUG}`]}>
        <Routes>
          <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
        </Routes>
      </MemoryRouter>,
    )
    return fetchFn
  }

  it('pide el manifiesto y sus fragmentos, y pinta una declaración del tema del área', async () => {
    expect(CON_TEMA, 'fragmentos con declaraciones del área').toHaveLength(2)
    const delArea = CON_TEMA.flatMap((p) => lee(p.chunkPath).items).filter((it) =>
      TEMAS.has(it.claim.topic),
    )
    const fetchFn = monta()
    await waitFor(() => expect(citas()).toContain(primeraCita(delArea)))
    await reposa()
    expect(pedidasDeDeclaraciones(fetchFn).sort()).toEqual([INDICE, ...CON_TEMA.map(urlDe)].sort())
  })
})
