/**
 * Deterministic legal-record row synthesis — the LLM extractor keeps
 * routing judicial documents into prose even under a MANDATORY prompt
 * rule (2026-07-30: informe 02/2021 + BOP 139/19 stayed narrative-only
 * twice), so the structured legal track is extracted deterministically
 * from the fetched OFFICIAL documents themselves and merged when the
 * LLM emits nothing.
 *
 * Libel discipline: every row carries (a) a docket/reference matched
 * verbatim in the document, (b) the issuing body derived from the same
 * document's title/text — rows whose issuing body cannot be derived are
 * DROPPED (an honest miss beats an unattributed legal row), and (c) a
 * verbatim ±window as verbatimRef. No outcome is inferred; `outcome`
 * stays absent for a curator or the LLM to fill from the document.
 */

export interface LegalBody {
  citationId: string
  title: string
  excerpt: string
}

export interface SynthesizedLegalRow {
  caseRef: string
  court: string
  verbatimRef: string
  sourceIds: string[]
}

// «sentencia 139/19», «Informe 02/2021», «expediente número 2019/8305»,
// «resolución 4/2020» — keyword + bounded filler (accent-safe: 'número'
// contains ú, which \w does not match) + NNN/NNNN reference.
const DOCKET_RE =
  /\b(sentencia|informe|expediente|resoluci[oó]n|auto)\b[^\d\n]{0,20}?(\d{1,5}[/-]\d{2,4})\b/gi

const ISSUER_PATTERNS: Array<{ rx: RegExp; label: string }> = [
  {
    rx: /junta superior de contractaci[oó]|junta superior de contrataci[oó]n/i,
    label: 'Junta Superior de Contractació Administrativa (GVA)',
  },
  { rx: /juzgado de lo social/i, label: 'Juzgado de lo Social' },
  { rx: /juzgado de lo contencioso/i, label: 'Juzgado de lo Contencioso-Administrativo' },
  {
    rx: /tribunal superior de just[ií]cia|TSJCV|TSJ de la Comunidad Valenciana/i,
    label: 'Tribunal Superior de Justícia de la Comunitat Valenciana',
  },
  { rx: /tribunal supremo/i, label: 'Tribunal Supremo' },
  {
    rx: /tribunal de cuentas|sindicatura de comptes/i,
    label: 'Sindicatura de Comptes / Tribunal de Cuentas',
  },
  { rx: /tribunal econ[oó]mico-administrativo|TEAR/i, label: 'Tribunal Económico-Administrativo' },
]

function deriveIssuer(text: string): string | null {
  for (const { rx, label } of ISSUER_PATTERNS) {
    if (rx.test(text)) return label
  }
  return null
}

function verbatimWindow(text: string, index: number, matchLen: number): string {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + matchLen + 120)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

// A gazette daily bulletin concatenates dozens of unrelated announcements;
// its masthead repeats between them. ≥2 repeats ⇒ multi-announcement.
const BULLETIN_MASTHEAD_RE = /N\.º\s*\d+\s|BUTLLET[IÍ] OFICIAL|BOLET[IÍ]N OFICIAL/gi

function isMultiAnnouncementBulletin(text: string): boolean {
  return (text.match(BULLETIN_MASTHEAD_RE) ?? []).length >= 2
}

function foldForSubject(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * One row per distinct docket reference found in judicial bodies —
 * ONLY where the docket is about the SUBJECT.
 *
 * Subject-proximity rule (root cause of the 2026-07-30 false
 * association, where the subject's wedding-delegation edicto and an
 * unrelated company's labor execution shared one BOP bulletin): in a
 * multi-announcement bulletin the subject's surname pair must appear
 * within ±800 chars of the docket match; in a single document it must
 * appear anywhere. No surname, no row — an honest miss beats a false
 * judicial imputation on a named living person.
 */
export function synthesizeLegalRecordRows(
  bodies: LegalBody[],
  subjectName: string,
): SynthesizedLegalRow[] {
  const surnameTokens = foldForSubject(subjectName).trim().split(/\s+/)
  const surnames = surnameTokens.length >= 2 ? surnameTokens.slice(-2).join(' ') : subjectName
  const seen = new Set<string>()
  const rows: SynthesizedLegalRow[] = []
  for (const body of bodies) {
    const haystack = `${body.title}\n${body.excerpt}`
    const folded = foldForSubject(haystack)
    if (!folded.includes(surnames)) continue
    const issuer = deriveIssuer(haystack)
    if (!issuer) continue
    const multi = isMultiAnnouncementBulletin(haystack)
    for (const m of haystack.matchAll(DOCKET_RE)) {
      const at = m.index ?? 0
      if (multi) {
        const windowFolded = foldForSubject(
          haystack.slice(Math.max(0, at - 800), at + m[0].length + 800),
        )
        if (!windowFolded.includes(surnames)) continue
      }
      const keyword = m[1].toLowerCase()
      const ref = m[2].replace('-', '/')
      const caseRef = `${keyword} ${ref}`
      const key = caseRef.replace(/\s+/g, ' ')
      if (seen.has(key)) continue
      const verbatimRef = verbatimWindow(haystack, at, m[0].length)
      if (verbatimRef.length < 20) continue
      seen.add(key)
      rows.push({ caseRef, court: issuer, verbatimRef, sourceIds: [body.citationId] })
    }
  }
  return rows
}

export interface LlmLegalRow extends SynthesizedLegalRow {
  date?: string
  outcome?: string
}

/**
 * Union merge — the engineering answer to "the LLM ignores structural
 * mandates" (it routed judicial docs to prose twice under a MANDATORY
 * prompt rule, 2026-07-30): the deterministic pass provides the FLOOR,
 * the LLM only ENRICHES, and this merge guarantees the floor by
 * construction. Keyed by folded caseRef: an LLM row on the same docket
 * wins field-wise (it saw the full body and can add date/outcome and a
 * more precise court); seeds with no LLM counterpart are appended
 * verbatim; LLM-added dockets the deterministic pass missed are kept.
 * `appendedSeeds` tells the caller how many rows the LLM dropped, for
 * the warning trail.
 */
export function mergeLegalRows(
  seeds: SynthesizedLegalRow[],
  llmRows: LlmLegalRow[],
): { rows: LlmLegalRow[]; appendedSeeds: number } {
  const keyOf = (r: SynthesizedLegalRow) => r.caseRef.toLowerCase().replace(/\s+/g, ' ').trim()
  const rows: LlmLegalRow[] = [...llmRows]
  const llmKeys = new Set(llmRows.map(keyOf))
  let appendedSeeds = 0
  for (const seed of seeds) {
    if (llmKeys.has(keyOf(seed))) continue
    rows.push(seed)
    appendedSeeds += 1
  }
  return { rows, appendedSeeds }
}
