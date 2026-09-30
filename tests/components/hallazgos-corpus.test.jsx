import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import Hallazgos from '../../src/pages/Hallazgos'
import { installFetchMock } from '../setup/mockFetch'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { DEPT_TO_CLAIM_TOPICS, deptSlugToClaimTopics } from '../../src/lib/department-claim-topics'
import { CATALOGUE } from '../../src/i18n'

/**
 * /hallazgos pide el corpus de declaraciones sólo cuando filtra por área.
 *
 * La página llamaba a `usePlenoClaims()` siempre, y ese hook pide el manifiesto de
 * pleno-claims y, detrás, cada fragmento que lista. Lo único que lo lee es el filtro
 * `?area=` —`findingMatchesArea`, que sin área devuelve `true` antes de mirarlo—, así
 * que sin él el corpus se descargaba para no leerse: medido el 29-09-2026 sobre una
 * build de producción con las dos banderas, abrir /hallazgos pidió index.json y los
 * 23 fragmentos, unos 7 MB descodificados.
 *
 * /hallazgos?area=… es el control, y no está de adorno. Allí el corpus ES la fuente:
 * un hallazgo no lleva área, se la dan los temas de las declaraciones que cita. La
 * prueba demuestra que entonces sí lo pide y que el filtro sigue estrechando la
 * lista, así que la lista vacía de la página sin área es una medida y no un silencio.
 *
 * El corpus se sirve entero en todos los casos: si la página lo pide, la petición
 * prospera y queda contada, en vez de morir en un 404 que nadie mira. Los datos salen
 * de las instantáneas publicadas.
 */

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const HALLAZGOS = lee('pleno-findings.json')
const PROCEDENCIA = lee('finding-quote-provenance.json')
const MANIFIESTO = lee('pleno-claims/index.json')

const INDICE = '/data/pleno-claims/index.json'
const urlDe = (p) => `/data/${p.chunkPath}`
const FRAGMENTOS = Object.fromEntries(MANIFIESTO.plenos.map((p) => [urlDe(p), lee(p.chunkPath)]))

/** Lo que la página ha pedido de pleno-claims, en el orden en que lo pidió. */
const pedidasDeDeclaraciones = (fetchFn) =>
  fetchFn.mock.calls
    .map(([input]) => String(input).replace(/^https?:\/\/[^/]+/, ''))
    .filter((ruta) => ruta.startsWith('/data/pleno-claims/'))

const IDS = new Set(HALLAZGOS.items.map((f) => f.id))

/** Las fichas pintadas, en el orden del documento: cada una lleva el id de su hallazgo. */
const fichas = () =>
  [...document.querySelectorAll('[id]')].map((el) => el.id).filter((id) => IDS.has(id))

/**
 * Los hallazgos en el orden en que la página los pinta: por pleno, del más reciente
 * al más antiguo, y dentro de un pleno en el del fichero (`sort` es estable).
 */
const enOrden = (lista) =>
  [...lista].sort((a, b) => b.plenoDate.localeCompare(a.plenoDate)).map((f) => f.id)

/** El tema de cada declaración del corpus servido. */
const TEMA = new Map(
  Object.values(FRAGMENTOS).flatMap((c) => c.items.map((it) => [it.claim.id, it.claim.topic])),
)

/**
 * Los hallazgos de un área, derivados aquí y no con `findingMatchesArea`: los que
 * citan alguna declaración de uno de los temas que el área agrupa.
 */
const delArea = (slug) => {
  const temas = deptSlugToClaimTopics(slug)
  return HALLAZGOS.items.filter((f) => f.sourceClaimIds.some((id) => temas.has(TEMA.get(id))))
}

/**
 * Deja correr lo que el montaje haya puesto en marcha: con el defecto, el manifiesto
 * llega y detrás salen las peticiones de sus fragmentos.
 */
async function reposa() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

/**
 * Monta la página en `ruta` con los datos publicados. `corpus`, si llega, es una
 * promesa que retiene toda petición de pleno-claims hasta resolverse; `falta` es un
 * fichero que se deja sin servir, y responde 404.
 */
function monta(ruta, { corpus = null, falta = null } = {}) {
  const mapa = {
    '/data/pleno-findings.json': HALLAZGOS,
    '/data/finding-quote-provenance.json': PROCEDENCIA,
    [INDICE]: MANIFIESTO,
    ...FRAGMENTOS,
  }
  if (falta) delete mapa[falta]
  const sirve = installFetchMock(mapa)
  const fetchFn = vi.fn(async (input) => {
    if (corpus && String(input).includes('/data/pleno-claims/')) await corpus
    return sirve(input)
  })
  globalThis.fetch = fetchFn
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/hallazgos" element={<Hallazgos />} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchFn
}

