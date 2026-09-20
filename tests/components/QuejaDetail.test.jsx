import { afterEach, describe, expect, it, vi } from 'vitest'
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

/**
 * El reloj legal (#62).
 *
 * `plazoFor` repetía a mano los 30 y los 90 días de `profileFor`, y los contaba
 * en días cuando el art. 21.3 LPACAP fija el plazo en MESES («tres meses»; en
 * transparencia, «un mes»). El art. 30.4 manda contarlos de fecha a fecha, así
 * que tres meses duran 90 o 91 días según cuándo se registre la queja, y el
 * contador se desviaba por ahí.
 *
 * El escenario está elegido para que las dos cuentas NO coincidan: registrada el
 * 1 de enero de 2028, que es bisiesto, tres meses vencen el 1 de abril y son 91
 * días. Con el 90 escrito a mano, el día 90 la ficha decía que no quedaba
 * ninguno.
 */
describe('/quejas/:id · el reloj legal', () => {
  afterEach(() => vi.useRealTimers())

  const registrada = (patch = {}) => ({
    ...BASE_QUEJAS,
    items: [
      {
        ...BASE_QUEJAS.items[0],
        registered_at: '2028-01-01T10:00:00Z',
        updated_datetime: '2028-01-01T10:00:00Z',
        ...patch,
      },
    ],
  })

  const pinta = (data) =>
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': data,
      '/data/quejas-responses.json': { generatedAt: '2028-01-01T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })

  it('publica el plazo en la unidad de la norma, no en días', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2028-01-15T12:00:00Z'))
    pinta(registrada())
    await waitFor(() => {
      expect(screen.getByText(/Plazo LPACAP en curso/i)).toBeInTheDocument()
    })
    expect(screen.getByText('3 meses')).toBeInTheDocument()
    expect(screen.queryByText('90 días')).toBeNull()
  })

  it('cuenta los días que de verdad tiene ESE plazo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Día 90 de los 91 que dura el plazo registrado el 1-1-2028.
    vi.setSystemTime(new Date('2028-03-31T12:00:00Z'))
    pinta(registrada())
    await waitFor(() => {
      expect(screen.getByText(/Días restantes/i)).toBeInTheDocument()
    })
    // Con los 90 días escritos a mano aquí salía un 0: plazo agotado un día
    // antes de que lo esté.
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('transparencia resuelve en 1 mes, leído de la misma tabla', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2028-01-15T12:00:00Z'))
    pinta(registrada({ service_code: 'transparencia' }))
    await waitFor(() => {
      expect(screen.getByText(/Plazo LPACAP en curso/i)).toBeInTheDocument()
    })
    expect(screen.getByText('1 mes')).toBeInTheDocument()
  })
})

/**
 * El hito de los apoyos (#62).
 *
 * Decía «incluida en el lote semanal» a partir de `apoyos >= 10`, y el lote lo
 * forman las DIEZ verificadas más apoyadas de esa semana: llegar al umbral no
 * garantiza entrar. Y lo fechaba con `updated_datetime`, que es la última vez
 * que la fila cambió por cualquier motivo — en una queja ya registrada, la
 * fecha del registro puesta sobre el hito anterior.
 */
describe('/quejas/:id · el hito de los apoyos', () => {
  const con = (patch) => ({
    ...BASE_QUEJAS,
    items: [{ ...BASE_QUEJAS.items[0], ...patch }],
  })
  const pinta = (data) =>
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': data,
      '/data/quejas-responses.json': { generatedAt: '2026-04-20T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })

  it('no dice que esté dentro del lote, sólo que llegó al umbral', async () => {
    pinta(con({ apoyos: 12 }))
    await waitFor(() => {
      expect(screen.getByText(/Verificada por la comunidad/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/incluida en el lote/i)).toBeNull()
    expect(screen.getByText(/umbral del lote semanal/i)).toBeInTheDocument()
  })

  it('sólo se fecha cuando ése es su estado; si no, no se inventa la fecha', async () => {
    // La queja ya está registrada: `updated_datetime` habla del registro, no de
    // cuándo llegó a los apoyos.
    pinta(con({ apoyos: 12, status: 'registrada', updated_datetime: '2026-03-05T10:00:00Z' }))
    await waitFor(() => {
      expect(screen.getByText(/Verificada por la comunidad/i)).toBeInTheDocument()
    })
    const hito = screen.getByText(/umbral del lote semanal/i).closest('div')
      .parentElement.parentElement
    expect(hito.textContent).toMatch(/—/)
    expect(hito.textContent).not.toMatch(/marzo/)
  })
})
