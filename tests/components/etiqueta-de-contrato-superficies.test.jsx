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

/** Un enlace publicado cuyo título la etiqueta acorta, el más largo. */
const LARGO = [...RELACIONES.links]
  .filter((l) => l.tenderTitle && etiquetaDeContrato(l.tenderTitle).recortada)
  .sort((a, b) => b.tenderTitle.length - a.tenderTitle.length)[0]
/** Y uno que la etiqueta no acorta. */
const CORTO = RELACIONES.links.find(
  (l) => l.tenderTitle && !etiquetaDeContrato(l.tenderTitle).recortada,
)

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
    '/data/queja-contract-relations-approved.json': { approvals: [] },
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
  const RECIENTES = TENDERS.top.recentAwarded.slice(0, 4)

  it('mide algo: alguna de las que se pintan hoy se acorta', () => {
    expect(RECIENTES.some((c) => etiquetaDeContrato(c.title).recortada)).toBe(true)
  })

  it('cada fila se titula con la etiqueta, sin cortar a mitad de palabra', async () => {
    installFetchMock({ '/data/tenders.json': TENDERS })
    render(
      <MemoryRouter>
        <LiveContracts />
      </MemoryRouter>,
    )
    for (const c of RECIENTES) {
      const { etiqueta } = etiquetaDeContrato(c.title)
      const enlaces = await screen.findAllByText(etiqueta)
      expect(enlaces.length, `no se pinta: ${etiqueta}`).toBeGreaterThan(0)
    }
    // El corte a 100 caracteres de antes no puede volver.
    for (const c of RECIENTES.filter((x) => x.title.length > 100)) {
      expect(screen.queryByText(c.title.slice(0, 100) + '…')).toBeNull()
    }
  })
})
