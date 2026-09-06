/**
 * Curator CLI — retire a published biography once a newer report about the
 * same subject has been promoted.
 *
 *   npm run journalist:archive -- <assignmentId> --superseded-by <newAssignmentId> \
 *       --reason "<≥20 chars>" [--curator "<name>"] [--dry-run]
 *
 * Until now the only way to supersede a report was a hand edit of
 * journalist-reports.json — which the curated-write guard denies, and which is
 * how Raga v1–v3 were removed (f4e7c5bd, before the guard). `promote-report`
 * only upserts by report id, so a v2 lands NEXT to the v1 and both stay
 * served; the /cargos join already prefers the newest promotedAt, but the
 * /laboratorio/agentes list and the old chunk URL keep publishing the
 * superseded prose. This is the one door that closes them.
 *
 * What it refuses, and why each refusal exists:
 *   · the superseding assignment must have a PUBLISHED report in the index —
 *     archiving on the promise of a v2 that is not there would leave the
 *     subject with no biography, a retraction nobody asked for;
 *   · same subject slug and kind — retiring somebody else's report is the
 *     misattribution the guard exists to prevent;
 *   · only a `promoted` assignment is archived, and only by a `promoted`
 *     superseder — a second run over an archived one must not append a second
 *     DEPURACIÓN paragraph for a report that is no longer there;
 *   · reason ≥ 20 chars, a named curator and a YYYY-MM-DD date, because the
 *     paragraph goes into the snapshot-level curatorNotes, which is PUBLIC.
 *
 * The pure function is deterministic given `today`; the CLI owns the clock and
 * the disk (both snapshots rewritten through their validators, the retired
 * chunk unlinked). Git history keeps the retired report.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSnapshot, writeSnapshot } from './lib/snapshot-io'
import {
  validateAssignmentsSnapshot,
  validateReportsSnapshot,
  type JournalistAssignmentsSnapshot,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const ASSIGNMENTS = resolve('public/data/journalist-assignments.json')
const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = 'public/data/journalist-reports'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface ArchiveOptions {
  assignmentId: string
  supersededBy: string
  reason: string
  curator: string
  /** YYYY-MM-DD — the date the public note carries. */
  today: string
}

export interface ArchiveResult {
  assignments: JournalistAssignmentsSnapshot
  reports: JournalistReportsSnapshot
  removedReportIds: string[]
  removedChunkFiles: string[]
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function archiveAssignment(
  assignments: JournalistAssignmentsSnapshot,
  reports: JournalistReportsSnapshot,
  opts: ArchiveOptions,
): ArchiveResult {
  const reason = opts.reason.trim()
  if (reason.length < 20) throw new Error('--reason must be ≥20 chars once trimmed')
  const curator = opts.curator.trim()
  if (!curator) throw new Error('--curator must name who signs the retirement')
  if (!DATE_RE.test(opts.today)) throw new Error(`today must be YYYY-MM-DD, got "${opts.today}"`)
  if (opts.assignmentId === opts.supersededBy)
    throw new Error(`${opts.assignmentId} cannot be superseded by itself`)

  const target = assignments.items.find((a) => a.id === opts.assignmentId)
  if (!target) throw new Error(`assignment ${opts.assignmentId} not found`)
  const superseder = assignments.items.find((a) => a.id === opts.supersededBy)
  if (!superseder) throw new Error(`assignment ${opts.supersededBy} not found`)
  if (target.status !== 'promoted')
    throw new Error(`only a promoted assignment can be archived; ${target.id} is ${target.status}`)
  if (superseder.status !== 'promoted')
    throw new Error(
      `the superseding assignment ${superseder.id} is ${superseder.status}, not promoted`,
    )
  if (
    target.subject.slug !== superseder.subject.slug ||
    target.subject.kind !== superseder.subject.kind
  ) {
    throw new Error(
      `subject mismatch: ${target.id} is about ${target.subject.kind}/${target.subject.slug ?? '?'}, ` +
        `${superseder.id} about ${superseder.subject.kind}/${superseder.subject.slug ?? '?'}`,
    )
  }
  if (!reports.items.some((r) => r.assignmentId === superseder.id))
    throw new Error(
      `${superseder.id} has no published report in the index — nothing to hand over to`,
    )

  const nextAssignments = clone(assignments)
  nextAssignments.items = nextAssignments.items.map((a) =>
    a.id === target.id ? { ...a, status: 'archived' as const } : a,
  )

  const nextReports = clone(reports)
  const removed = nextReports.items.filter((r) => r.assignmentId === target.id)
  nextReports.items = nextReports.items.filter((r) => r.assignmentId !== target.id)
  const note =
    `DEPURACIÓN EDITORIAL ${opts.today}: informe de ${target.id} retirado del índice ` +
    `al quedar sustituido por ${superseder.id} (${curator}). ${reason}`
  nextReports.curatorNotes = nextReports.curatorNotes
    ? `${nextReports.curatorNotes}\n\n${note}`
    : note

  return {
    assignments: nextAssignments,
    reports: nextReports,
    removedReportIds: removed.map((r) => r.id),
    removedChunkFiles: [`${CHUNK_DIR}/${target.id}.json`],
  }
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist:archive -- <assignmentId> --superseded-by <newAssignmentId> \\\n' +
      '      --reason "<≥20 chars>" [--curator "<name>"] [--dry-run]\n',
  )
  process.exit(2)
}

