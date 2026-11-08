/**
 * El chrome de /quejas, /quejas/dashboard y /laboratorio/prensa, en valencià.
 *
 * Segunda tanda del barrido de palabras (la primera es `barrido-valencia.test.jsx`):
 * las tres páginas no contractuales con más castellano escrito a mano en la página.
 * Con la interfaz en valencià seguían diciendo «Cómo funciona», «Total quejas»,
 * «Expedientes del Síndic sobre Riba-roja de Túria», «Tasa de verificación» o
 * «Filtrar por veredicto».
 *
 * Dos comprobaciones, las dos de la casa:
 *
 *   1. Cada clave nueva existe en los dos idiomas y se escribe distinto, salvo las que
 *      se escriben igual de verdad —un nombre propio, una palabra común a las dos
 *      lenguas—, que se declaran aquí con su porqué. La lista se vigila en los dos
 *      sentidos: una clave que deja de ser igual tiene que salir de ella.
 *   2. Cada página se pinta en los dos idiomas con datos de prueba: sale el rótulo del
 *      idioma activo y el castellano de antes NO sale. Los pares elegidos se escriben
 *      distinto en las dos lenguas —se comprueba antes—, porque uno que se escribiera
 *      igual dejaría la prueba pasando sin medir nada.
 *
 * La lectura pieza a pieza de las tres páginas enteras, con el detector de castellano,
 * está en `quejas-prensa-detector-valencia.test.jsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import Quejas from '../../src/pages/Quejas'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import LaboratorioPrensa from '../../src/pages/LaboratorioPrensa'
import { installFetchMock } from '../setup/mockFetch'

const ES = CATALOGUE.es
const CA = CATALOGUE.ca

/** Las familias de claves que esta tanda trajo al catálogo. */
const FAMILIAS = [
  'quejas.cargando',
  'quejas.error',
  'quejas.cifras.',
  'quejas.categorias.',
  'quejas.barrios.',
  'quejas.recientes.',
  'quejas.compartir',
  'quejas.plazo.',
  'quejas.empty.',
  'quejas.como.',
  'quejas.contrato.',
  'quejas.vigilan.',
  'quejas.sindic.',
  'quejas.consell.',
  'quejas.ctbg.',
  'quejas.sindicatura.',
  'quejas.bop.',
  'dashboard.cifras.',
  'dashboard.categorias.',
  'dashboard.barrios.',
  'dashboard.urgente.',
  'dashboard.error',
  'dashboard.vacio.',
  'laboratorio.prensa.',
]
const CLAVES = Object.keys(ES).filter((k) =>
  FAMILIAS.some((f) => (f.endsWith('.') ? k.startsWith(f) : k === f)),
)

/** Las que se escriben igual en las dos lenguas, y por qué. */
const IGUALES = {
  // Nombres propios y siglas.
  'quejas.sindicatura.vacio.enlace': 'el nombre de la institución',
  'quejas.sindicatura.pdf': '«PDF de la Sindicatura»: sigla y nombre propio',
  'quejas.ctbg.xlsx': '«XLSX oficial»: sigla y una palabra común',
  'quejas.bop.oficial': '«BOP oficial»: sigla y una palabra común',
  'quejas.consell.contra': '«Contra Riba-roja»',
  'laboratorio.prensa.trust.titulo': '«Indicador del Trust Project · …»',
  // Palabras que el valencià escribe igual.
  'laboratorio.prensa.estado.parcial': 'Parcial',
  'laboratorio.prensa.estado.contradicho': 'Discrepa',
  'laboratorio.prensa.medios.col.discrepa': 'Discrepa',
  'laboratorio.prensa.estado.promesa-repetida': 'Promesa repetida',
  'laboratorio.prensa.lagunas.promesa': 'Promesa',
  'laboratorio.prensa.oficial': 'OFICIAL',
  'laboratorio.prensa.trust.localCoverage': 'Cobertura local',
  'laboratorio.prensa.n.titular.uno': '«{n} titular»',
  'laboratorio.prensa.factcheck.ultima': '«Última consulta: {fecha}.»',
  'laboratorio.prensa.factcheck.sobre': '«{n} sobre Riba-roja de Túria»',
  'laboratorio.prensa.aviso.extraidas': '«{afirmaciones} de {articulos}»: sólo huecos y «de»',
}

describe('las claves nuevas existen en los dos idiomas y se escriben distinto', () => {
  it('mide algo: la tanda trae sus claves', () => {
    expect(CLAVES.length).toBeGreaterThan(250)
    for (const k of Object.keys(IGUALES)) expect(CLAVES, k).toContain(k)
  })

  it.each(CLAVES)('%s', (clave) => {
    expect(ES[clave], `${clave} falta en castellano`).toBeTruthy()
    expect(CA[clave], `${clave} falta en valencià`).toBeTruthy()
    if (clave in IGUALES) expect(CA[clave], `${clave} ya no se escribe igual`).toBe(ES[clave])
    else expect(CA[clave], `${clave} es el castellano copiado`).not.toBe(ES[clave])
  })
})

