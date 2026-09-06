/**
 * Curator CLI — apply an IFCN-style correction to a published journalist
 * report. Appends to `report.corrections[]` and replaces the targeted
 * field on the report in-place.
 *
 *   npm run correct-journalist-report -- <reportId> \
 *       --field <fieldPath> \
 *       --new "<text>" \
 *       --reason "<≥20 chars curator explanation>" \
 *       [--editor "<name>"]
 *
 * `fieldPath` accepts these targets today (kept narrow on purpose):
 *   · narrative.<heading>.bodyMarkdown   — replace the body of the
 *     narrative section whose heading matches.
 *   · narrative.<heading>.heading        — rename the heading.
 *   · quote.<index>.attributedTo         — change the attribution of a
 *     quote card (0-indexed).
 *   · portrait.portfolios[<index>]       — rename one área chip on the
 *     portrait beside the councillor's photograph (0-indexed).
 *   · warnings[<index>]                  — reword one of the curator-signed
 *     caveats of the biography (0-indexed). `area-fit.json` mirrors these BY
 *     INDEX onto /cargos and its validator pins the verbatim, so retract the
 *     mirrored aviso first (`promote-area-fit --aviso … --retract`), correct
 *     here, then re-sign it. Same three fences as the portrait: index in
 *     range, no blank, no copy of a sibling warning.
 *   · career-political[<index>].endYear  — close (or re-date the close of)
 *     one mandate in the biography's political career (0-indexed). Exists
 *     because a councillor who leaves mid-term stays «En el cargo · desde
 *     2023» on her page until somebody closes the row, and a full re-run is
 *     disproportionate for one date. Fenced like the portrait — exactly one
 *     career-political section, index in range — plus what a year needs: a
 *     four-digit YYYY, not before that row's `startYear`, not the value the
 *     row already holds (a no-op correction is a mistake, not a record), and
 *     never `null` or blank — re-opening a closed mandate is a re-run. The
 *     ledger's `original` is `'null'` for an open row, the previous year for
 *     a closed one, so the reader sees `null → 2025`.
 *
 * Re-validates the whole reports snapshot before writing — which, for a
 * warning, includes the judicial-token gate: a corrected caveat that names a
 * court would demand `legalSensitivity: 'high'` and the write would refuse.
 *
 * HOW AN ARRAY ELEMENT FITS A string→string LEDGER. `corrections[]` is flat by
 * design: the reader is shown `<field> · <original> → <corrected>` and nothing
 * else (`CorrectionLog` in src/pages/AgenteReporte.jsx). Serialising the whole
 * `portfolios` array into `original` would bury the one word that changed among
 * six that did not, so the address goes in `field` and the element alone goes in
 * `original`/`corrected`. That keeps the reader-facing line legible and the
 * record precise about what was republished.
 *
 * The index is the part that can misattribute, so it is fenced three ways: the
 * report must carry exactly one portrait, the index is bounds-checked against
 * that portrait as it stands now, and a value already present elsewhere in the
 * list is refused — two identical chips would also collide on the `key={p}`
 * HeroBand renders them with. What this CLI deliberately does NOT do is verify
 * the new value against `officials.json`: a portrait is a point-in-time snapshot
 * of the register, and a correction to it must stay able to restore what the
 * register said then. `check:relations`' `portrait-officials` is where the
 * roster join lives.
 *
 * This is NOT a way to add or drop an área. Renaming is a correction — the same
 * claim, spelled right. Changing which competences a named councillor holds is a
 * different claim, and it belongs in a re-run reviewed by a curator.
 */
import { existsSync, readFileSync } from 'node:fs'
import { rewriteJsonIfPresent, writeSnapshot } from './lib/snapshot-io'
import { resolve } from 'node:path'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportCorrection,
  type JournalistReportsSnapshot,
  type ReportSection,
} from '../src/scraper/journalist'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run correct-journalist-report -- <reportId> --field <fieldPath> \\\n' +
      '      --new "<replacement>" --reason "<≥20 chars>" [--editor "<name>"]\n' +
      '\n' +
      'fieldPath:\n' +
      '  · narrative.<heading>.bodyMarkdown\n' +
      '  · narrative.<heading>.heading\n' +
      '  · quote.<index>.attributedTo\n' +
      '  · portrait.portfolios[<index>]\n' +
      '  · warnings[<index>]\n' +
      '  · career-political[<index>].endYear   (--new YYYY; never null)\n',
  )
  process.exit(2)
}

