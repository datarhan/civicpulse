/**
 * La portada entera en valencià: lo que queda fuera del mapa (#38).
 *
 * #39 tradujo los globos, las leyendas y los avisos del mapa con una guarda que
 * pinta cada pieza en los dos idiomas y las compara. Lo demás de la portada se
 * quedó con castellano escrito a mano que se lee igual con la interfaz en
 * valencià: la cinta de datos nacionales, la tira de indicadores, la columna
 * editorial —fechas, rótulos, notas y los `title` que salen al pasar por encima— y
 * la cabecera.
 *
 * La misma guarda que `mapa-valencia.test.jsx`, con una diferencia en los datos: la
 * columna y la tira se pintan con las instantáneas PUBLICADAS y no con un banco de
 * pruebas escrito a mano. Son una docena de ficheros, cada uno con su forma, y
 * copiar esas formas aquí sería la regla 1 de docs/DATA_INTEGRITY.md al revés. Lo
 * que sale de una instantánea es dato por definición, así que qué cadenas son dato
 * se lee de los propios ficheros servidos. Las ramas que el dato de hoy no pinta
 * —la LOREG congelada, una concesión, un titular oficial, el presupuesto sin estado
 * de ejecución— se fuerzan con una mutación pequeña y nombrada del fichero
 * publicado.
 *
 * Y la lista de ficheros servidos se vigila sola en los dos sentidos: lo que la
 * portada pide y la prueba no sirve se nombra, y lo servido que nadie lee no llega
 * nunca a «listo».
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { REPORTAJE_SLUGS } from '../../src/reportajes'
import { CONCESSION_CONTRACT_TYPES } from '../../src/lib/contract-status'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../../src/scraper/departments'
import { euros, eurosBreves } from '../../src/lib/formatters'
import { EditorialColumn } from '../../src/variants/direction-d/EditorialColumn'
import { KpiStrip } from '../../src/variants/direction-d/KpiStrip'
import { Header } from '../../src/variants/direction-d/Topbar'
import { AlcaldeBox } from '../../src/variants/direction-d/blocks/AlcaldeBox'
import { EditorialMasthead, QuejaCTA } from '../../src/variants/direction-d/blocks/Masthead'
import { EnBrevePortada } from '../../src/variants/direction-d/blocks/EnBrevePortada'
import {
  ReportajeBlockD,
  reportajeTopic,
} from '../../src/variants/direction-d/blocks/ReportajeBlockD'
import {
  CoalitionRing,
  DepartamentosBlockD,
  PromesasBlockD,
} from '../../src/variants/direction-d/blocks/GovernmentBlocks'
import {
  EmpleoBlockD,
  EventsBlockD,
  LiveContracts,
  ParticipaBlockD,
  PressBlockD,
} from '../../src/variants/direction-d/blocks/FeedBlocks'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

// Lo que tarda el bloque de reportajes en pintarse después de que sus instantáneas
// lleguen al almacén. Cero salvo en la prueba de la espera, al final del fichero, que
// reproduce así el rojo del 18-10.
const retraso = vi.hoisted(() => ({ ms: 0 }))
vi.mock('../../src/lib/snapshot-store', async (original) => {
  const real = await original()
  return {
    ...real,
    loadSnapshotOptional: async (ruta) => {
      const datos = await real.loadSnapshotOptional(ruta)
      if (retraso.ms) await new Promise((r) => setTimeout(r, retraso.ms))
      return datos
    },
  }
})

// El chip «Hoy» de la cabecera ya se lee en valencià en `vivo-portada.test.jsx`, con
// sus tres fuentes servidas por URL. Aquí sólo estorbaría: esta prueba lee lo demás.
vi.mock('../../src/variants/direction-d/Vivo', () => ({ Vivo: () => null }))

// ─── Qué no es lengua ──────────────────────────────────────────────────────────

/**
 * Nombres propios, marcas, siglas, el comando del bot y las iniciales del avatar: lo
 * que la portada escribe igual en los dos idiomas porque no es lengua.
 */
const SIGLAS = [
  'CivicPulse',
  'MVP',
  'MP',
  '/queja',
  'ribarroja.es',
  'Comunitat Valenciana',
  'Riba-roja de Túria',
  'Riba-roja',
  '⌘K',
  'PVPC',
  'AEMET',
  'DGT',
  'BCE',
  'MRO',
  'IPC',
  'INE',
  'SEPE',
  'CONPREL',
  'Gobierto',
  'PLACSP',
  'LOREG',
  'BDNS',
  'DANA',
]

