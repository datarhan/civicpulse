/**
 * El día de cada queja es el de Riba-roja, lo lea quien lo lea.
 *
 * El bot guarda sus marcas con `datetime('now')` de SQLite —la hora UTC escrita
 * «2026-12-31 23:30:00», SIN zona— y así las exportaba a quejas.json. Medido el
 * 28-09-2026 en Chrome 152 con el reloj en Madrid: `new Date('2026-09-20
 * 22:30:00')` sale 20:30Z, dos horas antes, y la ficha fechaba el 20 de
 * septiembre una queja que en Riba-roja se envió a la 00:30 del 21; la misma
 * queja escrita con Z salía el 21. Y la Z sola no basta: el formateador pinta el
 * día del reloj de quien lee, así que en UTC —la CI— o en Nueva York seguía
 * siendo el 20. `slice(0, 10)` da el día UTC con Z o sin ella: /cambios dejaba la
 * queja fuera de la semana, la ficha de la concejalía la listaba el 20 y /quejas
 * decía que el canal recoge quejas «desde 2025–2026» por una de Nochevieja.
 *
 * Cada bloque corre con el proceso en otra zona —vale en el pool `forks`, no en
 * `threads`— y afirma antes el desfase que midió: en el portátil del curador, en
 * Madrid, un bloque «en UTC» que no se aplicara probaría Madrid otra vez y
 * pasaría solo.
 *
 * Lo que NO está aquí: los días que le quedan al plazo (`daysSince` en la ficha,
 * el panel de escalado). Se cuentan en el calendario de la sede, y eso es otro
 * arreglo.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import QuejaDetail from '../../src/pages/QuejaDetail'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import QuejasSpendOverlap from '../../src/components/Quejas/QuejasSpendOverlap'
import { useCambios } from '../../src/hooks/useCambios'
import { CATALOGUE } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

/** Zona → su desfase el 2 de julio de 2026 a mediodía, en minutos (el de `getTimezoneOffset`). */
const ZONAS = [
  ['UTC', 0],
  ['Europe/Madrid', -120],
  ['America/New_York', 240],
]

