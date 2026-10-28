import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // El recuento dice 6 y el listado trae 1: el listado está truncado, y entonces
  // no se puede saber qué quejas llegaron al registro ni a qué área van.
  it('con el listado truncado, ni filas por área ni cifras de respuesta', async () => {
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
      expect(document.querySelector('[data-quejas-por-area]')).not.toBeNull()
    })
    const p = document.querySelector('[data-quejas-por-area]')
    expect(p.textContent).toContain(CATALOGUE.es['quejas.reloj.exportIncompleto'])
    expect(p.querySelector('[data-area]')).toBeNull()
    expect(p.textContent).not.toMatch(/Teresa Pozuelo Martín|María Esther Gómez Laredo/)
    expect(screen.getAllByText(/Total quejas/i).length).toBeGreaterThan(0)
    expect(screen.getByText(CATALOGUE.es['dashboard.estados.titulo'])).toBeInTheDocument()
    // Y los dos contadores de respuesta, sin cifra: no se sabe qué se registró.
    const resueltas = screen.getByText('Resueltas').parentElement
    expect(resueltas.textContent).toContain('—')
    expect(resueltas.textContent).not.toMatch(/del total/)
  })

  it('dice que es la vista detallada y lleva a la lectura llana', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {},
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/officials.json': { officials: [] },
    })
    const volver = await screen.findByText(CATALOGUE.es['dashboard.volver'])
    expect(volver.closest('a').getAttribute('href')).toBe('/quejas')
    expect(screen.getByText(CATALOGUE.es['dashboard.intro'])).toBeInTheDocument()
  })
})

/**
 * Las quejas por área (auditoría de las dos lecturas, §19).
 *
 * Aquí había «Quejas por responsable político»: resueltas, pendientes y
 * silencios junto al nombre de cada concejal, una tabla de personas. Ahora las
 * filas son áreas, con la regla de /departamentos, y quien tiene el área a su
 * cargo se nombra una vez. Lo que aquella tabla aprendió sigue en pie: con la
 * única queja capturada y sin registrar, «abiertas 1 · silencios 0» junto a un
 * nombre era una deuda que el ayuntamiento no tiene y un aprobado que no se ha
 * ganado. Lo único que cambia entre los casos es si la queja está registrada.
 */
