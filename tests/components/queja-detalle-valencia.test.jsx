/**
 * La ficha de una queja en valencià (#38).
 *
 * /quejas/:id era una de las tres páginas que la incidencia encontró enteras sin
 * catálogo: `QuejaDetail` escribía a mano cada rótulo, fechaba en es-ES y pintaba el
 * estado y la categoría de una tabla castellana. La guarda es la de la portada
 * (`portada-valencia.test.jsx`): pinta la ficha en castellano y en valencià, espera
 * dos lecturas iguales y compara pieza a pieza.
 *
 * Con una diferencia en los datos, y es a propósito. La portada lee las instantáneas
 * publicadas; aquí la queja se escribe en la prueba. La única queja publicada hoy es
 * la de un vecino, que puede retirarla con /olvidar cuando quiera: copiada aquí,
 * sobreviviría a su retirada. Y una guarda atada a ella se pondría roja el día que no
 * se publicara ninguna, que es un estado legítimo del canal. Para que escribirla no
 * sea recitar una forma, sus campos se leen de la interfaz con la que el bot la
 * publica, y las relaciones con contratos las calcula el motor de verdad.
 *
 * Lo que sale de un fichero servido es dato por definición y se queda en su idioma;
 * lo demás tiene que leerse distinto. Cada rama de la ficha —el reloj legal, la
 * respuesta del Ayuntamiento, el silencio, el Síndic, la resolución, las tres clases
 * de relación— tiene su escenario, y la cobertura se vigila sola: cada cadena
 * `quejas.detalle.*` del catálogo tiene que pintarse en alguno.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { prettyNeighborhood } from '../../src/lib/formatters'
import QuejaDetail from '../../src/pages/QuejaDetail'
import { RELATION_LABELS, scoreRelation } from '../../src/scraper/queja-contract-relations'
import { installFetchMock } from '../setup/mockFetch'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'

// ─── Qué no es lengua ──────────────────────────────────────────────────────────

/** Nombres propios, dominios y comandos: se escriben igual en los dos idiomas. */
const SIGLAS = masLargasPrimero([
  'CivicPulse',
  'Telegram',
  'WhatsApp',
  'WA',
  'LPACAP',
  'Síndic de Greuges',
  'Síndic',
  'elsindic.com',
  'contrataciondelestado.es',
  '/aviso-legal',
  '/olvidar',
  '/apoyar',
])

// ─── La queja de la prueba ─────────────────────────────────────────────────────

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

/** Los campos con que el bot publica cada queja, leídos de su interfaz. */
const CAMPOS_PUBLICOS = (() => {
  const fuente = readFileSync(resolve('bot/src/services/snapshot.ts'), 'utf8')
  const desde = fuente.indexOf('export interface PublicQuejaRow {')
  const bloque = fuente.slice(desde, fuente.indexOf('\n}', desde))
  return [...bloque.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]).sort()
})()

const DIA = 24 * 60 * 60 * 1000
const haceDias = (n) => new Date(Date.now() - n * DIA).toISOString()

const OFICIALES = publicado('/data/officials.json')
/** Un concejal con foto, del padrón publicado: la ficha pinta su nombre y su partido. */
const CONCEJAL = OFICIALES.officials.find((o) => o.photoUrl && o.party && o.role !== 'alcalde')

const ID = 'Q-GUARDA01'
const BARRIO = 'el-oliveral'

/** Todos los campos que publica el bot; el texto es inventado. */
const QUEJA = {
  service_request_id: ID,
  status: 'capturada',
  service_code: 'alumbrado',
  service_name: 'alumbrado',
  description: 'Farola apagada desde hace tres semanas junto al paso de peatones del colegio',
  requested_datetime: '2026-08-03T18:20:00.000Z',
  updated_datetime: '2026-08-21T09:05:00.000Z',
  lat: null,
  long: null,
  address_string: BARRIO,
  apoyos: 3,
  concejalia_area: 'Obras y Servicios',
  concejal_slug: CONCEJAL?.slug ?? null,
  registro_entry_number: null,
  registered_at: null,
  photo: `/data/quejas-photos/${ID.toLowerCase()}.jpg`,
}

