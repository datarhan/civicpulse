/**
 * Municipal election results — official GVA/ICV open data.
 *
 * Source: dadesobertes.gva.es dataset «Mapa electoral municipal de la
 * Comunitat Valenciana: Elecciones Locales» — a WFS layer fed by ARGOS
 * (the Generalitat's municipal databank), one row per municipality with
 * per-party PERCENTAGE columns for every municipales since 2003
 * (`pspv_l23`, `pp_l19`, …) plus abstention (`abs_lNN`).
 *
 * Percentages, not seats: the layer carries vote shares. Seat counts
 * (concejales) live in our own officials.json (current corporation
 * composition) — consumers combine the two rather than this parser
 * guessing d'Hondt allocations.
 *
 * The WKT geometry column is dropped at parse time (the map already has
 * geo.json; this dataset is for the RESULTS).
 */
import { parse } from 'csv-parse/sync'

export const ELECTION_PARTY_LABEL: Record<string, string> = {
  pp: 'PP',
  pspv: 'PSPV-PSOE',
  compr: 'Compromís',
  cs: 'Ciudadanos',
  pod: 'Podem',
  vox: 'VOX',
  eupv: 'EUPV',
}

export interface ElectionResultRow {
  party: string
  pct: number
}

export interface MunicipalElection {
  year: number
  type: 'municipales'
  abstencionPct: number | null
  results: ElectionResultRow[]
}

export interface ElectionsSnapshot {
  generatedAt: string
  source: {
    title: string
    publisher: string
    url: string
    license: string
  }
  municipality: {
    ine: string
    poblacion: number | null
  }
  elections: MunicipalElection[]
}

const SOURCE = {
  title: 'Mapa electoral municipal de la Comunitat Valenciana: Elecciones Locales',
  publisher: 'Generalitat Valenciana · Institut Cartogràfic Valencià / ARGOS',
  url: 'https://dadesobertes.gva.es/dataset/mapa-electoral-municipal-de-la-comunitat-valenciana-elecciones-locales',
  license: 'CC-BY 4.0 (dadesobertes.gva.es)',
}

/**
 * Column suffix → full year. The layer reaches back to the first
 * democratic municipales: `l83` = 1983, `l03` = 2003. Pivot at 79
 * (España's first municipales, 1979) — nothing older exists, nothing
 * newer than the 2070s will keep this column scheme.
 */
function yearFromSuffix(suffix: string): number {
  const n = Number(suffix)
  return n >= 79 ? 1900 + n : 2000 + n
}

/**
 * Parse the WFS CSV and project ONE municipality's full municipales
 * series, newest first. Throws when the INE code is absent (an honest
 * failure beats an empty snapshot that looks like data).
 */
export function parseEleccionesLocales(csvText: string, ineCode: string): ElectionsSnapshot {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>

  const row = rows.find((r) => String(r.cod_ine ?? '').trim() === ineCode)
  if (!row) {
    throw new Error(`elections: INE ${ineCode} not found among ${rows.length} municipalities`)
  }

  // Discover election years from the abstention columns (abs_lNN).
  const years = Object.keys(row)
    .map((k) => /^abs_l(\d{2})$/.exec(k)?.[1])
    .filter((s): s is string => !!s)
    .map(yearFromSuffix)
    .sort((a, b) => b - a)

  const elections: MunicipalElection[] = years.map((year) => {
    const suffix = `l${String(year % 100).padStart(2, '0')}`
    const results: ElectionResultRow[] = []
    for (const [key, label] of Object.entries(ELECTION_PARTY_LABEL)) {
      const raw = row[`${key}_${suffix}`]
      if (raw === undefined) continue
      const pct = Number(String(raw).replace(',', '.'))
      if (!Number.isFinite(pct) || pct <= 0) continue
      results.push({ party: label, pct })
    }
    results.sort((a, b) => b.pct - a.pct)
    const absRaw = row[`abs_${suffix}`]
    const abstencionPct = absRaw !== undefined ? Number(String(absRaw).replace(',', '.')) : null
    return {
      year,
      type: 'municipales' as const,
      abstencionPct: Number.isFinite(abstencionPct as number) ? abstencionPct : null,
      results,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    municipality: {
      ine: ineCode,
      poblacion: Number.isFinite(Number(row.poblacion)) ? Number(row.poblacion) : null,
    },
    elections,
  }
}
