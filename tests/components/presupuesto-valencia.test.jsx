/**
 * /presupuesto en valencià (#38).
 *
 * La tercera de las páginas que la incidencia encontró sin catálogo. La cabecera,
 * la cascada y los capítulos ya pasaban por él; lo que no pasaba era todo lo que
 * cuelga debajo: la tarjeta del mapa de lo adjudicado con su medidor de cobertura,
 * el detalle de una zona, la línea de tiempo, las tres pestañas —el listado de
 * contratos con sus filtros y su paginación, los adjudicatarios y los tipos— y los
 * anuncios del TED.
 *
 * La guarda es la de las otras dos: pinta la página entera en castellano y en
 * valencià con las instantáneas publicadas, espera dos lecturas iguales y compara
 * pieza a pieza. Leaflet no se pinta en jsdom, así que `react-leaflet` se sustituye
 * por contenedores que pintan a sus hijos: lo que importa del mapa es lo que se
 * lee —el aviso vacío, el `aria-label` y el texto de cada tooltip—, no los círculos.
 * Y se lee también lo que un lector de pantalla oye de un control: su `placeholder`
 * y su `aria-valuetext`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../../src/i18n'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import Presupuesto, { formatEuros } from '../../src/pages/Presupuesto'
import { lecturaCapitulos } from '../../src/scraper/presupuesto-lectura'
import { isCommittedContract } from '../../src/lib/contract-status'
import { topContractors } from '../../src/lib/tender-geo'
import { importeAdjudicado } from '../../src/lib/contract-status'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

vi.mock('react-leaflet', () => {
  const Pinta = ({ children }) => <div>{children}</div>
  return {
    MapContainer: Pinta,
    Circle: Pinta,
    Tooltip: Pinta,
    TileLayer: () => null,
    AttributionControl: () => null,
    Polyline: () => null,
    useMap: () => ({ invalidateSize: () => {} }),
  }
})

// ─── Qué no es lengua ──────────────────────────────────────────────────────────

const SIGLAS = [
  'CONPREL',
  'PLACSP',
  'Gobierto',
  'DANA',
  'TED',
  'IVA',
  'BDNS',
  'FEDER',
  'MinHac',
  'Riba-roja de Túria',
  'Riba-roja',
]

/**
 * Lo que el valencià escribe igual que el castellano sin ser un valor entero del
 * catálogo: «Cap.» abrevia «capítulo» y «capítol»; «adj.», «adjudicado» y
 * «adjudicat»; y «Patrimonial» es el mismo tipo de contrato en los dos idiomas
 * cuando va pegado a su importe en el `title` de la barra.
 */
const IGUALES_EN_LOS_DOS = ['Cap.', 'adj.', 'Patrimonial']