interface Opts {
  reportId: string
  field: string
  newValue: string
  reason: string
  editor: string
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    reportId: '',
    field: '',
    newValue: '',
    reason: '',
    editor: 'civicpulse-curator',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--field') o.field = argv[++i]
    else if (a === '--new') o.newValue = argv[++i]
    else if (a === '--reason') o.reason = argv[++i]
    else if (a === '--editor') o.editor = argv[++i]
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[correct-journalist-report] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.reportId) o.reportId = a
  }
  if (!o.reportId || !o.field || !o.newValue || !o.reason) usage()
  if (o.reason.trim().length < 20) {
    process.stderr.write('[correct-journalist-report] --reason must be ≥20 chars\n')
    process.exit(2)
  }
  return o
}

const PORTFOLIO_PATH = /^portrait\.portfolios\[(\d+)\]$/
const WARNING_PATH = /^warnings\[(\d+)\]$/
const CAREER_END_PATH = /^career-political\[(\d+)\]\.endYear$/
const YEAR = /^\d{4}$/

export function applyCorrection(
  report: JournalistReport,
  fieldPath: string,
  newValue: string,
): { sections: ReportSection[]; warnings?: string[]; original: string } {
  const sections = JSON.parse(JSON.stringify(report.sections)) as ReportSection[]
  if (fieldPath.startsWith('career-political')) {
    const m = CAREER_END_PATH.exec(fieldPath)
    if (!m)
      throw new Error(
        `career-political must be addressed as career-political[<index>].endYear, got ${fieldPath}`,
      )
    const targetIndex = Number(m[1])
    const careers = sections.filter((s) => s.kind === 'career-political') as Array<
      Extract<ReportSection, { kind: 'career-political' }>
    >
    // Zero would silently close nothing; more than one makes "the mandate at
    // index N" ambiguous, and guessing would end the wrong person's term.
    if (careers.length === 0) throw new Error('no career-political section in this report')
    if (careers.length > 1)
      throw new Error(
        `expected exactly 1 career-political section, found ${careers.length} — ambiguous`,
      )
    const items = careers[0].payload.items
    if (targetIndex >= items.length)
      throw new Error(`career-political index ${targetIndex} out of range (${items.length} items)`)
    const item = items[targetIndex]
    const trimmed = newValue.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null')
      throw new Error(
        'endYear cannot be null or blank — re-opening a mandate is a re-run, not a correction',
      )
    if (!YEAR.test(trimmed))
      throw new Error(`endYear must be a four-digit year (YYYY), got "${trimmed}"`)
    const year = Number(trimmed)
    if (year < item.startYear)
      throw new Error(
        `endYear ${year} is before startYear ${item.startYear} of career-political[${targetIndex}]`,
      )
    if (item.endYear === year)
      throw new Error(
        `career-political[${targetIndex}].endYear is already ${year} — a no-op correction is a mistake, not a record`,
      )
    // The live row stores an open mandate as a MISSING key, not `null`;
    // `String(undefined)` would put "undefined" in the Bitácora.
    const original = item.endYear == null ? 'null' : String(item.endYear)
    item.endYear = year
    return { sections, original }
  }
  if (fieldPath.startsWith('warnings')) {
    const m = WARNING_PATH.exec(fieldPath)
    if (!m) throw new Error(`warnings must be addressed as warnings[<index>], got ${fieldPath}`)
    const targetIndex = Number(m[1])
    const warnings = [...(report.warnings ?? [])]
    if (targetIndex >= warnings.length)
      throw new Error(`warning index ${targetIndex} out of range (${warnings.length} warnings)`)
    const trimmed = newValue.trim()
    if (!trimmed)
      throw new Error('a warning cannot be blank — dropping a caveat is a re-run, not a correction')
    const clash = warnings.findIndex((w, i) => i !== targetIndex && w === trimmed)
    if (clash >= 0)
      throw new Error(
        `"${trimmed.slice(0, 60)}…" is already warnings[${clash}] — two identical caveats`,
      )
    const original = warnings[targetIndex]
    warnings[targetIndex] = trimmed
    return { sections, warnings, original }
  }
  if (fieldPath.startsWith('portrait.')) {
    const m = PORTFOLIO_PATH.exec(fieldPath)
    if (!m) throw new Error(`portrait subfield must be portfolios[<index>], got ${fieldPath}`)
    const targetIndex = Number(m[1])
    const portraits = sections.filter((s) => s.kind === 'portrait') as Array<
      Extract<ReportSection, { kind: 'portrait' }>
    >
    // Zero would silently correct nothing; more than one makes "the portrait"
    // ambiguous, and guessing which one would rename an área under a photograph
    // of somebody else.
    if (portraits.length !== 1)
      throw new Error(`expected exactly 1 portrait section, found ${portraits.length}`)
    const list = portraits[0].payload.portfolios
    if (targetIndex >= list.length)
      throw new Error(`portfolio index ${targetIndex} out of range (${list.length} áreas)`)
    const trimmed = newValue.trim()
    if (!trimmed)
      throw new Error('a portfolio cannot be blank — dropping an área is a re-run, not a rename')
    const clash = list.findIndex((p, i) => i !== targetIndex && p === trimmed)
    if (clash >= 0)
      throw new Error(
        `"${trimmed}" is already portfolios[${clash}] — renaming onto it would merge two áreas`,
      )
    const original = list[targetIndex]
    list[targetIndex] = trimmed
    return { sections, original }
  }
  if (fieldPath.startsWith('narrative.')) {
    const rest = fieldPath.slice('narrative.'.length)
    const lastDot = rest.lastIndexOf('.')
    if (lastDot < 0) throw new Error(`malformed fieldPath ${fieldPath}`)
    const heading = rest.slice(0, lastDot)
    const sub = rest.slice(lastDot + 1)
    if (sub !== 'bodyMarkdown' && sub !== 'heading') {
      throw new Error(`narrative subfield must be bodyMarkdown|heading, got ${sub}`)
    }
    const idx = sections.findIndex(
      (s) =>
        s.kind === 'narrative' &&
        (s as Extract<ReportSection, { kind: 'narrative' }>).payload.heading === heading,
    )
    if (idx < 0) throw new Error(`no narrative section with heading "${heading}"`)
    const nar = sections[idx] as Extract<ReportSection, { kind: 'narrative' }>
    const original = sub === 'bodyMarkdown' ? nar.payload.bodyMarkdown : nar.payload.heading
    if (sub === 'bodyMarkdown') nar.payload.bodyMarkdown = newValue
    else nar.payload.heading = newValue
    return { sections, original }
  }
  if (fieldPath.startsWith('quote.')) {
    const rest = fieldPath.slice('quote.'.length)
    const lastDot = rest.lastIndexOf('.')
    if (lastDot < 0) throw new Error(`malformed fieldPath ${fieldPath}`)
    const idxStr = rest.slice(0, lastDot)
    const sub = rest.slice(lastDot + 1)
    if (sub !== 'attributedTo') throw new Error(`quote subfield must be attributedTo, got ${sub}`)
    const targetIndex = Number(idxStr)
    if (!Number.isInteger(targetIndex) || targetIndex < 0)
      throw new Error(`quote index must be integer, got ${idxStr}`)
    const quoteSections = sections.filter((s) => s.kind === 'quote-card') as Array<
      Extract<ReportSection, { kind: 'quote-card' }>
    >
    if (targetIndex >= quoteSections.length)
      throw new Error(`quote index ${targetIndex} out of range (${quoteSections.length} quotes)`)
    const original = quoteSections[targetIndex].payload.attributedTo
    quoteSections[targetIndex].payload.attributedTo = newValue
    return { sections, original }
  }
  throw new Error(`unsupported fieldPath ${fieldPath} — see --help`)
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[correct-journalist-report] ${REPORTS} missing\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const idx = snap.items.findIndex((r) => r.id === opts.reportId)
  if (idx < 0) {
    process.stderr.write(`[correct-journalist-report] report ${opts.reportId} not found\n`)
    process.exit(1)
  }
  const report = snap.items[idx]
  let updated: { sections: ReportSection[]; warnings?: string[]; original: string }
  try {
    updated = applyCorrection(report, opts.field, opts.newValue)
  } catch (err) {
    process.stderr.write(`[correct-journalist-report] ${(err as Error).message}\n`)
    process.exit(1)
  }
  const correction: JournalistReportCorrection = {
    field: opts.field,
    original: updated.original,
    corrected: opts.newValue,
    reason: opts.reason.trim(),
    editor: opts.editor,
    correctedAt: new Date().toISOString().slice(0, 10),
  }
  const next: JournalistReport = {
    ...report,
    sections: updated.sections,
    warnings: updated.warnings ?? report.warnings,
    corrections: [...report.corrections, correction],
  }
  const items = [...snap.items]
  items[idx] = next
  const out: JournalistReportsSnapshot = { ...snap, generatedAt: new Date().toISOString(), items }
  writeSnapshot(REPORTS, out, validateReportsSnapshot)
  // Refresh per-id chunk if present.
  rewriteJsonIfPresent(resolve(CHUNK_DIR, `${next.assignmentId}.json`), next)
  process.stdout.write(
    `[correct-journalist-report] applied correction to ${report.id} · field=${opts.field} · editor=${opts.editor}\n`,
  )
}

// Guarded so `applyCorrection` can be unit-tested without the CLI running
// against public/data on import (same shape as check-finding-quotes.ts).
if (import.meta.url === `file://${process.argv[1]}`) main()
