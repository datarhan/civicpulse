import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Departamentos from '../../src/pages/Departamentos'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

/**
 * La tarjeta de cada concejalía pintaba en rojo las declaraciones en cuanto una
 * estaba contradicha. Son de cualquier grupo que habló de los temas del área, y
 * la tarjeta lleva el nombre de quien la dirige: el rojo se leía como suyo.
 */
it('las contradichas no tiñen de rojo la tarjeta de un área', async () => {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/pleno-claims/index.json': {
      plenos: [],
      totals: {
        items: 8,
        byVerdict: {},
        byTopicVerdict: { urbanismo: { contradicho: 3, 'sin-datos': 5 } },
      },
    },
  })
  render(
    <MemoryRouter>
      <Departamentos />
    </MemoryRouter>,
  )
  const rotulos = await screen.findAllByText(CATALOGUE.es['departamentos.card.declaraciones'])
  const cifras = rotulos.map((r) => r.nextElementSibling)
  // Mide algo: alguna tarjeta ha leído las tres contradichas.
  expect(cifras.map((c) => c.textContent)).toContain('3')
  for (const c of cifras) expect(c.style.color).not.toBe('var(--crit-ink)')
})
