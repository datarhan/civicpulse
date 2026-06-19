/**
 * Parser for ISPA (Información Salarial de los Puestos de la Administración),
 * the Ministerio de Hacienda y Función Pública dataset of elected-official
 * retribuciones — the authoritative, multi-year, per-municipality salary
 * source (it is what Newtral's Transparentia is built on).
 *
 * IMPORTANT libel/accuracy property: ISPA publishes councillor rows
 * ANONYMISED — one row per councillor with {dedicación, retribución} but NO
 * name. So this yields the full per-municipality distribution + the mayor's
 * figure (the alcalde is identifiable as the office-holder), but NEVER a name
 * → amount mapping for the rank-and-file councillors. The /cargos surface
 * shows the mayor's figure on his card and the rest only as an aggregate
 * distribution.
 *
 * The Excel sheets have no header row and a per-year-varying column layout
 * (`sheet_to_json` yields `__EMPTY`, `__EMPTY_1`, …). Rather than hard-code a
 * column index, we read each Riba-roja row positionally: the dedicación is the
 * value matching the dedicación vocabulary, and the amount is the largest
 * numeric value in the row (a stray count column is a small integer, the
 * retribución is thousands of euros).
 *
 * Pure parser — the xlsx download lives in scripts/scrape-ispa.ts.
 */

export interface IspaEntry {
  dedicacion: 'exclusiva' | 'parcial' | 'sin-dedicacion'
  dedicacionLabel: string
  amountEuros: number
}

export interface IspaYearSummary {
  total: number // councillors/alcalde rows seen
  totalAnnualEuros: number
  conDedicacion: number
  sinDedicacion: number
  brackets: Array<{ dedicacion: string; amountEuros: number; count: number }>
}

type Row = Record<string, unknown>

const DEDICACION_RE = /(exclusiva|parcial|sin\s*dedicaci)/i

function classifyDedicacion(raw: string): IspaEntry['dedicacion'] {
  if (/exclusiva/i.test(raw)) return 'exclusiva'
  if (/parcial/i.test(raw)) return 'parcial'
  return 'sin-dedicacion'
}

const LABEL: Record<IspaEntry['dedicacion'], string> = {
  exclusiva: 'dedicación exclusiva',
  parcial: 'dedicación parcial',
  'sin-dedicacion': 'sin dedicación',
}

/** Largest numeric value in the row (the retribución; ignores count columns). */
function rowAmount(row: Row): number {
  let max = 0
  for (const v of Object.values(row)) {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

function rowDedicacion(row: Row): string | null {
  for (const v of Object.values(row)) {
    const s = String(v)
    if (DEDICACION_RE.test(s)) return s
  }
  return null
}

/**
 * Extract the retribución rows for one municipality from ISPA sheet rows
 * (already projected via XLSX.utils.sheet_to_json). `municipio` is matched
 * case/diacritic-loosely against any cell in the row.
 */
export function extractMunicipioEntries(rows: Row[], municipio: string): IspaEntry[] {
  const needle = municipio.toLowerCase()
  const out: IspaEntry[] = []
  for (const row of rows) {
    const inMuni = Object.values(row).some((v) => String(v).toLowerCase().includes(needle))
    if (!inMuni) continue
    const ded = rowDedicacion(row)
    const amount = rowAmount(row)
    // A real retribución row has a dedicación marker AND a euro-scale amount.
    if (!ded || amount < 100) continue
    const dedicacion = classifyDedicacion(ded)
    out.push({
      dedicacion,
      dedicacionLabel: LABEL[dedicacion],
      amountEuros: Math.round(amount * 100) / 100,
    })
  }
  return out
}

export function summarize(entries: IspaEntry[]): IspaYearSummary {
  const byAmount = new Map<string, { dedicacion: string; amountEuros: number; count: number }>()
  let totalAnnualEuros = 0
  let conDedicacion = 0
  let sinDedicacion = 0
  for (const e of entries) {
    totalAnnualEuros += e.amountEuros
    if (e.dedicacion === 'sin-dedicacion') sinDedicacion += 1
    else conDedicacion += 1
    const key = `${e.dedicacion}:${e.amountEuros}`
    const b = byAmount.get(key) || {
      dedicacion: e.dedicacionLabel,
      amountEuros: e.amountEuros,
      count: 0,
    }
    b.count += 1
    byAmount.set(key, b)
  }
  const brackets = [...byAmount.values()].sort((a, b) => b.amountEuros - a.amountEuros)
  return {
    total: entries.length,
    totalAnnualEuros: Math.round(totalAnnualEuros * 100) / 100,
    conDedicacion,
    sinDedicacion,
    brackets,
  }
}
