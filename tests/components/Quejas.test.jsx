import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Quejas from '../../src/pages/Quejas'
import { installFetchMock } from '../setup/mockFetch'

function mountWith(data) {
  installFetchMock(data)
  return render(
    <MemoryRouter>
      <Quejas />
    </MemoryRouter>
  )
}

describe('/quejas — empty state', () => {
  it('renders the Telegram CTA + pipeline explanation when no quejas exist', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/sindic.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'Síndic de Greuges', portal: 'https://www.elsindic.com' },
        items: [],
      },
      '/data/ctbg.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { url: 'https://consejodetransparencia.es/x.xlsx', platform: 'CTBG', spec: 'XLSX oficial' },
        query: 'Riba-roja',
        stats: { totalEntries: 10551, matchedEntries: 0, years: [], bySentido: {} },
        matched: [],
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/El canal de quejas ciudadanas ya está abierto/i)).toBeInTheDocument()
    })
    expect(screen.getAllByText(/@munigraph_bot/)[0]).toBeInTheDocument()
    // Legal-contract section mentions LPACAP — may appear in multiple cards.
    expect(screen.getAllByText(/LPACAP/).length).toBeGreaterThan(0)
  })
})

describe('/quejas — populated state', () => {
  it('renders KPI tiles + feed rows when stats.total > 0', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
        stats: {
          total: 3,
          byState: { capturada: 2, resuelta: 1 },
          byNeighborhood: { 'santa-rosa': 2 },
          byCategory: { via_publica: 2, limpieza: 1 },
          byConcejal: {},
        },
        items: [
          {
            service_request_id: 'Q-ABC12301',
            status: 'capturada',
            service_code: 'via_publica',
            service_name: 'via_publica',
            description: 'Bache profundo en Av. Primera',
            requested_datetime: '2026-04-20T08:30:00Z',
            updated_datetime: '2026-04-20T08:30:00Z',
            lat: null,
            long: null,
            address_string: 'santa-rosa',
            apoyos: 3,
            concejalia_area: 'Obra Pública',
            concejal_slug: 'teresa-pozuelo-martin',
            registro_entry_number: null,
            registered_at: null,
          },
        ],
      },
      '/data/sindic.json': { generatedAt: '2026-04-20T00:00:00Z', source: { platform: 'S', portal: 'https://www.elsindic.com' }, items: [] },
      '/data/ctbg.json': { generatedAt: '2026-04-20T00:00:00Z', source: { url: 'x', platform: 'p', spec: 's' }, query: 'Riba-roja', stats: { totalEntries: 10, matchedEntries: 0, years: [], bySentido: {} }, matched: [] },
      '/data/geo.json': { boundary: { polygon: [] }, neighborhoods: [] },
    })

    await waitFor(() => {
      expect(screen.getByText('Q-ABC12301')).toBeInTheDocument()
    })
    expect(screen.getByText(/Bache profundo/i)).toBeInTheDocument()
    // KPI tiles: Total quejas = 3, Resueltas = 1
    expect(screen.getByText(/Total quejas/i)).toBeInTheDocument()
  })
})

describe('/quejas — CtbgCard factual zero message', () => {
  it('surfaces the honest "0 matches" state', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {},
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/sindic.json': { generatedAt: '2026-04-20T00:00:00Z', source: { platform: 'S', portal: 'https://www.elsindic.com' }, items: [] },
      '/data/ctbg.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: { url: 'x', platform: 'CTBG', spec: 'XLSX' },
        query: 'Riba-roja',
        stats: { totalEntries: 10551, matchedEntries: 0, years: [2024, 2025, 2026], bySentido: {} },
        matched: [],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/10\.551/)).toBeInTheDocument()
    })
    expect(screen.getByText(/sin resoluciones \(ámbito estatal\)/i)).toBeInTheDocument()
  })
})
