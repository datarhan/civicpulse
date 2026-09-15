import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CargoDetalle from '../../src/pages/CargoDetalle'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

/**
 * /cargos/:slug · la actividad de sus áreas no dice «0 votaciones» de lo que nadie
 * ha transcrito.
 *
 * Cada área que dirige un cargo enseñaba «0 votaciones · N declaraciones
 * contrastadas». Las votaciones se transcriben a mano desde el acta y la mayoría de
 * las áreas no tiene ninguna, así que ese 0, en la ficha de quien dirige el área,
 * decía que en sus concejalías no se votó nada. Es el «Aprobados 0» de
 * /departamentos, que llega aquí por otro camino desde el mismo recuento.
 *
 * El control lleva una aprobada y una rechazada: las dos son votaciones.
 */
const SLUG = 'ana-prueba'
const OFICIALES = {
  generatedAt: '2026-04-20T00:00:00Z',
  officials: [
    {
      slug: SLUG,
      name: 'Ana Prueba',
      role: 'concejal',
      party: 'PSOE',
      portfolios: ['Urbanismo'],
      photoUrl: '',
    },
  ],
}
const VOTACIONES = CATALOGUE.es['cargos.detalle.actividad.votos']
const SIN_VOTO = CATALOGUE.es['departamentos.card.sinVotoTranscrito']

const voto = (n, outcome) => ({
  id: `v${n}`,
  plenoId: 'p1',
  itemNumber: n,
  department: 'Urbanismo',
  outcome,
})

function monta(votos) {
  localStorage.setItem('cp:lang', 'es')
  installFetchMock({
    '/data/officials.json': OFICIALES,
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: votos },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/tenders.json': { contracts: [] },
  })
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[`/cargos/${SLUG}`]}>
        <Routes>
          <Route path="/cargos/:slug" element={<CargoDetalle />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

/** La fila de Urbanismo en «Actividad de sus áreas»: la del enlace a su ficha. */
async function filaDeUrbanismo() {
  const titulo = await screen.findByText(CATALOGUE.es['cargos.detalle.actividad.title'])
  const seccion = titulo.closest('section')
  expect(seccion, 'la actividad de sus áreas no está en una sección').not.toBeNull()
  const enlace = seccion.querySelector('a[href="/departamentos/urbanismo"]')
  expect(enlace, 'la sección no enlaza a la ficha de Urbanismo').not.toBeNull()
  return enlace.parentElement
}

afterEach(() => localStorage.clear())

describe('/cargos/:slug · la actividad de sus áreas', () => {
  it('sin votaciones transcritas del área, el motivo y ningún «0 votaciones»', async () => {
    monta([])
    const fila = await filaDeUrbanismo()
    expect(fila.textContent).toContain(SIN_VOTO)
    expect(fila.textContent, 'un cero que nadie ha medido').not.toMatch(
      new RegExp(`\\b0\\s+${VOTACIONES}`),
    )
  })

  it('EL CONTROL: con votaciones del área, cuántas, y sin motivo', async () => {
    monta([voto(1, 'aprobado'), voto(2, 'rechazado')])
    const fila = await filaDeUrbanismo()
    expect(fila.textContent).toMatch(new RegExp(`\\b2\\s+${VOTACIONES}`))
    expect(fila.textContent).not.toContain(SIN_VOTO)
  })
})