// ─── Las páginas ───────────────────────────────────────────────────────────────

const QUEJA = (id, cambios) => ({
  service_request_id: id,
  status: 'capturada',
  service_code: 'limpieza',
  service_name: 'limpieza',
  description: 'Contenedor desbordado desde el lunes',
  requested_datetime: '2026-03-02T08:30:00Z',
  updated_datetime: '2026-03-02T08:30:00Z',
  lat: null,
  long: null,
  address_string: 'santa-rosa',
  apoyos: 4,
  concejalia_area: 'Servicios Públicos',
  concejal_slug: null,
  registro_entry_number: null,
  registered_at: null,
  ...cambios,
})
const listado = (items) => ({
  generatedAt: '2026-11-08T07:00:00.000Z',
  source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
  stats: {
    total: items.length,
    byState: Object.fromEntries(items.map((q) => [q.status, 1])),
    byNeighborhood: { 'santa-rosa': items.length },
    byCategory: { limpieza: items.length },
    byConcejal: {},
  },
  items,
})
const QUEJAS = listado([
  QUEJA('Q-AAA11111', {}),
  QUEJA('Q-BBB22222', {
    status: 'registrada',
    registro_entry_number: '2026-RE-0847',
    registered_at: '2026-08-20T10:00:00.000Z',
  }),
])
const VACIO = { generatedAt: '2026-11-08T07:00:00.000Z' }
const INSTITUCIONES = {
  '/data/sindic.json': { ...VACIO, items: [] },
  '/data/sindic-expedientes.json': {
    ...VACIO,
    source: { buscador: 'https://www.elsindic.com/actuaciones/' },
    cobertura: { contraAyuntamientoDesde: 2016, contraAyuntamientoHasta: 2026 },
    contraAyuntamiento: [
      {
        expediente: '202600001',
        anio: 2026,
        materia: 'Urbanismo',
        asunto: 'Licencia de obra sin resolver',
        resoluciones: [],
      },
    ],
    vecinosOtrasAdministraciones: [],
    stats: { conResolucionPublicada: 0 },
  },
  '/data/sindicatura.json': { ...VACIO, dedicated: [], sectoral: [], stats: {} },
  '/data/consell-cv.json': {
    ...VACIO,
    source: { portal: 'https://conselltransparencia.gva.es' },
    stats: { totalEntries: 465, matchedEntries: 0, years: [2025, 2026], bySentido: {} },
    matched: [],
  },
  '/data/ctbg.json': {
    ...VACIO,
    source: { url: 'https://consejodetransparencia.es' },
    stats: { totalEntries: 11199, matchedEntries: 0, years: [2025], bySentido: {} },
    matched: [],
  },
  '/data/bop.json': {
    ...VACIO,
    source: { home: 'https://bop.dival.es/bop/' },
    stats: { total: 0, daysCovered: 30, daysRequested: 30 },
    anuncios: [],
  },
}
const MAPA = {
  '/data/geo.json': {
    neighborhoods: [
      { id: 'n-1', slug: 'santa-rosa', name: 'Santa Rosa', centroid: [39.55, -0.57] },
    ],
  },
  '/data/tender-geo.json': { ...VACIO, universe: {}, zones: [], places: [], assignments: [] },
}
const OFICIALES = {
  '/data/officials.json': { ...VACIO, source: 'ribarroja.es', count: 0, officials: [] },
}
const PRENSA = {
  '/data/press.json': {
    generatedAt: '2026-11-07T11:00:00.000Z',
    items: [
      {
        id: 'p-1',
        title: 'El Ayuntamiento adjudica la limpieza viaria',
        link: 'https://medio.test/p-1',
        source: 'La Veu del Túria',
        sourceHost: 'medio.test',
        date: '2026-11-05T08:00:00.000Z',
        fingerprint: 'f-1',
      },
    ],
  },
  '/data/press-trust.json': {
    ...VACIO,
    windowDays: 30,
    articles: [],
    outlets: [{ outlet: 'La Veu del Túria', outletHost: 'medio.test', articleCount: 1 }],
  },
  '/data/press-coverage-gaps.json': {
    ...VACIO,
    windowDays: 14,
    items: [],
    stats: { candidatesExamined: 3, titularesConsiderados: 4, tramitesExcluidos: 1 },
  },
}

function pagina(Pagina, idioma, datos) {
  invalidateSnapshots()
  localStorage.setItem('cp:lang', idioma)
  installFetchMock(datos)
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <Pagina />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('cp:lang')
  vi.useRealTimers()
})

