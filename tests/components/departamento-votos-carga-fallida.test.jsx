import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

/**
 * /departamentos/:slug · votaciones que no se pudieron cargar.
 *
 * La sección leía `(votesSnap.data?.items ?? [])`, así que un pleno-votes.json
 * que no llegaba se pintaba con la frase de vacío —«Todavía no hemos transcrito
 * ninguna votación de esta concejalía»—, que afirma algo que sin el fichero no
 * se sabe. Tres resultados, no dos: hay votos, no hay ninguno, no se sabe.
 *
 * Medido al escribir esta prueba: sin pleno-votes.json la ficha no llega a esa
 * sección (no resuelve el departamento), así que hoy la guarda de la sección es
 * latente. Se prueba la propiedad —nunca la frase de vacío sin el fichero— y no
 * el camino.
 */
const VACIO = CATALOGUE.es['departamentos.detalle.empty.votes']
const FALLO = CATALOGUE.es['departamentos.detalle.error.votes']

function monta(votos) {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    // Sin esta clave el mock responde 404: la carga fallida.
    ...(votos ? { '/data/pleno-votes.json': { items: votos } } : {}),
  })
  return render(
    <MemoryRouter initialEntries={['/departamentos/urbanismo']}>
      <Routes>
        <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('departamento — votaciones', () => {
  it('sin el fichero de votaciones no dice que no haya ninguna', async () => {
    // Hoy la ficha entera depende de las votaciones (useDepartmentStats), así
    // que sin el fichero no resuelve el departamento y lo dice como tal
    // (`data-no-resuelta`). Lo que importa aquí es que en ningún caso pinte la
    // frase de vacío; si la ficha deja de depender de las votaciones, la
    // sección pintará FALLO, que tampoco es VACIO.
    const { container } = monta(null)
    await screen.findByText(/no encontrado|No se han podido cargar/i)
    expect(screen.queryByText(VACIO)).toBeNull()
    expect(
      container.querySelector('[data-no-resuelta]') || screen.queryByText(FALLO),
    ).not.toBeNull()
  })

  it('con el fichero y ninguna votación del área, lo dice', async () => {
    monta([])
    expect(await screen.findByText(VACIO)).toBeInTheDocument()
    expect(screen.queryByText(FALLO)).toBeNull()
  })
})
