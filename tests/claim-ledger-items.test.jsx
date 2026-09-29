import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'

// Con `items`, el registro no pide nada a pleno-claims: la página ya trae sus
// declaraciones (/plenos/:id, su fragmento). Se le sirve un corpus de todas
// formas —manifiesto y un fragmento ajeno— para que, si vuelve a pedirlo, la
// petición prospere y quede contada en `fetchFn`.
let fetchFn
beforeEach(() => {
  fetchFn = installFetchMock({
    '/data/pleno-claims/index.json': {
      plenos: [{ plenoId: 'otra', chunkPath: 'pleno-claims/otra.json' }],
      totals: { items: 1, byVerdict: { verificado: 1 } },
    },
    '/data/pleno-claims/otra.json': { items: [item('verificado', 'cita de otra sesión')] },
  })
})

/** Lo pedido a pleno-claims, tras dejar llegar el manifiesto y lo que venga detrás. */
async function pedidasDeDeclaraciones() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return fetchFn.mock.calls
    .map(([input]) => String(input))
    .filter((ruta) => ruta.includes('/data/pleno-claims/'))
}

const item = (verdict, verbatim, type = 'afirmacion_numerica') => ({
  visibility: verdict === 'sin-datos' ? 'toggle' : 'shown',
  claim: {
    id: verbatim,
    type,
    plenoId: 'p',
    plenoDate: '2026-04-20',
    verbatim,
    entities: {},
    speakerGroup: 'PP',
  },
  verification: { verdict, summary: 's', evidence: [], checkedAgainst: [] },
})

describe('ClaimLedger items prop', () => {
  it('renders passed items (gated + signal-first) without fetching its own', async () => {
    render(
      <MemoryRouter>
        <ClaimLedger
          // `parcial`, not `contradicho`: a machine-assigned contradicho is now
          // withheld from the public ledger until a curator promotes it, so it
          // would (correctly) be dropped by the gate here.
          items={[item('verificado', 'cifra verificada'), item('parcial', 'obra parcial')]}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/cifra verificada/)).toBeTruthy())
    expect(screen.getByText(/obra parcial/)).toBeTruthy()
    expect(await pedidasDeDeclaraciones()).toEqual([])
  })

  it('drops a hidden item even if passed in', async () => {
    render(
      <MemoryRouter>
        <ClaimLedger
          items={[
            {
              visibility: 'shown',
              claim: {
                id: 'h',
                type: 'acusacion_publica',
                accusationSubtype: 'opinativa',
                plenoId: 'p',
                plenoDate: '2026-04-20',
                verbatim: 'acusacion oculta',
                entities: {},
              },
              verification: {
                verdict: 'sin-datos',
                summary: 's',
                evidence: [],
                checkedAgainst: [],
              },
            },
            item('verificado', 'cifra visible'),
          ]}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/cifra visible/)).toBeTruthy())
    expect(screen.queryByText(/acusacion oculta/)).toBeNull()
  })
})
