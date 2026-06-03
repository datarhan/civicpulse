/**
 * Parse SEPE's monthly per-municipality Excel for "paro registrado"
 * (registered unemployment). The workbook has separate sheets per sex:
 *   - "AMBOS SEXOS PARO"  (total)
 *   - "HOMBRES PARO"
 *   - "MUJERES PARO"
 *
 * Each sheet contains every muni in the CCAA stacked vertically. We
 * locate the row containing "Municipio: <NAME>" (case-insensitive,
 * accent-insensitive) and then scan down to the TOTAL row; the last
 * cell of that row is the grand total for the municipality.
 */
import * as XLSX from 'xlsx'

export interface ParoSnapshot {
  municipio: string
  period: string // YYYY-MM
  total: number
  men: number
  women: number
  source: 'SEPE Muniacteco 20-45'
}

interface ParseOpts {
  municipio: string
  period: string // YYYY-MM
}

function strip(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function readSheet(buf: Buffer | ArrayBuffer, name: string): unknown[][] | null {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[name]
  if (!sheet) return null
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
}

function munoTotal(rows: unknown[][], muniKey: string): number | null {
  const target = strip(muniKey)
  let hit = -1
  for (let i = 0; i < rows.length; i++) {
    const cell = String(rows[i]?.[1] ?? '')
    if (strip(cell).includes(`MUNICIPIO: ${target}`)) {
      hit = i
      break
    }
  }
  if (hit < 0) return null
  // Scan down a reasonable window for the TOTAL row.
  for (let i = hit; i < Math.min(hit + 30, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const label = String(row[1] ?? '')
      .trim()
      .toUpperCase()
    if (label !== 'TOTAL') continue
    // Last non-empty cell is the grand total.
    for (let j = row.length - 1; j >= 0; j--) {
      const v = row[j]
      if (v === null || v === undefined || v === '') continue
      if (typeof v === 'number') return v
      const str = String(v).replace(/[.,\s"']/g, '')
      const n = parseInt(str, 10)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

export function parseSepeParoMonth(
  buf: Buffer | ArrayBuffer,
  opts: ParseOpts,
): ParoSnapshot | null {
  const totalSheet = readSheet(buf, 'AMBOS SEXOS PARO')
  const menSheet = readSheet(buf, 'HOMBRES PARO')
  const womenSheet = readSheet(buf, 'MUJERES PARO')
  if (!totalSheet || !menSheet || !womenSheet) return null

  const total = munoTotal(totalSheet, opts.municipio)
  const men = munoTotal(menSheet, opts.municipio)
  const women = munoTotal(womenSheet, opts.municipio)
  if (total === null || men === null || women === null) return null

  return {
    municipio: opts.municipio,
    period: opts.period,
    total,
    men,
    women,
    source: 'SEPE Muniacteco 20-45',
  }
}
