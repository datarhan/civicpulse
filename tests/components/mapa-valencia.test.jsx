/**
 * El mapa de la portada, leído en valencià.
 *
 * La portada valenciana pintaba en castellano los globos, los rótulos flotantes,
 * las leyendas y los avisos de su mapa: «Población», «Inversión situada», «obra»,
 * «Adjudicatario:», la causa de un incendio… Más de quince componentes escritos a
 * mano fuera del catálogo, así que ni la caída al castellano los delataba.
 *
 * El detector de las otras pruebas (`tests/setup/castellano.js`) tampoco podía
 * verlos: sólo conoce las palabras que ya pasaron por el catálogo, y éstas nunca
 * pasaron. Por eso esta guarda no busca palabras. Pinta cada componente en
 * castellano y en valencià y los compara pieza a pieza: lo que se lee igual en
 * los dos idiomas sin ser un dato, una unidad, una sigla o una palabra que el
 * propio catálogo escribe igual, no se tradujo. `castellanoEn` mira además
 * dentro de cada pieza valenciana, para lo que va pegado a una traducción.
 *
 * Cada escenario espera a que el componente haya pintado SU rama —y sus datos
 * hayan llegado— y a dos lecturas seguidas iguales antes de comparar. Leída
 * antes, una rama vacía se lee igual en los dos idiomas y pasa por el motivo
 * equivocado.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { prettyNeighborhood } from '../../src/hooks/useQuejas'
import { aggregateNeighborhood, computePerNeighborhood } from '../../src/lib/neighborhood-aggregate'
import { NeighborhoodPopup } from '../../src/components/LiveCity/popups/NeighborhoodPopup'
import { PlacePopup } from '../../src/components/LiveCity/popups/PlacePopup'
import { IncendioPopup } from '../../src/components/LiveCity/popups/IncendioPopup'
import { NetworkStationPopup } from '../../src/components/LiveCity/popups/NetworkStationPopup'
import { ObraPopup, PROGRAMA_LABEL } from '../../src/components/LiveCity/popups/ObraPopup'
import {
  BarrioTooltip,
  IncendioTooltip,
  PinDineroTooltip,
  QuejasTooltip,
} from '../../src/components/LiveCity/popups/Tooltips'
import { ContractCard } from '../../src/components/tenders/ContractCard'
import { installFetchMock } from '../setup/mockFetch'
import { detectorDeCastellano, IGUALES_EN_EL_CATALOGO, loQueSeLee } from '../setup/castellano'

/** Unidades: se escriben igual en los dos idiomas porque no son lengua. */
const UNIDADES = ['M€', 'ha', 'hab.']

/** Primero las más largas: «hab.» se tiene que quitar antes que «ha». */
const masLargasPrimero = (xs) =>
  [...new Set(xs.filter((x) => x != null && x !== '').map(String))].sort(
    (a, b) => b.length - a.length,
  )

/** Lo que el lector recibe: textos, `aria-label` y `title`, en orden de documento. */
const lectura = (container) => [
  ...loQueSeLee(container),
  ...[...container.querySelectorAll('[title]')].map((el) => el.getAttribute('title')),
]

// ─── Datos de los escenarios ───────────────────────────────────────────────────

const REGISTRADA = '2026-07-10T09:00:00.000Z'
const BARRIO = { slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.5], population: 1200 }
const BARRIO_SIN_PADRON = {
  slug: 'el-clot',
  name: 'El Clot',
  centroid: [39.51, -0.52],
  population: null,
}
const ZONA_CON_OBRAS = {
  slug: BARRIO.slug,
  name: BARRIO.name,
  contractCount: 3,
  amount: 2_400_000,
  danaAmount: 1_100_000,
}
const queja = (over = {}) => ({
  service_request_id: 'Q-1',
  status: 'capturada',
  address_string: BARRIO.slug,
  registered_at: null,
  ...over,
})
const instantanea = (items) => ({ stats: { total: items.length }, items })
const QUEJAS_MEDIBLES = instantanea([
  queja({ registered_at: REGISTRADA, status: 'resuelta' }),
  queja({ service_request_id: 'Q-2', registered_at: REGISTRADA, status: 'silencio_negativo' }),
  queja({ service_request_id: 'Q-3', registered_at: REGISTRADA, status: 'registrada' }),
])
const QUEJAS_SIN_REGISTRO = instantanea([queja()])
const QUEJAS_DE_OTRO_BARRIO = instantanea([
  queja({ address_string: 'otro-barrio', registered_at: REGISTRADA }),
])

