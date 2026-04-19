/**
 * Parse INE Tempus3 "Población por municipios / sexo / año" CSV.
 *
 * Source: https://www.ine.es/jaxiT3/files/t/es/csv_bd/{tableId}.csv?nocab=1
 *   - table 2903 = Valencia province (46)
 *   - table 2902 = Alicante (03)
 *   - table 2904 = Valladolid (47)
 *   - etc.
 *
 * CSV shape (tab-separated):
 *   Municipios        | Sexo  | Periodo | Total
 *   46214 Riba-roja … | Total | 2025    | 24.616
 *
 * Total uses Spanish thousands separator "." — "24.616" means 24616.
 */

export interface PadronPoint {
  year: number
  value: number
}

export interface PadronSeries {
  ineCode: string
  name: string
  total: PadronPoint[]
  men: PadronPoint[]
  women: PadronPoint[]
  latestYear: number
  latestTotal: number
}

interface ParseOpts {
  ineCode: string
}

function parseEuroNumber(raw: string): number {
  // "24.616" (thousands dot) → 24616. "12,5" (decimal comma) → 12.5.
  const s = raw.trim()
  if (s === '' || s === '..' || s === '-') return 0
  // Remove thousand separators, then swap decimal comma for dot.
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function parseInePadron(csv: string, opts: ParseOpts): PadronSeries | null {
  // Strip BOM if present
  const text = csv.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return null
  // Detect separator (tab vs semicolon)
  const header = lines[0]
  const sep = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ','

  let name = ''
  const total: PadronPoint[] = []
  const men: PadronPoint[] = []
  const women: PadronPoint[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep)
    if (cols.length < 4) continue
    const muni = cols[0].trim()
    const sexo = cols[1].trim()
    const year = parseInt(cols[2].trim(), 10)
    const rawValue = (cols[3] || '').trim().replace(/^"|"$/g, '')
    // Muni format: "46214 Riba-roja de Túria"
    if (!muni.startsWith(opts.ineCode + ' ')) continue
    if (!name) name = muni.slice(opts.ineCode.length).trim()
    if (!Number.isFinite(year)) continue
    // Skip rows with missing data (INE often leaves gaps, e.g. 1997 padrón).
    if (rawValue === '' || rawValue === '..' || rawValue === '-') continue
    const value = parseEuroNumber(rawValue)
    if (!Number.isFinite(value) || value <= 0) continue
    const pt: PadronPoint = { year, value }
    if (sexo === 'Total') total.push(pt)
    else if (/hombre/i.test(sexo)) men.push(pt)
    else if (/mujer/i.test(sexo)) women.push(pt)
  }

  if (total.length === 0) return null

  total.sort((a, b) => a.year - b.year)
  men.sort((a, b) => a.year - b.year)
  women.sort((a, b) => a.year - b.year)

  const latest = total[total.length - 1]
  return {
    ineCode: opts.ineCode,
    name,
    total,
    men,
    women,
    latestYear: latest.year,
    latestTotal: latest.value,
  }
}
