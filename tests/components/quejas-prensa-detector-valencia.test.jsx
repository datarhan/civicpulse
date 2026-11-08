/**
 * /quejas, /quejas/dashboard y /laboratorio/prensa en valencià: nada se lee igual
 * que en castellano.
 *
 * Las tres páginas pintaban buena parte de su chrome en castellano escrito a mano
 * —la tarjeta «Cómo funciona», los contadores, el Síndic, la Sindicatura, el
 * Consell, el CTBG, los KPI y los filtros del laboratorio— y la prosa que el
 * laboratorio calcula (`src/lib/press-lab.js`) también. Esta guarda es la de la
 * ficha de una queja (`queja-detalle-valencia.test.jsx`): pinta cada escenario en
 * castellano y en valencià, espera dos lecturas iguales y compara pieza a pieza. Lo
 * que sale de un fichero servido es dato —el asunto de un expediente, el título de
 * un informe, el titular de un medio— y se queda en su idioma; lo demás tiene que
 * leerse distinto.
 *
 * Las quejas se escriben en la prueba, como en la ficha: la única publicada es la de
 * un vecino, que puede retirarla con /olvidar. Lo de las instituciones —Síndic,
 * Sindicatura, Consell, CTBG, BOP— y lo de la prensa es registro público y se lee de
 * `public/data`, con variantes escritas aquí para las ramas que el dato de hoy no
 * abre (un cero, una lista vacía, un medio de más).
 *
 * La prosa del laboratorio tiene más ramas de las que una página abre a la vez, así
 * que se recorre también llamando a sus funciones con el `t` valenciano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../../src/i18n'
import Quejas from '../../src/pages/Quejas'
import QuejasDashboard from '../../src/pages/QuejasDashboard'
import LaboratorioPrensa from '../../src/pages/LaboratorioPrensa'
import {
  avisoSinVeredicto,
  fraseFactcheck,
  fraseVeredictos,
  puenteTablaMedios,
  textoLibroVacio,
} from '../../src/lib/press-lab'
import { DESENLACES_EXTRACCION } from '../../src/scraper/press-extraccion'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

// ─── Qué no es lengua ──────────────────────────────────────────────────────────

/**
 * Nombres propios, siglas, dominios y órdenes del bot: se escriben igual en los dos
 * idiomas. Ninguno es una frase: si una frase entera se colara aquí, la guarda dejaría
 * de leerla.
 */
const SIGLAS = masLargasPrimero([
  'CivicPulse',
  'Telegram',
  'SQLite',
  'Open311',
  '@munigraph_bot',
  '/queja',
  '/apoyar Q-XXXX',
  '/escalar Q-XXXX',
  'Cl@ve',
  'LPACAP',
  'Síndic de Greuges CV',
  'Síndic de Greuges',
  'Síndic',
  'Sindicatura de Comptes CV',
  'Sindicatura de Comptes',
  'Sindicatura',
  'Consell de Transparència CV',
  'Consell de Transparència de la Comunitat Valenciana',
  'CTBG',
  'EELL',
  'BOP València',
  'BOP',
  'XLSX',
  'PDF',
  'elsindic.com/actuaciones',
  'sindicom.gva.es',
  'conselltransparencia.gva.es',
  'sindic-expedientes.json',
  '/data/quejas.json',
  'Trust Project',
  'Bellingcat',
  'Wayback',
  'Internet Archive',
  'Riba-roja de Túria',
  'Riba-roja',
  'WhatsApp',
  'quejas.json',
  // «Reg.», el número de registro de un anuncio del BOP: la abreviatura es la misma.
  'Reg.',
  // Lo que pinta Leaflet en el mapa de /quejas, y no el catálogo: los botones de zoom
  // (en inglés en los dos idiomas) y la atribución de las teselas.
  'Zoom in',
  'Zoom out',
  'OpenStreetMap',
  'CARTO',
  // Tramos de frase que el valencià escribe igual, medidos uno a uno: «El Síndic
  // registra **36 expedients**…» parte la frase en la negrita; «Política editorial.» es
  // la negrita de su párrafo; «Indicador del Trust Project · Cobertura local» es el
  // título de un indicador cuyo nombre es el mismo en las dos lenguas; «Presenta» y
  // «Una persona la revisa» abren en negrita dos pasos de «Cómo funciona». Una frase
  // ENTERA no entra aquí nunca: dejaría de leerse.
  'Una persona la revisa',
  'Presenta',
  'El Síndic registra',
  'Política editorial.',
  'Indicador del',
  'Cobertura local',
])

