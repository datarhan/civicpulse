/**
 * Contraste entre las dos cifras de presupuesto que publica este sitio.
 *
 * CORRECCIÓN 2026-10-22: el desacuerdo de gastos descrito abajo era un
 * artefacto. El snapshot del listado municipal tomaba la hoja de gastos del 2T
 * (impresa el 30-06-2025, 37,60 M€ iniciales) como cierre; la del 4T da
 * 41.578.252,26 €, los de CONPREL al céntimo y capítulo a capítulo. Queda el
 * segundo hecho, el de los ingresos: 1,94 M€ por encima de los gastos, que
 * también trae la hoja del propio ayuntamiento. El módulo sigue midiendo, y la
 * página sólo pinta el desacuerdo de gastos si existe.
 *
 * `/presupuesto` enseña el presupuesto de gastos de 2025 según CONPREL —lo que
 * el ministerio publica— y `/eficiencia` la ejecución según el listado que
 * cuelga el propio ayuntamiento. Las dos dicen ser el mismo ejercicio y no
 * cuadran:
 *
 *   ingresos    43.516.817,13   idénticos al céntimo en las dos fuentes
 *   gastos      41.578.252,26   CONPREL
 *   gastos      37.599.838,15   listado municipal
 *
 * Ninguna de las dos parsea mal: los nueve capítulos de cada fuente suman
 * exactamente el total que esa misma fuente declara, y las áreas de gasto de
 * CONPREL también. La diferencia tampoco es de escala ni de signo constante
 * —CONPREL es mayor en personal y corrientes, MENOR en financieros y en
 * transferencias de capital, e idéntico en activos y pasivos financieros—, así
 * que tampoco se explica por consolidar entidades dependientes.
 *
 * Y hay un segundo hecho, independiente del anterior: la fila de CONPREL da a
 * Riba-roja 1,94 M€ más de ingresos que de gastos. Un presupuesto general se
 * aprueba **sin déficit inicial** (art. 165.4 TRLRHL), y esa exigencia se
 * cumple en los dos sentidos: tampoco debería sobrar. La fila de la Diputación
 * de Alicante, en ese mismo fichero, cuadra al céntimo.
 *
 * Este módulo no elige una cifra ni corrige ninguna: sólo mide el desacuerdo
 * para que la página pueda enseñarlo. Publicar 41,58 M€ como «el presupuesto»
 * sin decir que la contabilidad del propio ayuntamiento arranca de 37,60 M€
 * sería dar por resuelto algo que no lo está.
 */

/** Un presupuesto no aprobado en equilibrio, por encima de este margen, es noticia. */
export const TOLERANCIA_EQUILIBRIO = 1000

export interface CapituloContraste {
  code: string
  label: string
  /** null cuando CONPREL no trae el capítulo: no se contrasta como si fuera 0. */
  conprel: number | null
  municipal: number
  diferencia: number | null
}

export interface BudgetContraste {
  anio: number
  /** Coinciden las dos fuentes en los ingresos iniciales; null si CONPREL no los trae. */
  ingresosCoinciden: boolean | null
  gastosConprel: number
  gastosMunicipal: number
  diferenciaGastos: number
  /** Ingresos menos gastos en la fuente del ministerio. Debería ser ~0. Null sin ingresos. */
  desequilibrioConprel: number | null
  capitulos: CapituloContraste[]
  /** `true` cuando hay algo que contar; si no, la página no pinta nada. */
  hayDesacuerdo: boolean
}

interface BudgetSnapshotLike {
  year?: number
  totalRevenue?: number | null
  totalExpense?: number | null
  expenseByEconomicChapter?: { code: string; label: string; amount: number | null }[]
}

interface EjecucionLike {
  year?: number
  gastos?: {
    total?: { inicial?: number }
    chapters?: { capitulo: number; label: string; inicial: number }[]
  }
  ingresos?: { total?: { inicial?: number } }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
/**
 * El lado de CONPREL se lee sin convertir la ausencia en 0: `budget.ts`
 * publica null por una celda que la fuente no trae, y contrastar ese null
 * como 0 daría por desacuerdo la cifra municipal entera.
 */
const cifra = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Ingresos menos gastos del presupuesto que el Ayuntamiento rinde a CONPREL; null
 * sin uno de los dos totales. Es un hecho de CONPREL solo y no necesita la
 * ejecución: el aviso «no cuadra en la fuente del ministerio» se calculaba
 * dentro del cotejo con el listado municipal, y el día que el periodo más nuevo
 * fue de otro año el cotejo dio null y el aviso desapareció.
 */
export function desequilibrioDeConprel(
  conprel: Pick<BudgetSnapshotLike, 'totalRevenue' | 'totalExpense'> | null | undefined,
): number | null {
  const gastos = cifra(conprel?.totalExpense)
  const ingresos = cifra(conprel?.totalRevenue)
  return gastos === null || gastos <= 0 || ingresos === null ? null : ingresos - gastos
}

export function contrastarPresupuesto(
  conprel: BudgetSnapshotLike | null | undefined,
  ejecucion: EjecucionLike | null | undefined,
): BudgetContraste | null {
  if (!conprel || !ejecucion) return null
  // Comparar ejercicios distintos no mide un desacuerdo, mide el paso del
  // tiempo. Sin año en las dos partes, no hay contraste que hacer.
  if (!conprel.year || !ejecucion.year || conprel.year !== ejecucion.year) return null

  const gastosConprel = cifra(conprel.totalExpense)
  const gastosMunicipal = num(ejecucion.gastos?.total?.inicial)
  if (gastosConprel === null || gastosConprel <= 0 || gastosMunicipal <= 0) return null

  const capitulos: CapituloContraste[] = (conprel.expenseByEconomicChapter ?? []).map((c) => {
    const m = (ejecucion.gastos?.chapters ?? []).find((x) => String(x.capitulo) === c.code)
    const municipal = num(m?.inicial)
    const deConprel = cifra(c.amount)
    return {
      code: c.code,
      label: c.label,
      conprel: deConprel,
      municipal,
      diferencia: deConprel === null ? null : deConprel - municipal,
    }
  })

  const ingresosConprel = cifra(conprel.totalRevenue)
  const desequilibrioConprel = desequilibrioDeConprel(conprel)
  const diferenciaGastos = gastosConprel - gastosMunicipal

  return {
    anio: conprel.year,
    ingresosCoinciden:
      ingresosConprel === null
        ? null
        : Math.abs(ingresosConprel - num(ejecucion.ingresos?.total?.inicial)) < 1,
    gastosConprel,
    gastosMunicipal,
    diferenciaGastos,
    desequilibrioConprel,
    capitulos,
    hayDesacuerdo:
      Math.abs(diferenciaGastos) >= TOLERANCIA_EQUILIBRIO ||
      (desequilibrioConprel !== null && Math.abs(desequilibrioConprel) >= TOLERANCIA_EQUILIBRIO),
  }
}