const LUGAR = { sourceId: 'cami-de-la-vallesa', name: 'Camí de la Vallesa', kind: 'street' }
const CONTRATO_OBRA = {
  id: 'c-obra',
  title: 'Obras de reurbanización del Camí de la Vallesa',
  permalink: 'https://contrataciondelestado.es/wps/poc?idEvl=obra',
  status: 'formalized',
  contractType: 'construction',
  processType: 'open_simplified',
  numberOfProposals: 4,
  duration: 180,
  assignee: 'Pavimentos del Túria, S.L.',
  initialAmountNoTaxes: 500000,
  finalAmountNoTaxes: 410000,
}
const CONTRATO_LOTE = {
  id: 'c-lote',
  title: 'Alumbrado del Camí de la Vallesa, lote 2',
  permalink: 'https://contrataciondelestado.es/wps/poc?idEvl=lote',
  status: 'provisionally_awarded',
  contractType: 'patrimonial',
  processType: 'negotiated_without_publicity',
  numberOfProposals: 1,
  duration: 30,
  assignee: 'Electro Riba, S.A.',
  initialAmountNoTaxes: 90000,
  finalAmountNoTaxes: 88000,
}
const ASIGNACIONES = [
  {
    id: CONTRATO_OBRA.id,
    place: { sourceId: LUGAR.sourceId },
    point: [39.5, -0.5],
    amount: 410000,
    amountKind: 'final',
    date: '2025-03-14',
    dana: false,
    contractType: CONTRATO_OBRA.contractType,
  },
  {
    id: CONTRATO_LOTE.id,
    place: { sourceId: LUGAR.sourceId },
    point: [39.5, -0.5],
    amount: 90000,
    amountKind: 'initial',
    date: '2024-11-02',
    dana: true,
    contractType: CONTRATO_LOTE.contractType,
    parentTitle: 'Reurbanización y alumbrado del Camí de la Vallesa',
  },
]

const CONTRATO_ZONA = {
  id: 'c-zona',
  title: 'Suministro e instalación de farolas en El Clot',
  permalink: 'https://contrataciondelestado.es/wps/poc?idEvl=zona',
  status: 'void',
  contractType: 'supplies',
  processType: 'minor_contract',
  numberOfProposals: 2,
  duration: 45,
  assignee: 'Luminarias Levante, S.L.',
  initialAmountNoTaxes: 30000,
  finalAmountNoTaxes: 26000,
}
const PROCEDENCIA = 'El Clot'
/** `relationLabel` es de /presupuesto y queda fuera de esta tarea: se pasa como dato. */
const QUEJA_RELACIONADA = {
  quejaId: 'Q-7',
  relationLabel: 'misma zona',
  description: 'Farola apagada junto al colegio de El Clot',
}

const FUENTE_INCENDIOS = {
  atribucion: 'Institut Cartogràfic Valencià (ICV) — Generalitat Valenciana, CC BY 4.0',
}
const INCENDIO_AJENO = {
  id: '2012VL0456',
  anyo: 2012,
  municipio: 'Vilamarxant',
  propio: false,
  paraje: 'Barranc de la Cerdana',
  causa: 'intencionado',
  detectadoEl: '2012-08-14',
  horaDeteccion: '15:40',
  extinguidoEl: '2012-08-16',
  superficieHa: 42.37,
  arboladaHa: 30.1,
  noArboladaHa: 12.27,
  intersecta: true,
}
const INCENDIO_PROPIO_SIN_DATOS = {
  id: '1998VL0012',
  anyo: 1998,
  municipio: 'Riba-roja de Túria',
  propio: true,
  paraje: null,
  causa: 'sinClasificar',
  detectadoEl: null,
  horaDeteccion: null,
  extinguidoEl: null,
  superficieHa: 1.5,
  arboladaHa: 0,
  noArboladaHa: 0,
  intersecta: true,
}

const ESTACION_RED = {
  name: 'Benimàmet',
  refs: ['L1', 'L2'],
  colors: { L1: '#E4BE36', L2: '#B4397F' },
}

