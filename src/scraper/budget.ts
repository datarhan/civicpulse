import * as XLSX from 'xlsx'

export interface Chapter {
  code: string
  label: string
  amount: number
}

export interface ProgramGroup {
  label: string
  amount: number
}

export interface BudgetSnapshot {
  ineCode: string
  name: string
  year: number
  population: number
  totalRevenue: number
  totalExpense: number
  balance: number
  revenueByEconomicChapter: Chapter[]
  expenseByEconomicChapter: Chapter[]
  expenseByProgram: ProgramGroup[]
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

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[.\s]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
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
    const population = num(row[4])

    const revenueByEconomicChapter = REV_LABELS.map((label, i) => ({
      code: String(i + 1),
      label,
      amount: num(row[6 + i]),
    }))
    const totalRevenue = num(row[15])
    const expenseByEconomicChapter = EXP_LABELS.map((label, i) => ({
      code: String(i + 1),
      label,
      amount: num(row[16 + i]),
    }))
    const totalExpense = num(row[25])
    const expenseByProgram = PROG_LABELS.map((label, i) => ({
      label,
      amount: num(row[26 + i]),
    }))

    return {
      ineCode: opts.ineCode,
      name,
      year: opts.year,
      population,
      totalRevenue,
      totalExpense,
      balance: totalRevenue - totalExpense,
      revenueByEconomicChapter,
      expenseByEconomicChapter,
      expenseByProgram,
      source: SOURCE_URL(opts.year),
    }
  }

  return null
}

export interface ConprelMunicipio {
  ine: string
  nombre: string
  poblacion: number
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
    const poblacion = num(row[4])
    if (pr === '00' || !nombre || poblacion <= 0) continue
    const ine = pr + cor
    // A repeated INE code would mean the sheet changed shape under us; keeping
    // the first and dropping the rest is safe here only because the duplicate
    // check in the tests would go red first.
    if (seen.has(ine)) continue
    seen.add(ine)
    out.push({ ine, nombre, poblacion })
  }
  return out
}
