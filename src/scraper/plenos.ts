/**
 * Two parsers for the same conceptual data — the council's pleno index —
 * across two source platforms:
 *
 * 1. `parsePlenosIndex` — legacy ribarroja.es /plenos/<year> HTML. Kept
 *    available so the historical fixture test continues to pass.
 *    Upstream retired 2026-05-25 (HTTP path ECONNRESET, HTTPS 404).
 *
 * 2. `parseRegmeetSessions` — new Regmeet SaaS index at
 *    regmeet.com/aytoribarroja/sesiones_categorias/<entityHash>/<year>.
 *    Server-rendered table; each row is a <tr class="tabla-sesiones">
 *    with date, type label, and a participaciones/<hash> "Ver" link.
 */

export type PlenoKind = 'ordinario' | 'extraordinario' | 'urgente' | 'otro'

export interface PlenoItem {
  id: string
  title: string
  date: string // YYYY-MM-DD
  kind: PlenoKind
  link: string
}

interface ParseOpts {
  year: number
  baseUrl: string
}

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function classify(title: string): PlenoKind {
  const lc = title.toLowerCase()
  if (lc.includes('extraordinario') && lc.includes('urgente')) return 'urgente'
  if (lc.includes('extraordinario')) return 'extraordinario'
  if (lc.includes('urgente')) return 'urgente'
  if (lc.includes('ordinario')) return 'ordinario'
  return 'otro'
}

function extractDate(title: string, _fallbackYear: number): string | null {
  // "Pleno ordinario 4 de diciembre de 2023"
  const m = title.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const mes = MESES[m[2].toLowerCase()]
  const yr = parseInt(m[3], 10)
  if (!day || !mes || !yr) return null
  return `${yr}-${String(mes).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(36)
}

interface RegmeetParseOpts {
  year: number
  /** Origin used to build absolute participaciones URLs. Defaults to regmeet.com. */
  baseUrl?: string
  /**
   * Optional date→id table so net-new sessions reuse the IDs already in
   * plenos.json. Downstream files (pleno-claims, pleno-findings, …) key
   * off plenoId; rotating IDs on a source migration would orphan them.
   */
  existingIdByDate?: Map<string, string>
}

const REGMEET_BASE = 'https://regmeet.com'
const REGMEET_LINK_RE = /\/aytoribarroja\/participaciones\/[a-f0-9]+/i
const REGMEET_DATE_RE = /(\d{2})-(\d{2})-(\d{4})/
const REGMEET_LONG_DATE_RE = /Sesi[oó]n\s+de\s+fecha\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i

function classifyRegmeet(typeLabel: string): PlenoKind {
  const lc = typeLabel.toLowerCase()
  if (lc.includes('extraordinaria') && lc.includes('urgent')) return 'urgente'
  if (lc.includes('extraordinaria')) return 'extraordinario'
  if (lc.includes('urgent')) return 'urgente'
  if (lc.includes('ordinaria')) return 'ordinario'
  return 'otro'
}

/**
 * Parse a single year's Regmeet session-index page. Returns newest-first.
 *
 * The HTML is server-rendered (jQuery DataTables seed) with one
 * `<tr class="tabla-sesiones">` per session containing:
 *
 *   - `<td>DD-MM-YYYY</td>`             (short date)
 *   - `<td>Sesiones plenarias …</td>`   (type label, drives kind)
 *   - `<td>Sesión de fecha … de … de YYYY</td>`  (display title)
 *   - `<td><a href="/aytoribarroja/participaciones/<hash>?…"></a></td>`
 */
export function parseRegmeetSessions(html: string, opts: RegmeetParseOpts): PlenoItem[] {
  const base = (opts.baseUrl || REGMEET_BASE).replace(/\/+$/, '')
  const items: PlenoItem[] = []
  const seenLink = new Set<string>()
  // Split into <tr class="tabla-sesiones"> blocks. Each is self-contained.
  const rowRe = /<tr[^>]*class="[^"]*tabla-sesiones[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const block = rowMatch[1]
    const dateMatch = block.match(REGMEET_DATE_RE)
    if (!dateMatch) continue
    const [, dd, mm, yyyy] = dateMatch
    const date = `${yyyy}-${mm}-${dd}`
    if (!date.startsWith(String(opts.year))) continue
    const linkMatch = block.match(REGMEET_LINK_RE)
    if (!linkMatch) continue
    const path = linkMatch[0]
    const link = base + path + '?idioma=castellano'
    if (seenLink.has(link)) continue
    seenLink.add(link)
    // Title preference: the "Sesión de fecha …" long form if present, else
    // build one from the date so /plenos still shows something readable.
    const longMatch = block.match(REGMEET_LONG_DATE_RE)
    const title = longMatch
      ? longMatch[0].replace(/\s+/g, ' ').trim()
      : `Sesión de ${dd}-${mm}-${yyyy}`
    // Type label drives kind classification.
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    const typeLabel = cells.find((c) => /sesiones plenarias/i.test(c)) || ''
    const kind = classifyRegmeet(typeLabel)
    // ID preservation: prefer an existing plenos.json id keyed by date so
    // downstream cross-references (pleno-claims, pleno-findings, …) survive
    // the source migration. New sessions get an FNV hash of the Regmeet link.
    const id = opts.existingIdByDate?.get(date) ?? fnv(link)
    items.push({ id, title, date, kind, link })
  }
  items.sort((a, b) => b.date.localeCompare(a.date))
  return items
}

export function parsePlenosIndex(html: string, opts: ParseOpts): PlenoItem[] {
  const items: PlenoItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*?(?:Pleno|pleno)[^<]*)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = m[1]
    const title = m[2].replace(/\s+/g, ' ').trim()
    if (!/pleno/i.test(title)) continue
    const date = extractDate(title, opts.year)
    if (!date) continue
    if (!date.startsWith(String(opts.year))) continue
    const link = /^https?:/.test(href)
      ? href
      : opts.baseUrl.replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href)
    const id = fnv(link || title)
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      title,
      date,
      kind: classify(title),
      link,
    })
  }
  items.sort((a, b) => b.date.localeCompare(a.date))
  return items
}
