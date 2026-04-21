/**
 * Parse the individual pleno-convocatoria page on ribarroja.es and extract
 * its "Orden del día" items.
 *
 * The municipal CMS publishes each pleno convocation as:
 *   <div class="cuerpo"> … Orden del día : 1.- … 2.- … Ruegos y preguntas </div>
 *
 * HTML is latin-1 encoded; we decode here so callers can pass a Buffer.
 *
 * Items follow three rough sections:
 *   - heading "Orden del día :"
 *   - "PARTE RESOLUTIVA" (first group; votable)
 *   - "PARTE DE INFORMACIÓN, IMPULSO Y CONTROL DE LOS ÓRGANOS DE GOBIERNO"
 *     (second group; informational)
 *   - finally "Ruegos y preguntas"
 *
 * Individual items look like:
 *   "3.- INTEGRIDAD, Expediente: 4305/2024/GEN, Nueva designación …"
 * or (without expediente):
 *   "1.- Aprobación Actas anteriores de fecha 9 de marzo 2026…"
 */

import { canonicalizeDepartment, type DepartmentSlug } from './departments'

export type PlenoSection = 'resolutiva' | 'informativa' | 'ruegos' | 'apertura' | 'otro'

export interface PlenoAgendaItem {
  number: number
  title: string
  section: PlenoSection
  /** Raw department string as it appears in the acta (kept for traceability). */
  department: string | null
  /**
   * Canonical kebab-case department slug (via canonicalizeDepartment).
   * Null when the raw department is missing or doesn't match any rule.
   * Derived at parse time — never used as a fact-check claim on its own;
   * the aggregator only counts agenda items as "commitments" when a
   * matching pleno-vote exists.
   */
  departmentSlug: DepartmentSlug | null
  expediente: string | null
}

export interface PlenoAgenda {
  raw: string
  items: PlenoAgendaItem[]
}

function decodeBuffer(buf: Buffer | string): string {
  if (typeof buf === 'string') return buf
  const asUtf = buf.toString('utf8')
  // Detect mojibake caused by latin-1 content read as UTF-8. Common markers:
  //   "Ã³" (ó), "Ã­" (í), "Ã©" (é), "Ã±" (ñ)
  // The raw U+FFFD replacement char is the other fallback signal.
  if (/\uFFFD/.test(asUtf) || /Ã[©³­±¡¨¼]/.test(asUtf)) {
    return buf.toString('latin1')
  }
  // If the document declares latin-1 explicitly and the utf-8 decode produced
  // none of the accented Spanish characters we'd expect, also fall back.
  if (
    /charset=ISO-8859-1/i.test(asUtf) &&
    !/[áéíóúñÁÉÍÓÚÑ]/.test(asUtf)
  ) {
    return buf.toString('latin1')
  }
  return asUtf
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ',
  ordm: 'º', ordf: 'ª',
  middot: '·',
  uuml: 'ü', Uuml: 'Ü',
  iquest: '¿', iexcl: '¡',
  euro: '€',
  deg: '°',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  laquo: '«', raquo: '»',
  ndash: '–', mdash: '—',
  hellip: '…',
  trade: '™', copy: '©', reg: '®',
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]
        : whole
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCuerpo(html: string): string | null {
  // Find the <div class="cuerpo"> … </div> enclosing the orden del día.
  const m = html.match(/<div\s+class="cuerpo"[^>]*>([\s\S]*?)<div[^>]+class="pie"/i)
  if (m) return m[1]
  const alt = html.match(/<div\s+class="cuerpo"[^>]*>([\s\S]*)$/i)
  return alt ? alt[1] : null
}

function parseItems(text: string): { items: PlenoAgendaItem[]; raw: string } {
  // Crop to the orden-del-día region.
  const ordenIdx = text.search(/Orden del d[ií]a\s*:/i)
  if (ordenIdx < 0) return { items: [], raw: text }
  let body = text.slice(ordenIdx)
  // Trim after "Ruegos y preguntas" + trailing numeric marker (common CMS exit)
  const endIdx = body.search(/Compartir\b|¿Te sirvió\?|Para el correcto funcionamiento/i)
  if (endIdx > 0) body = body.slice(0, endIdx)

  const items: PlenoAgendaItem[] = []
  let currentSection: PlenoSection = 'apertura'

  // Match "N.- …" chunks (N = 1-99). The "reluctant" regex captures up to the next
  // numbered item or the end-of-region sentinels.
  const re = /(\d{1,3})\.-\s*([^]+?)(?=\s*\d{1,3}\.-|Compartir|¿Te sirvió\?|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const num = parseInt(m[1], 10)
    const raw = m[2].trim().replace(/\s+/g, ' ')

    // Detect section switches embedded inside the item text (section headers
    // appear inline right before the next item number).
    const sectionBefore = /PARTE\s+RESOLUTIVA/i.test(raw)
      ? 'resolutiva'
      : /PARTE\s+DE\s+INFORMACI[ÓO]N/i.test(raw)
      ? 'informativa'
      : null

    // Strip out the section header if it's embedded.
    const cleaned = raw
      .replace(/PARTE\s+RESOLUTIVA/gi, '')
      .replace(/PARTE\s+DE\s+INFORMACI[ÓO]N[,\s]*IMPULSO\s+Y\s+CONTROL\s+DE\s+LOS\s+[OÓ]RGANOS\s+DE\s+GOBIERNO/gi, '')
      .trim()

    // Department + expediente extraction. Typical shapes:
    //   "TRANSPARENCIA, Expediente: 1741/2026/GEN, Carta de servicios 2026"
    //   "URBANISMO, Expediente: 717/2026/GEN, Acuerdo relativo …"
    //   "Aprobación Actas anteriores de fecha 9 de marzo 2026 …"  (no dept)
    let department: string | null = null
    let expediente: string | null = null
    let title = cleaned
    const headerMatch = cleaned.match(
      /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,30}?),\s*Expediente:\s*([0-9]+\/[0-9]{4}[A-Z/0-9]*),?\s*(.*)$/i
    )
    if (headerMatch) {
      department = headerMatch[1].trim()
      expediente = headerMatch[2].trim()
      title = headerMatch[3].trim() || department
    } else {
      // Fallback: catch "N/YYYY/CODE" patterns like "10/2026/PGRU" (moción).
      const inlineExp = cleaned.match(/^(\d+\/\d{4}\/[A-Z]+)[,\s]*(.*)$/)
      if (inlineExp) {
        expediente = inlineExp[1]
        title = inlineExp[2].trim() || cleaned
      }
    }

    let itemSection = currentSection
    if (sectionBefore) {
      itemSection = sectionBefore
      currentSection = sectionBefore
    }
    if (/ruegos\s+y\s+preguntas/i.test(title)) {
      itemSection = 'ruegos'
      currentSection = 'ruegos'
    }

    items.push({
      number: num,
      title: title.replace(/\.$/, '').trim(),
      section: itemSection,
      department,
      departmentSlug: canonicalizeDepartment(department),
      expediente,
    })
  }

  return { items, raw: body.slice(0, 5000) }
}

export function parsePlenoAgenda(input: Buffer | string): PlenoAgenda | null {
  const html = decodeBuffer(input)
  const cuerpo = extractCuerpo(html)
  if (!cuerpo) return null
  const text = htmlToText(cuerpo)
  const { items, raw } = parseItems(text)
  if (items.length === 0) return null
  // Enforce strictly-increasing number ordering (defensive).
  items.sort((a, b) => a.number - b.number)
  return { raw, items }
}
