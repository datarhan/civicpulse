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
import { resolverCoste, resolverUnidad, type Magnitud } from './indicadores'
import type { CesteRow } from './coste-efectivo'
import { SERVICIOS } from './indicador-registry'
import { medirDeclaracionCongelada, MIN_ENTREGAS_CONGELADA } from './declaracion-congelada'

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

/**
 * En qué página vive cada indicador municipal, cortado por FUENTE.
 *
 * Los siete de gestión salen de las series PMP, de CONPREL, del perfil de
 * contratante y del estado de ejecución; `denominadores-sin-remedir` mide las
 * declaraciones del coste efectivo, es decir exactamente el mismo cuaderno del
 * que salen los diez cocientes de /eficiencia, y habla de ellos.
 *
 * Lo declara cada indicador al construirse y no una tabla central: quien monta
 * la cifra es el único que sabe de dónde la ha sacado, y una tabla de ids
 * escrita aparte se queda vieja la primera vez que alguien añada uno. Mismo
 * criterio que `pares.descripcion`.
 */
export const PANELES = ['coste-efectivo', 'gestion'] as const
export type Panel = (typeof PANELES)[number]

export interface IndicadorMunicipal {
  id: string
  /** Obligatorio a propósito: sin él, un indicador nuevo no compila. */
  panel: Panel
  dimension: DimensionMunicipal
  etiqueta: string
  /** Qué mide, en una frase: la cifra no puede depender de su titular. */
  descripcion: string
  numerador: Magnitud
  denominador: Magnitud
  /** El cociente. `null` salvo que las dos magnitudes estén declaradas. */
  valor: number | null
  formato: FormatoValor
  /**
   * Unidad del denominador cuando NO comparte la del numerador. Sin esto, la
   * línea «X de Y» del panel formatea las dos magnitudes con el `formato` de
   * la fila y la población salía como «24.616 €» — cazado por el
   * reader-review, no por ningún test de datos: la cifra era correcta y la
   * frase falsa.
   */
  denominadorUnidad?: string
  /** El periodo que cubre. Nunca implícito: los contratos abarcan años. */
  periodo: string
  /** Umbral legal o de referencia, cuando la norma fija uno (PMP: 30 días). */
  referencia?: { valor: number; etiqueta: string; fuente: string }
  /** Serie propia, cuando la fuente la publica. Sin puntos inventados. */
  serie?: { periodo: string; valor: number }[]
  /** Reparto de pares, cuando existe una fuente que lo respalde. */
  pares?: {
    conjunto: string
    /**
     * Contra quién se compara, en palabras que encajen tras «en N municipios».
     * La escribe el indicador que construye la banda: sólo él sabe qué tienen
     * en común esos municipios.
     */
    descripcion?: string
    n: number
    percentil: number
    p25: number
    mediana: number
    p75: number
    /**
     * El valor más alto del grupo comparado.
     *
     * Existe para poder decir «por encima de TODOS» sin adivinar. El percentil
     * no lo sostiene: se calcula con `Math.round`, que sube un 99,5 a 100, y
     * con `<=`, que cuenta a quien empate. Con el máximo delante la afirmación
     * es aritmética y comprobable por el lector; sin él era una lectura del
     * percentil que la fuente no respalda.
     */
    maximo?: number
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
  /** public/data/budget.json — con su banda de municipios comparables. */
  budget?: {
    snapshot?: { year?: number; population?: number; totalExpense?: number }
    pares?: {
      conjunto?: string
      anio?: number
      miembros?: { ine: string; nombre: string; poblacion: number; gastoPorHabitante: number }[]
    }
  }
  /**
   * public/data/coste-efectivo.json — opcional.
   *
   * Sin él, el indicador de denominadores sin remedir NO se emite. Un cero se
   * leería como «el ayuntamiento lo remide todo», que es justo la afirmación
   * contraria a la que sostiene el dato ausente.
   */
  costeEfectivo?: {
    municipio?: { ine?: string; filas?: CesteRow[] }
    pares?: { filas?: CesteRow[] }
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
      panel: 'gestion',
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
              descripcion: 'que publican su plazo de pago con la misma norma',
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

  // ── 0b. Gasto por habitante. Es una ENTRADA, no un rendimiento: gastar más
  //        por vecino no es peor ni mejor, y sin esa etiqueta la tarjeta se lee
  //        como una nota. Lo que sí dice es en qué parte del pelotón está.
  const bud = input.budget
  const gastoTotal = num(bud?.snapshot?.totalExpense)
  const poblacion = num(bud?.snapshot?.population)
  const miembrosPc = bud?.pares?.miembros ?? []
  if (gastoTotal > 0 && poblacion > 0) {
    const propio = gastoTotal / poblacion
    const vals = miembrosPc
      .map((m) => m.gastoPorHabitante)
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    const q = (p: number) => {
      const i = (vals.length - 1) * p
      const lo = Math.floor(i)
      const hi = Math.ceil(i)
      return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (i - lo)
    }
    const anio = bud?.snapshot?.year ?? bud?.pares?.anio
    out.push({
      id: 'gasto-por-habitante',
      panel: 'gestion',
      dimension: 'fiscal',
      etiqueta: 'Gasto presupuestado por habitante',
      descripcion:
        'Presupuesto de gastos dividido entre la población, frente a los municipios valencianos de tamaño parecido en el mismo ejercicio.',
      numerador: declarado(gastoTotal, `budget:${anio}:snapshot.totalExpense`),
      denominador: declarado(poblacion, `budget:${anio}:snapshot.population`),
      valor: propio,
      formato: 'euros',
      denominadorUnidad: 'habitantes',
      periodo: String(anio ?? 'sin declarar'),
      pares:
        vals.length >= 15
          ? {
              conjunto: bud?.pares?.conjunto ?? 'cv-15k-40k',
              descripcion: 'de la misma banda de población',
              n: vals.length,
              percentil: Math.round((100 * vals.filter((v) => v <= propio).length) / vals.length),
              p25: q(0.25),
              mediana: q(0.5),
              p75: q(0.75),
              maximo: Math.max(...vals),
            }
          : undefined,
      caveats: [
        'Es una medida de ENTRADA: cuánto se presupuesta por vecino. Gastar más no es peor ni mejor —puede ser más servicio o menos eficiencia— y esta cifra sola no distingue las dos cosas.',
        // Decía «Es presupuesto aprobado, no gasto realizado. La ejecución de
        // este mismo ejercicio aparece más abajo», que afirma exactamente la
        // reconciliación que la salvedad de `ejecucion-presupuestaria` se
        // niega a hacer doce tarjetas más abajo, en esta misma página: las dos
        // cifras dicen ser el mismo ejercicio, difieren en casi cuatro
        // millones, y llamar a una «lo aprobado» y a la otra «lo definitivo»
        // sería inventarse la explicación. Una página no puede sostener las
        // dos frases.
        'Es una cifra presupuestaria de la publicación del ministerio, no gasto ejecutado. No es el punto de partida del porcentaje de ejecución que aparece más abajo: aquélla parte del crédito del listado municipal, las dos dicen ser el mismo ejercicio y la diferencia entre ambas sigue sin explicación.',
        'Sale de la publicación del ministerio, la misma fila cuyos ingresos y gastos no cuadran entre sí; /presupuesto lo explica.',
      ],
      citas: [
        {
          url: 'https://www.hacienda.gob.es/es-ES/CDI/Paginas/InformacionPresupuestaria/InformacionEELLs/Presupuestos%20EELL.aspx',
          etiqueta: 'CONPREL · presupuestos de las entidades locales',
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
    panel: 'gestion',
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
      // Las DOS direcciones. La salvedad sólo se emitía cuando había exclusiones,
      // así que al no haberlas la página callaba —y su denominador coincidía
      // exactamente con el de la tarjeta de al lado, que sí es «sobre el total
      // de adjudicados»—. Un lector no puede distinguir «el filtro no dejó
      // fuera a nadie» de «no se aplicó ningún filtro», y la descripción promete
      // un subconjunto. Cero excluidos es una respuesta, no la ausencia de una.
      sinDeclarar > 0
        ? `${sinDeclarar} contratos adjudicados no declaran número de ofertas y quedan fuera del cálculo.`
        : `Ningún contrato adjudicado se queda fuera: los ${conOfertas.length} declaran cuántas ofertas recibieron, así que el denominador coincide con el total de adjudicados.`,
    ],
    citas: [CITA_CONTRATOS],
  })

  // ── 2. Rigidez / publicidad: ¿cuánto se adjudica sin llamada abierta?
  const sinPublicidad = adjudicados.filter((c) =>
    (PROCESOS_SIN_PUBLICIDAD as readonly string[]).includes(c.processType ?? ''),
  )
  out.push({
    id: 'sin-publicidad-abierta',
    panel: 'gestion',
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
    panel: 'gestion',
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
    panel: 'gestion',
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
    panel: 'gestion',
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
      'No cuadra con la cifra de /presupuesto: aquélla viene de la publicación del ministerio y da 41,58 M€ de CRÉDITO de gastos para 2025, y el propio listado municipal parte de un crédito inicial de 37,60 M€. Las dos dicen ser el mismo ejercicio y difieren en casi cuatro millones; no sabemos cuál de las dos lo explica, y decir que una es «lo aprobado» y la otra «lo definitivo» sería inventarse la reconciliación.',
    ],
    citas: [citaEje],
  })

  // ── 6. ¿Vuelve el ayuntamiento a MEDIR lo que declara? ────────────────────
  //
  //  Es fricción de manual —control interno débil, la X-ineficiencia de
  //  Leibenstein— y no una afirmación sobre ningún servicio: mide la
  //  DECLARACIÓN. Un cociente cuyo numerador se actualiza cada entrega y cuyo
  //  denominador es una copia sólo puede subir, y sube porque nadie volvió a
  //  contar.
  //
  //  No lleva `referencia` a propósito. Ninguna norma obliga a remedir, y
  //  fabricar un umbral («debería ser cero») convertiría una elección nuestra en
  //  el límite contra el que se juzga a un ayuntamiento. Lo que sí existe es la
  //  banda: los mismos municipios comparables declaran los mismos servicios, así
  //  que la comparación la sostiene la población, no una opinión.
  if (input.costeEfectivo) {
    const d = medirDenominadores(input.costeEfectivo)
    if (d) out.push(d)
  }

  return out
}

/**
 * La proporción de servicios cuyo denominador el municipio repite entrega tras
 * entrega, y la misma proporción para cada municipio de la banda.
 *
 * Las dos mitades se miden con `medirDeclaracionCongelada`, la misma función que
 * produce la salvedad de cada tarjeta de `/eficiencia`. Un segundo criterio aquí
 * dejaría al indicador comparando una cosa mientras la tarjeta avisa de otra.
 */
function medirDenominadores(
  fuente: NonNullable<FriccionInput['costeEfectivo']>,
): IndicadorMunicipal | null {
  const filas = [...(fuente.pares?.filas ?? []), ...(fuente.municipio?.filas ?? [])]
  if (!filas.length) return null
  const anios = [...new Set(filas.map((f) => f.anio))].sort((a, b) => a - b)
  const entrega = anios[anios.length - 1]
  const programas = Object.keys(SERVICIOS)
  const propio = fuente.municipio?.ine ?? '46214'

  // Sólo cuentan los servicios en los que el cociente EXISTE en la entrega
  // vigente: hay coste y hay unidad. Donde no hay cociente —una concesión que
  // declara 0 €, un transporte sin viajeros— la unidad no divide nada, y que
  // esté o no congelada no le hace daño a ninguna cifra publicada. Meterlos
  // diluiría justo lo que se quiere medir.
  //
  // Se pregunta con LOS MISMOS resolvers que construyen el panel, no con una
  // copia a mano de lo que hacen. La copia decía `modoGestion === 'directa'`,
  // que fue un buen proxy de «tiene cociente» mientras la concesión era el
  // único modo sin cociente, y dejó de serlo el 2026-09-02, cuando una
  // concesión que declara pasó a dividir. Además contaba de más y de menos por
  // su cuenta: contaba servicios con dos costes positivos distintos, que el
  // panel rechaza, y no contaba los modos mancomunado o consorciado, que el
  // panel publica. Es el modo de fallo 1 de docs/DATA_INTEGRITY.md —restar una
  // forma en vez de importarla— en el indicador que describe al panel.
  //
  // El criterio se aplica IGUAL a la banda, leyendo sus propias filas, así que
  // la comparación no depende en nada de qué publique este sitio.
  const hayCociente = new Set<string>()
  const porMunicipio = new Map<string, CesteRow[]>()
  for (const f of filas) {
    const acc = porMunicipio.get(f.ine)
    if (acc) acc.push(f)
    else porMunicipio.set(f.ine, [f])
  }
  for (const [ine, suyas] of porMunicipio) {
    for (const programa of programas) {
      const def = SERVICIOS[programa]
      if (resolverCoste(suyas, programa, entrega).estado !== 'declarado') continue
      if (resolverUnidad(suyas, programa, entrega, def.denominador).estado !== 'declarado') continue
      hayCociente.add(`${ine}|${programa}`)
    }
  }

  const series = medirDeclaracionCongelada(filas, programas, anios).series.filter(
    (s) => s.magnitud === 'unidad' && hayCociente.has(`${s.ine}|${s.programa}`),
  )
  const porIne = new Map<string, { total: number; congeladas: number }>()
  for (const s of series) {
    const acc = porIne.get(s.ine) ?? { total: 0, congeladas: 0 }
    acc.total++
    if (s.congelada) acc.congeladas++
    porIne.set(s.ine, acc)
  }
  const mio = porIne.get(propio)
  if (!mio || mio.total === 0) return null

  // Sólo entran municipios con serie suficiente en al menos la mitad de los
  // servicios que se le miden a Riba-roja: comparar su 10 de 10 contra un
  // municipio del que sólo se pueden medir dos sería comparar dos cosas.
  const vals = [...porIne.entries()]
    .filter(([ine, a]) => ine !== propio && a.total >= mio.total / 2)
    .map(([, a]) => a.congeladas / a.total)
    .sort((a, b) => a - b)
  const q = (p: number) => {
    if (!vals.length) return 0
    const pos = (vals.length - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    return lo === hi ? vals[lo] : vals[lo] + (pos - lo) * (vals[hi] - vals[lo])
  }
  const valor = mio.congeladas / mio.total

  return {
    id: 'denominadores-sin-remedir',
    panel: 'coste-efectivo',
    dimension: 'friccion' as const,
    etiqueta: 'Denominadores que el ayuntamiento no vuelve a medir',
    descripcion:
      'De los servicios en los que hay coste unitario —hay coste y hay unidad en la última ' +
      'entrega—, en cuántos repite el ayuntamiento la misma unidad física entrega tras entrega ' +
      'mientras actualiza el coste.',
    // Provenance de agregado, NO de celda. El prefijo `cesel:` está reservado a
    // celdas literales del volcado y `check:eficiencia-findings` las resuelve
    // una a una; usarlo aquí hacía que un recuento derivado se presentara como
    // una casilla del ministerio, y la guarda lo cazó al primer intento.
    numerador: declarado(mio.congeladas, `coste-efectivo:${entrega}:denominadores-congelados`),
    denominador: declarado(mio.total, `coste-efectivo:${entrega}:denominadores-medibles`),
    valor,
    formato: 'porcentaje' as const,
    periodo: String(entrega),
    pares:
      vals.length >= 15
        ? {
            conjunto: 'cv-15k-40k',
            descripcion: 'de la misma banda de población de los que se puede medir lo mismo',
            n: vals.length,
            percentil: Math.round((100 * vals.filter((v) => v <= valor).length) / vals.length),
            p25: q(0.25),
            mediana: q(0.5),
            p75: q(0.75),
            // El MÁXIMO, y no por completismo. El percentil no sostiene un
            // «por encima de todos»: `Math.round` convierte un 99,5 en 100 y
            // el `<=` admite empates, así que percentil 100 puede convivir con
            // otro municipio igualado arriba. Sin esta celda, la afirmación
            // fuerte de la ficha firmada no tenía prueba publicada que el
            // lector pudiera comprobar — que es justo lo que este panel
            // promete. Ver `MOTIVO_ETIQUETA` en HallazgosEficiencia.jsx.
            maximo: Math.max(...vals),
          }
        : undefined,
    caveats: [
      'Esto mide la DECLARACIÓN, no el servicio: una cantidad estable puede ser perfectamente correcta, y repetirla no prueba que nadie la haya comprobado.',
      `Una serie cuenta como sin remedir cuando sus últimas ${MIN_ENTREGAS_CONGELADA} entregas o más traen el mismo valor hasta el cuarto decimal. Repetir cifra dos años seguidos es normal y no cuenta.`,
      'Lo que sí se puede afirmar es lo que le pasa al cociente: si el coste se actualiza cada entrega y la unidad no, el coste unitario sube sin que el servicio haya cambiado, y su serie no se puede leer como gestión.',
    ],
    citas: [
      {
        url: 'https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/Administracion%20Electronica/OVEELL/Paginas/CosteEfectivoServicios.aspx',
        etiqueta: 'Coste efectivo de los servicios · Ministerio de Hacienda',
      },
    ],
  }
}