// ─── Lo que se sirve ───────────────────────────────────────────────────────────

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))
const fixture = (nombre) => JSON.parse(readFileSync(resolve('tests/fixtures', nombre), 'utf8'))

const SINDIC = publicado('/data/sindic.json')
const EXPEDIENTES = publicado('/data/sindic-expedientes.json')
const SINDICATURA = publicado('/data/sindicatura.json')
const CONSELL = publicado('/data/consell-cv.json')
const CTBG = publicado('/data/ctbg.json')
const BOP = publicado('/data/bop.json')
const OFICIALES = publicado('/data/officials.json')
const TENDER_GEO = publicado('/data/tender-geo.json')

/** Dos barrios con su nombre de OSM: la página pinta el nombre, no el slug. */
const GEO = {
  neighborhoods: [
    { id: 'n-1', slug: 'santa-rosa', name: 'Santa Rosa', centroid: [39.55, -0.57] },
    { id: 'n-2', slug: 'l-oliveral', name: "l'Oliveral", centroid: [39.55, -0.56] },
  ],
}
const BARRIOS = GEO.neighborhoods.map((n) => n.name)
/** El mes de una resolución del CTBG, como lo trae su hoja: dato, en castellano. */
const MES_DEL_CTBG = 'marzo'

const QUEJA = (id, cambios) => ({
  service_request_id: id,
  status: 'capturada',
  service_code: 'limpieza',
  service_name: 'limpieza',
  description: `Contenedor desbordado desde el lunes junto a la parada ${id}`,
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

/** Un listado entero —el recuento del bot casa con las filas—, para que el reloj mida. */
function listado(items) {
  const cuenta = (campo) =>
    items.reduce((m, q) => ({ ...m, [q[campo]]: (m[q[campo]] ?? 0) + 1 }), {})
  return {
    generatedAt: '2026-11-08T07:00:00.000Z',
    source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
    stats: {
      total: items.length,
      byState: cuenta('status'),
      byNeighborhood: cuenta('address_string'),
      byCategory: cuenta('service_code'),
      byConcejal: {},
    },
    items,
  }
}

const CON_QUEJAS = listado([
  QUEJA('Q-AAA11111', { apoyos: 7 }),
  QUEJA('Q-BBB22222', {
    status: 'registrada',
    service_code: 'alumbrado',
    service_name: 'alumbrado',
    address_string: 'l-oliveral',
    registro_entry_number: '2026-RE-0847',
    registered_at: '2026-08-20T10:00:00.000Z',
  }),
  QUEJA('Q-CCC33333', {
    status: 'silencio_negativo',
    registro_entry_number: '2026-RE-0311',
    registered_at: '2026-06-01T10:00:00.000Z',
  }),
])
const SIN_QUEJAS = listado([])

/** Las instituciones como hoy, y con las ramas que hoy no se abren. */
const VIGILANCIA = {
  '/data/sindic.json': SINDIC,
  '/data/sindic-expedientes.json': EXPEDIENTES,
  '/data/sindicatura.json': SINDICATURA,
  '/data/consell-cv.json': CONSELL,
  '/data/ctbg.json': {
    ...CTBG,
    stats: { ...CTBG.stats, matchedEntries: 1, bySentido: { Estimatoria: 1 } },
    matched: [
      {
        resolucion: 'R/0123/2025',
        mesResolucion: MES_DEL_CTBG,
        sheetYear: 2025,
        asunto: 'Acceso a los contratos menores del ejercicio 2024',
        sentido: 'Estimatoria',
        organismo: 'Ayuntamiento de Riba-roja de Túria',
      },
    ],
  },
  '/data/bop.json': BOP,
}
const VIGILANCIA_A_CERO = {
  '/data/sindic.json': { ...SINDIC, items: [] },
  '/data/sindic-expedientes.json': {
    ...EXPEDIENTES,
    cobertura: { ...EXPEDIENTES.cobertura, vecinosDesde: null },
  },
  '/data/sindicatura.json': { ...SINDICATURA, dedicated: [], sectoral: [], art218: null },
  '/data/consell-cv.json': {
    ...CONSELL,
    stats: { ...CONSELL.stats, matchedEntries: 0, bySentido: {} },
    matched: [],
  },
  '/data/ctbg.json': CTBG,
  '/data/bop.json': {
    ...BOP,
    anuncios: [],
    stats: { ...BOP.stats, total: 0, daysCovered: 21, daysRequested: 30 },
  },
}
const BOP_ENTERO_VACIO = {
  ...BOP,
  anuncios: [],
  stats: { ...BOP.stats, total: 0, daysCovered: 30, daysRequested: 30 },
}

/** Lo que piden las dos páginas de quejas además del listado; /quejas pide también el mapa del gasto. */
const COMUN_DASHBOARD = { '/data/geo.json': GEO, '/data/officials.json': OFICIALES }
const COMUN_QUEJAS = { '/data/geo.json': GEO, '/data/tender-geo.json': TENDER_GEO }

// ─── El laboratorio ────────────────────────────────────────────────────────────

const PRENSA = {
  '/data/press.json': publicado('/data/press.json'),
  '/data/press-summaries.json': publicado('/data/press-summaries.json'),
  '/data/press-claims-verified.json': publicado('/data/press-claims-verified.json'),
  '/data/press-trust.json': publicado('/data/press-trust.json'),
  '/data/press-triangulation.json': publicado('/data/press-triangulation.json'),
  '/data/press-coverage-gaps.json': publicado('/data/press-coverage-gaps.json'),
  '/data/press-findings.json': publicado('/data/press-findings.json'),
  '/data/factcheck.json': publicado('/data/factcheck.json'),
  '/data/press-link-rot.json': publicado('/data/press-link-rot.json'),
}
/** El día en que se escribió press.json: la ventana de 30 días tiene sus titulares. */
const AHORA_PRENSA = Date.parse(PRENSA['/data/press.json'].generatedAt)

/** Las ramas que el laboratorio de hoy no abre: síntesis, triangulación, lagunas, medios de más. */
const PRENSA_CON_TODO = (() => {
  const articulos = PRENSA['/data/press.json'].items
  const [a, b] = articulos
  const outlets = PRENSA['/data/press-trust.json'].outlets
  const muchos = Array.from({ length: 12 }, (_, i) => ({
    ...outlets[i % outlets.length],
    outlet: `Medio de prueba ${i + 1}`,
    outletHost: `medio-${i + 1}.test`,
    articleCount: i === 11 ? 1 : 3,
  }))
  const hallazgos = PRENSA['/data/press-findings.json']
  return {
    ...PRENSA,
    '/data/press-summaries.json': {
      ...PRENSA['/data/press-summaries.json'],
      items: [{ articleId: a.id, summary: 'Resumen automático de prueba sobre el titular.' }],
    },
    '/data/press-triangulation.json': {
      ...PRENSA['/data/press-triangulation.json'],
      clusters: [
        {
          articleIds: [a.id, b.id],
          outlets: ['Levante-EMV', 'Las Provincias'],
          fuentesOficiales: ['Ajuntament de Riba-roja de Túria'],
        },
      ],
      stats: { totalClusters: 1, triangulated3Plus: 0 },
    },
    '/data/press-coverage-gaps.json': fixture('press-lagunas_2026-10-19.json'),
    '/data/press-trust.json': { ...PRENSA['/data/press-trust.json'], outlets: muchos },
    '/data/press-findings.json': {
      ...hallazgos,
      items: [
        { ...hallazgos.items[0], id: 'firmado-1', curatorName: 'Persona curadora' },
        ...hallazgos.items,
      ],
    },
  }
})()

const PRENSA_VACIA = {
  '/data/press.json': { ...PRENSA['/data/press.json'], items: [] },
  '/data/press-claims-verified.json': { ...PRENSA['/data/press-claims-verified.json'], items: [] },
  '/data/press-trust.json': { ...PRENSA['/data/press-trust.json'], outlets: [] },
  '/data/press-coverage-gaps.json': {
    ...PRENSA['/data/press-coverage-gaps.json'],
    items: [],
    stats: { ...PRENSA['/data/press-coverage-gaps.json'].stats, candidatesExamined: 0 },
  },
}

// ─── Escenarios ────────────────────────────────────────────────────────────────

const pinta = (c, texto) => c.textContent.includes(texto)
const ES = CATALOGUE.es
const CA = CATALOGUE.ca
/** El rótulo de cualquiera de los dos idiomas: `listo` se mira en los dos. */
const pintaClave = (c, clave) => pinta(c, ES[clave]) || pinta(c, CA[clave])

/** Pulsa un `<select>` por su etiqueta, en el idioma que esté pintado. */
function elige(container, claveAria, valor) {
  const select = [...container.querySelectorAll('select')].find((s) =>
    [ES[claveAria], CA[claveAria]].includes(s.getAttribute('aria-label')),
  )
  expect(select, `no encuentro el filtro ${claveAria}`).toBeTruthy()
  fireEvent.change(select, { target: { value: valor } })
}

/** Lo que se lee después de pulsar: la página entera otra vez, en el mismo orden. */
const tras = (fn) => (container) => {
  fn(container)
  return lectura(container)
}

const ESCENARIOS = [
  {
    nombre: '/quejas · con quejas y las cuatro instituciones con resultados',
    pinta: () => <Quejas />,
    fetch: { ...COMUN_QUEJAS, ...VIGILANCIA, '/data/quejas.json': CON_QUEJAS },
    listo: (c) =>
      pinta(c, 'Q-AAA11111') &&
      pinta(c, 'R/0123/2025') &&
      pinta(c, SINDICATURA.dedicated[0].title) &&
      pinta(c, BOP.anuncios[0].title),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas · sin quejas y con las instituciones a cero',
    pinta: () => <Quejas />,
    fetch: { ...VIGILANCIA_A_CERO, '/data/quejas.json': SIN_QUEJAS },
    listo: (c) =>
      pintaClave(c, 'quejas.empty.title') &&
      pintaClave(c, 'quejas.sindicatura.vacio.enlace') &&
      pintaClave(c, 'quejas.ctbg.sinResoluciones'),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas · el BOP leído entero y sin anuncios',
    pinta: () => <Quejas />,
    fetch: {
      ...COMUN_QUEJAS,
      ...VIGILANCIA,
      '/data/bop.json': BOP_ENTERO_VACIO,
      '/data/quejas.json': CON_QUEJAS,
    },
    listo: (c) => pinta(c, 'Q-AAA11111') && pintaClave(c, 'quejas.bop.vacio'),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas · el fichero de quejas no llega',
    pinta: () => <Quejas />,
    fetch: { ...VIGILANCIA },
    // La frase lleva la ruta del fichero en su hueco: se espera la ruta.
    listo: (c) => pinta(c, '/data/quejas.json'),
    faltanAdrede: ['/data/quejas.json', '/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas/dashboard · con quejas en plazo, en silencio y por área',
    ahora: Date.parse('2026-11-08T10:00:00Z'),
    pinta: () => <QuejasDashboard />,
    fetch: { ...COMUN_DASHBOARD, '/data/quejas.json': CON_QUEJAS },
    listo: (c) => pinta(c, 'Q-BBB22222') && pintaClave(c, 'dashboard.urgente.pill.silencio'),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas/dashboard · con el plazo en un año sin calendario',
    ahora: Date.parse('2027-01-15T10:00:00Z'),
    pinta: () => <QuejasDashboard />,
    fetch: {
      ...COMUN_DASHBOARD,
      '/data/quejas.json': listado([
        QUEJA('Q-DDD44444', {
          status: 'en_tramite',
          registro_entry_number: '2026-RE-0999',
          registered_at: '2026-10-20T10:00:00.000Z',
        }),
      ]),
    },
    listo: (c) => pinta(c, 'Q-DDD44444') && pintaClave(c, 'dashboard.urgente.pill.sinCalendario'),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas/dashboard · sin quejas',
    pinta: () => <QuejasDashboard />,
    fetch: { '/data/officials.json': OFICIALES, '/data/quejas.json': SIN_QUEJAS },
    listo: (c) => pintaClave(c, 'dashboard.vacio.titulo'),
    faltanAdrede: ['/data/quejas-responses.json'],
  },
  {
    nombre: '/quejas/dashboard · el fichero de quejas no llega',
    pinta: () => <QuejasDashboard />,
    fetch: { '/data/officials.json': OFICIALES },
    // La frase lleva la ruta del fichero en su hueco: se espera la ruta.
    listo: (c) => pinta(c, '/data/quejas.json'),
    faltanAdrede: ['/data/quejas.json', '/data/quejas-responses.json'],
  },
  {
    nombre: '/laboratorio/prensa · como hoy',
    ahora: AHORA_PRENSA,
    pinta: () => <LaboratorioPrensa />,
    fetch: PRENSA,
    listo: (c) => pintaClave(c, 'laboratorio.prensa.medios.col.articulos'),
  },
  {
    nombre: '/laboratorio/prensa · con síntesis, triangulación, lagunas y doce medios',
    ahora: AHORA_PRENSA,
    pinta: () => <LaboratorioPrensa />,
    fetch: PRENSA_CON_TODO,
    listo: (c) => pinta(c, 'Resumen automático de prueba') && pinta(c, 'Medio de prueba 1'),
    interactua: tras((c) => {
      const boton = [...c.querySelectorAll('button')].find((b) =>
        /^(Ver|Veure) /.test(b.textContent),
      )
      expect(boton, 'la tabla de medios no ofrece verlos todos').toBeTruthy()
      fireEvent.click(boton)
      elige(c, 'laboratorio.prensa.filtro.veredicto.aria', 'contradicho')
    }),
  },
  {
    nombre: '/laboratorio/prensa · sin titulares ni medios',
    ahora: AHORA_PRENSA,
    pinta: () => <LaboratorioPrensa />,
    fetch: PRENSA_VACIA,
    listo: (c) => pintaClave(c, 'laboratorio.prensa.medios.vacio'),
    faltanAdrede: [
      '/data/press-summaries.json',
      '/data/press-triangulation.json',
      '/data/press-findings.json',
      '/data/factcheck.json',
      '/data/press-link-rot.json',
    ],
  },
]

/**
 * Lo que se sirve de los ficheros y la página pinta tal cual. Los nombres de los
 * barrios, el nombre de cada medio inventado y los datos que la prueba escribe
 * también lo son.
 */
const DERIVADOS = [...BARRIOS, MES_DEL_CTBG]

/** «12d», «+68d»: los días que quedan, cifra y unidad, que se escriben igual en las dos. */
const cuentasDeDias = (piezas) => piezas.filter((p) => /^\+?\d+d$/.test(p))

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('las tres páginas en valencià: nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      vi.setSystemTime(escenario.ahora ?? Date.parse('2026-11-08T10:00:00Z'))
      const es = await pintaYLee(escenario, 'es')
      const ca = await pintaYLee(escenario, 'ca')
      expect(es.piezas.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])

      const datos = [
        ...datosPintados(es.piezas, cadenasDe(escenario.fetch)),
        ...DERIVADOS,
        ...cuentasDeDias(es.piezas),
      ]
      const { sinTraducir, castellanoEn } = detectorDeCastellano(
        masLargasPrimero([...datos, ...SIGLAS]),
      )
      expect
        .soft(
          ca.piezas.length,
          `no se pintan las mismas piezas\n  es ${JSON.stringify(es.piezas)}\n  ca ${JSON.stringify(ca.piezas)}`,
        )
        .toBe(es.piezas.length)
      expect
        .soft(
          sinTraducir(es.piezas.map((s, i) => [s, ca.piezas[i]])),
          'se lee igual en castellano y en valencià',
        )
        .toEqual([])
      expect
        .soft(
          [...new Set(ca.piezas.flatMap((s) => castellanoEn(s)))],
          'castellano dentro del valencià',
        )
        .toEqual([])
    },
    60000,
  )
})

