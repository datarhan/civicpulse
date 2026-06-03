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
 *
 * Re-validates the whole reports snapshot before writing.
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
      '  · quote.<index>.attributedTo\n',
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

function applyCorrection(
  report: JournalistReport,
  fieldPath: string,
  newValue: string,
): { sections: ReportSection[]; original: string } {
  const sections = JSON.parse(JSON.stringify(report.sections)) as ReportSection[]
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

main()
