import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import QuejaDetail from '../../src/pages/QuejaDetail'
import { installFetchMock } from '../setup/mockFetch'

function mountAt(path, data) {
  installFetchMock(data)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quejas/:id" element={<QuejaDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

const BASE_QUEJAS = {
  generatedAt: '2026-04-20T12:00:00Z',
  source: {},
  stats: { total: 1, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
  items: [
    {
      service_request_id: 'Q-ABC12301',
      status: 'registrada',
      service_code: 'via_publica',
      service_name: 'via_publica',
      description: 'Bache profundo sin reparar desde hace dos meses en Av. Primera',
      requested_datetime: '2026-03-01T08:30:00Z',
      updated_datetime: '2026-03-05T10:00:00Z',
      lat: null,
      long: null,
      address_string: 'santa-rosa',
      apoyos: 12,
      concejalia_area: 'Obra Pública',
      concejal_slug: 'teresa-pozuelo-martin',
      registro_entry_number: '2026-RE-0847',
      registered_at: '2026-03-05T10:00:00Z',
    },
  ],
}

const BASE_OFFICIALS = {
  generatedAt: '2026-04-20T00:00:00Z',
  source: 'ribarroja.es',
  count: 1,
  composition: { PSOE: 1 },
  officials: [
    {
      slug: 'teresa-pozuelo-martin',
      name: 'Teresa Pozuelo Martín',
      honorific: 'Sra.',
      role: 'concejal',
      party: 'PSOE',
      portfolios: ['Obra Pública'],
      email: 'tpozuelo@ribarroja.es',
      photoUrl: '',
    },
  ],
}

describe('/quejas/:id', () => {
  it('renders the header + verbatim detail + legal-clock + timeline when the queja exists', async () => {
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': BASE_QUEJAS,
      '/data/quejas-responses.json': { generatedAt: '2026-04-20T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })
    await waitFor(() => {
      expect(screen.getAllByText(/Q-ABC12301/).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Bache profundo sin reparar/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Teresa Pozuelo Martín/i)).toBeInTheDocument()
    expect(screen.getByText(/Plazo LPACAP en curso/i)).toBeInTheDocument()
    expect(screen.getByText('Línea temporal')).toBeInTheDocument()
  })

  it('renders the right-of-reply card verbatim when there is a matching response', async () => {
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': BASE_QUEJAS,
      '/data/quejas-responses.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        items: [
          {
            id: 'qr-a',
            queja_id: 'Q-ABC12301',
            role: 'Concejalía de Obra Pública',
            firmante: 'Teresa Pozuelo Martín',
            text: 'Reparación programada para la semana del 28 de abril. Expediente OBR-2026-0123.',
            source_url: 'https://www.ribarroja.es/obras/123',
            appliedAt: '2026-04-19T10:00:00Z',
          },
        ],
      },
      '/data/officials.json': BASE_OFFICIALS,
    })
    await waitFor(() => {
      expect(screen.getByText(/Respuesta del Ayuntamiento/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Reparación programada para la semana/i)).toBeInTheDocument()
    expect(screen.getByText(/Fuente primaria →/i)).toBeInTheDocument()
  })

  it('renders the anonymized photo figure when the queja has a published photo', async () => {
    const withPhoto = {
      ...BASE_QUEJAS,
      items: [{ ...BASE_QUEJAS.items[0], photo: '/data/quejas-photos/q-abc12301.jpg' }],
    }
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': withPhoto,
      '/data/quejas-responses.json': { generatedAt: '2026-04-20T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })
    const img = await screen.findByAltText(/anonimizada autom/i)
    expect(img).toHaveAttribute('src', '/data/quejas-photos/q-abc12301.jpg')
    // The caption must disclose the anonymization is automatic (editorial contract).
    expect(screen.getByText(/anonimizada autom/i)).toBeInTheDocument()
  })

  it('shows no queja photo when none has been published', async () => {
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': BASE_QUEJAS, // no `photo` field
      '/data/quejas-responses.json': { generatedAt: '2026-04-20T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })
    await waitFor(() => {
      expect(screen.getAllByText(/Q-ABC12301/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByAltText(/anonimizada autom/i)).toBeNull()
  })

  it('renders a "no encontrada" fallback when the id does not exist', async () => {
    mountAt('/quejas/q-does-not-exist', {
      '/data/quejas.json': BASE_QUEJAS,
      '/data/quejas-responses.json': { generatedAt: '2026-04-20T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })
    await waitFor(() => {
      expect(screen.getByText(/no aparece en el snapshot actual/i)).toBeInTheDocument()
    })
  })
})
