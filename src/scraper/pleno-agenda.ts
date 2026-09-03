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

import { load } from 'cheerio'
import { canonicalizeDepartment, DEPARTMENT_LABEL, type DepartmentSlug } from './departments'

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
  if (/charset=ISO-8859-1/i.test(asUtf) && !/[áéíóúñÁÉÍÓÚÑ]/.test(asUtf)) {
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
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  ordm: 'º',
  ordf: 'ª',
  middot: '·',
  uuml: 'ü',
  Uuml: 'Ü',
  iquest: '¿',
  iexcl: '¡',
  euro: '€',
  deg: '°',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  trade: '™',
  copy: '©',
  reg: '®',
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole,
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCuerpo(html: string): string | null {
  // Find the <div class="cuerpo"> … </div> enclosing the orden del día.
  const m = html.match(/<div\s+class="cuerpo"[^>]*>([\s\S]*?)<div[^>]+class="pie"/i)
  if (m) return m[1]
  // Fallback when no "pie" closer exists: bound the scan — a real cuerpo
  // fits comfortably in 200 KB, and an arbitrarily-corrupt CMS page should
  // not make this unanchored tail-capture chew the whole document.
  const alt = html.slice(0, 200_000).match(/<div\s+class="cuerpo"[^>]*>([\s\S]*)$/i)
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
      .replace(
        /PARTE\s+DE\s+INFORMACI[ÓO]N[,\s]*IMPULSO\s+Y\s+CONTROL\s+DE\s+LOS\s+[OÓ]RGANOS\s+DE\s+GOBIERNO/gi,
        '',
      )
      .trim()

    // Department + expediente extraction. Typical shapes:
    //   "TRANSPARENCIA, Expediente: 1741/2026/GEN, Carta de servicios 2026"
    //   "URBANISMO, Expediente: 717/2026/GEN, Acuerdo relativo …"
    //   "Aprobación Actas anteriores de fecha 9 de marzo 2026 …"  (no dept)
    let department: string | null = null
    let expediente: string | null = null
    let title = cleaned
    const headerMatch = cleaned.match(
      /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,30}?),\s*Expediente:\s*([0-9]+\/[0-9]{4}[A-Z/0-9]*),?\s*(.*)$/i,
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

/**
 * Parse the Regmeet (post-2026-05 upstream) session page. The Ayuntamiento
 * migrated its plenos from the in-house ribarroja.es CMS to regmeet.com, which
 * publishes the orden del día as `<table id="tableOrdenDia">`. Each numbered
 * row ("N. …") is an agenda item; the interleaved rows (speaker name + cargo)
 * are filtered out. Regmeet does NOT tag a department per item — unlike the old
 * "DEPARTMENT, Expediente:" prefix — so the department is INFERRED from the
 * item title via canonicalizeDepartment (keyword match, null when none).
 */
function parseRegmeetAgenda(html: string): { items: PlenoAgendaItem[]; raw: string } | null {
  const $ = load(html)
  const table = $('#tableOrdenDia')
  if (!table.length) return null

  const items: PlenoAgendaItem[] = []
  table.find('tr').each((_, tr) => {
    const cell = $(tr).find('td').first()
    cell.find('script, style').remove()
    const cellText = cell.text().replace(/\s+/g, ' ').trim()
    const m = cellText.match(/^(\d{1,3})\.\s+(.+)$/)
    if (!m) return // speaker / non-item row (no leading "N. ")
    const number = parseInt(m[1], 10)

    // Drop the audio-player tail: the "(HH:MM:SS)" timestamp + outcome and any
    // leftover inline CSS/JS braces that bleed into the cell text.
    let body = m[2]
      .replace(/\(\d{1,2}:\d{2}:\d{2}\)[\s\S]*$/, '')
      .replace(/[{#][\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Expediente: "Expediente: 1926/2026/GEN", "Expediente 2162/2026/GEN", or a
    // leading moción code "13/2026/PGRU". Strip it out of the title once found.
    let expediente: string | null = null
    const expLabelled = body.match(/Expediente:?\s*(\d+\/\d{4}(?:\/[A-Z]+)?)/i)
    if (expLabelled) {
      expediente = expLabelled[1]
      body = body.replace(/Expediente:?\s*\d+\/\d{4}(?:\/[A-Z]+)?,?\s*/i, '').trim()
    } else {
      const leadCode = body.match(/^(\d+\/\d{4}\/[A-Z]+),?\s*(.*)$/)
      if (leadCode) {
        expediente = leadCode[1]
        body = (leadCode[2] || body).trim()
      }
    }

    const title = body.replace(/\.$/, '').trim()
    if (title.length < 3) return

    // Section: ruegos y preguntas > informativa (dación/dar cuenta) > resolutiva.
    const section: PlenoSection = /ruegos?\s+y\s+preguntas|^ruegos\b|\bpreguntas?\b/i.test(title)
      ? 'ruegos'
      : /daci[oó]n\s+(?:de\s+)?cuenta|dar\s+cuenta|rendici[oó]n\s+de\s+cuentas/i.test(title)
        ? 'informativa'
        : 'resolutiva'

    const slug = canonicalizeDepartment(title)
    const department = slug ? DEPARTMENT_LABEL[slug].es : null

    items.push({ number, title, section, department, departmentSlug: slug, expediente })
  })

  if (items.length === 0) return null
  items.sort((a, b) => a.number - b.number)
  return { items, raw: table.text().replace(/\s+/g, ' ').slice(0, 5000) }
}

export function parsePlenoAgenda(input: Buffer | string): PlenoAgenda | null {
  const html = decodeBuffer(input)

  // Regmeet (current upstream) publishes the agenda in <table id="tableOrdenDia">.
  if (/id=["']tableOrdenDia["']/i.test(html)) {
    return parseRegmeetAgenda(html)
  }

  // Legacy ribarroja.es CMS (<div class="cuerpo"> … Orden del día :).
  const cuerpo = extractCuerpo(html)
  if (!cuerpo) return null
  const text = htmlToText(cuerpo)
  const { items, raw } = parseItems(text)
  if (items.length === 0) return null
  // Enforce strictly-increasing number ordering (defensive).
  items.sort((a, b) => a.number - b.number)
  return { raw, items }
}

/** A pleno from the index, enriched with its parsed orden del día. */
export interface EnrichedPleno {
  id: string
  date: string
  title: string
  kind: string
  link: string
  agenda: PlenoAgendaItem[]
  agendaCount: number
  departments: string[]
  hasRuegos: boolean
}

/**
 * Merge this run's fetched agendas over the stored snapshot.
 *
 * The snapshot used to be rebuilt from the 30 most-recent sessions, which
 * left 29 of 61 pleno pages with no orden del día and silently dropped the
 * oldest covered sessions each time the window slid. Merging means a session
 * keeps its agenda once fetched, so coverage only ever grows.
 *
 * Two guards, both from the f4fa424 incident (a dead upstream served shell
 * pages that parsed to zero items and blanked every department dashboard):
 * an empty fetch never overwrites a stored agenda, and an empty fetch for an
 * unknown session is dropped rather than published — a stored
 * `agendaCount: 0` reads on the page as "this session had no agenda points",
 * which is a claim we cannot support when the truth is that we never got it.
 */
export function mergeAgendaPlenos(
  existing: EnrichedPleno[],
  fetched: EnrichedPleno[],
): { plenos: EnrichedPleno[]; carriedForward: number; refreshed: number } {
  const byId = new Map<string, EnrichedPleno>()
  for (const p of existing) byId.set(p.id, p)

  let refreshed = 0
  for (const f of fetched) {
    if (f.agendaCount === 0) continue // never let an empty walk erase or assert
    byId.set(f.id, f)
    refreshed += 1
  }

  const plenos = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { plenos, carriedForward: plenos.length - refreshed, refreshed }
}

/** Un departamento del recuento, con su cuenta de PUNTOS del orden del día. */
export interface DepartmentTally {
  department: string
  count: number
  departmentSlug: DepartmentSlug | null
}

/**
 * Recuento de departamentos sobre los puntos del orden del día, con su
 * denominador.
 *
 * Vivía dentro de `scripts/scrape-pleno-agendas.ts`, donde no se podía probar.
 * Sale aquí porque el defecto que arregla es de aritmética, no de red.
 *
 * `itemsWithDepartment` es la mitad que faltaba. La tarjeta de `/plenos`
 * rotulaba «399 puntos» y debajo ponía una fila de departamentos que suma 93;
 * de esos 399, sólo 109 llevan departamento. Un lector no tenía forma de saber
 * que el 73 % no está clasificado, y la regla de la casa es que una capa que
 * enseña una fracción de su dominio lo diga.
 *
 * El numerador ya se arregló una vez: contaba SESIONES y ponía «Contratación ·
 * 5» debajo de «377 puntos». Se cuentan puntos desde entonces, y la prueba lo
 * fija para que no vuelva.
 */
export function tallyDepartments(plenos: Pick<EnrichedPleno, 'agenda'>[]): {
  itemsTotal: number
  itemsWithDepartment: number
  deptCount: Record<string, number>
  topDepartments: DepartmentTally[]
} {
  const deptCount: Record<string, number> = {}
  let itemsTotal = 0
  let itemsWithDepartment = 0
  for (const p of plenos) {
    for (const a of p.agenda ?? []) {
      itemsTotal += 1
      const d = a.departmentSlug || a.department
      if (!d) continue
      itemsWithDepartment += 1
      deptCount[d] = (deptCount[d] || 0) + 1
    }
  }
  const topDepartments = Object.entries(deptCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([department, count]) => ({
      department,
      count,
      departmentSlug: canonicalizeDepartment(department),
    }))
  return { itemsTotal, itemsWithDepartment, deptCount, topDepartments }
}
