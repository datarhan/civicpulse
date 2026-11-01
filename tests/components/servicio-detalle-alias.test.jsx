/**
 * /eficiencia/:id con el alias legible del servicio, «policia-local», pinta la
 * misma ficha que con su id; escrito con tilde, también. Un parámetro que no es
 * ni una cosa ni la otra dice que no hay ficha, como un id que no existe.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ServicioDetalle from '../../src/pages/ServicioDetalle'
import { installFetchMock } from '../setup/mockFetch'

const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const POLICIA = 'b132-130p-coste-unitario'
const etiqueta = publicado.indicadores.find((i) => i.id === POLICIA).etiqueta

function pinta(ruta) {
  installFetchMock({ '/data/indicadores.json': publicado })
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/eficiencia/:id" element={<ServicioDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ServicioDetalle — la dirección legible', () => {
  it('por el id, como siempre', async () => {
    pinta(`/eficiencia/${POLICIA}`)
    expect(await screen.findByRole('heading', { level: 1, name: etiqueta })).toBeTruthy()
  })

  it('por el alias, la misma ficha', async () => {
    const { container } = pinta('/eficiencia/policia-local')
    expect(await screen.findByRole('heading', { level: 1, name: etiqueta })).toBeTruthy()
    expect(container.querySelector('[data-no-resuelta]')).toBeNull()
  })

  it('por el alias escrito con tilde, también', async () => {
    pinta('/eficiencia/polic%C3%ADa-local')
    expect(await screen.findByRole('heading', { level: 1, name: etiqueta })).toBeTruthy()
  })

  it('un parámetro que no es ni id ni alias dice que no hay ficha', async () => {
    const { container } = pinta('/eficiencia/no-existe')
    await screen.findByText(/No hay ninguna ficha con ese identificador/)
    expect(container.querySelector('[data-no-resuelta]')).not.toBeNull()
  })
})
