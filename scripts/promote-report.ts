/**
 * Curator CLI — promote a machine-written journalist draft into the
 * public reports snapshot.
 *
 *   npm run promote-report -- <assignmentId> \
 *       [--curator-notes "<curator notes>"] \
 *       [--curator "<name>"] \
 *       [--ack-legal-review] \
 *       [--edit]
 *
 * Reads the draft from public/data/journalist-reports-suggestions.json,
 * strips the `requiresHumanApproval` flag, attaches `promotedBy` /
 * `promotedAt` / `curatorNotes` / empty `corrections[]` / `response:null`,
 * and writes to public/data/journalist-reports.json (validated by
 * validateReportsSnapshot) + the per-id chunk under
 * public/data/journalist-reports/<assignmentId>.json. Also bumps the
 * assignment's status to "promoted".
 *
 * Refuses to promote a draft whose legalSensitivity is "high" unless
 * the curator passes --ack-legal-review explicitly. That flag is the
 * libel-discipline gate: it forces a human to confirm a legal review
 * has happened before the report goes public.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateAssignmentsSnapshot,
  validateDraftsSnapshot,
  validateReportsSnapshot,
  type JournalistAssignmentsSnapshot,
  type JournalistReport,
  type JournalistReportDraft,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const ASSIGNMENTS = resolve('public/data/journalist-assignments.json')
const DRAFTS = resolve('public/data/journalist-reports-suggestions.json')
const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

const DEFAULT_LEGAL_NOTICE =
  'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación. Cada afirmación incluye cita verbatim, enlace de archivo cuando procede y derecho de réplica abierto vía formulario público.'

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run promote-report -- <assignmentId> [--curator "<name>"] [--curator-notes "<text>"] \\\n' +
      '      [--ack-legal-review] [--edit]\n',
  )
  process.exit(2)
}

interface Opts {
  assignmentId: string
  curator: string
  curatorNotes?: string
  ackLegalReview: boolean
  edit: boolean
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    assignmentId: '',
    curator: 'civicpulse-curator',
    ackLegalReview: false,
    edit: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--curator') o.curator = argv[++i]
    else if (a === '--curator-notes') o.curatorNotes = argv[++i]
    else if (a === '--ack-legal-review') o.ackLegalReview = true
    else if (a === '--edit') o.edit = true
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[promote-report] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.assignmentId) o.assignmentId = a
  }
  if (!o.assignmentId) usage()
  return o
}

function loadDrafts(): JournalistReportDraft[] {
  if (!existsSync(DRAFTS)) {
    process.stderr.write(`[promote-report] ${DRAFTS} missing — run npm run journalist:run first\n`)
    process.exit(1)
  }
  return validateDraftsSnapshot(readFileSync(DRAFTS, 'utf8')).items
}

function loadReports(): JournalistReportsSnapshot {
  if (!existsSync(REPORTS)) {
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      legalNotice: DEFAULT_LEGAL_NOTICE,
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [],
    }
  }
  return validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
}

function loadAssignments(): JournalistAssignmentsSnapshot | null {
  if (!existsSync(ASSIGNMENTS)) return null
  return validateAssignmentsSnapshot(readFileSync(ASSIGNMENTS, 'utf8'))
}

function writeChunk(report: JournalistReport): string {
  mkdirSync(CHUNK_DIR, { recursive: true })
  const p = resolve(CHUNK_DIR, `${report.assignmentId}.json`)
  writeFileSync(p, JSON.stringify(report, null, 2) + '\n')
  return p
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const drafts = loadDrafts()
  const matching = drafts.filter((d) => d.assignmentId === opts.assignmentId)
  if (matching.length === 0) {
    process.stderr.write(
      `[promote-report] no draft for assignment ${opts.assignmentId} in ${DRAFTS}\n`,
    )
    process.exit(1)
  }
  // Pick the latest draft for this assignment (drafts ids embed the date).
  const draft = matching.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]

  if (draft.legalSensitivity === 'high' && !opts.ackLegalReview) {
    process.stderr.write(
      `[promote-report] REFUSE: draft ${draft.id} has legalSensitivity=high.\n` +
        `  · re-run with --ack-legal-review to confirm a legal review has happened.\n` +
        `  · warnings:\n    ${draft.warnings.slice(0, 6).join('\n    ')}\n`,
    )
    process.exit(1)
  }

  // Strip suggestion-only fields, attach curator metadata.
  const { requiresHumanApproval: _strip, ...base } = draft as JournalistReportDraft & {
    requiresHumanApproval?: boolean
  }
  void _strip
  const report: JournalistReport = {
    ...(base as Omit<JournalistReportDraft, 'requiresHumanApproval'>),
    promotedBy: opts.curator,
    promotedAt: new Date().toISOString(),
    ...(opts.curatorNotes ? { curatorNotes: opts.curatorNotes } : {}),
    corrections: [],
    response: null,
  }

  if (opts.edit) {
    const tmp = `/tmp/journalist-report-${report.id}.json`
    writeFileSync(tmp, JSON.stringify(report, null, 2) + '\n')
    process.stdout.write(
      `[promote-report] EDIT MODE — wrote ${tmp} (not applied).\n` +
        `  Review, then re-run without --edit to publish.\n`,
    )
    return
  }

  const reports = loadReports()
  const rIdx = reports.items.findIndex((r) => r.id === report.id)
  const items = [...reports.items]
  if (rIdx >= 0) items[rIdx] = report
  else items.push(report)
  items.sort((a, b) => b.promotedAt.localeCompare(a.promotedAt))
  const out: JournalistReportsSnapshot = {
    ...reports,
    generatedAt: new Date().toISOString(),
    items,
  }
  const serialized = JSON.stringify(out, null, 2) + '\n'
  validateReportsSnapshot(serialized)
  writeFileSync(REPORTS, serialized, 'utf8')
  const chunkPath = writeChunk(report)

  // Bump the assignment status to "promoted" if the snapshot exists.
  const assignments = loadAssignments()
  if (assignments) {
    const aIdx = assignments.items.findIndex((a) => a.id === opts.assignmentId)
    if (aIdx >= 0) {
      assignments.items[aIdx] = { ...assignments.items[aIdx], status: 'promoted' }
      assignments.generatedAt = new Date().toISOString()
      const aOut = JSON.stringify(assignments, null, 2) + '\n'
      validateAssignmentsSnapshot(aOut)
      writeFileSync(ASSIGNMENTS, aOut, 'utf8')
    }
  }

  process.stdout.write(
    `[promote-report] ${rIdx >= 0 ? 'updated' : 'promoted'} report ${report.id} ` +
      `(legalSensitivity=${report.legalSensitivity}${opts.ackLegalReview ? ', legal review acknowledged' : ''}, ${report.sections.length} sections, ${report.sources.length} sources)\n` +
      `[promote-report] index → ${REPORTS}\n` +
      `[promote-report] chunk → ${chunkPath}\n`,
  )
}

main()
