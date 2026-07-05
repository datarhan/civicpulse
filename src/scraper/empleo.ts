/**
 * Pure parser for the Riba-roja municipal employment agency (ADL — Agència de
 * Col·locació) job board, served by the portalemp SaaS at
 * ribaocupacio.portalemp.com. Fetch + the OWASP-CSRFProtector handshake live
 * in the CLI wrapper (scripts/scrape-empleo.ts); this module is pure.
 *
 * Two payloads, two parsers:
 *
 *   parseOfertasList(fragmentHtml) — the AJAX `?acc=tableData` HTML fragment:
 *       a <table id="tabla-ofertas"> with one <tr class="oferta-table-item">
 *       per open offer. Columns, in order: Fecha · Fin inscripciones · Código
 *       (links ofertas.html?fo=<id>) · Oferta (title) · Lugar de trabajo ·
 *       Estado (<span class="spPildora sp-*">…</span>).
 *
 *   parseOfertaDetail(html) — a single offer page (ofertas.html?fo=<id>),
 *       server-rendered. Offer content lives in <div class="ficha"> as
 *       <p><label>KEY</label>…VALUE…</p> rows grouped by <h3> sub-sections
 *       (Datos generales, Ocupaciones solicitadas, Carnets de conducir…).
 *
 * The agency brokers jobs comarca-wide (Paterna, Cheste, Bétera…), so the feed
 * is deliberately NOT filtered to the municipality; each row instead carries an
 * `inRibaRoja` flag (from the shared RIBA_ROJA_ALIASES policy) that powers the
 * client-side "Solo Riba-roja" toggle on /empleo.
 */
import { normalizeAlphanumeric, RIBA_ROJA_ALIASES } from './normalize'

export type OfertaStatusTone = 'ok' | 'warn' | 'crit' | 'ghost' | 'neutral'

export interface OfertaListRow {
  id: string // String(fo) — stable, used in the /empleo/:id route
  fo: number
  codigo: string
  titulo: string
  publishedAt: string // ISO YYYY-MM-DD
  deadline: string | null // "Fin inscripciones", ISO or null
  location: string // raw "Lugar de trabajo"
  status: string // "Abierta"
  statusTone: OfertaStatusTone
  url: string // absolute detail URL ofertas.html?fo=<id>
  inRibaRoja: boolean
}

export interface Ocupacion {
  nombre: string
  experiencia?: string
}

export interface OfertaDetail {
  fields: { label: string; value: string }[] // every <label>→value pair (forward-compat)
  tipoContrato?: string
  duracion?: string
  numPuestos?: string
  categoria?: string
  observaciones?: string
  municipio?: string
  provincia?: string
  cp?: string
  jornada?: string
  horario?: string
  salario?: string
  funciones?: string
  vehiculo?: string
  ocupaciones: Ocupacion[]
}

export interface OfertaItem extends OfertaListRow {
  detail: OfertaDetail | null
}

// The Estado cell's sp-* pill class → our Pill tone vocabulary.
const STATUS_TONE_BY_CLASS: Record<string, OfertaStatusTone> = {
  'sp-success': 'ok',
  'sp-warning': 'warn',
  'sp-danger': 'crit',
  'sp-info': 'neutral',
}

export const OFERTA_STATUS_TONE: Record<string, OfertaStatusTone> = {
  Abierta: 'ok',
  Cerrada: 'ghost',
  Adjudicada: 'neutral',
  Anulada: 'crit',
}

export const OFERTA_STATUS_LABEL: Record<string, string> = {
  Abierta: 'Abierta',
  Cerrada: 'Cerrada',
  Adjudicada: 'Adjudicada',
  Anulada: 'Anulada',
}

// Every RIBA_ROJA_ALIASES variant, folded to a bare token — the shared
// municipality-filter POLICY, reused (not re-derived) so it can't drift.
const RIBA_NEEDLES = RIBA_ROJA_ALIASES.map(normalizeAlphanumeric)

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

