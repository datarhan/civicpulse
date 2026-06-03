/**
 * Consell de Transparència, Accés a la Informació Pública i Bon Govern
 * de la Comunitat Valenciana (CTIP-CV) — regional equivalent of CTBG
 * for transparency reclamaciones. Handles municipal complaints from
 * Valencian ayuntamientos (which the national CTBG does NOT).
 *
 * Source: https://conselltransparencia.gva.es/es/reclamaciones-resueltas
 * The Consell publishes one summary table per year as XLSX or ODS,
 * directly parseable with the `xlsx` package (same module handles
 * both formats). Schema is stable:
 *   [Nº RESOLUCIÓN, FECHA, EXPEDIENTE, ADMINISTRACIÓN RECLAMADA,
 *    MOTIVO, MATERIA, SENTIDO]
 *
 * Riba-roja disambiguation: we filter by "Ayuntamiento de Riba-roja"
 * / "Ayuntamiento de Ribarroja" against the ADMINISTRACIÓN column —
 * exact field match, no Ebro-dam risk because the column only names
 * the reclamada entity, never rivers/embalses.
 */

import * as XLSX from 'xlsx'

// Canonical known tables. The Consell publishes one XLSX/ODS per year;
// URLs are stable once minted but the UUID suffix is opaque so we
// maintain the list here. Add the new URL each January.
export const CONSELL_CV_TABLES: Array<{ year: number; url: string }> = [
  {
    year: 2026,
    url: 'https://conselltransparencia.gva.es/documents/163244115/178037184/TABLA+RELACI%C3%93N+RESOLUCIONES+RECLAMACIONES+2026/ef19184b-d40f-49a0-8182-3484d29a78cc',
  },
  {
    year: 2025,
    url: 'https://conselltransparencia.gva.es/documents/163244115/177340111/TABLA+RELACI%C3%93N+RESOLUCIONES+RECLAMACIONES+2025/b6ef0402-cd92-4d12-b72a-3d15a9b2c132',
  },
]

export interface ConsellEntry {
  year: number
  numero: string // "1/2026"
  fecha: string // ISO yyyy-mm-dd when parseable, else raw
  expediente: string // "GESOC/RE/2025/10"
  administracion: string // "Ayuntamiento de Riba-roja de Túria"
  motivo: string
  materia: string
  sentido: string
}

export interface ConsellSnapshot {
  generatedAt: string
  source: {
    portal: string
    platform: string
    tables: Array<{ year: number; url: string }>
  }
  query: string
  stats: {
    totalEntries: number
    matchedEntries: number
    years: number[]
    bySentido: Record<string, number>
    byMateria: Record<string, number>
  }
  matched: ConsellEntry[]
}

const HEADERS = [
  'Nº RESOLUCIÓN',
  'FECHA RESOLUCIÓN',
  'EXPEDIENTE',
  'ADMINISTRACIÓN RECLAMADA',
  'MOTIVO',
  'MATERIA',
  'SENTIDO DE LA RESOLUCIÓN',
] as const

function clean(cell: unknown): string {
  return String(cell ?? '').trim()
}

/**
 * Consell's year tables come in two flavours:
 *   - 2026 XLSX: title omitted, headers at row 0, dates M/D/YY (US order)
 *   - 2025 ODS: title "RESOLUCIONES 2025" at row 0, headers at row 1,
 *               header labels include embedded newlines ("ADMINISTRACIÓN\nRECLAMADA"),
 *               dates DD/MM/YY (European order)
 *
 * We fuzzy-match the header row + detect date order per-row. `RESUMEN`
 * (2025) and `MOTIVO` (2026) map to the same positional column.
 */