/**
 * Las unidades de las cifras, leídas de los formateadores de la portada y no
 * escritas: las cifras van en es-ES en los dos idiomas, así que «M€» o «mil €» no
 * son castellano sin traducir. Es la lección de la CI de #39: escrita a mano, la
 * unidad dependía del ICU del runtime.
 */
const DINERO_COMPACTO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  notation: 'compact',
})
const sinCifras = (s) =>
  s
    .replace(/[\d.,\s\u00a0\u202f\u2212-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((x) => /\p{L}|€/u.test(x))
const UNIDADES = masLargasPrimero([
  ...sinCifras(DINERO_COMPACTO.format(55_000_000)),
  ...sinCifras(DINERO_COMPACTO.format(418_000)),
  ...sinCifras(eurosBreves(41_578_252)),
  ...sinCifras(euros(41_578_252)),
  '€/kWh',
  '€/L',
  'bps',
  'k',
])

// ─── Lo publicado ──────────────────────────────────────────────────────────────

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))
const sirve = (rutas) => Object.fromEntries(rutas.map((r) => [r, publicado(r)]))

/** El reloj de la cabecera y del membrete: un martes, para que el día se escriba. */
const AHORA = new Date('2026-09-15T08:30:00')

const RUTAS_COLUMNA = [
  '/data/officials.json',
  '/data/promises.json',
  '/data/plenos-agendas.json',
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/tenders.json',
  '/data/bdns.json',
  '/data/press.json',
  '/data/empleo.json',
  '/data/events.json',
  '/data/participa.json',
  // «Tu ayuntamiento en 30 segundos»: el último pleno y la cobertura del barrio.
  '/data/plenos.json',
  '/data/pleno-votes.json',
  '/data/tender-geo.json',
  ...REPORTAJE_SLUGS.map((slug) => `/data/reportajes/${slug}.json`),
]
const RUTAS_TIRA = [
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/padron.json',
  '/data/paro.json',
  '/data/plenos.json',
  '/data/tenders.json',
]

/** Los trece bloques que monta la columna, en su orden. */
const LA_COLUMNA = [
  EditorialMasthead,
  EnBrevePortada,
  QuejaCTA,
  AlcaldeBox,
  ReportajeBlockD,
  CoalitionRing,
  PromesasBlockD,
  DepartamentosBlockD,
  PressBlockD,
  LiveContracts,
  EmpleoBlockD,
  EventsBlockD,
  ParticipaBlockD,
]
const bloquesPintados = (c) => c.querySelectorAll('aside > *').length

/**
 * Los títulos de los reportajes publicados que un escenario sirve. El bloque no se
 * pinta cuando sus instantáneas llegan al almacén, que es lo que `pintaYLee` vigila,
 * sino después: las pide con un `Promise.all` y guarda el resultado en un estado
 * propio, y React pinta ese estado en una tarea suya. En ese hueco la columna puede
 * leerse dos veces igual sin el bloque. El 18-10, con la suite entera, la pasada en
 * castellano se leyó así (180 piezas contra 223): la espera sólo pedía nueve bloques
 * de doce, y el que faltaba era este. Así que exige estos títulos siempre que el
 * escenario sirva alguno publicado.
 */
const titulosDeReportajes = (mapa) =>
  REPORTAJE_SLUGS.map((slug) => mapa[`/data/reportajes/${slug}.json`]?.meta)
    .filter((meta) => meta?.estado === 'publicado')
    .map((meta) => meta.titulo)
const reportajesPintados = (c, mapa) =>
  titulosDeReportajes(mapa).every((titulo) => c.textContent.includes(titulo))

/**
 * La sección de cada reportaje («Dinero público») sale de su JSON congelado, recortada
 * por el propio bloque: es contenido del reportaje y se queda en su idioma. La lectura
 * de datos no la ve porque ya no es la cadena del fichero, así que se deriva con la
 * misma función que la recorta.
 */
const TEMAS_DE_REPORTAJE = REPORTAJE_SLUGS.map((slug) =>
  reportajeTopic(publicado(`/data/reportajes/${slug}.json`).meta?.seccion),
).filter(Boolean)

/**
 * La columna en las ramas que el dato de hoy no pinta. Cada mutación es pequeña y
 * dice qué rama abre; el resto del fichero es el publicado.
 */
