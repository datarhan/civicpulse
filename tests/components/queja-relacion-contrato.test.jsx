import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import QuejaDetail from '../../src/pages/QuejaDetail'
import { CATALOGUE } from '../../src/i18n'
import { scoreRelation } from '../../src/scraper/queja-contract-relations'
import { installFetchMock } from '../setup/mockFetch'

/**
 * /quejas/:id · «Posibles actuaciones municipales relacionadas».
 *
 * Cada tarjeta decía «misma zona y materia · zona: … · materia: …» y un enlace
 * «Ver contrato en contrataciondelestado.es →», y nada más: en Q-KJY6XSVG, tres
 * tarjetas iguales sin decir qué contrato era cada una. Ahora cada una lleva el
 * título del contrato, la fecha de adjudicación y el importe, o «importe no
 * publicado» cuando la fuente no lo trae (nunca «0 €»).
 *
 * Los enlaces los calcula el motor de verdad (`scoreRelation`). Los contratos
 * llevan los campos de la fila real 5106922 de tenders.json; el segundo, sin
 * importe, como los 100 que la fuente publica a 0.
 */
const ID = 'Q-PRUEBA01'
const BARRIO = 'valencia-la-vella'
const QUEJA = {
  service_request_id: ID,
  status: 'capturada',
  service_code: 'urbanismo',
  service_name: 'urbanismo',
  description: 'Estructura metálica instalada sin licencia junto al campo deportivo',
  requested_datetime: '2026-07-02T10:00:00.000Z',
  updated_datetime: '2026-07-02T10:00:00.000Z',
  lat: null,
  long: null,
  address_string: BARRIO,
  apoyos: 0,
  concejalia_area: 'Urbanismo',
  concejal_slug: null,
  registro_entry_number: null,
  registered_at: null,
  photo: null,
}
const CONTRATO = {
  id: '5106922',
  permalink:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=prueba-1',
  title:
    'Contrato administrativo obras para la ejecución del proyecto Área de esparcimiento en zona verde de Valencia la Vella',
  department: 'urbanismo',
  cpvs: [],
  places: [BARRIO],
  zones: [],
  awardDate: '2026-05-27',
  amount: 89980.26,
  assignee: 'GEOCIVIL, S.A.',
  expediente: null,
}
const SIN_IMPORTE = {
  ...CONTRATO,
  id: '96520',
  permalink:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=prueba-2',
  title: 'Contrato de obras de colocación de Centros Culturales en Valencia La Vella',
  awardDate: '2019-11-03',
  amount: null,
}
const enlace = (c) =>
  scoreRelation(
    {
      id: ID,
      serviceCode: QUEJA.service_code,
      department: 'urbanismo',
      placeSlug: BARRIO,
      description: QUEJA.description,
      createdAt: QUEJA.requested_datetime,
    },
    c,
  )

function monta(links) {
  installFetchMock({
    '/data/quejas.json': { generatedAt: '2026-10-25T06:00:00.000Z', stats: {}, items: [QUEJA] },
    '/data/quejas-responses.json': { generatedAt: '2026-10-25T06:00:00.000Z', items: [] },
    '/data/officials.json': { officials: [] },
    '/data/geo.json': {
      neighborhoods: [{ id: 'n1', slug: BARRIO, name: 'Urbanització València la Vella' }],
    },
    '/data/queja-contract-relations.json': {
      generatedAt: '2026-10-25T06:00:00.000Z',
      links,
      stats: {},
    },
    '/data/queja-contract-relations-approved.json': { approvals: [] },
  })
  return render(
    <MemoryRouter initialEntries={[`/quejas/${ID}`]}>
      <Routes>
        <Route path="/quejas/:id" element={<QuejaDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjetaDe = (enlaceHref) => {
  const a = document.querySelector(`a[href="${enlaceHref}"]`)
  // La tarjeta es el bloque que contiene el enlace y su pastilla de relación.
  return a?.closest('div[style*="padding"]') ?? null
}

describe('queja · contratos relacionados', () => {
  it('cada tarjeta dice qué contrato es, cuándo se adjudicó y por cuánto', async () => {
    monta([enlace(CONTRATO)])
    expect(await screen.findByText(/Área de esparcimiento en zona verde/)).toBeInTheDocument()
    const t = within(tarjetaDe(CONTRATO.permalink))
    expect(t.getByText(/27 de mayo de 2026/)).toBeInTheDocument()
    expect(t.getByText(/89\.980 €/)).toBeInTheDocument()
    expect(t.getByText(/sin IVA/)).toBeInTheDocument()
  })

  it('sin importe publicado lo dice, y no pinta 0 €', async () => {
    monta([enlace(SIN_IMPORTE)])
    expect(await screen.findByText(/Centros Culturales/)).toBeInTheDocument()
    const tarjeta = tarjetaDe(SIN_IMPORTE.permalink)
    expect(
      within(tarjeta).getByText(new RegExp(CATALOGUE.es['importe.noPublicado'])),
    ).toBeInTheDocument()
    expect(tarjeta.textContent).not.toMatch(/\b0 €/)
  })

  it('un enlace de un fichero anterior, sin título, sigue pintando su tarjeta', async () => {
    const viejo = enlace(CONTRATO)
    delete viejo.tenderTitle
    delete viejo.tenderAwardDate
    delete viejo.tenderAmount
    monta([viejo])
    expect(
      await screen.findByText(CATALOGUE.es['quejas.detalle.relacion.verContrato']),
    ).toBeInTheDocument()
    expect(tarjetaDe(CONTRATO.permalink).textContent).not.toMatch(/undefined|null|NaN/)
  })
})
