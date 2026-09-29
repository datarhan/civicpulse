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
 * 31 de mayo de 2026, tres meses vencen el lunes 31 de agosto —hábil— y son 92
 * días. Con el 90 escrito a mano, el día 91 la ficha daba el plazo por excedido.
 * (Era el 1 de enero de 2028, un bisiesto de 91 días; desde que un año sin
 * calendario de inhábiles no se cuenta, 2028 no tiene reloj que probar.)
 */
describe('/quejas/:id · el reloj legal', () => {
  afterEach(() => vi.useRealTimers())

  const registrada = (patch = {}) => ({
    ...BASE_QUEJAS,
    items: [
      {
        ...BASE_QUEJAS.items[0],
        registered_at: '2026-05-31T10:00:00Z',
        updated_datetime: '2026-05-31T10:00:00Z',
        ...patch,
      },
    ],
  })

  const pinta = (data) =>
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': data,
      '/data/quejas-responses.json': { generatedAt: '2026-05-31T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })

  it('publica el plazo en la unidad de la norma, no en días', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    pinta(registrada())
    await waitFor(() => {
      expect(screen.getByText(/Plazo LPACAP en curso/i)).toBeInTheDocument()
    })
    expect(screen.getByText('3 meses')).toBeInTheDocument()
    expect(screen.queryByText('90 días')).toBeNull()
  })

  it('cuenta los días que de verdad tiene ESE plazo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Día 91 de los 92 que dura el plazo registrado el 31-05-2026.
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
    pinta(registrada())
    await waitFor(() => {
      expect(screen.getByText(/Días restantes/i)).toBeInTheDocument()
    })
    // Con los 90 días escritos a mano aquí salía un día excedido: plazo agotado
    // antes de que lo esté.
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('transparencia resuelve en 1 mes, leído de la misma tabla', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    pinta(registrada({ service_code: 'transparencia' }))
    await waitFor(() => {
      expect(screen.getByText(/Plazo LPACAP en curso/i)).toBeInTheDocument()
    })
    expect(screen.getByText('1 mes')).toBeInTheDocument()
  })
})

/**
 * El contador, en el calendario de la sede y hasta el final del último día.
 *
 * La marca llega como la escribe el bot: UTC sin la Z. `2026-01-30 23:30:00` son
 * las 00:30 del 31 de enero en Madrid, y tres meses desde el 31 de enero vencen
 * el 30 de abril (art. 30.4). La ficha la lee un navegador de Madrid: contaba en
 * tandas de 24 horas desde la marca leída en hora local, y el 30 de abril decía
 * que quedaba un día y el 1 de mayo, con el plazo ya vencido, que quedaban cero.
 */
describe('/quejas/:id · el contador, en el calendario de la sede', () => {
  const antes = process.env.TZ
  afterEach(() => {
    vi.useRealTimers()
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })

  const pinta = () =>
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': {
        ...BASE_QUEJAS,
        items: [
          {
            ...BASE_QUEJAS.items[0],
            registered_at: '2026-01-30 23:30:00',
            updated_datetime: '2026-01-30 23:30:00',
          },
        ],
      },
      '/data/quejas-responses.json': { generatedAt: '2026-01-31T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })

  /** El número que acompaña a un rótulo del reloj (el rótulo y su cifra son hermanos). */
  const cifraDe = async (rotulo) => (await screen.findByText(rotulo)).nextElementSibling.textContent

  it('el último día quedan cero, no uno', async () => {
    process.env.TZ = 'Europe/Madrid'
    expect(new Date(2026, 3, 30, 12).getTimezoneOffset(), 'no se aplicó Europe/Madrid').toBe(-120)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-30T21:59:00Z')) // 23:59 del 30 de abril en Madrid
    pinta()
    expect(await cifraDe(/Días restantes/i)).toBe('0')
  })

  it('a las 00:00 de Madrid del día siguiente, un día excedido', async () => {
    process.env.TZ = 'Europe/Madrid'
    expect(new Date(2026, 3, 30, 12).getTimezoneOffset(), 'no se aplicó Europe/Madrid').toBe(-120)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-30T22:30:00Z')) // 00:30 del 1 de mayo en Madrid
    pinta()
    expect(await cifraDe(/Días excedidos/i)).toBe('1')
  })

  it('dice cuál es el último día del plazo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'))
    pinta()
    expect(await cifraDe(/Último día/i)).toMatch(/30 de abril de 2026/)
  })
})

/**
 * El último día inhábil pasa al primer día hábil (art. 30.5), y la ficha lo dice.
 *
 * Registrada a las 12:00 del viernes 14-08-2026: tres meses acaban el sábado 14
 * de noviembre, y el plazo, el lunes 16. El contador cuenta hasta el lunes, y la
 * ficha da el día prorrogado y por qué, para que se pueda comprobar.
 */
describe('/quejas/:id · el último día inhábil pasa al primer día hábil', () => {
  afterEach(() => vi.useRealTimers())

  it('el sábado nominal quedan dos días, hasta el lunes, y dice por qué', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-14T11:00:00Z')) // mediodía del sábado en Madrid
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': {
        ...BASE_QUEJAS,
        items: [
          {
            ...BASE_QUEJAS.items[0],
            registered_at: '2026-08-14 10:00:00',
            updated_datetime: '2026-08-14 10:00:00',
          },
        ],
      },
      '/data/quejas-responses.json': { generatedAt: '2026-08-14T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })
    const cifraDe = async (rotulo) =>
      (await screen.findByText(rotulo)).nextElementSibling.textContent
    expect(await cifraDe(/Último día/i)).toBe('16 de noviembre de 2026')
    expect(
      screen.getByText(/prorrogado: el 14 de noviembre de 2026 es inhábil/),
    ).toBeInTheDocument()
    expect(await cifraDe(/Días restantes/i)).toBe('2')
  })
})

/**
 * Sin el calendario del año en que acaba el plazo, el reloj no cuenta.
 *
 * El art. 30.5 prorroga al primer día hábil un último día inhábil, y un año sin
 * calendario de inhábiles no es un año sin festivos. La ficha no da entonces ni
 * días restantes ni días excedidos —un «excedido» es un silencio publicado al
 * lado de un cargo—: da el último día nominal «o el primer día hábil
 * siguiente», y dice qué año de calendario falta.
 */
describe('/quejas/:id · sin el calendario del año, el reloj no cuenta', () => {
  afterEach(() => vi.useRealTimers())

  const pinta = () =>
    mountAt('/quejas/q-abc12301', {
      '/data/quejas.json': {
        ...BASE_QUEJAS,
        items: [
          {
            ...BASE_QUEJAS.items[0],
            // 11:00 del 15-01-2099 en Madrid: tres meses acaban el 15-04-2099, y
            // 2099 no tiene calendario (nadie lo va a tener: la prueba no caduca).
            registered_at: '2099-01-15 10:00:00',
            updated_datetime: '2099-01-15 10:00:00',
          },
        ],
      },
      '/data/quejas-responses.json': { generatedAt: '2099-01-15T00:00:00Z', items: [] },
      '/data/officials.json': BASE_OFFICIALS,
    })

  it('pasado el día nominal no da el plazo por vencido, y dice qué año falta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2099-05-01T10:00:00Z'))
    pinta()
    expect(
      await screen.findByText(/Falta el calendario de días inhábiles de 2099/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/15 de abril de 2099 o el primer día hábil siguiente/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Días excedidos/i)).toBeNull()
    expect(screen.queryByText(/Días restantes/i)).toBeNull()
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
