import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from '../setup/mockFetch'
import Declaraciones from '../../src/pages/Declaraciones'
import { ClaimLedger } from '../../src/components/ClaimLedger'
import { marcaDeFirma } from '../../src/lib/atribucion-firmada'

/**
 * Un grupo que firmó una persona se lee distinto de uno que puso el mapa de
 * voces, y la página lo dice: «firmado» junto al grupo, con el tramo escuchado
 * en el título, en los dos sitios que pintan declaraciones —/declaraciones y
 * el registro de /plenos/:id—. Una regla, un ayudante, dos pintores.
 *
 * Los segundos van como los teclea quien coteja en el reproductor del pleno:
 * 4016 s son 1:06:56 y 4095 s, 1:08:15.
 */

const firmada = (id, verdict = 'verificado') => ({
  visibility: verdict === 'sin-datos' ? 'toggle' : 'shown',
  claim: {
    id,
    plenoId: 'p1',
    plenoDate: '2025-12-01',
    segmentIndex: 39,
    type: 'cita_obra',
    speakerGroup: 'PSOE',
    atribucionFirmada: { desde: 4016, hasta: 4095 },
    verbatim: `Literal firmado de prueba ${id} sobre los dos conservatorios del municipio.`,
    context: 'Contexto.',
    topic: 'educacion',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
  },
  verification: { claimId: id, verdict, summary: 's', evidence: [], checkedAgainst: [] },
})

const sinFirma = (id, verdict = 'verificado') => {
  const it = firmada(id, verdict)
  const { atribucionFirmada: _fuera, ...claim } = it.claim
  return {
    ...it,
    claim: { ...claim, verbatim: `Literal sin firma de prueba ${id} sobre la piscina.` },
  }
}

describe('marcaDeFirma', () => {
  it('sin marca de firma, no hay nada que pintar', () => {
    expect(marcaDeFirma({ speakerGroup: 'PSOE' })).toBeNull()
    expect(marcaDeFirma({ speakerGroup: null })).toBeNull()
  })

  it('con marca, «firmado» y el tramo escuchado como en el reproductor', () => {
    const m = marcaDeFirma({
      speakerGroup: 'PSOE',
      atribucionFirmada: { desde: 4016, hasta: 4095 },
    })
    expect(m.texto).toBe('firmado')
    expect(m.titulo).toContain('1:06:56')
    expect(m.titulo).toContain('1:08:15')
    expect(m.titulo).toMatch(/persona/)
  })
})

describe('/declaraciones', () => {
  it('la fila firmada dice «firmado» con el tramo en el título; la otra, no', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'p1', plenoDate: '2025-12-01', chunkPath: 'pleno-claims/p1.json' }],
        totals: { items: 2, byVerdict: { verificado: 2 } },
      },
      '/data/pleno-claims/p1.json': {
        items: [firmada('p1-039-cit-aaaaaa'), sinFirma('p1-050-cit-bbbbbb')],
      },
      '/data/plenos.json': { items: [] },
      '/data/officials.json': {
        composition: { PSOE: 11, PP: 7, VOX: 1, 'EU-Podem': 1, Compromís: 1 },
        officials: [],
      },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    // El filtro arranca en «con evidencia»: se pasa a todas.
    fireEvent.click(await screen.findByRole('button', { name: /^Todas/ }))
    await screen.findByText(/Literal sin firma de prueba/)
    const marcas = screen.getAllByText('firmado')
    expect(marcas).toHaveLength(1)
    expect(marcas[0].getAttribute('title')).toContain('1:06:56')
    expect(marcas[0].getAttribute('title')).toContain('1:08:15')
  })
})

describe('el registro de /plenos/:id (ClaimLedger)', () => {
  it('la declaración firmada dice «firmado» con el tramo en el título; la otra, no', async () => {
    installFetchMock({})
    render(
      <MemoryRouter>
        <ClaimLedger items={[firmada('p1-039-cit-aaaaaa'), sinFirma('p1-050-cit-bbbbbb')]} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/Literal sin firma de prueba/)).toBeTruthy())
    const marcas = screen.getAllByText('firmado')
    expect(marcas).toHaveLength(1)
    expect(marcas[0].getAttribute('title')).toContain('1:06:56')
  })
})