/**
 * Cada página, con los pares que pinta: rótulos que se escriben distinto en las dos
 * lenguas y que ningún dato servido repite.
 */
const PAGINAS = [
  {
    nombre: '/quejas, con quejas',
    Pagina: Quejas,
    datos: { ...QUEJAS_DATOS(QUEJAS), ...INSTITUCIONES, ...MAPA },
    pares: [
      'quejas.cifras.total',
      'quejas.cifras.pendientes.sub',
      'quejas.categorias.titulo',
      'quejas.recientes.titulo',
      'quejas.sindic.eyebrow',
      'quejas.sindic.titulo',
      'quejas.sindic.sinFichas',
      'quejas.consell.titulo',
      'quejas.consell.sinReclamaciones',
      'quejas.ctbg.titulo',
      'quejas.ctbg.mencionan',
      'quejas.vigilan.registro',
      'quejas.sindicatura.titulo',
      'quejas.bop.eyebrow',
      'quejas.bop.vacio',
    ],
  },
  {
    nombre: '/quejas, sin quejas',
    Pagina: Quejas,
    datos: { ...QUEJAS_DATOS(listado([])), ...INSTITUCIONES },
    pares: [
      'quejas.empty.pill',
      'quejas.como.eyebrow',
      'quejas.como.titulo',
      'quejas.contrato.eyebrow',
      'quejas.contrato.titulo',
      'quejas.contrato.noPublicamos',
    ],
  },
  {
    nombre: '/quejas/dashboard',
    Pagina: QuejasDashboard,
    ahora: '2026-11-08T10:00:00Z',
    datos: { ...QUEJAS_DATOS(QUEJAS), ...OFICIALES, '/data/geo.json': MAPA['/data/geo.json'] },
    pares: [
      'quejas.cifras.total',
      'quejas.cifras.resueltas',
      'dashboard.cifras.pendientes.sub',
      'dashboard.categorias.eyebrow',
      'dashboard.categorias.titulo',
      'dashboard.barrios.titulo',
      'dashboard.urgente.eyebrow',
      'dashboard.urgente.titulo',
    ],
  },
  {
    nombre: '/laboratorio/prensa',
    Pagina: LaboratorioPrensa,
    ahora: '2026-11-08T10:00:00Z',
    datos: PRENSA,
    pares: [
      'laboratorio.prensa.eyebrow',
      'laboratorio.prensa.titulo',
      'laboratorio.prensa.kpi.monitorizados',
      'laboratorio.prensa.kpi.auditados',
      'laboratorio.prensa.kpi.verificacion',
      'laboratorio.prensa.filtro.veredicto',
      'laboratorio.prensa.filtro.todos',
      'laboratorio.prensa.medios.col.medio',
      'laboratorio.prensa.medios.col.articulos',
      'laboratorio.prensa.lagunas.titulo',
      'laboratorio.prensa.lagunas.otrasPalabras',
      'laboratorio.prensa.factcheck.eyebrow',
      'laboratorio.prensa.replica',
    ],
  },
]

/** El listado de quejas y sus respuestas: /quejas pide las dos. */
function QUEJAS_DATOS(quejas) {
  return { '/data/quejas.json': quejas }
}

/** El texto entero de la página, con lo que sólo se oye (`aria-label`) y las opciones. */
const leida = (container) =>
  [
    container.textContent,
    ...[...container.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')),
  ].join('\n')

for (const { nombre, Pagina, datos, pares, ahora } of PAGINAS) {
  describe(`${nombre} · el chrome en el idioma de la interfaz`, () => {
    it('control: cada par se escribe distinto, y el castellano no cabe en el valencià', () => {
      for (const clave of pares) {
        expect(CA[clave], clave).toBeTruthy()
        expect(CA[clave], clave).not.toBe(ES[clave])
        expect(CA[clave].includes(ES[clave]), `${clave}: el valencià contiene el castellano`).toBe(
          false,
        )
      }
    })

    for (const idioma of ['es', 'ca']) {
      it(`en ${idioma}, del catálogo${idioma === 'ca' ? ', y sin el castellano de antes' : ''}`, async () => {
        if (ahora) {
          vi.useFakeTimers({ toFake: ['Date'] })
          vi.setSystemTime(new Date(ahora))
        }
        const { container } = pagina(Pagina, idioma, datos)
        const tabla = CATALOGUE[idioma]
        await waitFor(() => expect(leida(container)).toContain(tabla[pares[0]]))
        await waitFor(() => {
          for (const clave of pares) expect(leida(container), clave).toContain(tabla[clave])
        })
        if (idioma === 'ca') {
          const texto = leida(container)
          for (const clave of pares)
            expect(texto, `${clave} sale en castellano`).not.toContain(ES[clave])
        }
      })
    }
  })
}
