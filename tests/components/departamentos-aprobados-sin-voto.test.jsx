import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import Departamentos from '../../src/pages/Departamentos'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

/**
 * /departamentos · «Aprobados» sin votaciones transcritas.
 *
 * La tarjeta de cada concejalía decía «Aprobados 0» con «sin voto transcrito»
 * debajo, y la tira de la ficha decía «Aprobados 0» sin nada más. Las votaciones se
 * transcriben a mano desde el acta y la mayoría de las áreas no tiene ninguna, así
 * que ese 0 afirmaba, junto a quien dirige el área, que no se le aprobó nada. La
 * revisión lectora lo señaló en /departamentos el 15-09-2026. Es el defecto de
 * «Votaciones 0» en /plenos/:id: de lo que nadie ha medido no hay cero que dar.
 *
 * Los controles llevan dos aprobadas y una rechazada: la cifra es 2 y no 3, para
 * que un recuento cambiado se note.
 */
const APROBADOS = CATALOGUE.es['departamentos.card.aprobados']
const SIN_VOTO = CATALOGUE.es['departamentos.card.sinVotoTranscrito']

const voto = (n, outcome) => ({
  id: `v${n}`,
  plenoId: 'p1',
  itemNumber: n,
  department: 'Urbanismo',
  outcome,
})
const CON_VOTOS = [voto(1, 'aprobado'), voto(2, 'aprobado'), voto(3, 'rechazado')]

function monta(ruta, votos) {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: votos },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
  })
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/departamentos" element={<Departamentos />} />
        <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La celda «Aprobados» de la tarjeta de Urbanismo en el índice. */
async function celdaDeLaTarjeta() {
  await waitFor(() =>
    expect(document.querySelector('a[href="/departamentos/urbanismo"]')).not.toBeNull(),
  )
  const tarjeta = document.querySelector('a[href="/departamentos/urbanismo"]')
  return within(tarjeta).getByText(APROBADOS).parentElement
}

/** La celda «Aprobados» de la tira de la ficha: la primera del documento. */
async function celdaDeLaFicha() {
  await waitFor(() =>
    expect(screen.getAllByText(APROBADOS, { selector: 'div' }).length).toBeGreaterThan(0),
  )
  const [rotulo] = screen.getAllByText(APROBADOS, { selector: 'div' })
  return rotulo.parentElement
}

describe('/departamentos · «Aprobados» en la tarjeta de la concejalía', () => {
  it('sin votaciones transcritas, «—» y el motivo, y ningún 0', async () => {
    monta('/departamentos', [])
    const celda = await celdaDeLaTarjeta()
    expect(within(celda).getByText('—')).toBeInTheDocument()
    expect(within(celda).getByText(SIN_VOTO)).toBeInTheDocument()
    expect(within(celda).queryByText('0'), 'un cero que nadie ha medido').toBeNull()
  })

  it('EL CONTROL: con votaciones del área, la cifra y sin motivo', async () => {
    monta('/departamentos', CON_VOTOS)
    const celda = await celdaDeLaTarjeta()
    expect(await within(celda).findByText('2')).toBeInTheDocument()
    expect(within(celda).queryByText(SIN_VOTO)).toBeNull()
  })
})

describe('/departamentos/:slug · «Aprobados» en la tira de la ficha', () => {
  it('sin votaciones transcritas, «—» y el motivo, y ningún 0', async () => {
    monta('/departamentos/urbanismo', [])
    const celda = await celdaDeLaFicha()
    expect(within(celda).getByText('—')).toBeInTheDocument()
    expect(within(celda).getByText(SIN_VOTO)).toBeInTheDocument()
    expect(within(celda).queryByText('0'), 'un cero que nadie ha medido').toBeNull()
  })

  it('EL CONTROL: con votaciones del área, la cifra y sin motivo', async () => {
    monta('/departamentos/urbanismo', CON_VOTOS)
    const celda = await celdaDeLaFicha()
    expect(await within(celda).findByText('2')).toBeInTheDocument()
    expect(within(celda).queryByText(SIN_VOTO)).toBeNull()
  })
})