describe('Quejas por área: las respuestas del ayuntamiento se cuentan desde el registro', () => {
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
        portfolios: ['Urbanismo'],
        email: '',
        photoUrl: '',
      },
    ],
  }
  const queja = (over = {}) => ({
    service_request_id: 'Q-1',
    status: 'capturada',
    service_code: 'urbanismo',
    service_name: 'urbanismo',
    description: 'valla caída',
    requested_datetime: '2026-04-20T08:30:00Z',
    updated_datetime: '2026-04-20T08:30:00Z',
    lat: null,
    long: null,
    address_string: 'santa-rosa',
    apoyos: 0,
    concejalia_area: 'Urbanismo',
    concejal_slug: SLUG,
    registro_entry_number: null,
    registered_at: null,
    ...over,
  })
  const REGISTRADA = { registro_entry_number: 'RE-1', registered_at: '2026-04-21T09:00:00Z' }
  const quejas = (...items) => ({
    generatedAt: '2026-04-22T12:00:00Z',
    source: {},
    stats: {
      total: items.length,
      byState: Object.fromEntries(items.map((q) => [q.status, 1])),
      byNeighborhood: { 'santa-rosa': items.length },
      byCategory: { urbanismo: items.length },
      byConcejal: {},
    },
    items,
  })
  const fila = async () => {
    await waitFor(() => expect(document.querySelector('[data-area="urbanismo"]')).not.toBeNull())
    const f = document.querySelector('[data-area="urbanismo"]')
    return { f, cifras: [...f.querySelectorAll('[role="cell"]')].map((c) => c.textContent) }
  }

  it('sin ninguna queja registrada: el área y cuántas, pero no abiertas ni silencios', async () => {
    mountWith({ '/data/quejas.json': quejas(queja()), '/data/officials.json': OFICIALES })
    const { f, cifras } = await fila()
    expect(within(f).getByText('Urbanismo')).toBeInTheDocument()
    expect(within(f).getByText('Teresa Pozuelo Martín')).toBeInTheDocument()
    expect(cifras).toEqual(['1', '—', '—'])
    const p = document.querySelector('[data-quejas-por-area]')
    expect(p.textContent).toContain(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])
    expect(p.textContent).toContain(CATALOGUE.es['quejas.reloj.sinRegistro'])
    // Sin cifras, ni la leyenda de las columnas.
    expect(p.textContent).not.toContain(CATALOGUE.es['dashboard.areas.leyenda'])
    // Y el contador de resueltas tampoco es un «0 %» en verde.
    const resueltas = screen.getByText('Resueltas').parentElement
    expect(resueltas.textContent).toContain('—')
    expect(resueltas.textContent).toContain(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])
  })

  it('con la queja registrada, las cifras vuelven (control)', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja({ ...REGISTRADA, status: 'registrada' })),
      '/data/officials.json': OFICIALES,
    })
    const { cifras } = await fila()
    expect(cifras).toEqual(['1', '1', '0'])
    const p = document.querySelector('[data-quejas-por-area]')
    expect(p.textContent).toContain(CATALOGUE.es['dashboard.areas.leyenda'])
    expect(screen.getByText('Resueltas').parentElement.textContent).toMatch(
      /0%\s*·\s*sobre 1 registrada/,
    )
  })

  it('un silencio registrado se cuenta y se marca', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja({ ...REGISTRADA, status: 'silencio_negativo' })),
      '/data/officials.json': OFICIALES,
    })
    const { cifras } = await fila()
    expect(cifras).toEqual(['1', '1', '1'])
  })

  it('quien tiene el área se nombra una vez, aunque el área tenga varias quejas', async () => {
    mountWith({
      '/data/quejas.json': quejas(queja(), queja({ service_request_id: 'Q-2' })),
      '/data/officials.json': OFICIALES,
    })
    const { cifras } = await fila()
    expect(cifras[0]).toBe('2')
    const p = document.querySelector('[data-quejas-por-area]')
    expect(p.textContent.split('Teresa Pozuelo Martín').length - 1).toBe(1)
  })

  it('una queja que no cae en ningún área se cuenta aparte', async () => {
    mountWith({
      '/data/quejas.json': quejas(
        queja(),
        queja({ service_request_id: 'Q-2', service_code: 'otra', service_name: 'otra' }),
      ),
      '/data/officials.json': OFICIALES,
    })
    await fila()
    const p = document.querySelector('[data-quejas-por-area]')
    expect(p.textContent).toContain(CATALOGUE.es['dashboard.areas.sinArea.una'])
  })
})

/**
 * «Acción urgente»: el plazo, en el calendario de la sede.
 *
 * La lista pinta «Silencio» cuando da el plazo por vencido, así que su cuenta es
 * una afirmación pública. Contaba tandas de 24 horas desde la marca leída en hora
 * local: registrada a las 00:30 del 31 de enero en Madrid (`2026-01-30 23:30:00`,
 * como la escribe el bot), el plazo de tres meses acaba con el 30 de abril y son
 * 89 días; la lista decía 90, el 30 de abril quedaba «1d» y el 1 de mayo, ya
 * vencido, «0d».
 */
describe('Acción urgente: el plazo, en el calendario de la sede', () => {
  const antes = process.env.TZ
  afterEach(() => {
    vi.useRealTimers()
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })

  const pinta = () =>
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-30T04:00:00Z',
        source: {},
        stats: {
          total: 1,
          byState: { registrada: 1 },
          byNeighborhood: { 'santa-rosa': 1 },
          byCategory: { via_publica: 1 },
          byConcejal: {},
        },
        items: [
          {
            service_request_id: 'Q-1',
            status: 'registrada',
            service_code: 'via_publica',
            service_name: 'via_publica',
            description: 'bache',
            requested_datetime: '2026-01-10 08:30:00',
            updated_datetime: '2026-01-30 23:30:00',
            lat: null,
            long: null,
            address_string: 'santa-rosa',
            apoyos: 12,
            concejalia_area: 'Obra Pública',
            concejal_slug: null,
            registro_entry_number: 'RE-1',
            registered_at: '2026-01-30 23:30:00',
          },
        ],
      },
      '/data/officials.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: 'ribarroja.es',
        count: 0,
        composition: {},
        officials: [],
      },
    })

  const enMadridA = (instante) => {
    process.env.TZ = 'Europe/Madrid'
    expect(new Date(2026, 3, 30, 12).getTimezoneOffset(), 'no se aplicó Europe/Madrid').toBe(-120)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(instante))
  }

  it('el último día quedan 0d, sobre un plazo de 89 días', async () => {
    enMadridA('2026-04-30T21:59:00Z') // 23:59 del 30 de abril en Madrid
    pinta()
    expect(await screen.findByText(/plazo 89 días/)).toBeInTheDocument()
    expect(screen.getByText('0d')).toBeInTheDocument()
    expect(screen.queryByText('Silencio')).toBeNull()
  })

  it('a las 00:00 de Madrid del día siguiente, +1d y «Silencio»', async () => {
    enMadridA('2026-04-30T22:30:00Z') // 00:30 del 1 de mayo en Madrid
    pinta()
    expect(await screen.findByText('+1d')).toBeInTheDocument()
    expect(screen.getByText('Silencio')).toBeInTheDocument()
  })
})

