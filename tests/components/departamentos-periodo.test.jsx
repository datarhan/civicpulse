import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Departamentos from '../../src/pages/Departamentos'
import { installFetchMock } from '../setup/mockFetch'

/**
 * Cada tarjeta de /departamentos rotulaba su contratación con el periodo de TODA
 * la contratación atribuida, no con el de sus propios contratos: «Vivienda» decía
 * 2017–2026 con los suyos entre 2018 y 2025. El periodo junto a una cifra tiene que
 * ser el de las filas que esa cifra suma.
 */
it('cada tarjeta rotula el periodo de sus propios contratos', async () => {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/tenders.json': {
      contracts: [
        {
          id: 'u1',
          categoryTitle: 'architecture',
          assignee: 'A SL',
          finalAmount: 10,
          awardDate: '2018-03-01',
        },
        {
          id: 'u2',
          categoryTitle: 'architecture',
          assignee: 'A SL',
          finalAmount: 20,
          awardDate: '2025-06-01',
        },
        {
          id: 'v1',
          categoryTitle: 'real_estate',
          assignee: 'B SA',
          finalAmount: 40,
          awardDate: '2017-01-16',
        },
      ],
    },
  })
  render(
    <MemoryRouter>
      <Departamentos />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Contratación 2018–2025')).toBeInTheDocument()
  expect(screen.getByText('Contratación 2017')).toBeInTheDocument()
  // Y ninguna lleva el periodo de todas juntas, que era el defecto.
  expect(screen.queryAllByText('Contratación 2017–2025')).toHaveLength(0)
})