/** Strip tags → decode entities → collapse whitespace → trim. */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** 'DD/MM/YYYY' → 'YYYY-MM-DD'; null when absent/unparseable. */
function toISO(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function isRibaRoja(...parts: string[]): boolean {
  const hay = normalizeAlphanumeric(parts.join(' '))
  return RIBA_NEEDLES.some((n) => hay.includes(n))
}

export function parseOfertasList(html: string, opts: { baseUrl?: string } = {}): OfertaListRow[] {
  const base = (opts.baseUrl || 'https://ribaocupacio.portalemp.com').replace(/\/+$/, '')
  const rows: OfertaListRow[] = []
  const seen = new Set<number>()
  const trRe = /<tr class="oferta-table-item"[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRe.exec(html))) {
    const tr = m[1]
    const foM = tr.match(/ofertas\.html\?fo=(\d+)/i)
    if (!foM) continue // a row we can't stably key / deep-link is dropped
    const fo = parseInt(foM[1], 10)
    if (seen.has(fo)) continue
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1])
    if (tds.length < 6) continue
    const publishedAt = toISO(text(tds[0]))
    if (!publishedAt) continue // must carry a valid publish date
    seen.add(fo)
    const statusCell = tds[5]
    const status = text(statusCell)
    const clsM = statusCell.match(/spPildora\s+(sp-[a-z]+)/i)
    const statusTone =
      (clsM && STATUS_TONE_BY_CLASS[clsM[1].toLowerCase()]) ||
      OFERTA_STATUS_TONE[status] ||
      'neutral'
    const location = text(tds[4])
    rows.push({
      id: String(fo),
      fo,
      codigo: text(tds[2]),
      titulo: text(tds[3]),
      publishedAt,
      deadline: toISO(text(tds[1])),
      location,
      status,
      statusTone,
      url: `${base}/ofertas.html?fo=${fo}`,
      inRibaRoja: isRibaRoja(location),
    })
  }
  return rows
}

export function parseOfertaDetail(html: string): OfertaDetail {
  // Scope strictly to the offer "ficha" so the site chrome (mega-menu,
  // breadcrumb <li>Ofertas</li>, footer) can never leak into the fields or
  // the occupations list.
  const start = html.indexOf('<div class="ficha">')
  const end = html.indexOf('fin: ficha')
  const ficha = start !== -1 ? html.slice(start, end !== -1 ? end : start + 20000) : ''

  // Fields come in two wrappers: single-line `<p><label>K</label>V</p>` (V is a
  // <span class="content">, bare text, or after a <br/>) and multi-line
  // `<div class="multilinea"><label>K</label><span class="content">…</span></div>`.
  // One left-to-right scan keeps document order: prefer the span value; else
  // take the bare text up to the closing </p>.
  const fields: { label: string; value: string }[] = []
  const fieldRe =
    /<label>([\s\S]*?)<\/label>\s*(?:<span class="content">([\s\S]*?)<\/span>|([\s\S]*?)<\/p>)/gi
  let pm: RegExpExecArray | null
  while ((pm = fieldRe.exec(ficha))) {
    const label = text(pm[1])
    const value = text(pm[2] ?? pm[3] ?? '')
    if (label && value) fields.push({ label, value })
  }
  const byLabel = (want: string): string | undefined => {
    const w = want.toLowerCase()
    return fields.find((f) => f.label.toLowerCase() === w)?.value
  }

  // "Lugar puesto de trabajo" → Municipio / Provincia / CP.
  const lugar = byLabel('Lugar puesto de trabajo') || ''
  const muniM = lugar.match(/Municipio:\s*([^,]+?)\s*,\s*Provincia:\s*([^,]+?)\s*,\s*CP:\s*(\d+)/i)

  // "Ocupaciones solicitadas" → the <ul> immediately after that <h3> only,
  // so the Carnets / Conocimientos sub-section lists don't bleed in.
  const ocupaciones: Ocupacion[] = []
  const occSection = ficha.match(/<h3>\s*Ocupaciones solicitadas\s*<\/h3>\s*<ul>([\s\S]*?)<\/ul>/i)
  if (occSection) {
    for (const li of occSection[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
      const raw = text(li[1])
      if (!raw) continue
      const expM = raw.match(/Experiencia requerida:\s*(.+)$/i)
      const nombre = raw.replace(/Experiencia requerida:.*$/i, '').trim()
      if (!nombre) continue
      ocupaciones.push(expM ? { nombre, experiencia: expM[1].trim() } : { nombre })
    }
  }

  return {
    fields,
    tipoContrato: byLabel('Tipo de contrato'),
    duracion: byLabel('Duración del contrato'),
    numPuestos: byLabel('Número de puestos'),
    categoria: byLabel('Categoría profesional'),
    observaciones: byLabel('Observaciones'),
    municipio: muniM ? muniM[1].trim() : undefined,
    provincia: muniM ? muniM[2].trim() : undefined,
    cp: muniM ? muniM[3].trim() : undefined,
    jornada: byLabel('Tipo de jornada laboral'),
    horario: byLabel('Horario'),
    salario: byLabel('Salario'),
    funciones: byLabel('Funciones'),
    vehiculo: byLabel('Requiere vehículo propio'),
    ocupaciones,
  }
}
