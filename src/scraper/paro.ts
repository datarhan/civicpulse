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
  // The label column is not fixed. The labels sit in column B, but
  // sheet_to_json counts from the start of the sheet's declared range: A1 up
  // to April 2026 and again from July, B1 in May and June 2026, so the label
  // came at index 1 or 0. Find the cell, and read the TOTAL label from the
  // same column: matching TOTAL in any cell would stop at the block's header
  // row, whose last activity heading is "TOTAL", and return its last code (99).
  let hit = -1
  let col = -1
  for (let i = 0; i < rows.length && hit < 0; i++) {
    const row = rows[i] ?? []
    for (let j = 0; j < row.length; j++) {
      if (strip(String(row[j] ?? '')).includes(`MUNICIPIO: ${target}`)) {
        hit = i
        col = j
        break
      }
    }
  }
  if (hit < 0) return null
  // Scan down a reasonable window for the TOTAL row, but never past the next
  // municipality's header: a block is 14 rows, so the window reaches the next
  // one, whose TOTAL would be published as ours.
  for (let i = hit + 1; i < Math.min(hit + 30, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const label = strip(String(row[col] ?? ''))
    if (label.startsWith('MUNICIPIO:')) break
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
