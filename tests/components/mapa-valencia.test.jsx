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
import { porAnyo } from '../../src/lib/incendios'
import { POI_CATEGORIES } from '../../src/lib/civic-poi'
import { NeighborhoodPopup } from '../../src/components/LiveCity/popups/NeighborhoodPopup'
import { PlacePopup } from '../../src/components/LiveCity/popups/PlacePopup'
import { IncendioPopup } from '../../src/components/LiveCity/popups/IncendioPopup'
import { NetworkStationPopup } from '../../src/components/LiveCity/popups/NetworkStationPopup'
import { ObraPopup, PROGRAMA_LABEL } from '../../src/components/LiveCity/popups/ObraPopup'
import {
  BarrioTooltip,
  IncendioTooltip,
  PinDineroTooltip,
  PoiTooltip,
  QuejasTooltip,
} from '../../src/components/LiveCity/popups/Tooltips'
import { MoneyTimeSlider } from '../../src/components/LiveCity/controls/MoneyTimeSlider'
import { MoneyCoverage } from '../../src/components/LiveCity/controls/MoneyCoverage'
import { FloodLegend } from '../../src/components/LiveCity/controls/FloodLegend'
import { IncendiosYearSlider } from '../../src/components/LiveCity/controls/IncendiosYearSlider'
import { IncendiosLegend } from '../../src/components/LiveCity/controls/IncendiosLegend'
import { IncendiosCobertura } from '../../src/components/LiveCity/controls/IncendiosCobertura'
import { PoiLegend } from '../../src/components/LiveCity/controls/PoiLegend'
import { QuejasLegend } from '../../src/components/LiveCity/controls/QuejasLegend'
import { LayerControl, MAP_LAYERS } from '../../src/components/LiveCity/controls/LayerControl'
import { ContractCard } from '../../src/components/tenders/ContractCard'
import { EventTicker } from '../../src/variants/direction-d/MapOverlays'
import { installFetchMock } from '../setup/mockFetch'
import {
  detectorDeCastellano,
  IGUALES_EN_EL_CATALOGO,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'

/**
 * La unidad del dinero compacto, leída del ICU de ESTE runtime y no escrita a mano.
 * El Node 20.12 del portátil (CLDR 44) escribe «2 M€», y el Node 20.20 de la CI
 * (CLDR 48), «2 M €», con un espacio duro antes del euro. Escrita «M€», la guarda
 * pasaba en el portátil y en la CI leía cada cifra en millones como castellano. Las
 * opciones son las de los tres formateadores del mapa, que escriben las cifras en
 * es-ES en los dos idiomas.
 */
const DINERO_COMPACTO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 1,
  notation: 'compact',
})
const UNIDAD_MILLONES = DINERO_COMPACTO.format(2_000_000)
  .replace(/^[\d.,\s]+/u, '')
  .trim()

/** Unidades: se escriben igual en los dos idiomas porque no son lengua. */
const UNIDADES = [UNIDAD_MILLONES, 'ha', 'hab.']

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
/**
 * `relationLabel` NO es un dato: es un valor del enum de
 * `queja-contract-relations.ts`, y su pastilla se lee en el idioma de la interfaz
 * como el resto de la tarjeta. Hasta #38 se pasaba aquí como dato, y la tarjeta
 * decía «misma zona» también en la portada valenciana.
 */
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
const EQUIPAMIENTO = {
  id: 'poi-escola',
  name: 'CEIP La Reva',
  category: 'educacion',
  lat: 39.5,
  lng: -0.5,
}
/** Una categoría fuera del enum se enseña tal cual llega: es un dato, no un rótulo. */
const EQUIPAMIENTO_SIN_CATEGORIA = {
  id: 'poi-punt-net',
  name: 'Ecoparc de Riba-roja',
  category: 'reciclaje',
  lat: 39.5,
  lng: -0.5,
}

