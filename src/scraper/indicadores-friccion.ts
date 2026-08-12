/**
 * Indicadores municipales: fricción institucional y salud fiscal.
 *
 * La cuarta dimensión del panel no es «satisfacción ciudadana» —para eso haría
 * falta una encuesta representativa que no existe, y derivarla del buzón de
 * quejas, que es autoseleccionado, sería justo el tipo de número que las reglas
 * de este proyecto existen para impedir—. Es la **X-ineficiencia** de
 * Leibenstein: el desperdicio que nace de la falta de competencia, de la
 * rigidez del procedimiento y del control interno débil.
 *
 * Y resulta que eso sí se puede medir aquí, sin una sola fuente nueva: los
 * contratos, la ejecución presupuestaria y los informes de la Sindicatura ya
 * están descargados y versionados.
 *
 * ESTOS INDICADORES NO SON COSTES UNITARIOS y por eso no comparten tipo con
 * ellos. Un porcentaje de licitadores únicos no tiene numerador en euros ni
 * denominador físico ni modo de gestión; forzarlo dentro de `Indicador`
 * obligaría a rellenar media docena de campos con valores sin sentido. Lo que
 * sí comparten es `Magnitud`, para que las dos mitades de la página se
 * comprueben igual.
 *
 * Módulo puro: recibe los snapshots ya leídos, no toca red ni disco.
 */
import type { Magnitud } from './indicadores'

/**
 * Estados en los que un contrato ya está adjudicado.
 *
 * `formalized` es la mitad del universo (314 de 699 en la instantánea con la
 * que se escribió esto). Filtrar sólo por `awarded` daba un 58,4 % de licitador
 * único en vez del 47,5 % real — el mismo desliz `finalized`/`formalized` que
 * borró 53,5 M€ del sitio y que abre el modo de fallo 1 de DATA_INTEGRITY.
 */
export const ESTADOS_ADJUDICADOS = ['awarded', 'formalized'] as const

/**
 * Procedimientos que se resuelven SIN llamada abierta.
 *
 * `restricted` y `based_on_agreement` no entran: son derivados de un acuerdo
 * marco o de un SDA cuya licitación sí se publicó en su momento.
 */
export const PROCESOS_SIN_PUBLICIDAD = ['minor_contract', 'negotiated_without_publicity'] as const

/** Cuando una sola adjudicación pasa de esto, la concentración habla de ella. */
export const ADJUDICACION_DOMINANTE = 0.25

export type DimensionMunicipal = 'respuesta' | 'fiscal' | 'friccion'
export type FormatoValor = 'porcentaje' | 'euros' | 'numero' | 'dias'

export interface IndicadorMunicipal {
  id: string
  dimension: DimensionMunicipal
  etiqueta: string
  /** Qué mide, en una frase: la cifra no puede depender de su titular. */
  descripcion: string
  numerador: Magnitud
  denominador: Magnitud
  /** El cociente. `null` salvo que las dos magnitudes estén declaradas. */
  valor: number | null
  formato: FormatoValor
  /** El periodo que cubre. Nunca implícito: los contratos abarcan años. */
  periodo: string
  /** Umbral legal o de referencia, cuando la norma fija uno (PMP: 30 días). */
  referencia?: { valor: number; etiqueta: string; fuente: string }
  /** Serie propia, cuando la fuente la publica. Sin puntos inventados. */
  serie?: { periodo: string; valor: number }[]
  /** Reparto de pares, cuando existe una fuente que lo respalde. */
  pares?: {
    conjunto: string
    n: number
    percentil: number
    p25: number
    mediana: number
    p75: number
  }
  caveats: string[]
  citas: { url: string; etiqueta: string }[]
}

interface ContratoLike {
  status?: string
  processType?: string
  assignee?: string
  awardDate?: string | null
  startDate?: string | null
  numberOfProposals?: number | null
  initialAmount?: number
  initialAmountNoTaxes?: number
  finalAmount?: number
  finalAmountNoTaxes?: number
  title?: string
}

const declarado = (valor: number, fuente: string): Magnitud => ({
  valor,
  estado: 'declarado',
  fuente,
})
const ausente = (fuente: string): Magnitud => ({
  valor: null,
  estado: 'no-declarado',
  motivo: 'ausente',
  fuente,
})

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Importe adjudicado real, neutralizando el artefacto de PLACSP.
 *
 * Una fila «100 € con −99 % de baja» es una puntuación de 0 a 100 metida en el
 * campo de importe, no un precio. Reproduce la firma de
 * `src/lib/tenders.js:isScoreArtifactAmount` sobre el tipo local para que este
 * módulo siga siendo puro y sin dependencias del front.
 */