const OBRAS = [
  {
    id: 'porta-del-barranc',
    programa: 'feder',
    nombre: 'Porta del Barranc',
    fichaUrl: 'https://www.ribarroja.es/files/ficha-porta-del-barranc.pdf',
    importeAdjudicacion: 668086.5,
    plazoMeses: 6,
    inicio: '2019-03-25',
    empresa: 'LICUAS, S.A.',
    bajaPct: 27.8,
  },
  {
    id: 'asfaltado-la-llobatera-ii',
    programa: 'renove',
    nombre: 'Asfaltado La Llobatera II',
    fichaUrl: 'https://www.ribarroja.es/files/ficha-asfaltado-la-llobatera-ii.pdf',
    fechaEjecucion: '2024-02-02',
    empresa: 'BECSA, S.A.U.',
    costePrevisto: 22998.47,
  },
]

const PIN_UNA_OBRA = { name: LUGAR.name, amount: 1_300_000, count: 1 }
const PIN_VARIAS_OBRAS = { name: 'Urbanització Masia de Traver', amount: 3_400_000, count: 3 }
const AGG_CON_QUEJAS = aggregateNeighborhood({
  neighborhood: BARRIO,
  zones: [],
  instantanea: QUEJAS_MEDIBLES,
})
const AGG_SIN_PADRON = aggregateNeighborhood({
  neighborhood: BARRIO_SIN_PADRON,
  zones: [],
  instantanea: QUEJAS_DE_OTRO_BARRIO,
})
const [FILA_MEDIBLE] = computePerNeighborhood(QUEJAS_MEDIBLES, [BARRIO])
const [FILA_SIN_REGISTRO] = computePerNeighborhood(QUEJAS_SIN_REGISTRO, [BARRIO])

// ─── Escenarios ────────────────────────────────────────────────────────────────

const escenarioBarrio = (nombre, { neighborhood, zones, quejas }) => {
  const agg = aggregateNeighborhood({ neighborhood, zones, instantanea: quejas })
  const rotulo = prettyNeighborhood(neighborhood.name)
  return {
    nombre,
    cubre: [NeighborhoodPopup],
    datos: [rotulo],
    pinta: () => <NeighborhoodPopup agg={agg} />,
    listo: (c) => c.textContent.includes(rotulo),
  }
}

