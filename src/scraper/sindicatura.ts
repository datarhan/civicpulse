/**
 * Sindicatura de Comptes de la Comunitat Valenciana — the regional audit court.
 * The missing "ex-post" accountability pillar next to Síndic de Greuges
 * (sindic.ts) and CTBG (ctbg.ts): PLACSP/Gobierto show what was *awarded*; the
 * Sindicatura audits, after the fact, whether public money was managed correctly.
 *
 * Pure parser: the `/informes?text=Riba-roja de Túria&type=full` search (which
 * indexes PDF *content*) returns an HTML table of every fiscalización report
 * that names the town. We classify each:
 *   - `dedicated`  — the report's TITLE names Riba-roja (an audit ABOUT the town,
 *     e.g. the 2017-2019 internal-control audit with its 27 deficiencies);
 *   - `sectoral`   — Riba-roja appears only inside the PDF (a sector-wide sweep).
 * The CLI keeps the dedicated ones + the local-entity sectoral ones
 * (isLocalEntityReport) and reports the rest as a count, so the card is honest
 * without drowning in 145 tangential mentions.
 *
 * No network, no fs — the CLI (scripts/scrape-sindicatura.ts) owns fetch + write.
 */

const BASE = 'https://www.sindicom.gva.es'
const RIBA_ROJA = /riba-?roja/i

export type SindicaturaScope = 'dedicated' | 'sectoral'

export interface SindicaturaReport {
  id: string
  title: string
  year: number
  url: string
  scope: SindicaturaScope
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse the Sindicatura `/informes` search-results table into typed reports. */
export function parseSindicaturaSearch(html: string): SindicaturaReport[] {
  const out: SindicaturaReport[] = []
  const seen = new Set<string>()
  const rowRe = /<tr[^>]*id="js-fila-informe(\d+)"[^>]*>([\s\S]*?)<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html)) !== null) {
    const rid = m[1]
    const body = m[2]
    const tds = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]))
    const year = parseInt(tds[0] || '', 10)
    const title = tds[1] || ''
    const href = body.match(/href="([^"]+\.pdf)"/i)
    if (!title || !Number.isInteger(year) || !href) continue
    const url = href[1].startsWith('http') ? href[1] : `${BASE}${href[1]}`
    const id = `sindicatura-${rid}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title,
      year,
      url,
      scope: RIBA_ROJA.test(title) ? 'dedicated' : 'sectoral',
    })
  }
  return out
}

/**
 * Is a sectoral report one where Riba-roja is a genuine audit subject (a
 * local-entities sweep) rather than an incidental mention (a Generalitat /
 * university / hospital report)?
 */
export function isLocalEntityReport(title: string): boolean {
  return /entidad(es)? local|entitat|ayuntamiento|ajuntament|\bEELL\b|municipal|\blocales\b/i.test(
    title,
  )
}