// ─── La prosa que calcula el laboratorio, rama a rama ─────────────────────────

const tCa = (clave) => CA[clave] ?? ES[clave] ?? clave
const resumen = (o) => ({
  monitoredCount: 12,
  auditedCount: 3,
  totalClaims: 0,
  resueltasClaims: 0,
  parcialClaims: 0,
  cotejadasClaims: 0,
  cotejadasMunicipalesClaims: 0,
  cotejadasSoloPromesasClaims: 0,
  ...o,
})
const RESUMENES = [
  resumen({}),
  resumen({ totalClaims: 1, auditedCount: 1 }),
  resumen({ totalClaims: 10, cotejadasClaims: 10, cotejadasMunicipalesClaims: 10 }),
  resumen({
    totalClaims: 10,
    cotejadasClaims: 6,
    cotejadasMunicipalesClaims: 3,
    cotejadasSoloPromesasClaims: 2,
  }),
  resumen({ totalClaims: 2, cotejadasClaims: 1, cotejadasMunicipalesClaims: 1 }),
  resumen({ totalClaims: 4, parcialClaims: 2, cotejadasClaims: 4, cotejadasMunicipalesClaims: 4 }),
  resumen({ totalClaims: 10, resueltasClaims: 1, parcialClaims: 1 }),
  resumen({ totalClaims: 1, resueltasClaims: 1, parcialClaims: 0 }),
  resumen({ totalClaims: 10, resueltasClaims: 10 }),
  resumen({ totalClaims: 10, resueltasClaims: 5 }),
  resumen({ totalClaims: 10, resueltasClaims: 3 }),
  resumen({ totalClaims: 10, resueltasClaims: 7 }),
]
const intento = (fuente, estado, examinadas = 0, aceptadas = 0, motivo) => ({
  fuente,
  estado,
  examinadas,
  aceptadas,
  ...(motivo ? { motivo } : {}),
})
const FACTCHECKS = [
  null,
  { consulta: { intentos: [intento('Maldita.es RSS', 'error', 0, 0, 'HTTP 503')] } },
  { consulta: { intentos: [intento('Maldita.es RSS', 'error')] } },
  { consulta: { intentos: [intento('Maldita.es RSS', 'consultada', 1, 0)] } },
  {
    consulta: {
      intentos: [
        intento('Google Fact Check Tools API', 'consultada', 0),
        intento('Maldita.es RSS', 'consultada', 0),
      ],
    },
  },
  {
    consulta: {
      intentos: [
        intento('Google Fact Check Tools API', 'consultada', 1, 1),
        intento('Maldita.es RSS', 'consultada', 50, 2),
        intento('Newtral RSS', 'error', 0, 0, 'HTTP 503'),
      ],
    },
  },
]
const NOMBRES_DE_FUENTES = [
  'Google Fact Check Tools API',
  'Maldita.es RSS',
  'Newtral RSS',
  'HTTP 503',
]
const PUENTES = [
  [[{ articleCount: 12 }], { monitoredCount: 12, fueraDelFeedCount: 0 }],
  [[{ articleCount: 1 }], { monitoredCount: 1, fueraDelFeedCount: 0 }],
  [[{ articleCount: 11 }], { monitoredCount: 12, fueraDelFeedCount: 1 }],
  [[{ articleCount: 10 }], { monitoredCount: 12, fueraDelFeedCount: 2 }],
  [[{ articleCount: 9 }], { monitoredCount: 12, fueraDelFeedCount: 0 }],
  [[{ articleCount: 9 }], { monitoredCount: 12, fueraDelFeedCount: 1 }],
]

