/**
 * Parse a Sindicatura de Comptes "control interno" audit report (plain text
 * extracted from the signed PDF by pdf-parse) into structured findings:
 *   - deficiencies — the numbered "salvedades" (§4 "Fundamento de la opinión con
 *     salvedades"), each tagged with its thematic area subheading;
 *   - recommendations — the numbered list in §7 "Recomendaciones".
 *
 * Pure (text → findings). The CLI (scripts/scrape-sindicatura.ts) downloads the
 * PDF + runs pdf-parse; this module never touches network or fs. Conservative:
 * on text that isn't a control-interno report, both lists come back empty.
 */

export interface AuditDeficiency {
  n: number
  category: string
  text: string
}
export interface AuditRecommendation {
  n: number
  text: string
}
export interface AuditFindings {
  deficiencies: AuditDeficiency[]
  recommendations: AuditRecommendation[]
}

// Thematic area subheadings that segment the salvedades list (stable across the
// Sindicatura's control-interno reports). Longest-first so a super-heading never
// shadows a more specific one when both are prefixes.
const AREA_HEADINGS = [
  'Información económico-financiera y su fiabilidad',
  'Estabilidad presupuestaria, control del gasto y ciclo presupuestario',
  'Operaciones de los sistemas de información',
  'Protección de los bienes de la entidad',
  'Cumplimiento de la normativa aplicable',
  'Organización y regulación',
  'Entorno tecnológico',
  'Marco organizativo',
  'Control financiero',
  'Otros aspectos',
  'Personal',
].sort((a, b) => b.length - a.length)

const PAGE_HEADER = /Informe de fiscalización sobre el control interno/
const LONE_NUM = /^\d{1,3}$/ // page number or footnote superscript on its own line
const FOOTNOTE_DEF =
  /^\d{1,2}\s+(Artículo|Artigo|Capítulo|Ley|Real|Disposición|Orden|Decreto|LO\b|Ver\b)/

/** Drop page headers/footers, lone page-numbers/superscripts and footnote definitions. */
function cleanLines(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !PAGE_HEADER.test(l) && !LONE_NUM.test(l) && !FOOTNOTE_DEF.test(l))
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .replace(/\s+%/g, '%')
    .trim()
}

/** The whole text between an (uppercase) start heading and an end heading. */
function sliceBetween(text: string, start: RegExp, end: RegExp): string {
  const s = text.search(start)
  if (s < 0) return ''
  const rest = text.slice(s)
  const e = rest.search(end)
  return e < 0 ? rest : rest.slice(0, e)
}

function matchedHeading(line: string): string | null {
  for (const h of AREA_HEADINGS) if (line === h || line.startsWith(h)) return h
  return null
}

function parseDeficiencies(text: string): AuditDeficiency[] {
  const section = sliceBetween(
    text,
    /FUNDAMENTO DE LA OPINIÓN CON SALVEDADES/,
    /OPINIÓN CON SALVEDADES SOBRE EL CONTROL INTERNO/,
  )
  if (!section) return []
  const out: AuditDeficiency[] = []
  let category = ''
  let current: AuditDeficiency | null = null
  for (const line of cleanLines(section)) {
    const heading = matchedHeading(line)
    if (heading) {
      category = heading
      continue
    }
    const m = line.match(/^(\d{1,2})\)\s*(.*)$/)
    if (m) {
      if (current) out.push({ ...current, text: tidy(current.text) })
      current = { n: parseInt(m[1], 10), category, text: m[2] }
    } else if (current) {
      current.text += ' ' + line
    }
  }
  if (current) out.push({ ...current, text: tidy(current.text) })
  return out
}

function parseRecommendations(text: string): AuditRecommendation[] {
  const section = sliceBetween(text, /7\.\s*RECOMENDACIONES/, /APÉNDICE\s*1/)
  if (!section) return []
  const out: AuditRecommendation[] = []
  let current: AuditRecommendation | null = null
  for (const line of cleanLines(section)) {
    // Skip the "7. RECOMENDACIONES" heading itself (the slice includes it).
    if (/RECOMENDACIONES/.test(line)) continue
    // Chart data leaks in after the last item — stop the current rec at it.
    if (/^\d+([.,]\d+)?\s*%/.test(line) || /^Gráfico\b/.test(line)) {
      if (current) {
        out.push({ ...current, text: tidy(current.text) })
        current = null
      }
      continue
    }
    const m = line.match(/^(\d{1,2})\.\s+(.*)$/)
    if (m) {
      if (current) out.push({ ...current, text: tidy(current.text) })
      current = { n: parseInt(m[1], 10), text: m[2] }
    } else if (current) {
      current.text += ' ' + line
    }
  }
  if (current) out.push({ ...current, text: tidy(current.text) })
  // Cut any residual chart labels off the last recommendation.
  return out.map((r) => ({ ...r, text: r.text.split(/\s+\d+([.,]\d+)?\s*%/)[0].trim() }))
}

export function parseAuditFindings(text: string): AuditFindings {
  return {
    deficiencies: parseDeficiencies(text),
    recommendations: parseRecommendations(text),
  }
}