/** Pone el proceso en `zona` para el bloque que lo llama, y lo deja como estaba. */
function enZona(zona, desfaseEnJulio) {
  let antes
  beforeAll(() => {
    antes = process.env.TZ
    process.env.TZ = zona
    expect(new Date(2026, 6, 2, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(
      desfaseEnJulio,
    )
  })
  afterAll(() => {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })
}

// El 31-12-2026 a las 23:30 UTC ya es la 00:30 del 1 de enero de 2027 en
// Riba-roja: cambian el día, el mes y el año. Y el 4 de enero a las 23:10 UTC,
// la 00:10 del 5.
const SIN_ZONA = {
  requested_datetime: '2026-12-31 23:30:00',
  updated_datetime: '2027-01-04 23:10:00',
  registered_at: '2027-01-04 23:10:00',
}
const CON_Z = {
  requested_datetime: '2026-12-31T23:30:00Z',
  updated_datetime: '2027-01-04T23:10:00Z',
  registered_at: '2027-01-04T23:10:00Z',
}
/** La instantánea publicada hasta hoy trae la primera forma; el bot exporta ya la segunda. */
const FORMAS = [
  ['sin zona, como las escribe SQLite', SIN_ZONA],
  ['con Z, como las exporta el bot', CON_Z],
]

const queja = (marcas) => ({
  service_request_id: 'Q-01KNOCHEVIEJA',
  status: 'registrada',
  service_code: 'urbanismo',
  service_name: 'urbanismo',
  description: 'Farola apagada en la plaza desde Nochevieja',
  lat: null,
  long: null,
  address_string: 'santa-rosa',
  apoyos: 0,
  concejalia_area: 'Urbanismo',
  concejal_slug: null,
  registro_entry_number: '2027-RE-0001',
  ...marcas,
})

/** La instantánea publicada: `stats.total` tiene que cuadrar con `items`. */
const instantanea = (items) => ({
  generatedAt: '2027-01-08T12:00:00Z',
  source: {},
  stats: { total: items.length, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
  items,
})

// `appliedAt` lo escribe `npm run queja-reply` con toISOString(): siempre con Z.
// El 5 de enero a las 23:45 UTC es la 00:45 del 6 en Riba-roja.
const RESPUESTA = {
  id: 'qr-nochevieja',
  queja_id: 'Q-01KNOCHEVIEJA',
  role: 'Concejalía de Urbanismo',
  firmante: 'Firma de prueba',
  text: 'Reparada la farola.',
  source_url: null,
  appliedAt: '2027-01-05T23:45:00Z',
}

async function montaFicha(q, respuestas = []) {
  installFetchMock({
    '/data/quejas.json': instantanea([q]),
    '/data/quejas-responses.json': { generatedAt: '2027-01-08T12:00:00Z', items: respuestas },
    '/data/officials.json': { officials: [] },
  })
  render(
    <MemoryRouter initialEntries={[`/quejas/${q.service_request_id.toLowerCase()}`]}>
      <Routes>
        <Route path="/quejas/:id" element={<QuejaDetail />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText(CATALOGUE.es['quejas.detalle.hito.capturada'])
}

/** La fecha de un hito de la línea temporal: la primera columna de su fila. */
function fechaDelHito(clave) {
  const rotulo = screen.getByText(CATALOGUE.es[clave])
  return rotulo.parentElement.parentElement.firstElementChild.textContent
}

/** La fecha de registro que enseña la tarjeta del plazo, debajo de su rótulo. */
function fechaDelReloj() {
  return screen.getByText(CATALOGUE.es['quejas.detalle.reloj.registrada']).nextElementSibling
    .textContent
}

describe.each(ZONAS)('leído con el reloj en %s', (zona, desfaseEnJulio) => {
  enZona(zona, desfaseEnJulio)

  describe.each(FORMAS)('marcas %s', (_, marcas) => {
    it('/quejas/:id: la línea temporal y el reloj del plazo fechan el día de Riba-roja', async () => {
      await montaFicha(queja(marcas))
      expect(fechaDelHito('quejas.detalle.hito.capturada')).toBe('1 de enero de 2027')
      expect(fechaDelHito('quejas.detalle.hito.registrada')).toBe('5 de enero de 2027')
      expect(fechaDelReloj()).toBe('5 de enero de 2027')
    })

    it('/departamentos/:slug: la lista de quejas fecha el día de Riba-roja', async () => {
      const q = queja(marcas)
      installFetchMock({
        '/data/officials.json': { officials: [] },
        '/data/promises.json': { items: [] },
        '/data/plenos-agendas.json': { plenos: [] },
        '/data/pleno-votes.json': { items: [] },
        '/data/quejas.json': instantanea([q]),
      })
      render(
        <MemoryRouter initialEntries={['/departamentos/urbanismo']}>
          <Routes>
            <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
          </Routes>
        </MemoryRouter>,
      )
      const descripcion = await screen.findByText(q.description)
      expect(descripcion.nextElementSibling.textContent).toBe('2027-01-01')
    })

    it('/cambios: entra en la semana que empieza el día de Riba-roja, con ese día', async () => {
      // El 8 de enero a mediodía, una ventana de 7 días corta en el 2027-01-01.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2027-01-08T12:00:00Z'))
      try {
        installFetchMock({ '/data/quejas.json': instantanea([queja(marcas)]) })
        const { result } = renderHook(() => useCambios(7))
        await waitFor(() => expect(result.current.loading).toBe(false))
        const fechas = result.current.changes.filter((c) => c.kind === 'queja').map((c) => c.date)
        expect(fechas).toEqual(['2027-01-01'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('/quejas: el periodo de las quejas es el año de Riba-roja', async () => {
      installFetchMock({
        '/data/geo.json': {
          neighborhoods: [{ slug: 'santa-rosa', name: 'Santa Rosa', centroid: [39.54, -0.57] }],
        },
        '/data/quejas.json': instantanea([queja(marcas)]),
      })
      render(
        <MemoryRouter>
          <QuejasSpendOverlap />
        </MemoryRouter>,
      )
      const barrio = await screen.findByText(CATALOGUE.es['quejas.cruce.col.barrio'])
      // La cabecera de la columna lleva el periodo que cuenta: «Quejas 2027».
      expect(barrio.nextElementSibling.textContent).toBe(
        `${CATALOGUE.es['quejas.cruce.col.quejas']} 2027`,
      )
    })
  })

  it('/quejas/:id: la respuesta del ayuntamiento lleva la fecha y la hora de Riba-roja', async () => {
    await montaFicha(queja(SIN_ZONA), [RESPUESTA])
    const linea = (await screen.findByText(/Firma de prueba/)).textContent
    expect(linea).toMatch(/\b6 ene\.? 2027\b/)
    expect(linea).toContain('00:45')
  })
})
