import * as XLSX from 'xlsx'

// Un importe es `null` cuando la celda de CONPREL viene vacía o no se puede
// leer como cifra. Nunca 0: un capítulo de verdad a cero llega como `0`
// numérico en la descarga, y confundir los dos publicaría «aprobado a 0 €» de
// algo que la fuente no dice (CLAUDE.md, regla 3).
export interface Chapter {
  code: string
  label: string
  amount: number | null
}

export interface ProgramGroup {
  label: string
  amount: number | null
}

/** Una celda de la fila que la fuente dejó vacía o ilegible. */
export interface CeldaSinDato {
  /** Ruta del campo en el snapshot: `totalExpense`, `expenseByEconomicChapter.4`… */
  campo: string
  /** Su rótulo, para que la página pueda decir cuál falta. */
  etiqueta: string
}

export interface BudgetSnapshot {
  ineCode: string
  name: string
  year: number
  population: number | null
  totalRevenue: number | null
  totalExpense: number | null
  /** Ingresos − gastos; null si falta cualquiera de los dos. */
  balance: number | null
  revenueByEconomicChapter: Chapter[]
  expenseByEconomicChapter: Chapter[]
  expenseByProgram: ProgramGroup[]
  /**
   * Lo que la fila no trae. Vacío significa que se leyeron TODAS sus celdas,
   * que es distinto de no haber mirado: el campo existe siempre.
   */
  sinDato: CeldaSinDato[]
  source: string
}

// Stable chapter labels (Spanish public-sector clasificación económica).
// See: Orden HAP/419/2014 — estructura presupuestos Entidades Locales.
const REV_LABELS = [
  'Impuestos directos',
  'Impuestos indirectos',
  'Tasas y otros ingresos',
  'Transferencias corrientes',
  'Ingresos patrimoniales',
  'Enajenación de inversiones reales',
  'Transferencias de capital',
  'Activos financieros',
  'Pasivos financieros',
]

const EXP_LABELS = [
  'Gastos de personal',
  'Gastos en bienes corrientes y servicios',
  'Gastos financieros',
  'Transferencias corrientes',
  'Fondo de contingencia',
  'Inversiones reales',
  'Transferencias de capital',
  'Activos financieros',
  'Pasivos financieros',
]

const PROG_LABELS = [
  'Deuda pública',
  'Servicios públicos básicos',
  'Actuaciones de protección y promoción social',
  'Producción de bienes públicos de carácter preferente',
  'Actuaciones de carácter económico',
  'Actuaciones de carácter general',
]

const SOURCE_URL = (year: number) =>
  `https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero?CCAA=17&TipoDato=Presupuestos&Ejercicio=${year}&TipoPublicacion=Definitiva`

interface ParseOpts {
  ineCode: string // e.g. '46214' → Pr=46, Cor=214
  year: number
  sheetName?: string // default: 'Comunitat Valenciana'
}

/** «1.234,56», «-1.000», «0»: miles con punto, decimales con coma, nada más. */
const IMPORTE_ES = /^-?\d+(,\d+)?$/

/**
 * Una celda de CONPREL como importe, o `null` si no lo es.
 *
 * Devolvía 0 por una celda vacía, un texto ilegible o un tipo que no fuera
 * número ni cadena, y `parseFloat` daba 12 por «12abc». Un 0 inventado se
 * publicaba como cifra; ahora la ausencia llega como ausencia y quien la pinta
 * decide cómo decirla.
 */
export function importe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const limpio = v.replace(/[.\s]/g, '')
  if (!IMPORTE_ES.test(limpio)) return null
  return Number(limpio.replace(',', '.'))
}

