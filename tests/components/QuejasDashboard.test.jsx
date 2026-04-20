import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import { installFetchMock } from '../setup/mockFetch'

function mountWith(data) {
  installFetchMock(data)
  return render(
    <MemoryRouter>
      <QuejasDashboard />
    </MemoryRouter>
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
          { slug: 'teresa-pozuelo-martin', name: 'Teresa Pozuelo Martín', role: 'concejal', party: 'PSOE', portfolios: ['Obra Pública'], email: '', photoUrl: '' },
          { slug: 'maria-esther-gomez-laredo', name: 'María Esther Gómez Laredo', role: 'concejal', party: 'PSOE', portfolios: ['Transparencia'], email: '', photoUrl: '' },
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
