/**
 * Contraste entre las dos cifras de presupuesto que publica este sitio.
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
  conprel: number
  municipal: number
  diferencia: number
}

export interface BudgetContraste {
  anio: number
  /** Coinciden las dos fuentes en los ingresos iniciales. */
  ingresosCoinciden: boolean
  gastosConprel: number
  gastosMunicipal: number
  diferenciaGastos: number
  /** Ingresos menos gastos en la fuente del ministerio. Debería ser ~0. */
  desequilibrioConprel: number
  capitulos: CapituloContraste[]
  /** `true` cuando hay algo que contar; si no, la página no pinta nada. */
  hayDesacuerdo: boolean
}

interface BudgetSnapshotLike {
  year?: number
  totalRevenue?: number
  totalExpense?: number
  expenseByEconomicChapter?: { code: string; label: string; amount: number }[]
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

export function contrastarPresupuesto(
  conprel: BudgetSnapshotLike | null | undefined,
  ejecucion: EjecucionLike | null | undefined,
): BudgetContraste | null {
  if (!conprel || !ejecucion) return null
  // Comparar ejercicios distintos no mide un desacuerdo, mide el paso del
  // tiempo. Sin año en las dos partes, no hay contraste que hacer.
  if (!conprel.year || !ejecucion.year || conprel.year !== ejecucion.year) return null

  const gastosConprel = num(conprel.totalExpense)
  const gastosMunicipal = num(ejecucion.gastos?.total?.inicial)
  if (gastosConprel <= 0 || gastosMunicipal <= 0) return null

  const capitulos: CapituloContraste[] = (conprel.expenseByEconomicChapter ?? []).map((c) => {
    const m = (ejecucion.gastos?.chapters ?? []).find((x) => String(x.capitulo) === c.code)
    const municipal = num(m?.inicial)
    return {
      code: c.code,
      label: c.label,
      conprel: num(c.amount),
      municipal,
      diferencia: num(c.amount) - municipal,
    }
  })

  const desequilibrioConprel = num(conprel.totalRevenue) - gastosConprel
  const diferenciaGastos = gastosConprel - gastosMunicipal

  return {
    anio: conprel.year,
    ingresosCoinciden:
      Math.abs(num(conprel.totalRevenue) - num(ejecucion.ingresos?.total?.inicial)) < 1,
    gastosConprel,
    gastosMunicipal,
    diferenciaGastos,
    desequilibrioConprel,
    capitulos,
    hayDesacuerdo:
      Math.abs(diferenciaGastos) >= TOLERANCIA_EQUILIBRIO ||
      Math.abs(desequilibrioConprel) >= TOLERANCIA_EQUILIBRIO,
  }
}