export function parseConprelBudget(
  buffer: Buffer | ArrayBuffer,
  opts: ParseOpts,
): BudgetSnapshot | null {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = opts.sheetName ?? 'Comunitat Valenciana'
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return null

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  const pr = opts.ineCode.slice(0, 2)
  const cor = opts.ineCode.slice(2)

  for (const row of rows) {
    if (!row || row.length < 30) continue
    const rowPr = String(row[0] ?? '')
      .replace(/\D/g, '')
      .padStart(2, '0')
    const rowCor = String(row[1] ?? '')
      .replace(/\D/g, '')
      .padStart(3, '0')
    if (rowPr !== pr || rowCor !== cor) continue

    // Column layout (0-indexed):
    //   0 Pr | 1 Cor | 2 Tip | 3 Nombre | 4 Pobla | 5 Estado Inf.
    //   6..14  revenue chapters 1..9
    //   15     Total ingresos
    //   16..24 expense chapters 1..9
    //   25     Total gastos
    //   26..31 expense groups by program
    //   32     Total gastos (duplicate)
    const name = String(row[3] ?? '').trim()
    const population = importe(row[4])

    // Cada celda que no se deja leer queda anotada aquí, con su rótulo. Los
    // totales son los que declara la fuente: si falta uno no se rehace
    // sumando capítulos, porque eso publicaría una suma nuestra como cifra
    // del ministerio.
    const sinDato: CeldaSinDato[] = []
    const lee = (col: number, campo: string, etiqueta: string): number | null => {
      const v = importe(row[col])
      if (v === null) sinDato.push({ campo, etiqueta })
      return v
    }

    const revenueByEconomicChapter = REV_LABELS.map((label, i) => ({
      code: String(i + 1),
      label,
      amount: lee(6 + i, `revenueByEconomicChapter.${i + 1}`, label),
    }))
    const totalRevenue = lee(15, 'totalRevenue', 'Total ingresos')
    const expenseByEconomicChapter = EXP_LABELS.map((label, i) => ({
      code: String(i + 1),
      label,
      amount: lee(16 + i, `expenseByEconomicChapter.${i + 1}`, label),
    }))
    const totalExpense = lee(25, 'totalExpense', 'Total gastos')
    const expenseByProgram = PROG_LABELS.map((label, i) => ({
      label,
      amount: lee(26 + i, `expenseByProgram.${i + 1}`, label),
    }))

    return {
      ineCode: opts.ineCode,
      name,
      year: opts.year,
      population,
      totalRevenue,
      totalExpense,
      balance: totalRevenue !== null && totalExpense !== null ? totalRevenue - totalExpense : null,
      revenueByEconomicChapter,
      expenseByEconomicChapter,
      expenseByProgram,
      sinDato,
      source: SOURCE_URL(opts.year),
    }
  }

  return null
}

export interface ConprelMunicipio {
  ine: string
  nombre: string
  poblacion: number
  /** Total de gastos del presupuesto inicial, columna «Total gastos»; null si no consta. */
  gastoTotal: number | null
  /** Total de ingresos, para poder ver si la fila cuadra consigo misma; null si no consta. */
  ingresoTotal: number | null
}

/**
 * Every municipality in the CONPREL sheet, with its population.
 *
 * `parseConprelBudget` walks these same rows and stops at the one it wants;
 * this reads all of them. It exists because CESEL — the coste efectivo return
 * behind /eficiencia — carries no population, so "municipios de tamaño
 * parecido" has to be sized from somewhere, and the file is already on disk.
 *
 * Column layout is documented on `parseConprelBudget`: 0 Pr | 1 Cor | 3 Nombre
 * | 4 Pobla. Province 00 is the "varias/consorcios" bucket, not a municipality.
 */
export function parseConprelRoster(
  buffer: Buffer | ArrayBuffer,
  opts: { sheetName?: string } = {},
): ConprelMunicipio[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[opts.sheetName ?? 'Comunitat Valenciana']
  if (!sheet) return []

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  const out: ConprelMunicipio[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || row.length < 30) continue
    const pr = String(row[0] ?? '')
      .replace(/\D/g, '')
      .padStart(2, '0')
    const cor = String(row[1] ?? '')
      .replace(/\D/g, '')
      .padStart(3, '0')
    const nombre = String(row[3] ?? '').trim()
    const poblacion = importe(row[4])
    // Sin población la fila no es un municipio que se pueda dimensionar
    // (diputaciones, mancomunidades): se salta, no se cuenta como 0 habitantes.
    if (pr === '00' || !nombre || poblacion === null || poblacion <= 0) continue
    const ine = pr + cor
    // A repeated INE code would mean the sheet changed shape under us; keeping
    // the first and dropping the rest is safe here only because the duplicate
    // check in the tests would go red first.
    if (seen.has(ine)) continue
    seen.add(ine)
    // Mismas columnas que usa parseConprelBudget: 15 total ingresos, 25 total
    // gastos. Se leen aquí para poder comparar el gasto por habitante contra
    // municipios del mismo tamaño sin descargar nada más.
    out.push({
      ine,
      nombre,
      poblacion,
      gastoTotal: importe(row[25]),
      ingresoTotal: importe(row[15]),
    })
  }
  return out
}