export function importeAdjudicado(c: ContratoLike): number {
  const fin = num(c.finalAmount)
  const finNo = num(c.finalAmountNoTaxes)
  const iniNo = num(c.initialAmountNoTaxes)
  const artefacto =
    fin > 0 &&
    finNo > 0 &&
    iniNo > 0 &&
    fin === finNo &&
    num(c.initialAmount) > iniNo &&
    finNo <= iniNo * 0.1
  if (artefacto) return 0
  return finNo || fin || 0
}

function periodoDe(contratos: ContratoLike[]): string {
  const fechas = contratos
    .map((c) => c.awardDate || c.startDate)
    .filter((d): d is string => Boolean(d))
    .sort()
  if (!fechas.length) return 'periodo sin declarar'
  return `${fechas[0].slice(0, 4)}–${fechas[fechas.length - 1].slice(0, 4)}`
}

export interface FriccionInput {
  tenders: { contracts?: ContratoLike[]; source?: { platform?: string; host?: string } }
  budgetExecution: {
    latest?: {
      year?: number
      fechaListado?: string
      gastos?: {
        total?: { inicial?: number; modificaciones?: number; actual?: number; ejecutado?: number }
      }
    }
    source?: string
  }
  /** public/data/pmp.json — opcional: el panel se dibuja igual sin él. */
  pmp?: {
    plazoLegalDias?: number
    source?: { serie?: string; norma?: string }
    ultimo?: {
      periodo?: string
      dias?: number
      percentil?: number | null
      distribucion?: { n: number; p25: number; mediana: number; p75: number } | null
    }
    serie?: { periodo: string; dias: number }[]
  }
}

const CITA_CONTRATOS = {
  url: 'https://ribalicita.ribarroja.es',
  etiqueta: 'Perfil de contratante (Gobierto)',
}

