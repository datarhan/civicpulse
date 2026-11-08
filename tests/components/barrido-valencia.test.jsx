/**
 * Lo que el barrido de palabras saca de la página al catálogo, en valencià.
 *
 * La re-lectura de la auditoría de las dos lecturas (02-11-2026) encontró
 * castellano escrito a mano en el chrome de páginas que no son material legal:
 * con la interfaz en valencià, el lector seguía leyendo «Esta pieza tiene 9
 * correcciones» en cada reportaje, la entrada de /quejas entera («Canal público
 * de quejas… Dashboard analítico →»), «Presión vecinal · top 10» en el panel
 * del canal y «Biografía →» y «Atribución.» en la ficha de un cargo.
 *
 * Cada caso se pinta en los dos idiomas y se comprueba lo que de verdad
 * cambia: que sale el rótulo del idioma activo y que el castellano de antes NO
 * sale. Cada par se escribe distinto en las dos lenguas —se comprueba antes—,
 * porque uno que se escribiera igual dejaría la prueba pasando sin medir nada.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { fmtDateLong, rellena } from '../../src/lib/formatters'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { CorrectionNote, CorrectionNotice } from '../../src/components/reportajes/CorrectionNote'
import Quejas from '../../src/pages/Quejas'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import CargoDetalle from '../../src/pages/CargoDetalle'
import { installFetchMock } from '../setup/mockFetch'

const ES = CATALOGUE.es
const CA = CATALOGUE.ca

const NUEVAS = [
  'reportajes.correcciones.aviso.una',
  'reportajes.correcciones.aviso.varias',
  'reportajes.correcciones.aviso.verUna',
  'reportajes.correcciones.aviso.verVarias',
  'reportajes.correcciones.titulo',
  'reportajes.correcciones.entrada',
  'quejas.intro',
  'quejas.intro.panel',
  'dashboard.apoyos.eyebrow',
  'dashboard.apoyos.titulo',
  'cargos.detalle.biografia',
  'cargos.detalle.biografia.title',
  'cargos.detalle.atribucion',
]

afterEach(() => {
  cleanup()
  localStorage.removeItem('cp:lang')
})

function enIdioma(idioma, nodo) {
  invalidateSnapshots()
  localStorage.setItem('cp:lang', idioma)
  return render(<LocaleProvider>{nodo}</LocaleProvider>)
}

/** El texto de una plantilla sin sus huecos: lo que se pinta seguro, sea cual sea el dato. */
const fijo = (plantilla) =>
  plantilla
    .split(/\{\w+\}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)

describe('las claves nuevas existen y se escriben distinto en cada idioma', () => {
  for (const clave of NUEVAS) {
    it(clave, () => {
      expect(ES[clave], `${clave} falta en castellano`).toBeTruthy()
      expect(CA[clave], `${clave} falta en valencià`).toBeTruthy()
      expect(CA[clave]).not.toBe(ES[clave])
    })
  }
})

describe('el aviso y el registro de correcciones de un reportaje', () => {
  const DOS = [
    { fecha: '2026-08-13', texto: 'B.' },
    { fecha: '2026-08-02', texto: 'A.' },
  ]

  it('en valencià, con la fecha en valencià y sin el castellano de antes', () => {
    const { container } = enIdioma(
      'ca',
      <>
        <CorrectionNotice correcciones={DOS} />
        <CorrectionNote correcciones={DOS} />
      </>,
    )
    const texto = container.textContent
    expect(texto).toContain(
      rellena(CA['reportajes.correcciones.aviso.varias'], {
        n: 2,
        fecha: fmtDateLong('2026-08-13', 'ca'),
      }),
    )
    expect(texto).toContain(CA['reportajes.correcciones.aviso.verVarias'])
    expect(texto).toContain(CA['reportajes.correcciones.titulo'])
    expect(texto).toContain(
      rellena(CA['reportajes.correcciones.entrada'], { fecha: fmtDateLong('2026-08-02', 'ca') }),
    )
    expect(texto).not.toMatch(/Esta pieza tiene|Correcciones|Corrección ·/)
  })

  it('en castellano, una sola en singular', () => {
    const { container } = enIdioma(
      'es',
      <CorrectionNotice correcciones={[{ fecha: '2026-08-02', texto: 'A.' }]} />,
    )
    expect(container.textContent).toContain(
      rellena(ES['reportajes.correcciones.aviso.una'], { fecha: fmtDateLong('2026-08-02', 'es') }),
    )
    expect(container.textContent).toContain(ES['reportajes.correcciones.aviso.verUna'])
  })
})

