/**
 * Parse the Ayuntamiento's plenos index page.
 * URL pattern: http://www.ribarroja.es/plenos/<year>
 *
 * Links look like:
 *   <a href="/avisos_urgentes/pleno_ordinario_4_de_diciembre_de_2023/…">
 *     Pleno ordinario 4 de diciembre de 2023
 *   </a>
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

function extractDate(title: string, fallbackYear: number): string | null {
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