// Leyendas y deslizadores.
const noHaceNada = () => {}
const UNIVERSO_DINERO = {
  locatedAmount: 2_200_000,
  totalAmount: 124_000_000,
  locatedContracts: 47,
  totalContracts: 696,
  dateMin: '2017-01-01',
  dateMax: '2026-06-30',
}
const AVISO_ICV = 'No están cartografiados todos los incendios forestales del periodo'
const ESTE_ANYO = new Date().getFullYear()
const incendioDeLaSerie = (over) => ({ ...INCENDIO_PROPIO_SIN_DATOS, intersecta: true, ...over })
const INCENDIOS_CON_CAUSAS = [
  incendioDeLaSerie({ id: 'serie-a', anyo: 2012, causa: 'intencionado' }),
  incendioDeLaSerie({ id: 'serie-b', anyo: 2015, causa: 'rayo' }),
  incendioDeLaSerie({ id: 'serie-c', anyo: 2019, causa: 'sinClasificar' }),
]
const snapIncendios = (universe) => ({
  generatedAt: '2026-09-01T00:00:00.000Z',
  fuente: FUENTE_INCENDIOS,
  universe: { aviso: AVISO_ICV, ...universe },
  incendios: INCENDIOS_CON_CAUSAS,
})
const TENDER_GEO_SIN_PUNTOS = {
  generatedAt: null,
  universe: null,
  zones: [],
  places: [],
  assignments: [],
}
const CONTRATOS_DE_INCENDIOS = {
  contracts: [
    { id: 'inc-1', title: 'Servicio de prevención de incendios forestales en el término' },
    { id: 'inc-2', title: 'Desbroce de caminos y cortafuegos del monte municipal' },
  ],
}

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
    cubre: [PinDineroTooltip, BarrioTooltip, IncendioTooltip, QuejasTooltip, PoiTooltip],
    datos: [
      PIN_UNA_OBRA.name,
      PIN_VARIAS_OBRAS.name,
      prettyNeighborhood(BARRIO.name),
      prettyNeighborhood(BARRIO_SIN_PADRON.name),
      INCENDIO_AJENO.paraje,
      EQUIPAMIENTO.name,
      EQUIPAMIENTO_SIN_CATEGORIA.name,
      EQUIPAMIENTO_SIN_CATEGORIA.category,
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
        <PoiTooltip poi={EQUIPAMIENTO} />
        <PoiTooltip poi={EQUIPAMIENTO_SIN_CATEGORIA} />
      </>
    ),
    listo: (c) => c.textContent.includes(PIN_VARIAS_OBRAS.name),
  },
]

/** Las leyendas, los deslizadores y los chips que se apilan sobre el mapa. */
const LEYENDAS = [
  {
    nombre: 'el deslizador del dinero situado, desplegado y con su cobertura',
    cubre: [MoneyTimeSlider, MoneyCoverage],
    datos: [],
    siglas: ['DANA'],
    pinta: () => (
      <MoneyTimeSlider
        snapshot={{ universe: UNIVERSO_DINERO }}
        min={Date.parse('2018-01-01')}
        max={Date.parse('2025-12-31')}
        value={Date.parse('2024-06-15')}
        onChange={noHaceNada}
        danaOnly={false}
        onToggleDana={noHaceNada}
        obrasOnly={false}
        onToggleObras={noHaceNada}
        plegada={false}
        onPlegar={noHaceNada}
      />
    ),
    listo: (c) => !!c.querySelector('input[type=range]') && c.textContent.includes(UNIDAD_MILLONES),
  },
  {
    nombre: 'la leyenda de inundación, cargando y cuando el servicio falla',
    cubre: [FloodLegend],
    datos: [],
    siglas: ['PATRICOVA', 'Generalitat Valenciana', 'ICV'],
    pinta: () => (
      <>
        <FloodLegend estado="cargando" />
        <FloodLegend estado="error" />
      </>
    ),
    listo: (c) => c.textContent.includes('PATRICOVA'),
  },
  {
    nombre: 'serie de incendios: un año con incendio, dos fuera del término y contratos sin situar',
    cubre: [IncendiosYearSlider, IncendiosLegend, IncendiosCobertura],
    datos: [AVISO_ICV],
    siglas: ['ICV'],
    fetch: {
      '/data/incendios.json': snapIncendios({
        dibujados: 90,
        anyoMin: 1993,
        anyoMax: 2024,
        superficieHaTotal: 214.87,
        atribuidosSinPerimetroAqui: 2,
        superficieHaSinPerimetroAqui: 150,
      }),
      '/data/tenders.json': CONTRATOS_DE_INCENDIOS,
      '/data/tender-geo.json': TENDER_GEO_SIN_PUNTOS,
    },
    pinta: () => (
      <IncendiosYearSlider
        anyoMin={1993}
        anyoMax={2024}
        value={2012}
        onChange={noHaceNada}
        serie={porAnyo(INCENDIOS_CON_CAUSAS, 1993, 2024)}
      />
    ),
    listo: (c) =>
      c.textContent.includes(AVISO_ICV) &&
      c.textContent.includes(String(CONTRATOS_DE_INCENDIOS.contracts.length)),
  },
  {
    nombre:
      'serie de incendios: un año vacío, uno fuera del término y la cartografía de hace meses',
    cubre: [IncendiosYearSlider, IncendiosLegend, IncendiosCobertura],
    datos: [AVISO_ICV],
    siglas: ['ICV'],
    fetch: {
      '/data/incendios.json': snapIncendios({
        dibujados: 3,
        anyoMin: 2000,
        anyoMax: ESTE_ANYO - 1,
        superficieHaTotal: 9,
        atribuidosSinPerimetroAqui: 1,
        superficieHaSinPerimetroAqui: 40,
      }),
      '/data/tenders.json': { contracts: [] },
      '/data/tender-geo.json': TENDER_GEO_SIN_PUNTOS,
    },
    pinta: () => (
      <IncendiosYearSlider
        anyoMin={2000}
        anyoMax={ESTE_ANYO - 1}
        value={2001}
        onChange={noHaceNada}
        serie={porAnyo(INCENDIOS_CON_CAUSAS, 2000, ESTE_ANYO - 1)}
      />
    ),
    listo: (c) => c.textContent.includes(AVISO_ICV) && c.textContent.includes('2001'),
  },
  {
    nombre: 'la leyenda de servicios públicos, con una de cada categoría',
    cubre: [PoiLegend],
    datos: [],
    siglas: ['OpenStreetMap'],
    fetch: {
      '/data/civic-poi.json': {
        generatedAt: '2026-09-01T00:00:00.000Z',
        source: 'OpenStreetMap',
        pois: Object.keys(POI_CATEGORIES).map((category, i) => ({
          id: `poi-${i}`,
          name: `Equipamiento ${i}`,
          category,
          lat: 39.5,
          lng: -0.5,
        })),
      },
    },
    pinta: () => <PoiLegend />,
    listo: (c) => c.textContent.includes('OpenStreetMap'),
  },
  {
    nombre: 'la leyenda de quejas, con la escala que pinta la capa',
    cubre: [QuejasLegend],
    datos: [],
    fetch: {
      '/data/geo.json': { neighborhoods: [BARRIO] },
      '/data/quejas.json': QUEJAS_MEDIBLES,
    },
    pinta: () => <QuejasLegend />,
    listo: (c) => new RegExp(`\\b${QUEJAS_MEDIBLES.items.length}\\b`).test(c.textContent),
  },
  {
    nombre: 'los chips de capas',
    cubre: [LayerControl],
    datos: [],
    pinta: () => (
      <LayerControl
        layers={{ money: true, poi: false, quejas: false, flood: false, incendios: false }}
        onToggle={noHaceNada}
      />
    ),
    listo: (c) => c.querySelectorAll('[data-capa]').length === MAP_LAYERS.length,
  },
]