const QUEJA = (id, status, apoyos) => ({
  service_request_id: id,
  status,
  service_code: 'limpieza',
  service_name: 'limpieza',
  description: 'Contenedor desbordado desde el lunes',
  requested_datetime: '2026-03-02T08:30:00Z',
  updated_datetime: '2026-03-02T08:30:00Z',
  lat: null,
  long: null,
  address_string: 'santa-rosa',
  apoyos,
  concejalia_area: 'Servicios Públicos',
  concejal_slug: null,
  registro_entry_number: null,
  registered_at: null,
})

const DATOS_QUEJAS = {
  '/data/quejas.json': {
    generatedAt: '2026-04-20T12:00:00Z',
    source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
    stats: {
      total: 2,
      byState: { capturada: 2 },
      byNeighborhood: { 'santa-rosa': 2 },
      byCategory: { limpieza: 2 },
      byConcejal: {},
    },
    items: [QUEJA('Q-AAA11111', 'capturada', 4), QUEJA('Q-BBB22222', 'capturada', 1)],
  },
}

function pagina(Pagina, idioma) {
  invalidateSnapshots()
  localStorage.setItem('cp:lang', idioma)
  installFetchMock(DATOS_QUEJAS)
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <Pagina />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

describe('/quejas · la entrada de la página', () => {
  for (const idioma of ['es', 'ca']) {
    it(`en ${idioma}, del catálogo`, async () => {
      const { container } = pagina(Quejas, idioma)
      const tabla = CATALOGUE[idioma]
      await waitFor(() => expect(container.textContent).toContain(fijo(tabla['quejas.intro'])[0]))
      for (const trozo of fijo(tabla['quejas.intro']))
        expect(container.textContent).toContain(trozo)
      expect(screen.getByRole('link', { name: tabla['quejas.intro.panel'] })).toBeTruthy()
    })
  }

  it('en valencià no queda la entrada castellana', async () => {
    const { container } = pagina(Quejas, 'ca')
    await waitFor(() => expect(container.textContent).toContain(fijo(CA['quejas.intro'])[0]))
    expect(container.textContent).not.toMatch(/Canal público de quejas|Dashboard analítico/)
  })
})

describe('/quejas/dashboard · las quejas con más apoyos', () => {
  it('en valencià, del catálogo', async () => {
    const { container } = pagina(QuejasDashboard, 'ca')
    await waitFor(() => expect(container.textContent).toContain(CA['dashboard.apoyos.titulo']))
    expect(container.textContent).toContain(CA['dashboard.apoyos.eyebrow'])
    expect(container.textContent).not.toMatch(/Presión vecinal|Quejas pendientes con más apoyos/)
  })
})

describe('/cargos/:slug · «Biografía» y «Atribución»', () => {
  const OFICIALES = {
    generatedAt: '2026-09-28T00:00:00Z',
    source: 'ribarroja.es',
    count: 1,
    composition: { PSOE: 1 },
    officials: [
      {
        slug: 'persona-de-prueba',
        name: 'Persona De Prueba',
        honorific: 'Sr.',
        role: 'concejal',
        party: 'PSOE',
        portfolios: [],
        email: null,
        photoUrl: '',
        partyLogoUrl: '',
        cvUrl: 'https://www.ribarroja.es/cv/persona-de-prueba.pdf',
      },
    ],
    formerOfficials: [],
  }

  function ficha(idioma) {
    invalidateSnapshots()
    localStorage.setItem('cp:lang', idioma)
    installFetchMock({ '/data/officials.json': OFICIALES })
    return render(
      <MemoryRouter initialEntries={['/cargos/persona-de-prueba']}>
        <LocaleProvider>
          <Routes>
            <Route path="/cargos/:slug" element={<CargoDetalle />} />
          </Routes>
        </LocaleProvider>
      </MemoryRouter>,
    )
  }

  it('en valencià, del catálogo y sin el castellano', async () => {
    const { container } = ficha('ca')
    await waitFor(() => expect(screen.getAllByText('Persona De Prueba').length).toBeGreaterThan(0))
    expect(container.textContent).toContain(CA['cargos.detalle.biografia'])
    expect(container.textContent).toContain(CA['cargos.detalle.atribucion'])
    expect(container.textContent).not.toMatch(/Biografía →|Atribución\./)
  })
})
