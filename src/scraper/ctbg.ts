/**
 * CTBG (Consejo de Transparencia y Buen Gobierno) resoluciones parser.
 *
 * CTBG publishes their full registry of resoluciones de ámbito estatal
 * as a multi-sheet XLSX (one sheet per year, 2015–current). Each row
 * carries the resolution number, date, motive, asunto, fallo, and
 * organism. State-level only — municipal reclamaciones in the
 * Comunitat Valenciana route to the Consell de Transparència CV
 * instead (separate adapter, future sprint).
 *
 * This adapter downloads the XLSX, flattens all sheets, and filters by
 * an administrative-name substring (default: "Riba-roja"). Surfacing
 * the count — even if zero — is itself a useful public fact: it
 * proves we've checked the state registry and what we found.
 *
 * Pure function library + TDD, same pattern as every other adapter.
 */

import * as XLSX from 'xlsx'

export const CTBG_XLSX_URL =
  'https://consejodetransparencia.es/content/dam/ctransparencia/portal-ctbg/reclamaciones/nuestras-resoluciones/resoluciones-%C3%A1mbito-estatal/ResolucionesAE.xlsx'

export interface CtbgEntry {
  sheetYear: number
  resolucion: string
  anoEntrada: number | null
  mesEntrada: string | null
  mesResolucion: string | null
  motivo: string
  asunto: string
  materia: string[] // descriptores materia 1/2/3 joined into an array
  sentido: string
  criterio: string[]
  palabrasClave: string
  organismo: string
}

export interface CtbgSnapshot {
  generatedAt: string
  source: {
    url: string
    platform: string
    spec: string
  }
  query: string // what we filtered by
  stats: {
    totalEntries: number
    matchedEntries: number
    years: number[]
    bySentido: Record<string, number>
  }
  matched: CtbgEntry[]
}

const HEADERS = [
  'Resolución',
  'Año de entrada de la reclamación',
  'Mes de entrada',
  'Mes de resolución',
  'Motivo de la reclamación',
  'Asunto',
  'Descriptores materia 1',
  'Descriptores materia 2',
  'Descriptores materia 3',
  'Sentido de la resolución',
  'Criterio CTBG 1',
  'Criterio CTBG 2',
  'Palabras clave',
  'Ministerio/organismo',
]

function clean(cell: unknown): string {
  return String(cell ?? '').trim()
}

function parseSheetRows(sheet: XLSX.WorkSheet, sheetYear: number): CtbgEntry[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })
  if (rows.length === 0) return []
  const entries: CtbgEntry[] = []
  // Row 0 is the header row. Validate it loosely so we fail fast if CTBG
  // renames a column we depend on.
  const header = rows[0].map(clean)
  if (!header.includes('Resolución')) return []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const resolucion = clean(r[0])
    if (!resolucion) continue
    const entry: CtbgEntry = {
      sheetYear,
      resolucion,
      anoEntrada: r[1] ? Number(r[1]) || null : null,
      mesEntrada: r[2] ? clean(r[2]) : null,
      mesResolucion: r[3] ? clean(r[3]) : null,
      motivo: clean(r[4]),
      asunto: clean(r[5]),
      materia: [r[6], r[7], r[8]].map(clean).filter(Boolean),
      sentido: clean(r[9]),
      criterio: [r[10], r[11]].map(clean).filter(Boolean),
      palabrasClave: clean(r[12]),
      organismo: clean(r[13]),
    }
    entries.push(entry)
  }
  return entries
}

export function parseCtbgWorkbook(buffer: Buffer | ArrayBuffer): CtbgEntry[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const out: CtbgEntry[] = []
  for (const sheetName of wb.SheetNames) {
    const year = Number(sheetName)
    if (!Number.isFinite(year) || year < 2010 || year > 2100) continue
    out.push(...parseSheetRows(wb.Sheets[sheetName], year))
  }
  return out
}

function normalise(s: string): string {
  // Strip accents and every non-alphanumeric char so "Riba-roja",
  // "riba roja", "ribarroja" and "Ribarroja" all collapse to the same
  // token. This is deliberately aggressive because our search query
  // ("Riba-roja") has no natural false-positive risk in Spanish legal
  // texts.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Riba-roja de Túria (INE 46214, Valencia) must be disambiguated from
 * the Ebro-river dam "embalse de Riba-roja" (Aragón/Cataluña) and
 * other hydroelectric references. We require the "de Túria" /
 * "del Turia" disambiguator in every alias. Four orthographic forms
 * cover Catalán (Riba-roja / Túria) and Castilian (Ribarroja / Turia).
 */
export const DEFAULT_ALIASES = [
  'Riba-roja de Túria',
  'Riba-roja del Turia',
  'Ribarroja de Túria',
  'Ribarroja del Turia',
]

export function filterEntries(
  entries: CtbgEntry[],
  query: string | string[]
): CtbgEntry[] {
  const terms = Array.isArray(query) ? query : [query]
  const needles = terms.map(normalise).filter((n) => n.length > 0)
  if (needles.length === 0) return []
  return entries.filter((e) => {
    const haystack = [
      e.resolucion,
      e.motivo,
      e.asunto,
      ...e.materia,
      e.sentido,
      ...e.criterio,
      e.palabrasClave,
      e.organismo,
    ].map(normalise).join('')
    return needles.some((n) => haystack.includes(n))
  })
}

export function buildSnapshot(
  entries: CtbgEntry[],
  query: string | string[],
  now: Date = new Date()
): CtbgSnapshot {
  const matched = filterEntries(entries, query)
  const years = [...new Set(entries.map((e) => e.sheetYear))].sort()
  const bySentido: Record<string, number> = {}
  for (const m of matched) {
    const k = m.sentido || 'sin_sentido_registrado'
    bySentido[k] = (bySentido[k] ?? 0) + 1
  }
  return {
    generatedAt: now.toISOString(),
    source: {
      url: CTBG_XLSX_URL,
      platform: 'Consejo de Transparencia y Buen Gobierno · Resoluciones de ámbito estatal',
      spec: 'XLSX oficial',
    },
    query: Array.isArray(query) ? query.join(' | ') : query,
    stats: {
      totalEntries: entries.length,
      matchedEntries: matched.length,
      years,
      bySentido,
    },
    matched,
  }
}

export const CTBG_HEADERS_FOR_TEST = HEADERS
