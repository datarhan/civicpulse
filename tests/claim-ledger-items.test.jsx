import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'

// items prop is the source; the internal usePlenoClaims still runs, so serve it
// a clean empty manifest (200) so its fetch resolves without noise in the test.
beforeEach(() => {
  installFetchMock({
    '/data/pleno-claims/index.json': { plenos: [], totals: { items: 0, byVerdict: {} } },
  })
})

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
          items={[item('verificado', 'cifra verificada'), item('contradicho', 'obra contradicha')]}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/cifra verificada/)).toBeTruthy())
    expect(screen.getByText(/obra contradicha/)).toBeTruthy()
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
