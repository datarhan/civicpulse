import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CargoDetalle from '../../src/pages/CargoDetalle'
import { LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La ficha de un cargo publicaba «Dinero adjudicado en las concejalías que dirige»
 * con la suma de todos los contratos atribuidos a esas áreas desde 2017, sin decir
 * de qué años. En /cargos/teresa-pozuelo-martin eran 30,54 M€ en 235 contratos, la
 * mitad larga anteriores al mandato que empezó en 2023: se leía como la contratación
 * de su mandato. Y la entradilla lo llamaba «gasto», que una adjudicación no es.
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
      portfolios: ['Urbanismo', 'Vivienda'],
      photoUrl: '',
    },
  ],
}
const contrato = (id, categoryTitle, awardDate) => ({
  id,
  title: `Contrato ${id}`,
  categoryTitle,
  assignee: 'Empresa SL',
  status: 'awarded',
  awardDate,
  finalAmount: 1000,
})

function monta(contratos, idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/officials.json': OFICIALES,
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/tenders.json': { contracts: contratos },
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

afterEach(() => localStorage.clear())

describe('/cargos/:slug · el dinero de sus áreas dice de qué años es', () => {
  it('con contratos de 2019 y 2024, el título da el periodo', async () => {
    monta([
      contrato('u1', 'architecture', '2019-05-02'),
      contrato('v1', 'real_estate', '2024-03-01'),
    ])
    expect(
      await screen.findByText(
        'Dinero adjudicado entre 2019 y 2024 en las concejalías que hoy dirige',
      ),
    ).toBeInTheDocument()
  })

  it('la entradilla no lo llama «gasto» y dice que no es la contratación de su mandato', async () => {
    monta([contrato('u1', 'architecture', '2019-05-02')])
    const entradilla = await screen.findByText(/^Importes adjudicados/)
    expect(entradilla.textContent).not.toMatch(/gasto/i)
    expect(entradilla.textContent).toContain('no es la contratación de su mandato')
  })

  it('con contratos de un solo año, un solo año (el control)', async () => {
    monta([
      contrato('u1', 'architecture', '2024-01-10'),
      contrato('v1', 'real_estate', '2024-11-30'),
    ])
    expect(
      await screen.findByText('Dinero adjudicado en 2024 en las concejalías que hoy dirige'),
    ).toBeInTheDocument()
  })

  it('en valencià, el periodo en valencià', async () => {
    monta(
      [contrato('u1', 'architecture', '2019-05-02'), contrato('v1', 'real_estate', '2024-03-01')],
      'ca',
    )
    expect(
      await screen.findByText(
        'Diners adjudicats entre 2019 i 2024 a les regidories que hui dirigeix',
      ),
    ).toBeInTheDocument()
  })
})