function columnaEnSusRamasRaras() {
  const mapa = sirve(RUTAS_COLUMNA)
  // La LOREG congelada: la insignia del bloque de promesas.
  mapa['/data/promises.json'] = { ...mapa['/data/promises.json'], frozenUntil: '2099-01-01' }
  // Un titular de la fuente oficial: la pastilla «Oficial» y su `title`.
  const prensa = structuredClone(mapa['/data/press.json'])
  prensa.items[0] = { ...prensa.items[0], official: true }
  mapa['/data/press.json'] = prensa
  // Las últimas adjudicaciones: una concesión con plazo y otra sin él, y una fila
  // sin adjudicatario, categoría ni tipo.
  const contratos = structuredClone(mapa['/data/tenders.json'])
  const [a, b, c, ...resto] = contratos.top.recentAwarded
  contratos.top.recentAwarded = [
    { ...a, contractType: CONCESSION_CONTRACT_TYPES[0], duration: 6209 },
    { ...b, contractType: CONCESSION_CONTRACT_TYPES[0], duration: null },
    { ...c, contractor: null, categoryTitle: null, contractType: null },
    ...resto,
  ]
  mapa['/data/tenders.json'] = contratos
  // Sin estado de ejecución: el presupuesto aprobado en vez del crédito definitivo.
  delete mapa['/data/budget-execution.json']
  return mapa
}

// ─── Escenarios ────────────────────────────────────────────────────────────────

const COLUMNA_DE_HOY = sirve(RUTAS_COLUMNA)
const COLUMNA_RARA = columnaEnSusRamasRaras()

const ESCENARIOS = [
  {
    nombre: 'la columna editorial con lo que hoy está publicado',
    cubre: [EditorialColumn, ...LA_COLUMNA],
    datos: TEMAS_DE_REPORTAJE,
    fetch: COLUMNA_DE_HOY,
    pinta: () => <EditorialColumn now={AHORA} />,
    // Con el dato de hoy casi todos los bloques pintan; la otra columna los exige todos.
    // Los reportajes, sí o sí: son el bloque que se pinta tarde.
    listo: (c) => bloquesPintados(c) >= 9 && reportajesPintados(c, COLUMNA_DE_HOY),
  },
  {
    nombre: 'la columna editorial en sus ramas raras: LOREG, concesiones, oficial y sin ejecución',
    cubre: [EditorialColumn, ...LA_COLUMNA],
    datos: TEMAS_DE_REPORTAJE,
    fetch: COLUMNA_RARA,
    faltanAdrede: ['/data/budget-execution.json'],
    pinta: () => <EditorialColumn now={AHORA} />,
    listo: (c) => bloquesPintados(c) === LA_COLUMNA.length && reportajesPintados(c, COLUMNA_RARA),
  },
  {
    nombre: 'la tira de indicadores con lo publicado',
    cubre: [KpiStrip],
    fetch: sirve(RUTAS_TIRA),
    pinta: () => <KpiStrip />,
    listo: (c) => c.querySelectorAll('.d-kpi-cell').length === 6,
  },
  {
    nombre: 'la tira de indicadores sin padrón, presupuesto, paro ni plenos',
    cubre: [KpiStrip],
    fetch: sirve(['/data/tenders.json']),
    faltanAdrede: RUTAS_TIRA.filter((r) => r !== '/data/tenders.json'),
    pinta: () => <KpiStrip />,
    listo: (c) => c.querySelectorAll('.d-kpi-cell').length === 6,
  },
  {
    nombre: 'la cabecera de la portada',
    cubre: [Header],
    fetch: {},
    pinta: () => <Header now={AHORA} />,
    listo: (c) => c.textContent.includes('CivicPulse'),
  },
]

afterEach(() => localStorage.clear())