interface CliOpts {
  assignmentId: string
  supersededBy: string
  reason: string
  curator: string
  dryRun: boolean
}

function parseArgs(argv: string[]): CliOpts {
  const o: CliOpts = {
    assignmentId: '',
    supersededBy: '',
    reason: '',
    curator: 'civicpulse-curator',
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--superseded-by') o.supersededBy = argv[++i] ?? ''
    else if (a === '--reason') o.reason = argv[++i] ?? ''
    else if (a === '--curator') o.curator = argv[++i] ?? ''
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[journalist:archive] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.assignmentId) o.assignmentId = a
  }
  if (!o.assignmentId || !o.supersededBy || !o.reason) usage()
  return o
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(ASSIGNMENTS) || !existsSync(REPORTS)) {
    process.stderr.write('[journalist:archive] assignments or reports snapshot missing\n')
    process.exit(1)
  }
  const assignments = loadSnapshot(ASSIGNMENTS, validateAssignmentsSnapshot, {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    items: [],
  })
  const reports = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))

  let out: ArchiveResult
  try {
    out = archiveAssignment(assignments, reports, {
      assignmentId: opts.assignmentId,
      supersededBy: opts.supersededBy,
      reason: opts.reason,
      curator: opts.curator,
      today: new Date().toISOString().slice(0, 10),
    })
  } catch (err) {
    process.stderr.write(`[journalist:archive] REFUSE: ${(err as Error).message}\n`)
    process.exit(1)
  }

  const lines = [
    `assignment ${opts.assignmentId} → archived (superseded by ${opts.supersededBy})`,
    ...out.removedReportIds.map((id) => `report ${id} removed from the index`),
    ...out.removedChunkFiles.map(
      (f) => `chunk ${f} ${existsSync(resolve(f)) ? 'deleted' : 'absent'}`,
    ),
  ]
  if (opts.dryRun) {
    process.stdout.write(
      `[journalist:archive] DRY RUN — would do:\n${lines.map((l) => `  · ${l}`).join('\n')}\n`,
    )
    return
  }
  const now = new Date().toISOString()
  writeSnapshot(ASSIGNMENTS, { ...out.assignments, generatedAt: now }, validateAssignmentsSnapshot)
  writeSnapshot(REPORTS, { ...out.reports, generatedAt: now }, validateReportsSnapshot)
  for (const f of out.removedChunkFiles) {
    const p = resolve(f)
    if (existsSync(p)) unlinkSync(p)
  }
  process.stdout.write(`[journalist:archive]\n${lines.map((l) => `  · ${l}`).join('\n')}\n`)
}

// Guarded so `archiveAssignment` can be unit-tested without the CLI running
// against public/data on import (same shape as correct-journalist-report.ts).
if (import.meta.url === `file://${process.argv[1]}`) main()