/**
 * Tres contratos, uno por clase de relación, y los enlaces que el motor calcula para
 * ellos. Las dos relaciones de nivel B sólo se publican aprobadas, así que se aprueban.
 */
const SIN_MAS = {
  title: '',
  cpvs: [],
  places: [],
  zones: [],
  awardDate: null,
  amount: null,
  assignee: null,
  expediente: null,
}
const permalink = (n) =>
  `https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=guarda-${n}`
const CONTRATOS = [
  { ...SIN_MAS, id: 'G-1', permalink: permalink(1), department: 'urbanismo', places: [BARRIO] },
  { ...SIN_MAS, id: 'G-2', permalink: permalink(2), department: 'cultura', zones: [BARRIO] },
  {
    ...SIN_MAS,
    id: 'G-3',
    permalink: permalink(3),
    department: 'urbanismo',
    awardDate: '2026-09-01',
  },
]
const ENLACES = CONTRATOS.map((c) =>
  scoreRelation(
    {
      id: ID,
      serviceCode: QUEJA.service_code,
      department: 'urbanismo',
      placeSlug: BARRIO,
      description: QUEJA.description,
      createdAt: QUEJA.requested_datetime,
    },
    c,
  ),
).filter(Boolean)
const RELACIONES = { generatedAt: '2026-09-17T06:00:00.000Z', links: ENLACES, stats: {} }
const APROBADAS = {
  generatedAt: '2026-09-17T06:00:00.000Z',
  approvals: ENLACES.filter((l) => l.requiresHumanApproval).map((l) => ({
    quejaId: l.quejaId,
    tenderId: l.tenderId,
  })),
}
const SIN_RELACIONES = { generatedAt: '2026-09-17T06:00:00.000Z', links: [], stats: {} }
const SIN_APROBADAS = { generatedAt: '2026-09-17T06:00:00.000Z', approvals: [] }

const RESPUESTA = {
  id: 'qr-guarda',
  queja_id: ID,
  role: 'Concejalía de Obras y Servicios',
  firmante: 'Oficina de atención ciudadana',
  text: 'La reparación de la farola está incluida en la orden de trabajo de esta semana.',
  source_url: 'https://www.ribarroja.es/',
  appliedAt: '2026-09-02T10:15:00.000Z',
}

/** Lo que la ficha pide: la queja, las respuestas y el padrón; y, si la encuentra, las relaciones. */
function sirve({
  queja = QUEJA,
  respuestas = [],
  relaciones = SIN_RELACIONES,
  aprobadas = SIN_APROBADAS,
  encontrada = true,
} = {}) {
  const mapa = {
    '/data/quejas.json': {
      generatedAt: '2026-09-17T06:00:00.000Z',
      source: {
        platform: 'CivicPulse bot · Telegram capture',
        spec: 'Open311 GeoReport v2 (extended)',
      },
      stats: {},
      items: [queja],
    },
    '/data/quejas-responses.json': { generatedAt: '2026-09-17T06:00:00.000Z', items: respuestas },
    '/data/officials.json': OFICIALES,
  }
  if (encontrada) {
    mapa['/data/queja-contract-relations.json'] = relaciones
    mapa['/data/queja-contract-relations-approved.json'] = aprobadas
  }
  return mapa
}

/** El dato que la ficha deriva del fichero y no está escrito en él: el barrio legible. */
const DERIVADOS = [prettyNeighborhood(BARRIO)]

// ─── Escenarios ────────────────────────────────────────────────────────────────

const pintaLa = (c, texto) => c.textContent.includes(texto)