describe('/hallazgos sin área · no descarga el corpus de declaraciones', () => {
  it('pinta todos los hallazgos, en su orden, sin pedir nada de pleno-claims', async () => {
    const fetchFn = monta('/hallazgos')
    // La lista está pintada entera: sin esto, «no pidió nada» también sería verdad
    // con la página cargando todavía.
    await waitFor(() => expect(fichas()).toEqual(enOrden(HALLAZGOS.items)))
    await reposa()
    expect(pedidasDeDeclaraciones(fetchFn)).toEqual([])
  })
})

describe('/hallazgos?area=… · EL CONTROL: con área, el corpus se pide y filtra', () => {
  const AREA = 'urbanismo'

  it('mide algo: el área deja dentro unos hallazgos y fuera otros', () => {
    const dentro = delArea(AREA).length
    expect(dentro).toBeGreaterThan(0)
    expect(dentro).toBeLessThan(HALLAZGOS.items.length)
  })

  it('pide el manifiesto y cada fragmento una vez, y pinta sólo los hallazgos del área', async () => {
    const fetchFn = monta(`/hallazgos?area=${AREA}`)
    await waitFor(() => expect(fichas()).toEqual(enOrden(delArea(AREA))), { timeout: 3000 })
    await reposa()
    expect(pedidasDeDeclaraciones(fetchFn).sort()).toEqual(
      [INDICE, ...MANIFIESTO.plenos.map(urlDe)].sort(),
    )
  })

  it('un área sin hallazgos dice que ninguno coincide, no que no hay ninguno publicado', async () => {
    const vacia = Object.keys(DEPT_TO_CLAIM_TOPICS).find((s) => delArea(s).length === 0)
    expect(vacia, 'un área sin ningún hallazgo').toBeDefined()
    monta(`/hallazgos?area=${vacia}`)
    // El corpus ha llegado: el mensaje es el de la lista ya filtrada, no el de la carga.
    await waitFor(
      () =>
        expect(MANIFIESTO.plenos.every((p) => peekSnapshot(urlDe(p))?.status === 'ready')).toBe(
          true,
        ),
      { timeout: 3000 },
    )
    await reposa()
    expect(document.body.textContent).toContain('Ninguno coincide con los filtros actuales.')
    expect(document.body.textContent).not.toContain('Todavía no hay hallazgos')
  })
})

/**
 * Sin el corpus no se sabe qué hallazgos son del área. La lista decía «Ninguno
 * coincide con los filtros actuales.» mientras llegaba —y para siempre si no
 * llegaba—, que es falso: en una página que nombra a grupos políticos, «no lo sé
 * todavía» se publicaba como «no hay ninguno».
 */
describe('/hallazgos?area=… · sin el corpus, la lista no dice que ninguno coincide', () => {
  const AREA = 'urbanismo'
  const CARGANDO = CATALOGUE.es['common.loading']
  const TITULAR = 'Hallazgos sobre declaraciones en pleno'
  const texto = () => document.body.textContent

  it('mientras el corpus no llega dice que carga, y cuando llega pinta los del área', async () => {
    let suelta
    const corpus = new Promise((r) => {
      suelta = r
    })
    monta(`/hallazgos?area=${AREA}`, { corpus })
    // La página ya ha cargado sus hallazgos —el titular sólo sale entonces—, así que
    // el aviso de carga es el de la lista, no el de la página.
    await waitFor(() => expect(texto()).toContain(TITULAR))
    await reposa()
    expect(texto()).toContain(CARGANDO)
    expect(texto()).not.toContain('Ninguno coincide')
    expect(fichas()).toEqual([])

    suelta()
    await waitFor(() => expect(fichas()).toEqual(enOrden(delArea(AREA))), { timeout: 3000 })
    expect(texto()).not.toContain(CARGANDO)
  })

  it('si falta un fragmento, dice cuál en vez de decir que ninguno coincide', async () => {
    const FALTA = urlDe(MANIFIESTO.plenos[0])
    monta(`/hallazgos?area=${AREA}`, { falta: FALTA })
    await waitFor(() => expect(texto()).toContain(FALTA), { timeout: 3000 })
    expect(texto()).not.toContain('Ninguno coincide')
    expect(texto()).not.toContain(CARGANDO)
    expect(fichas()).toEqual([])
  })
})