/** Los globos, los rótulos flotantes y la tarjeta de contrato. */
const GLOBOS = [
  escenarioBarrio('barrio con obras, DANA y quejas medibles', {
    neighborhood: BARRIO,
    zones: [ZONA_CON_OBRAS],
    quejas: QUEJAS_MEDIBLES,
  }),
  escenarioBarrio('barrio sin obras ni registro', {
    neighborhood: BARRIO,
    zones: [],
    quejas: QUEJAS_SIN_REGISTRO,
  }),
  escenarioBarrio('barrio sin quejas ni padrón', {
    neighborhood: BARRIO_SIN_PADRON,
    zones: [],
    quejas: QUEJAS_DE_OTRO_BARRIO,
  }),
  {
    nombre: 'lugar con dos contratos, un lote y DANA',
    cubre: [PlacePopup, ContractCard],
    datos: [
      LUGAR.name,
      CONTRATO_OBRA.title,
      CONTRATO_OBRA.assignee,
      CONTRATO_LOTE.title,
      CONTRATO_LOTE.assignee,
      ASIGNACIONES[1].parentTitle,
    ],
    siglas: ['DANA'],
    pinta: () => (
      <PlacePopup
        place={LUGAR}
        assignments={ASIGNACIONES}
        contractsById={
          new Map([CONTRATO_OBRA, CONTRATO_LOTE].map((contrato) => [contrato.id, contrato]))
        }
        danaOnly={false}
        obrasOnly={false}
        cpvDict={undefined}
      />
    ),
    listo: (c) => c.textContent.includes(CONTRATO_LOTE.assignee),
  },
  {
    nombre: 'la tarjeta de contrato de /presupuesto: sin fecha, situada y con quejas',
    cubre: [ContractCard],
    datos: [
      CONTRATO_ZONA.title,
      CONTRATO_ZONA.assignee,
      PROCEDENCIA,
      QUEJA_RELACIONADA.relationLabel,
      QUEJA_RELACIONADA.description,
    ],
    siglas: ['DANA'],
    pinta: () => (
      <ContractCard
        contract={CONTRATO_ZONA}
        amount={26000}
        amountKind="initial"
        dana
        provenance={PROCEDENCIA}
        relatedQuejas={[QUEJA_RELACIONADA]}
      />
    ),
    listo: (c) => c.textContent.includes(QUEJA_RELACIONADA.description),
  },
  {
    nombre: 'incendio que la Generalitat atribuye a otro municipio',
    cubre: [IncendioPopup],
    datos: [
      INCENDIO_AJENO.paraje,
      INCENDIO_AJENO.municipio,
      INCENDIO_AJENO.id,
      FUENTE_INCENDIOS.atribucion,
    ],
    pinta: () => <IncendioPopup incendio={INCENDIO_AJENO} fuente={FUENTE_INCENDIOS} />,
    listo: (c) => c.textContent.includes(INCENDIO_AJENO.municipio),
  },
  {
    nombre: 'incendio propio sin paraje, fecha ni causa',
    cubre: [IncendioPopup],
    datos: [INCENDIO_PROPIO_SIN_DATOS.id],
    pinta: () => <IncendioPopup incendio={INCENDIO_PROPIO_SIN_DATOS} />,
    listo: (c) => c.textContent.includes(INCENDIO_PROPIO_SIN_DATOS.id),
  },
  {
    nombre: 'el globo de una estación de la red completa',
    cubre: [NetworkStationPopup],
    datos: [ESTACION_RED.name, ...ESTACION_RED.refs],
    siglas: ['metrovalencia.es'],
    pinta: () => <NetworkStationPopup {...ESTACION_RED} />,
    listo: (c) => c.textContent.includes(ESTACION_RED.name),
  },
  {
    nombre: 'dos obras de las fichas municipales, una FEDER y una RENOVE',
    cubre: [ObraPopup],
    datos: [...OBRAS.flatMap((o) => [o.nombre, o.empresa]), ...Object.values(PROGRAMA_LABEL)],
    pinta: () => <ObraPopup obras={OBRAS} />,
    listo: (c) => c.textContent.includes(OBRAS[1].nombre),
  },
  {
    nombre: 'los rótulos flotantes de las capas',
    cubre: [PinDineroTooltip, BarrioTooltip, IncendioTooltip, QuejasTooltip],
    datos: [
      PIN_UNA_OBRA.name,
      PIN_VARIAS_OBRAS.name,
      prettyNeighborhood(BARRIO.name),
      prettyNeighborhood(BARRIO_SIN_PADRON.name),
      INCENDIO_AJENO.paraje,
    ],
    pinta: () => (
      <>
        <PinDineroTooltip lugar={PIN_UNA_OBRA} />
        <PinDineroTooltip lugar={PIN_VARIAS_OBRAS} />
        <BarrioTooltip agg={AGG_CON_QUEJAS} />
        <BarrioTooltip agg={AGG_SIN_PADRON} />
        <IncendioTooltip incendio={INCENDIO_AJENO} />
        <IncendioTooltip incendio={INCENDIO_PROPIO_SIN_DATOS} />
        <QuejasTooltip fila={FILA_MEDIBLE} />
        <QuejasTooltip fila={FILA_SIN_REGISTRO} />
      </>
    ),
    listo: (c) => c.textContent.includes(PIN_VARIAS_OBRAS.name),
  },
]

const ESCENARIOS = [...GLOBOS]

/**
 * Pinta un escenario en un idioma y devuelve lo que se lee, cuando ya no se mueve.
 *
 * Tres condiciones antes de leer: los datos del escenario han llegado al almacén,
 * el componente ha pintado su rama, y dos lecturas seguidas coinciden.
 */
async function pintaYLee(escenario, idioma) {
  localStorage.setItem('cp:lang', idioma)
  if (escenario.fetch) installFetchMock(escenario.fetch)
  const { container, unmount } = render(<LocaleProvider>{escenario.pinta()}</LocaleProvider>)
  const rutas = Object.keys(escenario.fetch ?? {})
  let previa = null
  await waitFor(() => {
    const sinLlegar = rutas.filter((r) => peekSnapshot(r)?.status !== 'ready')
    expect(sinLlegar, `${escenario.nombre} (${idioma}): datos sin llegar`).toEqual([])
    expect(
      escenario.listo(container, idioma),
      `${escenario.nombre} (${idioma}): no ha pintado su rama`,
    ).toBe(true)
    const ahora = lectura(container)
    const quieta = previa !== null && JSON.stringify(ahora) === JSON.stringify(previa)
    previa = ahora
    expect(quieta, `${escenario.nombre} (${idioma}): la lectura todavía se mueve`).toBe(true)
  })
  unmount()
  return previa
}

afterEach(() => localStorage.clear())

