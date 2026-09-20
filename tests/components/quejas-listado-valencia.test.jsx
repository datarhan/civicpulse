/**
 * La categoría y el estado de una queja, en el idioma de la interfaz (#62).
 *
 * `CATEGORY_LABEL` y `STATE_LABEL` son, desde #59, el CASTELLANO del catálogo:
 * existen para que las páginas que todavía no han pasado por él no puedan
 * discrepar de las que sí. /quejas y /quejas/dashboard las leían tal cual, así
 * que con la interfaz en valencià seguían pintando «Vía pública» y «Registrada
 * en sede» — y las claves `quejas.categoria.*` y `quejas.estado.*` ya estaban
 * traducidas desde entonces, esperando a que alguien las leyera.
 *
 * Esta guarda no pide que las dos páginas estén traducidas enteras: su chrome
 * («Por categoría», «Snapshot:») sigue en castellano y es un trabajo aparte, el
 * que queda de #38. Pide lo que la incidencia midió: que el enum del bot se
 * pinte con el rótulo del idioma activo, y que la marca castellana NO aparezca
 * cuando la interfaz es valenciana.
 *
 * Se comprueba con el rótulo que de verdad cambia entre lenguas: «Vía pública»
 * y «Via pública» sólo se distinguen en la tilde, así que el escenario usa
 * también «Limpieza»/«Neteja» y «Registrada en sede»/«Registrada en seu», que
 * no se parecen. Un par que se escribiera igual en los dos idiomas dejaría la
 * prueba pasando sin comprobar nada.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import Quejas from '../../src/pages/Quejas'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import { installFetchMock } from '../setup/mockFetch'

const QUEJAS = {
  generatedAt: '2026-04-20T12:00:00Z',
  source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
  stats: {
    total: 2,
    byState: { registrada: 1, capturada: 1 },
    byNeighborhood: { 'santa-rosa': 2 },
    byCategory: { via_publica: 1, limpieza: 1 },
    byConcejal: {},
  },
  items: [
    {
      service_request_id: 'Q-AAA11111',
      status: 'registrada',
      service_code: 'via_publica',
      service_name: 'via_publica',
      description: 'Bache profundo sin reparar en Av. Primera',
      requested_datetime: '2026-03-01T08:30:00Z',
      updated_datetime: '2026-03-05T10:00:00Z',
      lat: null,
      long: null,
      address_string: 'santa-rosa',
      apoyos: 3,
      concejalia_area: 'Obra Pública',
      concejal_slug: 'teresa-pozuelo-martin',
      registro_entry_number: '2026-RE-0847',
      registered_at: '2026-03-05T10:00:00Z',
    },
    {
      service_request_id: 'Q-BBB22222',
      status: 'capturada',
      service_code: 'limpieza',
      service_name: 'limpieza',
      description: 'Contenedor desbordado desde el lunes',
      requested_datetime: '2026-03-02T08:30:00Z',
      updated_datetime: '2026-03-02T08:30:00Z',
      lat: null,
      long: null,
      address_string: 'santa-rosa',
      apoyos: 1,
      concejalia_area: 'Servicios Públicos',
      concejal_slug: 'teresa-pozuelo-martin',
      registro_entry_number: null,
      registered_at: null,
    },
  ],
}

const VACIO = (extra) => ({ generatedAt: '2026-04-20T12:00:00Z', ...extra })

const DATOS = {
  '/data/quejas.json': QUEJAS,
  '/data/sindic.json': {
    ...VACIO({ source: { platform: 'Síndic de Greuges', portal: 'https://www.elsindic.com' } }),
    items: [],
  },
  '/data/ctbg.json': {
    ...VACIO({ source: { url: 'https://x', platform: 'CTBG', spec: 'XLSX oficial' } }),
    query: 'Riba-roja',
    stats: { totalEntries: 0, matchedEntries: 0, years: [], bySentido: {} },
    matched: [],
  },
  '/data/officials.json': {
    ...VACIO({ source: 'ribarroja.es' }),
    count: 1,
    composition: { PSOE: 1 },
    officials: [
      {
        slug: 'teresa-pozuelo-martin',
        name: 'Teresa Pozuelo Martín',
        role: 'concejal',
        party: 'PSOE',
        portfolios: ['Obra Pública'],
        email: 'tpozuelo@ribarroja.es',
        photoUrl: '',
      },
    ],
  },
}

function pinta(Pagina, idioma) {
  invalidateSnapshots()
  localStorage.setItem('cp:lang', idioma)
  installFetchMock(DATOS)
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <Pagina />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

/** Los cuatro rótulos del escenario, en cada idioma. */
const ROTULO = (idioma, clave) => CATALOGUE[idioma][clave]

afterEach(() => {
  cleanup()
  localStorage.removeItem('cp:lang')
})

for (const [nombre, Pagina] of [
  ['/quejas', Quejas],
  ['/quejas/dashboard', QuejasDashboard],
]) {
  describe(`${nombre} · la categoría y el estado hablan el idioma de la interfaz`, () => {
    it('en castellano escribe lo que escribía', async () => {
      pinta(Pagina, 'es')
      await waitFor(() => {
        expect(
          screen.getAllByText(ROTULO('es', 'quejas.categoria.limpieza')).length,
        ).toBeGreaterThan(0)
      })
      expect(screen.getAllByText(ROTULO('es', 'quejas.estado.registrada')).length).toBeGreaterThan(
        0,
      )
    })

    it('en valencià no se queda el castellano', async () => {
      // El control de la prueba: estos dos pares se escriben distinto en cada
      // idioma, así que leerlos dice de verdad cuál se pintó.
      expect(ROTULO('ca', 'quejas.categoria.limpieza')).not.toBe(
        ROTULO('es', 'quejas.categoria.limpieza'),
      )
      expect(ROTULO('ca', 'quejas.estado.registrada')).not.toBe(
        ROTULO('es', 'quejas.estado.registrada'),
      )

      pinta(Pagina, 'ca')
      await waitFor(() => {
        expect(
          screen.getAllByText(ROTULO('ca', 'quejas.categoria.limpieza')).length,
        ).toBeGreaterThan(0)
      })
      expect(screen.getAllByText(ROTULO('ca', 'quejas.estado.registrada')).length).toBeGreaterThan(
        0,
      )
      expect(screen.queryByText(ROTULO('es', 'quejas.categoria.limpieza'))).toBeNull()
      expect(screen.queryByText(ROTULO('es', 'quejas.estado.registrada'))).toBeNull()
    })
  })
}
