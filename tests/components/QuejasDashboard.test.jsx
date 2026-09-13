import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

function mountWith(data) {
  installFetchMock(data)
  return render(
    <MemoryRouter>
      <QuejasDashboard />
    </MemoryRouter>,
  )
}

describe('/quejas/dashboard', () => {
  it('shows the empty state when total is 0', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {},
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/officials.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: 'ribarroja.es',
        count: 0,
        composition: {},
        officials: [],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/El canal está abierto, aún no hay quejas/i)).toBeInTheDocument()
    })
  })

  it('renders KPI tiles + SlaPanel when quejas exist', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {},
        stats: {
          total: 6,
          byState: { capturada: 2, registrada: 1, resuelta: 2, silencio_negativo: 1 },
          byNeighborhood: { 'santa-rosa': 4, 'el-molinet': 2 },
          byCategory: { via_publica: 3, transparencia: 2, limpieza: 1 },
          byConcejal: {
            'teresa-pozuelo-martin': { total: 3, resueltas: 2, silencios: 0, pendientes: 1 },
            'maria-esther-gomez-laredo': { total: 2, resueltas: 0, silencios: 1, pendientes: 1 },
          },
        },
        items: [
          {
            service_request_id: 'Q-1',
            status: 'capturada',
            service_code: 'via_publica',
            service_name: 'via_publica',
            description: 'bache',
            requested_datetime: '2026-04-20T08:30:00Z',
            updated_datetime: '2026-04-20T08:30:00Z',
            lat: null,
            long: null,
            address_string: 'santa-rosa',
            apoyos: 5,
            concejalia_area: 'Obra Pública',
            concejal_slug: 'teresa-pozuelo-martin',
            registro_entry_number: null,
            registered_at: null,
          },
        ],
      },
      '/data/officials.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: 'ribarroja.es',
        count: 2,
        composition: { PSOE: 2 },
        officials: [
          {
            slug: 'teresa-pozuelo-martin',
            name: 'Teresa Pozuelo Martín',
            role: 'concejal',
            party: 'PSOE',
            portfolios: ['Obra Pública'],
            email: '',
            photoUrl: '',
          },
          {
            slug: 'maria-esther-gomez-laredo',
            name: 'María Esther Gómez Laredo',
            role: 'concejal',
            party: 'PSOE',
            portfolios: ['Transparencia'],
            email: '',
            photoUrl: '',
          },
        ],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/Teresa Pozuelo Martín/)).toBeInTheDocument()
    })
    expect(screen.getByText(/María Esther Gómez Laredo/)).toBeInTheDocument()
    expect(screen.getAllByText(/Total quejas/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Ciclo de vida LPACAP/i)).toBeInTheDocument()
  })
})

/**
 * La fila de cada cargo en «Quejas por responsable político» contaba
 * ✓ resueltas · ⏳ pendientes · ⚠ silencios aunque ninguna queja hubiera llegado
 * al registro del ayuntamiento, que es desde donde corre el plazo legal. Con la
 * única queja publicada —capturada, sin registrar— la fila decía «⏳ 1 · ⚠ 0»
 * junto al nombre de una concejala: una deuda que el ayuntamiento no tiene y un
 * aprobado que no se ha ganado.
 *
 * Los tres casos comparten fila y oficial; lo único que cambia es si la queja
 * tiene fecha de registro. El primero es el defecto, los otros dos su control.
 */
describe('SlaPanel: las respuestas del ayuntamiento se cuentan desde el registro', () => {
  const SLUG = 'teresa-pozuelo-martin'
  const OFICIALES = {
    generatedAt: '2026-04-20T00:00:00Z',
    source: 'ribarroja.es',
    count: 1,
    composition: { PSOE: 1 },
    officials: [
      {
        slug: SLUG,
        name: 'Teresa Pozuelo Martín',
        role: 'concejal',
        party: 'PSOE',
        portfolios: ['Obra Pública'],
        email: '',
        photoUrl: '',
      },
    ],
  }
  const queja = (over = {}) => ({
    service_request_id: 'Q-1',
    status: 'capturada',
    service_code: 'via_publica',
    service_name: 'via_publica',
    description: 'bache',
    requested_datetime: '2026-04-20T08:30:00Z',
    updated_datetime: '2026-04-20T08:30:00Z',
    lat: null,
    long: null,
    address_string: 'santa-rosa',
    apoyos: 0,
    concejalia_area: 'Obra Pública',
    concejal_slug: SLUG,
    registro_entry_number: null,
    registered_at: null,
    ...over,
  })
  const REGISTRADA = { registro_entry_number: 'RE-1', registered_at: '2026-04-21T09:00:00Z' }
  const quejas = (q, fila) => ({
    generatedAt: '2026-04-22T12:00:00Z',
    source: {},
    stats: {
      total: 1,
      byState: { [q.status]: 1 },
      byNeighborhood: { 'santa-rosa': 1 },
      byCategory: { via_publica: 1 },
      byConcejal: { [SLUG]: fila },
    },
    items: [q],
  })
  const panel = () => screen.findByRole('region', { name: /Quejas por responsable político/i })

  it('sin ninguna queja registrada no hay cifras, sino el motivo', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja(), { total: 1, resueltas: 0, pendientes: 1, silencios: 0 }),
      '/data/officials.json': OFICIALES,
    })
    const p = await panel()
    expect(within(p).getByText('Teresa Pozuelo Martín')).toBeInTheDocument()
    expect(p.textContent).not.toMatch(/⚠\s*0/)
    expect(p.textContent).not.toMatch(/⏳\s*1/)
    expect(p.textContent).toContain(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])
    expect(p.textContent).toContain(CATALOGUE.es['quejas.reloj.sinRegistro'])
  })

  it('con la queja registrada, las cifras vuelven tal cual (control)', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja({ ...REGISTRADA, status: 'registrada' }), {
        total: 1,
        resueltas: 0,
        pendientes: 1,
        silencios: 0,
      }),
      '/data/officials.json': OFICIALES,
    })
    const p = await panel()
    expect(p.textContent).toMatch(/⏳\s*1/)
    expect(p.textContent).toMatch(/⚠\s*0/)
    expect(p.textContent).not.toContain(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])
  })

  it('un silencio registrado se cuenta y se marca', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja({ ...REGISTRADA, status: 'silencio_negativo' }), {
        total: 1,
        resueltas: 0,
        pendientes: 0,
        silencios: 1,
      }),
      '/data/officials.json': OFICIALES,
    })
    const p = await panel()
    expect(p.textContent).toMatch(/⚠\s*1/)
  })
})