describe('el mapa de la portada en valencià: nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)('$nombre', async (escenario) => {
    const es = await pintaYLee(escenario, 'es')
    const ca = await pintaYLee(escenario, 'ca')
    expect(es.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)

    const noSeTraduce = [...escenario.datos, ...(escenario.siglas ?? [])]
    const { sinTraducir } = detectorDeCastellano(masLargasPrimero([...noSeTraduce, ...UNIDADES]))
    // Sin las unidades: ninguna es una palabra castellana, y quitar «ha» como
    // subcadena cegaría a este detector ante «hace», «hasta» o «hablan».
    const { castellanoEn } = detectorDeCastellano(masLargasPrimero(noSeTraduce))

    expect
      .soft(
        ca.length,
        `no se pintan las mismas piezas\n  es ${JSON.stringify(es)}\n  ca ${JSON.stringify(ca)}`,
      )
      .toBe(es.length)
    expect
      .soft(sinTraducir(es.map((s, i) => [s, ca[i]])), 'se lee igual en castellano y en valencià')
      .toEqual([])
    expect
      .soft([...new Set(ca.flatMap((s) => castellanoEn(s)))], 'castellano dentro del valencià')
      .toEqual([])
  })
})

describe('la comparación, probada', () => {
  it('caza un rótulo sin traducir y deja pasar un dato, las unidades y un nombre que el catálogo escribe igual', () => {
    const igual = [...IGUALES_EN_EL_CATALOGO].find((v) => /^\p{Lu}\p{Ll}{3,}$/u.test(v))
    expect(igual, 'el catálogo no tiene ningún nombre que se escriba igual').toBeTruthy()
    const dato = prettyNeighborhood(BARRIO.name)
    const { sinTraducir } = detectorDeCastellano(masLargasPrimero([dato, ...UNIDADES]))
    expect(
      sinTraducir([
        ['Inversión situada', 'Inversión situada'],
        [dato, dato],
        ['2,4 M€', '2,4 M€'],
        ['1.200 hab.', '1.200 hab.'],
        ['ha', 'ha'],
        [igual, igual],
      ]),
    ).toEqual(['Inversión situada'])
  })

  it('y castellanoEn ve una palabra castellana pegada a una traducción', () => {
    const { castellanoEn } = detectorDeCastellano([])
    expect(castellanoEn('sense quejas de veïns')).toEqual(['quejas'])
  })
})

/**
 * Cobertura: todo componente exportado de las carpetas vigiladas tiene su
 * escenario.
 *
 * Un globo nuevo nace sin leer en valencià, y nadie lo notaría. El glob los
 * encuentra solos y exige que algún escenario declare cubrirlo.
 */
const MODULOS = import.meta.glob(['../../src/components/LiveCity/popups/*.jsx'], { eager: true })
/** Los dos globos de estación ya se leen en valencià en `globo-estacion.test.jsx`. */
const LEIDOS_EN_OTRA_PRUEBA = new Set([
  'StationSchedulePopup.jsx#StationSchedulePopup',
  'GtfsSchedulePopup.jsx#GtfsSchedulePopup',
])

describe('cobertura de la guarda', () => {
  it('ningún componente exportado de las carpetas vigiladas se queda sin escenario', () => {
    const componentes = Object.entries(MODULOS).flatMap(([ruta, modulo]) =>
      Object.entries(modulo)
        .filter(([nombre, valor]) => typeof valor === 'function' && /^[A-Z]/.test(nombre))
        .map(([nombre, valor]) => ({ id: `${ruta.split('/').pop()}#${nombre}`, valor })),
    )
    // Mide algo: un patrón mal escrito devuelve un objeto vacío, no un error.
    expect(componentes.length).toBeGreaterThan(LEIDOS_EN_OTRA_PRUEBA.size)
    const exentosQueNoExisten = [...LEIDOS_EN_OTRA_PRUEBA].filter(
      (id) => !componentes.some((c) => c.id === id),
    )
    expect(exentosQueNoExisten, 'una exención apunta a algo que ya no existe').toEqual([])

    const cubiertos = new Set(ESCENARIOS.flatMap((e) => e.cubre))
    const sinEscenario = componentes
      .filter(({ id, valor }) => !cubiertos.has(valor) && !LEIDOS_EN_OTRA_PRUEBA.has(id))
      .map(({ id }) => id)
    expect(sinEscenario).toEqual([])
  })
})