/** Una sola queja registrada con esa marca (UTC sin la Z, como la escribe el bot). */
const unaRegistrada = (registeredAt) => ({
  '/data/quejas.json': {
    generatedAt: '2026-11-15T04:00:00Z',
    source: {},
    stats: {
      total: 1,
      byState: { registrada: 1 },
      byNeighborhood: { 'santa-rosa': 1 },
      byCategory: { via_publica: 1 },
      byConcejal: {},
    },
    items: [
      {
        service_request_id: 'Q-1',
        status: 'registrada',
        service_code: 'via_publica',
        service_name: 'via_publica',
        description: 'bache',
        requested_datetime: registeredAt,
        updated_datetime: registeredAt,
        lat: null,
        long: null,
        address_string: 'santa-rosa',
        apoyos: 12,
        concejalia_area: 'Obra Pública',
        concejal_slug: null,
        registro_entry_number: 'RE-1',
        registered_at: registeredAt,
      },
    ],
  },
  '/data/officials.json': {
    generatedAt: '2026-01-01T00:00:00Z',
    source: 'ribarroja.es',
    count: 0,
    composition: {},
    officials: [],
  },
})

/**
 * «Acción urgente»: el último día inhábil pasa al primer día hábil (art. 30.5).
 *
 * Registrada a las 12:00 del viernes 14-08-2026: tres meses acaban el sábado 14
 * de noviembre, y el plazo, el lunes 16. El domingo la lista decía «+1d» y
 * «Silencio» de un plazo abierto.
 */
describe('Acción urgente: el último día inhábil pasa al primer día hábil', () => {
  afterEach(() => vi.useRealTimers())

  it('el domingo queda un día, sobre un plazo de 94, y no hay «Silencio»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    mountWith(unaRegistrada('2026-08-14 10:00:00'))
    expect(await screen.findByText(/plazo 94 días/)).toBeInTheDocument()
    expect(screen.getByText('1d')).toBeInTheDocument()
    expect(screen.queryByText('Silencio')).toBeNull()
  })
})

/**
 * «Acción urgente» sin el calendario del año en que acaba el plazo.
 *
 * Un año sin calendario de inhábiles no es un año sin festivos: la lista no puede
 * decir «Silencio» ni «+Nd» de un plazo cuyo último día puede haberse prorrogado
 * (art. 30.5). Tampoco puede callarla —es justo la que quien modera tiene que
 * mirar—: sale, con el año que falta.
 */
describe('Acción urgente: sin el calendario del año, ni «Silencio» ni silencio', () => {
  afterEach(() => vi.useRealTimers())

  it('pasado el día nominal, sale con el año que falta y sin «Silencio»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2099-05-01T10:00:00Z'))
    // Tres meses acaban el 15-04-2099 o el primer hábil siguiente, y 2099 no
    // tiene calendario (nadie lo va a tener: la prueba no caduca).
    mountWith(unaRegistrada('2099-01-15 10:00:00'))
    expect(await screen.findByText(/sin calendario de días inhábiles de 2099/)).toBeInTheDocument()
    expect(screen.queryByText('Silencio')).toBeNull()
    expect(screen.queryByText(/^\+\d+d$/)).toBeNull()
  })
})
