/**
 * La salvedad de una concesión —«el importe es el valor estimado por todo su
 * plazo …, no un gasto anual»— la vigilaba SÓLO el e2e de la portada, y su
 * premisa era que la concesión del agua siguiera entre las cuatro últimas
 * adjudicaciones. El 13-09-2026 dejó de estarlo —entraron cuatro contratos de
 * septiembre— y la prueba se puso roja sin que el código cambiara: la frase
 * dejó de estar comprobada por una rotación de la ventana.
 *
 * Aquí la frase se fija contra un dato de laboratorio, así que sigue vigilada
 * cuando la lista viva no traiga ninguna concesión. El e2e comprueba la otra
 * mitad, la que sólo puede verse en la página: que la portada la pinta cuando
 * el snapshot sí trae una.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LiveContracts } from '../../src/variants/direction-d/blocks/FeedBlocks'
import { installFetchMock } from '../setup/mockFetch'
import { CONCESSION_CONTRACT_TYPES, contractTermYears } from '../../src/lib/contract-status'

/** Del enum, no escrito a mano: un tipo nuevo de concesión entra solo. */
const TIPO_CONCESION = CONCESSION_CONTRACT_TYPES[0]
/** Los días de la concesión del agua: 6.209 → diecisiete años. */
const DIAS_DIECISIETE_ANIOS = 6209

const fila = (over = {}) => ({
  id: 'c-1',
  title: 'Contrato de prueba del banco de pruebas',
  contractor: 'Empresa de prueba',
  permalink: 'https://example.org/c1',
  awardDate: '2026-08-06',
  status: 'awarded',
  finalAmountNoTaxes: 1000,
  contractType: 'services',
  duration: 365,
  ...over,
})

function monta(filas) {
  installFetchMock({
    '/data/tenders.json': {
      generatedAt: '2026-09-13T00:00:00.000Z',
      stats: { awardedContracts: filas.length, awardedTotalEuros: 1000 },
      contracts: filas,
      top: { recentAwarded: filas },
    },
  })
  return render(
    <MemoryRouter>
      <LiveContracts />
    </MemoryRouter>,
  )
}

describe('la salvedad de una concesión en «últimas adjudicaciones»', () => {
  it('dice que el importe cubre todo el plazo, con los años salidos del dato', async () => {
    monta([
      fila({
        contractType: TIPO_CONCESION,
        duration: DIAS_DIECISIETE_ANIOS,
        finalAmountNoTaxes: 55685178.79,
      }),
    ])
    const nota = await screen.findByText(/no un gasto anual/)
    // Los años se calculan, nunca se escriben: mismo convenio que el módulo.
    expect(nota.textContent).toContain(
      `${contractTermYears({ duration: DIAS_DIECISIETE_ANIOS })} años`,
    )
  })

  it('sin plazo utilizable lo dice igual, sin inventarse los años', async () => {
    monta([fila({ contractType: TIPO_CONCESION, duration: null })])
    const nota = await screen.findByText(/no un gasto anual/)
    expect(nota.textContent).not.toMatch(/años/)
  })

  it('un contrato que no es concesión no lleva salvedad (control)', async () => {
    monta([fila({ contractType: 'services' })])
    // La fila está pintada: lo que falta es la salvedad, no el bloque.
    await screen.findByText(/Contrato de prueba del banco de pruebas/)
    expect(screen.queryByText(/no un gasto anual/)).toBeNull()
  })
})