function normaliseFecha(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date → ISO
    const jsMs = (raw - 25569) * 86400 * 1000
    const d = new Date(jsMs)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const s = clean(raw)

  // "DD.MM.YYYY"
  const dmyDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dmyDot) {
    const [, d, m, y] = dmyDot
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // "D/M/YY" or "M/D/YY" — distinguish by seeing which part is > 12.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, a, b, y] = slash
    const na = Number(a)
    const nb = Number(b)
    const full = y.length === 2 ? 2000 + Number(y) : Number(y)
    // First part > 12 → must be DD/MM. Second part > 12 → must be MM/DD.
    // Both ≤ 12 → default to DD/MM (European/Spanish convention).
    let day: number
    let month: number
    if (na > 12 && nb <= 12) {
      day = na
      month = nb
    } else if (nb > 12 && na <= 12) {
      day = nb
      month = na
    } else {
      day = na
      month = nb
    }
    return `${full}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return s
}

function matchHeader(header: unknown[]): boolean {
  const norm = header.map((c) => clean(c).replace(/\s+/g, ' ').toLowerCase())
  return norm.some((c) => c.includes('administraci') && c.includes('reclamad'))
}

export function parseConsellTable(buffer: Buffer | ArrayBuffer, year: number): ConsellEntry[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
  })
  if (rows.length === 0) return []

  // Find the header row in the first 3 rows (title row + optional gap).
  let headerRow = -1
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    if (matchHeader(rows[i] || [])) {
      headerRow = i
      break
    }
  }
  if (headerRow === -1) return []

  const out: ConsellEntry[] = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const numero = clean(r[0])
    if (!numero) continue
    // Skip obvious non-data rows (e.g. "Total", empty continuations).
    if (!/\d/.test(numero)) continue
    out.push({
      year,
      numero,
      fecha: normaliseFecha(r[1]),
      expediente: clean(r[2]),
      administracion: clean(r[3]),
      motivo: clean(r[4]),
      materia: clean(r[5]),
      sentido: clean(r[6]),
    })
  }
  return out
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Riba-roja de Túria has two orthographic variants in Valencian
 * administrative texts: "Riba-roja" (Catalán, single r) and
 * "Ribarroja" (Castellano, double r). Both normalise to distinct
 * alphanumeric strings, so we check both.
 */
export const DEFAULT_ALIASES = [
  'Riba-roja de Túria',
  'Riba-roja del Turia',
  'Ribarroja de Túria',
  'Ribarroja del Turia',
]

export function filterEntries(entries: ConsellEntry[], query: string | string[]): ConsellEntry[] {
  const terms = Array.isArray(query) ? query : [query]
  const needles = terms.map(normalise).filter((n) => n.length > 0)
  if (needles.length === 0) return []
  return entries.filter((e) => {
    // Consell's table names the reclamada entity explicitly in the
    // ADMINISTRACIÓN column — that's the only place we need to match
    // (much tighter than CTBG's full-text search).
    const haystack = normalise(e.administracion)
    return needles.some((n) => haystack.includes(n))
  })
}

export function buildSnapshot(
  entries: ConsellEntry[],
  query: string | string[],
  tables: Array<{ year: number; url: string }> = CONSELL_CV_TABLES,
  now: Date = new Date(),
): ConsellSnapshot {
  const matched = filterEntries(entries, query)
  const years = [...new Set(entries.map((e) => e.year))].sort()
  const bySentido: Record<string, number> = {}
  const byMateria: Record<string, number> = {}
  for (const m of matched) {
    const ks = m.sentido || 'sin_sentido_registrado'
    bySentido[ks] = (bySentido[ks] ?? 0) + 1
    const km = m.materia || 'sin_materia_registrada'
    byMateria[km] = (byMateria[km] ?? 0) + 1
  }
  return {
    generatedAt: now.toISOString(),
    source: {
      portal: 'https://conselltransparencia.gva.es',
      platform:
        'Consell de Transparència, Accés a la Informació Pública i Bon Govern · Comunitat Valenciana',
      tables,
    },
    query: Array.isArray(query) ? query.join(' | ') : query,
    stats: {
      totalEntries: entries.length,
      matchedEntries: matched.length,
      years,
      bySentido,
      byMateria,
    },
    matched,
  }
}

export const CONSELL_HEADERS_FOR_TEST = HEADERS
