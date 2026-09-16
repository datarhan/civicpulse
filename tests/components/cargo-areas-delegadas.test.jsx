import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CargoDetalle from '../../src/pages/CargoDetalle'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La cabecera de un cargo nombra sus áreas delegadas tal como las publica el
 * ayuntamiento, y la cifra de al lado decía «Concejalías 3» junto a cuatro
 * nombres: contaba las fichas de /departamentos a las que esos nombres llegan, no
 * los nombres. «Áreas Industriales y Cementerio» no llega a ninguna, y la página no
 * lo decía. El índice de /cargos ya contaba las áreas delegadas.
 */
const SLUG = 'ana-prueba'
const oficiales = (portfolios) => ({
  generatedAt: '2026-04-20T00:00:00Z',
  officials: [
    { slug: SLUG, name: 'Ana Prueba', role: 'concejal', party: 'PSOE', portfolios, photoUrl: '' },
  ],
})

function monta(portfolios) {
  installFetchMock({
    '/data/officials.json': oficiales(portfolios),
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
  })
  return render(
    <MemoryRouter initialEntries={[`/cargos/${SLUG}`]}>
      <Routes>
        <Route path="/cargos/:slug" element={<CargoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La celda de un `MiniStat`, localizada por su rótulo (como en CargoDetalle.test.jsx). */
async function celda(rotulo) {
  const etiqueta = await screen.findByText(rotulo, { selector: 'div' })
  return etiqueta.parentElement
}

describe('/cargos/:slug · la cifra de áreas cuenta las que nombra la cabecera', () => {
  it('cuatro áreas delegadas y una sin ficha: la cifra dice 4 y la página nombra la que no la tiene', async () => {
    monta(['Urbanismo', 'Vivienda', 'Obra Pública', 'Áreas Industriales y Cementerio'])
    expect(within(await celda('Áreas delegadas')).getByText('4')).toBeInTheDocument()
    expect(
      screen.getByText('Sin ficha de área en /departamentos: Áreas Industriales y Cementerio'),
    ).toBeInTheDocument()
  })

  it('con una sola área, que sí tiene ficha: 1 y ninguna nota (el control)', async () => {
    monta(['Obra Pública'])
    expect(within(await celda('Áreas delegadas')).getByText('1')).toBeInTheDocument()
    expect(screen.queryByText(/^Sin ficha de área/)).toBeNull()
  })
})