const ESCENARIOS = [
  {
    nombre: 'capturada: foto, área, responsable y las tres clases de relación',
    ruta: `/quejas/${ID}`,
    fetch: sirve({ relaciones: RELACIONES, aprobadas: APROBADAS }),
    listo: (c) =>
      pintaLa(c, QUEJA.description) &&
      pintaLa(c, CONCEJAL.name) &&
      c.querySelectorAll('a[href*="idEvl=guarda-"]').length === CONTRATOS.length,
    comparte: true,
  },
  {
    nombre: 'en trámite: verificada, registrada, en plazo y con respuesta del Ayuntamiento',
    ruta: `/quejas/${ID}`,
    fetch: sirve({
      queja: {
        ...QUEJA,
        status: 'en_tramite',
        service_code: 'transparencia',
        service_name: 'transparencia',
        apoyos: 12,
        address_string: null,
        concejalia_area: null,
        concejal_slug: null,
        registro_entry_number: '2026-RE-0847',
        registered_at: haceDias(12),
      },
      respuestas: [RESPUESTA],
    }),
    listo: (c) => pintaLa(c, RESPUESTA.text) && pintaLa(c, '2026-RE-0847'),
    comparte: true,
  },
  {
    nombre: 'en silencio: el plazo excedido y la puerta del Síndic',
    ruta: `/quejas/${ID}`,
    fetch: sirve({
      queja: {
        ...QUEJA,
        status: 'silencio_negativo',
        registro_entry_number: '2026-RE-0311',
        registered_at: haceDias(140),
      },
    }),
    listo: (c) => pintaLa(c, '2026-RE-0311') && pintaLa(c, 'elsindic.com'),
  },
  {
    nombre: 'escalada al Síndic',
    ruta: `/quejas/${ID}`,
    fetch: sirve({
      queja: {
        ...QUEJA,
        status: 'escalada_sindic',
        photo: undefined,
        registro_entry_number: '2026-RE-0102',
        registered_at: haceDias(200),
      },
    }),
    listo: (c) => pintaLa(c, '2026-RE-0102') && pintaLa(c, 'elsindic.com'),
  },
  {
    nombre: 'resuelta: sin reloj',
    ruta: `/quejas/${ID}`,
    fetch: sirve({
      queja: {
        ...QUEJA,
        status: 'resuelta',
        registro_entry_number: '2026-RE-0555',
        registered_at: haceDias(40),
      },
    }),
    listo: (c) =>
      pintaLa(c, QUEJA.description) && c.querySelectorAll('[data-section-head]').length >= 4,
  },
  {
    nombre: 'una queja que el fichero no publica',
    ruta: '/quejas/Q-NOESTA99',
    fetch: sirve({ encontrada: false }),
    listo: (c) => pintaLa(c, 'Q-NOESTA99'),
  },
]

// ─── Pintar y leer ─────────────────────────────────────────────────────────────