// ─── Lo que flota sobre el mapa ────────────────────────────────────────────────

const DIA = 24 * 60 * 60 * 1000
/** El mismo cálculo que `useTodayEvents`: el día UTC de ahora y el de dentro de 24 h. */
const HOY = new Date().toISOString().slice(0, 10)
const MANANA = new Date(Date.now() + DIA).toISOString().slice(0, 10)
const aviso = (id, kind, dia, title) => ({
  id,
  slug: `aviso-${id}`,
  title,
  link: `https://participa.ribarroja.es/aviso-${id}/`,
  date: `${dia}T18:00:00`,
  kind,
})
const snapParticipa = (items) => ({
  generatedAt: '2026-09-01T00:00:00.000Z',
  source: 'participa.ribarroja.es',
  stats: { total: items.length },
  items,
})
const AVISOS_CON_CLASE = [
  aviso(1, 'activity', HOY, 'Taller de huertos urbanos'),
  aviso(2, 'survey', MANANA, 'Encuesta de movilidad al polígono'),
]
/** `other` tiene rótulo propio; una clase que el mapa no conoce cae en la genérica. */
const AVISOS_SIN_CLASE = [
  aviso(3, 'other', HOY, 'Corte de agua en el casco antiguo'),
  aviso(4, 'boletin', MANANA, 'Boletín de participación de septiembre'),
]

/** Los avisos de hoy y de mañana de participa.ribarroja.es, sobre el mapa. */
const AVISOS = [
  {
    nombre: 'los avisos de hoy y de mañana: una actividad y una encuesta',
    cubre: [EventTicker],
    datos: AVISOS_CON_CLASE.flatMap((a) => [a.title, a.date]),
    fetch: { '/data/participa.json': snapParticipa(AVISOS_CON_CLASE) },
    pinta: () => <EventTicker />,
    listo: (c) => c.textContent.includes(AVISOS_CON_CLASE[1].title),
  },
  {
    nombre: 'un aviso a secas y uno de una clase que el mapa no conoce',
    cubre: [EventTicker],
    datos: AVISOS_SIN_CLASE.flatMap((a) => [a.title, a.date]),
    fetch: { '/data/participa.json': snapParticipa(AVISOS_SIN_CLASE) },
    pinta: () => <EventTicker />,
    listo: (c) => c.textContent.includes(AVISOS_SIN_CLASE[1].title),
  },
]

const ESCENARIOS = [...GLOBOS, ...LEYENDAS, ...AVISOS]

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
        [DINERO_COMPACTO.format(2_400_000), DINERO_COMPACTO.format(2_400_000)],
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
 * Un globo o una leyenda nuevos nacen sin leer en valencià, y nadie lo notaría. El
 * glob los encuentra solos y exige que algún escenario declare cubrirlos.
 */
const MODULOS = import.meta.glob(
  ['../../src/components/LiveCity/popups/*.jsx', '../../src/components/LiveCity/controls/*.jsx'],
  { eager: true },
)
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
    expect(
      componentes.some((c) => c.id.startsWith('FloodLegend.jsx#')),
      'el glob no ve las leyendas',
    ).toBe(true)
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