describe('la prosa de press-lab.js en valencià, rama a rama', () => {
  const { castellanoEn } = detectorDeCastellano(
    masLargasPrimero([...NOMBRES_DE_FUENTES, ...SIGLAS]),
  )
  const frases = [
    ...RESUMENES.map((r) => fraseVeredictos(r, tCa)),
    ...RESUMENES.flatMap((r) => {
      const aviso = avisoSinVeredicto(r, tCa)
      return aviso ? [aviso.titulo, aviso.texto] : []
    }),
    ...FACTCHECKS.map((f) => fraseFactcheck(f, tCa)),
    ...PUENTES.map(([o, s]) => puenteTablaMedios(o, s, tCa)),
    ...[null, ...DESENLACES_EXTRACCION].map((d) => textoLibroVacio(d, tCa)),
  ]

  it('mide algo: cada rama dice algo distinto y ninguna se queda con un hueco', () => {
    // Doce resúmenes, seis consultas, seis puentes y cada desenlace: si una rama
    // dejara de pintarse, la lista tendría repetidas o vacías.
    expect(new Set(frases).size).toBeGreaterThan(30)
    for (const f of frases) {
      expect(f.trim(), 'una rama no dice nada').not.toBe('')
      expect(f, 'un hueco llegó al lector').not.toMatch(/\{\w+\}/)
    }
  })

  it.each(frases.map((f) => [f]))('%s', (frase) => {
    expect(castellanoEn(frase)).toEqual([])
  })

  it('el castellano de siempre sigue saliendo sin `t`', () => {
    for (const r of RESUMENES) {
      expect(fraseVeredictos(r)).toBe(fraseVeredictos(r, (k) => ES[k]))
    }
    expect(fraseFactcheck(null)).toBe(ES['laboratorio.prensa.factcheck.noConsta'])
  })
})