/** Las unidades de las cifras, leídas de los formateadores y no escritas. */
const DINERO_COMPACTO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  notation: 'compact',
})
const sinCifras = (s) =>
  s
    .replace(/[\d.,\s−-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((x) => /\p{L}|€/u.test(x))
const UNIDADES = masLargasPrimero([
  ...sinCifras(DINERO_COMPACTO.format(55_000_000)),
  ...sinCifras(DINERO_COMPACTO.format(418_000)),
  ...sinCifras(formatEuros(41_578_252, { compact: true })),
  ...sinCifras(formatEuros(41_578_252)),
  'M€',
  'k€',
])

// ─── Lo publicado ──────────────────────────────────────────────────────────────

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

const RUTAS = [
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/obras.json',
  '/data/bdns.json',
  '/data/deuda-viva.json',
  '/data/tenders.json',
  '/data/tenders-ted.json',
  '/data/tender-geo.json',
  '/data/cpv-labels.json',
  '/data/entities.json',
  '/data/geo.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]
const sirve = () => Object.fromEntries(RUTAS.map((r) => [r, publicado(r)]))

/**
 * Los nombres de capítulo como los escribe la página: son dato del snapshot —CONPREL
 * y el estado de ejecución los publican en castellano—, pero la página los pasa por
 * `lecturaCapitulos` («GASTOS DE PERSONAL» → «Gastos de personal») o a minúsculas
 * dentro de una frase, y ya no son la cadena del fichero. Se derivan con la misma
 * función, como la portada deriva la sección de un reportaje.
 */
const CAPITULOS = (() => {
  const ejecucion = publicado('/data/budget-execution.json').latest
  const conprel = publicado('/data/budget.json').snapshot
  return [
    ...lecturaCapitulos(ejecucion?.gastos?.chapters, ejecucion?.gastos?.total).map((f) => f.rotulo),
    ...(conprel?.expenseByEconomicChapter ?? []).map((c) => c.label),
    ...(conprel?.revenueByEconomicChapter ?? []).map((c) => c.label),
  ].flatMap((r) => [r, r.toLowerCase()])
})()

/** Lo que la página sólo pide al pulsar: la pestaña de adjudicatarios y el detalle de una zona. */
const AL_PULSAR = [
  '/data/entities.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]
const llegaron = (rutas) => rutas.every((r) => peekSnapshot(r)?.status === 'ready')

// ─── Lo que se pulsa ───────────────────────────────────────────────────────────

/** Lo que se lee de la página, con lo que sólo oye quien usa un lector de pantalla. */
const leePagina = (c) => [
  ...lectura(c),
  ...[...c.querySelectorAll('[placeholder]')].map((el) => el.getAttribute('placeholder')),
  ...[...c.querySelectorAll('[aria-valuetext]')].map((el) => el.getAttribute('aria-valuetext')),
  ...[...c.querySelectorAll('img[alt]')].map((el) => el.getAttribute('alt')),
]

const pulsaYLee = async (c, boton, espera) => {
  expect(boton, 'no encuentro el control').toBeTruthy()
  fireEvent.click(boton)
  await waitFor(() => expect(espera(c)).toBe(true))
  return leePagina(c)
}

/**
 * Las pestañas, el primer adjudicatario abierto, la primera zona del medidor, el
 * filtro DANA y la segunda página del listado. Cada paso lee la página entera.
 */
async function recorre(c) {
  const leido = []
  const pestanas = () => [...c.querySelectorAll('[role="tablist"] [role="tab"]')]
  expect(pestanas().length, 'la tarjeta del mapa no tiene pestañas').toBeGreaterThan(1)

  // La segunda página del listado de contratos, en la pestaña inicial.
  const siguiente = [...c.querySelectorAll('nav button')].at(-1)
  leido.push(
    ...(await pulsaYLee(c, siguiente, () =>
      [...c.querySelectorAll('nav [aria-live]')].some((s) => s.textContent.trim().startsWith('2')),
    )),
  )

  for (let i = 1; i < pestanas().length; i += 1) {
    leido.push(
      ...(await pulsaYLee(
        c,
        pestanas()[i],
        () => pestanas()[i].getAttribute('aria-selected') === 'true',
      )),
    )
  }
  // En la de adjudicatarios, el primero abierto, con el registro de empresas ya llegado.
  fireEvent.click(pestanas()[1])
  await waitFor(() => {
    expect(pestanas()[1].getAttribute('aria-selected')).toBe('true')
    expect(llegaron(['/data/entities.json'])).toBe(true)
  })
  const primero = c.querySelector('[role="tabpanel"] button[aria-expanded]')
  leido.push(
    ...(await pulsaYLee(c, primero, () => primero.getAttribute('aria-expanded') === 'true')),
  )

  // El filtro DANA de la tarjeta.
  const dana = c
    .querySelector('.cp-gasto-grid')
    ?.parentElement?.querySelector('button[aria-pressed]')
  leido.push(...(await pulsaYLee(c, dana, () => dana.getAttribute('aria-pressed') === 'true')))
  fireEvent.click(dana)

  // La primera zona del medidor, y su detalle con las quejas relacionadas ya llegadas.
  const zona = c.querySelector('.cp-gasto-grid > div:last-child button')
  leido.push(
    ...(await pulsaYLee(
      c,
      zona,
      () =>
        !c.querySelector('.cp-gasto-grid > div:last-child button + button') &&
        llegaron(AL_PULSAR.slice(1)),
    )),
  )

  // Lo último: reproducir la línea de tiempo y pararla. Mientras corre, la fecha y el
  // mapa cambian a cada fotograma, así que de este paso sólo se lee el botón.
  const reproducir = c.querySelector('.cp-gasto-grid > div:first-child button[aria-label]')
  if (reproducir) {
    const antes = reproducir.getAttribute('aria-label')
    fireEvent.click(reproducir)
    await waitFor(() => expect(reproducir.getAttribute('aria-label')).not.toBe(antes))
    leido.push(reproducir.getAttribute('aria-label'))
    fireEvent.click(reproducir)
  }
  return leido
}

/** El snapshot de contratos, con sus filas en `contracts`. */
const CONTRATOS = '/data/tenders.json'
const MAPA = '/data/tender-geo.json'
const EMPRESAS = '/data/entities.json'

/**
 * Las ramas de la tarjeta del mapa y de los menores que el dato de hoy no pinta,
 * cada una con una mutación pequeña y nombrada:
 *
 * - el universo del mapa sin fechas: sin periodo en el rótulo ni en la cobertura, y
 *   sin línea de tiempo;
 * - ningún contrato situado en una zona: el mapa vacío y la frase sin su cuota de obras;
 * - el mayor contrato deja de ser una concesión;
 * - un solo contrato fuera de las cifras comprometidas;
 * - un contrato menor sin importe neto publicado;
 * - los dos mayores adjudicatarios, fundidos en una empresa con dos razones sociales.
 */
function ramasRaras() {
  const mapa = structuredClone(sirve())
  const tg = mapa[MAPA]
  delete tg.universe.dateMin
  delete tg.universe.dateMax
  tg.assignments = tg.assignments.map((a) => ({ ...a, zones: [] }))
  // Con el mapa vacío no se monta la silueta del término, que es quien pide geo.json.
  delete mapa['/data/geo.json']

  const contratos = mapa[CONTRATOS].contracts
  const comprometidos = contratos.filter(isCommittedContract)
  const mayor = comprometidos.reduce((a, b) =>
    (importeAdjudicado(b) ?? 0) > (importeAdjudicado(a) ?? 0) ? b : a,
  )
  mayor.contractType = 'services'
  const noComprometidos = contratos.filter((c) => !isCommittedContract(c))
  for (const c of noComprometidos.slice(1)) c.status = 'awarded'
  const menor = contratos.find((c) => c.minorContract === true && isCommittedContract(c))
  menor.finalAmountNoTaxes = null
  menor.initialAmountNoTaxes = null

  const [primero, segundo] = topContractors(contratos, 2)
  // La última: el resolvedor de la página se queda con la última empresa que nombra
  // una razón social, y el registro publicado ya puede nombrar a alguno de los dos.
  mapa[EMPRESAS].companies = [
    ...(mapa[EMPRESAS].companies ?? []),
    {
      nameKey: 'fusion-de-la-guarda',
      canonicalName: primero.assignee,
      variants: [primero.assignee, segundo.assignee],
    },
  ]
  return mapa
}

/** Sin un solo importe en los contratos: la frase del total no puede decir qué parte son obras. */
function sinImportes() {
  const mapa = structuredClone(sirve())
  for (const c of mapa[CONTRATOS].contracts) {
    for (const campo of Object.keys(c)) if (/amount/i.test(campo)) c[campo] = null
  }
  for (const r of AL_PULSAR) delete mapa[r]
  return mapa
}

const pintada = (c) =>
  !!c.querySelector('h1') &&
  /\d{4}/.test(c.querySelector('h1').textContent) &&
  c.querySelectorAll('[role="tablist"] [role="tab"]').length > 1 &&
  c.querySelectorAll('.cp-contrato-fila').length > 0

const ESCENARIOS = [
  {
    nombre: 'la página con lo publicado, recorriendo pestañas, zona, DANA, páginas y tiempo',
    fetch: sirve(),
    pinta: () => <Presupuesto />,
    listo: pintada,
    interactua: recorre,
    alPulsar: AL_PULSAR,
  },
  {
    nombre:
      'las ramas raras: sin fechas, nada situado, el mayor sin concesión, uno fuera, un menor sin importe, dos razones sociales',
    fetch: ramasRaras(),
    pinta: () => <Presupuesto />,
    listo: pintada,
    interactua: recorre,
    alPulsar: AL_PULSAR,
  },
  {
    nombre: 'sin importes en los contratos',
    fetch: sinImportes(),
    pinta: () => <Presupuesto />,
    listo: pintada,
  },
]

afterEach(() => localStorage.clear())

describe('/presupuesto en valencià: nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (esc) => {
      const es = await pintaYLee(esc, 'es', { lee: leePagina })
      const ca = await pintaYLee(esc, 'ca', { lee: leePagina })
      expect(es.piezas.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])
      expect.soft(es.servidasSinPedir, 'se sirve algo que ninguna pulsación pide').toEqual([])

      const datos = [...datosPintados(es.piezas, cadenasDe(esc.fetch)), ...CAPITULOS]
      const noSeTraduce = masLargasPrimero([...datos, ...SIGLAS])
      // Las unidades y lo que se escribe igual sólo para comparar piezas enteras: quitar
      // «Cap.» o «adj.» como subcadena al buscar palabras sueltas no aportaría nada.
      const { sinTraducir } = detectorDeCastellano(
        masLargasPrimero([...noSeTraduce, ...UNIDADES, ...IGUALES_EN_LOS_DOS]),
      )
      const { castellanoEn } = detectorDeCastellano(noSeTraduce)

      expect.soft(ca.piezas.length, 'no se pintan las mismas piezas').toBe(es.piezas.length)
      expect
        .soft(
          [...new Set(sinTraducir(es.piezas.map((s, i) => [s, ca.piezas[i]])))],
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
    180000,
  )
})

/**
 * Las familias de cadenas que esta guarda cubre. El titular de la deuda no está: sus
 * ramas dependen de la serie, y las recorre `deuda-titular-valencia.test.js` entera.
 */
const PREFIJOS = [
  'presupuesto.gasto.',
  'presupuesto.menores.',
  'presupuesto.obras.',
  'presupuesto.subvenciones.',
  'paginacion.',
]

describe('cobertura de la guarda de /presupuesto', () => {
  it('toda cadena de sus familias se pinta en algún escenario', async () => {
    const claves = Object.keys(CATALOGUE.es).filter((k) => PREFIJOS.some((p) => k.startsWith(p)))
    // Mide algo, y de cada familia: una familia sin claves no está cubierta, falta.
    for (const p of PREFIJOS) {
      expect(
        claves.some((k) => k.startsWith(p)),
        `el catálogo no tiene cadenas ${p}*`,
      ).toBe(true)
    }
    const leido = []
    for (const esc of ESCENARIOS)
      leido.push(...(await pintaYLee(esc, 'es', { lee: leePagina })).piezas)
    const texto = leido.join('\n')
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 300000)
})
