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
 *
 * Re-validates the whole reports snapshot before writing.
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
      '  · portrait.portfolios[<index>]\n',
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

export function applyCorrection(
  report: JournalistReport,
  fieldPath: string,
  newValue: string,
): { sections: ReportSection[]; original: string } {
  const sections = JSON.parse(JSON.stringify(report.sections)) as ReportSection[]
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
  let updated: { sections: ReportSection[]; original: string }
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