/** Lo que se lee de la ficha, con el texto alternativo de sus imágenes: también se oye. */
const leeFicha = (c) => [
  ...lectura(c),
  ...[...c.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt')),
]

/** El texto que el botón de WhatsApp manda, sin la URL de la página que lo cierra. */
function leeLoCompartido(container) {
  const abre = vi.spyOn(window, 'open').mockImplementation(() => null)
  const boton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('WA'))
  expect(boton, 'la ficha no tiene botón de compartir').toBeTruthy()
  fireEvent.click(boton)
  expect(abre, 'compartir no abrió nada').toHaveBeenCalledTimes(1)
  const texto = new URL(String(abre.mock.calls[0][0])).searchParams.get('text') ?? ''
  abre.mockRestore()
  return texto
    .split('\n')
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Pinta un escenario en un idioma y devuelve lo que se lee, cuando ya no se mueve, y
 * lo que la ficha pidió sin que la prueba lo sirviera.
 */
async function pintaYLee(escenario, idioma) {
  localStorage.setItem('cp:lang', idioma)
  const fetchFn = installFetchMock(escenario.fetch)
  const { container, unmount } = render(
    <MemoryRouter initialEntries={[escenario.ruta]}>
      <LocaleProvider>
        <Routes>
          <Route path="/quejas/:id" element={<QuejaDetail />} />
        </Routes>
      </LocaleProvider>
    </MemoryRouter>,
  )
  const rutas = Object.keys(escenario.fetch)
  let previa = null
  await waitFor(
    () => {
      const sinLlegar = rutas.filter((r) => peekSnapshot(r)?.status !== 'ready')
      expect(sinLlegar, `${escenario.nombre} (${idioma}): datos sin llegar`).toEqual([])
      expect(
        escenario.listo(container),
        `${escenario.nombre} (${idioma}): no ha pintado su rama`,
      ).toBe(true)
      const ahora = leeFicha(container)
      const quieta = previa !== null && JSON.stringify(ahora) === JSON.stringify(previa)
      previa = ahora
      expect(quieta, `${escenario.nombre} (${idioma}): la lectura todavía se mueve`).toBe(true)
    },
    { timeout: 15000 },
  )
  const pedidasSinServir = [
    ...new Set(fetchFn.mock.calls.map(([u]) => String(u).replace(/^https?:\/\/[^/]+/, ''))),
  ].filter((p) => p.startsWith('/data/') && !(p in escenario.fetch))
  const compartido = escenario.comparte ? leeLoCompartido(container) : []
  unmount()
  return { piezas: [...previa, ...compartido], pedidasSinServir }
}

afterEach(() => localStorage.clear())

// ─── Lo que se compara ─────────────────────────────────────────────────────────

describe('la queja de la prueba es una queja que el bot publicaría', () => {
  it('lleva exactamente los campos de PublicQuejaRow', () => {
    // Mide algo: una interfaz que ya no se encuentra devuelve cero campos.
    expect(CAMPOS_PUBLICOS.length, 'no encuentro PublicQuejaRow en el bot').toBeGreaterThan(10)
    expect(Object.keys(QUEJA).sort()).toEqual(CAMPOS_PUBLICOS)
  })

  it('el motor da una relación de cada clase, y el padrón publicado un concejal con foto', () => {
    expect(CONCEJAL, 'officials.json no publica ningún concejal con foto').toBeTruthy()
    expect([...new Set(ENLACES.map((l) => l.relationLabel))].sort()).toEqual(
      [...RELATION_LABELS].sort(),
    )
  })
})

describe('la ficha de una queja en valencià: nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      const es = await pintaYLee(escenario, 'es')
      const ca = await pintaYLee(escenario, 'ca')
      expect(es.piezas.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)
      expect.soft(es.pedidasSinServir, 'la ficha pide datos que la prueba no sirve').toEqual([])

      const datos = [...datosPintados(es.piezas, cadenasDe(escenario.fetch)), ...DERIVADOS]
      const noSeTraduce = masLargasPrimero([...datos, ...SIGLAS])
      const { sinTraducir, castellanoEn } = detectorDeCastellano(noSeTraduce)

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

  it('mientras carga, también en valencià', async () => {
    localStorage.setItem('cp:lang', 'ca')
    globalThis.fetch = vi.fn(() => new Promise(() => {}))
    const { container, unmount } = render(
      <MemoryRouter initialEntries={[`/quejas/${ID}`]}>
        <LocaleProvider>
          <Routes>
            <Route path="/quejas/:id" element={<QuejaDetail />} />
          </Routes>
        </LocaleProvider>
      </MemoryRouter>,
    )
    expect(container.textContent.trim()).toBe(CATALOGUE.ca['common.loading'])
    unmount()
  })
})

/**
 * Cobertura: cada cadena de la ficha en el catálogo se pinta en algún escenario. Un
 * rótulo nuevo sin escenario nace sin leer en valencià y nadie lo notaría.
 */
describe('cobertura de la guarda de la ficha', () => {
  it('toda cadena quejas.detalle.* se pinta en algún escenario', async () => {
    const claves = Object.keys(CATALOGUE.es).filter((k) => k.startsWith('quejas.detalle.'))
    // Mide algo: sin claves no hay nada que cubrir.
    expect(claves.length, 'el catálogo no tiene cadenas de la ficha').toBeGreaterThan(20)
    const leido = []
    for (const escenario of ESCENARIOS) leido.push(...(await pintaYLee(escenario, 'es')).piezas)
    const texto = leido.join('\n')
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 120000)
})
