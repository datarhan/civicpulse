import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'node:fs'

import QuejaDetail from '../../src/pages/QuejaDetail'
import { LiveContracts } from '../../src/variants/direction-d/blocks/FeedBlocks'
import { etiquetaDeContrato } from '../../src/scraper/etiqueta-de-contrato'
import { CATALOGUE } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La etiqueta llana de un contrato (`etiquetaDeContrato`) fuera de /cambios:
 * en las tarjetas de contratos de /quejas/:id y en «últimas adjudicaciones» de
 * la portada (auditoría de las dos lecturas, §2; plan revisado, 4a.4).
 *
 * Antes: /quejas/:id cortaba el título oficial a 140 caracteres y dejaba el
 * entero en un `title` que sólo ve quien pasa el ratón; la portada lo cortaba a
 * 100 caracteres, a mitad de palabra. Las dos enseñaban la fórmula de delante
 * («Contrato administrativo de obras para…») y el procedimiento de detrás.
 *
 * Los títulos son los de los ficheros publicados, no inventados.
 */
const TENDERS = JSON.parse(readFileSync('public/data/tenders.json', 'utf8'))
const RELACIONES = JSON.parse(readFileSync('public/data/queja-contract-relations.json', 'utf8'))

/**
 * Un enlace publicado cuyo título la etiqueta acorta, el más largo, y otro que
 * no acorta. Los de nivel B no se enseñan hasta que un curador los aprueba, así
 * que un enlace de nivel B se sirve con su aprobación: el camino por el que
 * llega a la página. Así la prueba no depende de qué enlaces sean hoy de
 * nivel A (tres, y los tres se acortan).
 */
const LARGO = [...RELACIONES.links]
  .filter((l) => l.tenderTitle && etiquetaDeContrato(l.tenderTitle).recortada)
  .sort((a, b) => b.tenderTitle.length - a.tenderTitle.length)[0]
const CORTO = RELACIONES.links.find(
  (l) => l.tenderTitle && !etiquetaDeContrato(l.tenderTitle).recortada,
)
const aprobacionDe = (l) =>
  l.requiresHumanApproval ? [{ quejaId: l.quejaId, tenderId: l.tenderId }] : []

function montaQueja(link) {
  const id = link.quejaId
  installFetchMock({
    '/data/quejas.json': {
      generatedAt: '2026-11-23T06:00:00.000Z',
      stats: {},
      items: [
        {
          service_request_id: id,
          status: 'capturada',
          service_code: 'urbanismo',
          service_name: 'urbanismo',
          description: 'Descripción',
          requested_datetime: '2026-07-02T10:00:00.000Z',
          updated_datetime: '2026-07-02T10:00:00.000Z',
          lat: null,
          long: null,
          address_string: null,
          apoyos: 0,
          photo: null,
        },
      ],
    },
    '/data/quejas-responses.json': { items: [] },
    '/data/officials.json': { officials: [] },
    '/data/geo.json': { neighborhoods: [] },
    '/data/queja-contract-relations.json': { ...RELACIONES, links: [link] },
    '/data/queja-contract-relations-approved.json': { approvals: aprobacionDe(link) },
  })
  return render(
    <MemoryRouter initialEntries={[`/quejas/${id}`]}>
      <Routes>
        <Route path="/quejas/:id" element={<QuejaDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('/quejas/:id · el contrato relacionado se titula con su etiqueta', () => {
  it('mide algo: hay enlaces publicados con título largo y con título corto', () => {
    expect(LARGO, 'ningún enlace publicado se acorta').toBeDefined()
    expect(CORTO, 'todos los enlaces publicados se acortan').toBeDefined()
  })

  it('título largo: la etiqueta arriba y el título oficial entero debajo', async () => {
    const { container } = montaQueja(LARGO)
    const { etiqueta } = etiquetaDeContrato(LARGO.tenderTitle)
    expect(await screen.findByText(etiqueta)).toBeInTheDocument()
    const oficial = container.querySelector('[data-titulo-oficial]')
    expect(oficial, 'falta el título oficial bajo la etiqueta').not.toBeNull()
    expect(oficial.textContent).toBe(
      rellena(CATALOGUE.es['cambios.contrato.tituloOficial'], { titulo: LARGO.tenderTitle }),
    )
    // El título entero ya está a la vista: no hace falta un `title` que sólo
    // ve quien pasa el ratón.
    expect(container.querySelector(`[title="${CSS.escape(LARGO.tenderTitle)}"]`)).toBeNull()
  })

  it('título corto: la etiqueta, y ninguna línea de título oficial', async () => {
    const { container } = montaQueja(CORTO)
    expect(
      await screen.findByText(etiquetaDeContrato(CORTO.tenderTitle).etiqueta),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-titulo-oficial]')).toBeNull()
  })
})

describe('portada · últimas adjudicaciones', () => {
  /**
   * Cuatro filas reales de tenders.json: dos que la etiqueta acorta y dos que
   * no, servidas como las últimas adjudicaciones. Las de hoy rotan con cada
   * nocturna; así la prueba mira los dos casos pase lo que pase con el dato.
   */
  const ACORTADAS = TENDERS.contracts.filter((c) => etiquetaDeContrato(c.title).recortada)
  const ENTERAS = TENDERS.contracts.filter((c) => c.title && !etiquetaDeContrato(c.title).recortada)
  const FILAS = [...ACORTADAS.slice(0, 2), ...ENTERAS.slice(0, 2)]

  it('mide algo: el fichero trae contratos de los dos casos', () => {
    expect(ACORTADAS.length).toBeGreaterThan(1)
    expect(ENTERAS.length).toBeGreaterThan(1)
  })

  it('cada fila se titula con la etiqueta, y el título oficial va debajo si dice menos', async () => {
    installFetchMock({
      '/data/tenders.json': { ...TENDERS, top: { ...TENDERS.top, recentAwarded: FILAS } },
    })
    const { container } = render(
      <MemoryRouter>
        <LiveContracts />
      </MemoryRouter>,
    )
    for (const c of FILAS) {
      const { etiqueta } = etiquetaDeContrato(c.title)
      const enlaces = await screen.findAllByText(etiqueta)
      expect(enlaces.length, `no se pinta: ${etiqueta}`).toBeGreaterThan(0)
    }
    const oficiales = [...container.querySelectorAll('[data-titulo-oficial]')].map(
      (o) => o.textContent,
    )
    expect(oficiales).toEqual(
      ACORTADAS.slice(0, 2).map((c) =>
        rellena(CATALOGUE.es['cambios.contrato.tituloOficial'], { titulo: c.title }),
      ),
    )
    // El corte a 100 caracteres de antes no puede volver.
    for (const c of FILAS.filter((x) => x.title.length > 100)) {
      expect(screen.queryByText(c.title.slice(0, 100) + '…')).toBeNull()
    }
  })
})