describe('la portada en valencià: fuera del mapa, nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      const es = await pintaYLee(escenario, 'es')
      const ca = await pintaYLee(escenario, 'ca')
      expect(es.piezas.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)
      expect.soft(es.pedidasSinServir, 'la portada pide datos que la prueba no sirve').toEqual([])

      const datos = [
        ...datosPintados(es.piezas, cadenasDe(escenario.fetch ?? {})),
        ...(escenario.datos ?? []),
      ]
      const noSeTraduce = masLargasPrimero([...datos, ...SIGLAS])
      const { sinTraducir } = detectorDeCastellano(masLargasPrimero([...noSeTraduce, ...UNIDADES]))
      // Sin las unidades: quitar «k» o «mil» como subcadena cegaría a este detector.
      const { castellanoEn } = detectorDeCastellano(noSeTraduce)

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

/**
 * Las áreas del alcalde también son nombres del padrón de cargos, así que la
 * comparación las toma por dato y no las vería sin traducir. Se miran aparte, con el
 * rótulo que su enum da en cada idioma.
 */
describe('las áreas del alcalde, con el nombre de su idioma', () => {
  it('en valencià, cada área con su nombre valenciano', async () => {
    const cargos = publicado('/data/officials.json')
    const alcalde = cargos.officials.find((o) => o.role === 'alcalde')
    const slugs = [
      ...new Set((alcalde?.portfolios ?? []).map(canonicalizeDepartment).filter(Boolean)),
    ]
    expect(slugs.length, 'el alcalde publicado no tiene áreas que leer').toBeGreaterThan(0)
    const conNombreDistinto = slugs.filter((s) => DEPARTMENT_LABEL[s].ca !== DEPARTMENT_LABEL[s].es)
    expect(
      conNombreDistinto.length,
      'ninguna área se escribe distinto: no mide nada',
    ).toBeGreaterThan(0)

    const { piezas } = await pintaYLee(
      {
        nombre: 'el bloque del alcalde',
        fetch: sirve(['/data/officials.json']),
        pinta: () => <AlcaldeBox />,
        listo: (c) => c.textContent.includes(alcalde.name),
      },
      'ca',
    )
    const texto = piezas.join(' · ')
    for (const slug of conNombreDistinto) {
      expect.soft(texto, `${slug} en valencià`).toContain(DEPARTMENT_LABEL[slug].ca)
    }
  })
})

/**
 * Cobertura: todo bloque exportado de la columna tiene su escenario. Un bloque nuevo
 * nace sin leer en valencià y nadie lo notaría; el glob lo encuentra solo.
 */
const BLOQUES = import.meta.glob('../../src/variants/direction-d/blocks/*.jsx', { eager: true })

describe('cobertura de la guarda de la portada', () => {
  it('ningún bloque exportado de la columna se queda sin escenario', () => {
    const componentes = Object.entries(BLOQUES).flatMap(([ruta, modulo]) =>
      Object.entries(modulo)
        .filter(([nombre, valor]) => typeof valor === 'function' && /^[A-Z]/.test(nombre))
        .map(([nombre, valor]) => ({ id: `${ruta.split('/').pop()}#${nombre}`, valor })),
    )
    // Mide algo: un patrón mal escrito devuelve un objeto vacío, no un error.
    expect(componentes.length, 'el glob no ve los bloques').toBeGreaterThanOrEqual(
      LA_COLUMNA.length,
    )
    const cubiertos = new Set(ESCENARIOS.flatMap((e) => e.cubre))
    expect(componentes.filter(({ valor }) => !cubiertos.has(valor)).map(({ id }) => id)).toEqual([])
    for (const fuera of [EditorialColumn, KpiStrip, Header]) {
      expect(cubiertos.has(fuera), `${fuera.name} sin escenario`).toBe(true)
    }
  })
})

/**
 * El rojo del 18-10, reproducido: los reportajes llegan al almacén a tiempo y el bloque
 * tarda en pintarlos, sólo en la pasada en castellano. 300 ms son seis vueltas del
 * `waitFor` (50 ms): sin exigir el bloque, la columna se daba por quieta antes.
 */
describe('la espera de la columna', () => {
  it('no da la columna por leída mientras el bloque de reportajes no se ha pintado', async () => {
    const escenario = ESCENARIOS[0]
    const titulos = titulosDeReportajes(escenario.fetch)
    expect(titulos.length, 'ningún reportaje publicado: no mide nada').toBeGreaterThan(0)
    retraso.ms = 300
    let es
    try {
      es = await pintaYLee(escenario, 'es')
    } finally {
      retraso.ms = 0
    }
    const ca = await pintaYLee(escenario, 'ca')
    const texto = es.piezas.join(' · ')
    for (const titulo of titulos) expect.soft(texto, 'reportaje sin leer').toContain(titulo)
    expect(es.piezas.length, 'no se pintan las mismas piezas').toBe(ca.piezas.length)
  }, 60000)
})
