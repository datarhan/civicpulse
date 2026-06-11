/**
 * BOE (Boletín Oficial del Estado) adapter.
 *
 * Pulls daily sumarios from boe.es's open-data JSON API and filters
 * each `item` (the leaf-level entry) down to those whose title
 * mentions Riba-roja / Ribarroja. Riba-roja appears in the BOE
 * when:
 *   · the Ayuntamiento publishes a convenio, expropriación, plan
 *     general, or resolución sancionadora,
 *   · the GVA delegates competencias municipales,
 *   · a tribunal cita la corporación en una resolución concursal o
 *     anulación contractual,
 *   · subvenciones nominativas pasan por trámite estatal.
 *
 * The lab's verifier cross-references claims that cite an
 * "ordenanza", "decreto" or "resolución" against this snapshot —
 * BOE is the authoritative gazette for actos administrativos.
 *
 * API: https://www.boe.es/datosabiertos/api/boe/sumario/{YYYYMMDD}
 * Auth: none. Open data.
 * Politeness: throttled to 1 req/600ms in the CLI; the parser is pure.
 */
import { sha256Short } from './hash'

const MATCH_RE = /\b(riba[\s-]?roja|ribarroja|ribaroja)\b/i

export interface BoeRow {
  /** sha256(identificador) — first 12 chars. */
  id: string
  /** BOE-A-2026-NNNNN canonical identifier. */
  identificador: string
  /** Full ISO date (UTC midnight) of publication. */
  publicacionDate: string
  /** Department (Ayuntamiento / Ministerio / GVA / …). */
  departamento: string
  /** Section name (e.g. "III. Otras disposiciones"). */
  seccion: string
  /** Epigraph (subsection — "Subvenciones", "Ayudas", "Concursos", …). */
  epigrafe: string
  /** Verbatim titulo, ≤480 chars (BOE titulos are sometimes very long). */
  titulo: string
  /** Canonical HTML URL. */
  urlHtml: string
  /** Canonical PDF URL (always present). */
  urlPdf: string
}

export interface BoeSnapshot {
  generatedAt: string
  source: {
    url: string
    matchPattern: string
    description: string
  }
  stats: {
    daysFetched: number
    daysWithMatches: number
    total: number
    byDepartamento: Record<string, number>
  }
  items: BoeRow[]
}

// Shared impl — BOE row ids are stable keys the press verifier cites.
const sha256 = sha256Short

function isoDateFromYyyymmdd(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return new Date(0).toISOString()
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00.000Z`
}

/**
 * BOE's JSON is permissive about pluralisation: `seccion`, `departamento`,
 * `epigrafe`, and `item` can each be a single object OR an array. Helper
 * that normalises both into an array.
 */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

interface ApiItem {
  identificador?: string
  titulo?: string
  url_html?: string
  url_pdf?: { texto?: string }
}

interface ApiEpigrafe {
  nombre?: string
  item?: ApiItem | ApiItem[]
}

interface ApiDepartamento {
  codigo?: string
  nombre?: string
  epigrafe?: ApiEpigrafe | ApiEpigrafe[]
  /** Some boletines tag items directly under departamento, sin epígrafe. */
  item?: ApiItem | ApiItem[]
}

interface ApiSeccion {
  codigo?: string
  nombre?: string
  departamento?: ApiDepartamento | ApiDepartamento[]
}

interface ApiDiario {
  seccion?: ApiSeccion | ApiSeccion[]
}

export interface ApiSumarioResponse {
  status?: { code?: string }
  data?: {
    sumario?: {
      metadatos?: { fecha_publicacion?: string }
      diario?: ApiDiario | ApiDiario[]
    }
  }
}

/**
 * Pure parser — takes a single day's ApiSumarioResponse and emits
 * normalised rows whose titulo matches the Riba-roja pattern.
 */
export function parseBoeSumario(payload: ApiSumarioResponse): BoeRow[] {
  const sumario = payload?.data?.sumario
  if (!sumario) return []
  const yyyymmdd = sumario.metadatos?.fecha_publicacion ?? ''
  const publicacionDate = isoDateFromYyyymmdd(yyyymmdd)
  const rows: BoeRow[] = []
  const seen = new Set<string>()
  for (const diario of asArray(sumario.diario)) {
    for (const seccion of asArray(diario.seccion)) {
      const seccionName = seccion.nombre ?? ''
      for (const departamento of asArray(seccion.departamento)) {
        const departamentoName = departamento.nombre ?? ''
        const directItems = asArray(departamento.item).map((it) => ({ epigrafe: '', it }))
        const wrappedItems = asArray(departamento.epigrafe).flatMap((ep) =>
          asArray(ep.item).map((it) => ({ epigrafe: ep.nombre ?? '', it })),
        )
        for (const { epigrafe, it } of [...directItems, ...wrappedItems]) {
          const titulo = (it.titulo ?? '').trim()
          const identificador = (it.identificador ?? '').trim()
          if (!titulo || !identificador) continue
          if (!MATCH_RE.test(titulo)) continue
          if (seen.has(identificador)) continue
          seen.add(identificador)
          rows.push({
            id: sha256(identificador),
            identificador,
            publicacionDate,
            departamento: departamentoName,
            seccion: seccionName,
            epigrafe,
            titulo: titulo.slice(0, 480),
            urlHtml: it.url_html ?? '',
            urlPdf: it.url_pdf?.texto ?? '',
          })
        }
      }
    }
  }
  return rows
}

// The day-walking network fetcher lives in ./boe-fetch.ts — this module
// stays a pure parser (the architecture contract).