export function construirIndicadoresMunicipales(input: FriccionInput): IndicadorMunicipal[] {
  const out: IndicadorMunicipal[] = []
  const todos = input.tenders?.contracts ?? []
  const adjudicados = todos.filter((c) =>
    (ESTADOS_ADJUDICADOS as readonly string[]).includes(c.status ?? ''),
  )
  const periodo = periodoDe(adjudicados)

  // ── 0. Plazo de pago. El único indicador del panel con umbral LEGAL, serie y
  //       pares de verdad: no hace falta que nadie opine si la cifra es alta.
  const pmp = input.pmp
  const ultimo = pmp?.ultimo
  if (pmp && ultimo && typeof ultimo.dias === 'number' && ultimo.periodo) {
    const limite = pmp.plazoLegalDias ?? 30
    const dist = ultimo.distribucion ?? undefined
    out.push({
      id: 'periodo-medio-pago',
      dimension: 'respuesta',
      etiqueta: 'Periodo medio de pago a proveedores',
      descripcion:
        'Días que tarda el ayuntamiento en pagar a sus proveedores, calculado por el Ministerio de Hacienda con la metodología del RD 1040/2017.',
      numerador: declarado(ultimo.dias, `pmp:${ultimo.periodo}:dias`),
      // El denominador de un plazo es el propio plazo: la magnitud ya viene en
      // días. Se declara igualmente para que la comprobación sea uniforme.
      denominador: declarado(1, `pmp:${ultimo.periodo}:unidad`),
      valor: ultimo.dias,
      formato: 'dias',
      periodo: ultimo.periodo,
      referencia: {
        valor: limite,
        etiqueta: `${limite} días, plazo legal`,
        fuente: pmp.source?.norma ?? 'https://www.boe.es/buscar/act.php?id=BOE-A-2017-15446',
      },
      serie: (pmp.serie ?? []).map((p) => ({ periodo: p.periodo, valor: p.dias })),
      pares:
        dist && typeof ultimo.percentil === 'number'
          ? {
              conjunto: 'municipios que publican PMP con la misma norma',
              n: dist.n,
              percentil: ultimo.percentil,
              p25: dist.p25,
              mediana: dist.mediana,
              p75: dist.p75,
            }
          : undefined,
      caveats: [
        'Riba-roja reporta por trimestres, no por meses: es lo que corresponde a los municipios fuera del modelo de cesión.',
        'El plazo legal de 30 días es una referencia de la norma, no una sanción automática. Superarlo obliga a la entidad a publicar un plan de tesorería.',
      ],
      citas: [
        {
          url:
            pmp.source?.serie ?? 'https://www.hacienda.gob.es/cdi/pmp/pmp-series-rd-1040-2017.xlsx',
          etiqueta: 'Ministerio de Hacienda · series PMP',
        },
      ],
    })
  }

  // ── 1. Competencia: ¿cuántos contratos se resolvieron con un solo licitador?
  const conOfertas = adjudicados.filter(
    (c) => typeof c.numberOfProposals === 'number' && c.numberOfProposals > 0,
  )
  const unico = conOfertas.filter((c) => c.numberOfProposals === 1)
  const sinDeclarar = adjudicados.length - conOfertas.length
  out.push({
    id: 'licitador-unico',
    dimension: 'friccion',
    etiqueta: 'Contratos con un solo licitador',
    descripcion:
      'De los contratos adjudicados que declaran cuántas ofertas recibieron, cuántos recibieron exactamente una.',
    numerador: conOfertas.length
      ? declarado(unico.length, 'tenders:adjudicados:numberOfProposals=1')
      : ausente('tenders:adjudicados:numberOfProposals=1'),
    denominador: conOfertas.length
      ? declarado(conOfertas.length, 'tenders:adjudicados:conOfertasDeclaradas')
      : ausente('tenders:adjudicados:conOfertasDeclaradas'),
    valor: conOfertas.length ? unico.length / conOfertas.length : null,
    formato: 'porcentaje',
    periodo,
    caveats: [
      'Un licitador único no es irregular por sí mismo: hay mercados con un solo proveedor capaz. Es el indicador que la Comisión Europea usa para vigilar la competencia en compra pública, y lo que mide es cuánta de ella hubo.',
      ...(sinDeclarar > 0
        ? [
            `${sinDeclarar} contratos adjudicados no declaran número de ofertas y quedan fuera del cálculo.`,
          ]
        : []),
    ],
    citas: [CITA_CONTRATOS],
  })

  // ── 2. Rigidez / publicidad: ¿cuánto se adjudica sin llamada abierta?
  const sinPublicidad = adjudicados.filter((c) =>
    (PROCESOS_SIN_PUBLICIDAD as readonly string[]).includes(c.processType ?? ''),
  )
  out.push({
    id: 'sin-publicidad-abierta',
    dimension: 'friccion',
    etiqueta: 'Adjudicado sin llamada abierta',
    descripcion:
      'Contratos menores y negociados sin publicidad, sobre el total de adjudicados. Los derivados de un acuerdo marco o de un SDA no cuentan: su licitación sí se publicó.',
    numerador: adjudicados.length
      ? declarado(sinPublicidad.length, 'tenders:adjudicados:sinPublicidad')
      : ausente('tenders:adjudicados:sinPublicidad'),
    denominador: adjudicados.length
      ? declarado(adjudicados.length, 'tenders:adjudicados')
      : ausente('tenders:adjudicados'),
    valor: adjudicados.length ? sinPublicidad.length / adjudicados.length : null,
    formato: 'porcentaje',
    periodo,
    caveats: [
      'El contrato menor es un instrumento legal por debajo de los umbrales de la Ley 9/2017. Esto no mide irregularidad: mide qué parte de la contratación se resuelve sin concurrencia abierta.',
    ],
    citas: [CITA_CONTRATOS],
  })

  // ── 3. Concentración de proveedores
  const porProveedor = new Map<string, number>()
  let importeTotal = 0
  let mayorAdjudicacion: { importe: number; assignee: string; title: string } | null = null
  for (const c of adjudicados) {
    const v = importeAdjudicado(c)
    if (v <= 0) continue
    const k = (c.assignee || '(sin adjudicatario declarado)').trim()
    porProveedor.set(k, (porProveedor.get(k) ?? 0) + v)
    importeTotal += v
    if (!mayorAdjudicacion || v > mayorAdjudicacion.importe) {
      mayorAdjudicacion = { importe: v, assignee: k, title: c.title ?? '' }
    }
  }
  const orden = [...porProveedor.values()].sort((a, b) => b - a)
  const top5 = orden.slice(0, 5).reduce((s, v) => s + v, 0)

  const caveatsConc = [
    'Suma importes de adjudicación de años distintos y de contratos de duración muy distinta, así que mide concentración del importe adjudicado en el periodo, no gasto anual.',
  ]
  // Regla mecánica, no juicio: si una sola adjudicación pesa más de un cuarto
  // del total, la concentración habla sobre todo de ella y hay que decirlo.
  if (mayorAdjudicacion && importeTotal > 0) {
    const peso = mayorAdjudicacion.importe / importeTotal
    if (peso >= ADJUDICACION_DOMINANTE) {
      caveatsConc.push(
        `Una sola adjudicación —${mayorAdjudicacion.assignee}— supone el ${Math.round(peso * 100)} % del importe del periodo. ` +
          `Las concesiones se adjudican por todo su plazo de una vez, así que su importe no es comparable con el de un contrato anual.`,
      )
    }
  }
  out.push({
    id: 'concentracion-proveedores',
    dimension: 'friccion',
    etiqueta: 'Importe en manos de los cinco mayores proveedores',
    descripcion:
      'Qué parte del importe adjudicado en el periodo se concentra en las cinco empresas que más recibieron.',
    numerador:
      importeTotal > 0
        ? declarado(top5, 'tenders:adjudicados:top5Importe')
        : ausente('tenders:adjudicados:top5Importe'),
    denominador:
      importeTotal > 0
        ? declarado(importeTotal, 'tenders:adjudicados:importeTotal')
        : ausente('tenders:adjudicados:importeTotal'),
    valor: importeTotal > 0 ? top5 / importeTotal : null,
    formato: 'porcentaje',
    periodo,
    caveats: caveatsConc,
    citas: [CITA_CONTRATOS],
  })

  // ── 4 y 5. Salud fiscal: planificación y ejecución del presupuesto
  const eje = input.budgetExecution?.latest
  const total = eje?.gastos?.total
  const anio = eje?.year ? String(eje.year) : 'sin declarar'
  const citaEje = {
    url: input.budgetExecution?.source ?? 'https://www.ribarroja.es',
    etiqueta: `Estado de ejecución ${anio}`,
  }
  const inicial = num(total?.inicial)
  const modificaciones = num(total?.modificaciones)
  const actual = num(total?.actual)
  const ejecutado = num(total?.ejecutado)

  out.push({
    id: 'modificaciones-presupuestarias',
    dimension: 'fiscal',
    etiqueta: 'Modificaciones sobre el presupuesto aprobado',
    descripcion:
      'Crédito añadido durante el ejercicio, sobre el crédito inicial que aprobó el pleno.',
    numerador:
      inicial > 0
        ? declarado(modificaciones, `budget-execution:${anio}:gastos.total.modificaciones`)
        : ausente(`budget-execution:${anio}:gastos.total.modificaciones`),
    denominador:
      inicial > 0
        ? declarado(inicial, `budget-execution:${anio}:gastos.total.inicial`)
        : ausente(`budget-execution:${anio}:gastos.total.inicial`),
    valor: inicial > 0 ? modificaciones / inicial : null,
    formato: 'porcentaje',
    periodo: eje?.fechaListado ? `${anio} (a ${eje.fechaListado})` : anio,
    caveats: [
      'Las modificaciones son legales y a veces inevitables —una subvención que llega a mitad de año hay que incorporarla—. Lo que mide es cuánto se aleja el presupuesto ejecutado del que se aprobó y se debatió.',
    ],
    citas: [citaEje],
  })

  out.push({
    id: 'ejecucion-presupuestaria',
    dimension: 'fiscal',
    etiqueta: 'Ejecución del presupuesto de gastos',
    descripcion: 'Gasto reconocido sobre el crédito definitivo, inicial más modificaciones.',
    numerador:
      actual > 0
        ? declarado(ejecutado, `budget-execution:${anio}:gastos.total.ejecutado`)
        : ausente(`budget-execution:${anio}:gastos.total.ejecutado`),
    denominador:
      actual > 0
        ? declarado(actual, `budget-execution:${anio}:gastos.total.actual`)
        : ausente(`budget-execution:${anio}:gastos.total.actual`),
    valor: actual > 0 ? ejecutado / actual : null,
    formato: 'porcentaje',
    periodo: eje?.fechaListado ? `${anio} (a ${eje.fechaListado})` : anio,
    caveats: [
      '«Ejecutado» son obligaciones reconocidas netas, la medida estándar de ejecución presupuestaria; no son pagos hechos.',
      'El denominador es el crédito DEFINITIVO, que incluye las modificaciones incorporadas a lo largo del ejercicio —algunas a final de año, cuando ya no da tiempo a gastarlas—. Buena parte de un porcentaje bajo es crédito inflado, no sólo gasto que no se hizo: el capítulo de inversiones reales partió de cero crédito inicial, incorporó 22,06 M€ por modificación y ejecutó el 4,7 %.',
      'Compararlo con la cifra de presupuesto que aparece en /presupuesto no funciona: aquella es el presupuesto aprobado según la publicación del ministerio y ésta es el crédito definitivo del propio listado municipal.',
    ],
    citas: [citaEje],
  })

  return out
}
