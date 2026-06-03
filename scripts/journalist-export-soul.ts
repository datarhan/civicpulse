/**
 * Curator CLI — export a published journalist report as a portable
 * soul.md markdown dossier.
 *
 *   npm run journalist:export-soul -- <assignmentId> [--out <path>]
 *
 * Default output path is `public/data/souls/<subject.slug>.md` when the
 * assignment has a subject slug, otherwise
 * `public/data/souls/<assignmentId>.md`.
 *
 * Reads from the curator-promoted snapshot only — never from the
 * machine-written suggestions file. The exporter is deterministic, so
 * the same JournalistReport always produces the same markdown.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  validateAssignmentsSnapshot,
  validateReportsSnapshot,
  type JournalistAssignment,
} from '../src/scraper/journalist'
import { exportSoulMarkdown } from '../src/scraper/journalist-soul-export'

const REPORTS = resolve('public/data/journalist-reports.json')
const ASSIGNMENTS = resolve('public/data/journalist-assignments.json')
const DEFAULT_OUT_DIR = resolve('public/data/souls')

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist:export-soul -- <assignmentId> [--out <path>]\n' +
      '\n' +
      'Default output: public/data/souls/<subject.slug>.md\n',
  )
  process.exit(2)
}

interface Opts {
  assignmentId: string
  out?: string
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { assignmentId: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') o.out = argv[++i]
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[journalist:export-soul] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.assignmentId) o.assignmentId = a
  }
  if (!o.assignmentId) usage()
  return o
}

function loadAssignment(id: string): JournalistAssignment | null {
  if (!existsSync(ASSIGNMENTS)) return null
  const snap = validateAssignmentsSnapshot(readFileSync(ASSIGNMENTS, 'utf8'))
  return snap.items.find((a) => a.id === id) ?? null
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[journalist:export-soul] ${REPORTS} missing — promote a report first\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const report = snap.items.find(
    (r) => r.assignmentId === opts.assignmentId || r.id === opts.assignmentId,
  )
  if (!report) {
    process.stderr.write(
      `[journalist:export-soul] no promoted report for assignment ${opts.assignmentId}\n`,
    )
    process.exit(1)
  }
  const assignment = loadAssignment(report.assignmentId)
  const subjectName = assignment?.subject.name ?? report.assignmentId
  const subjectSlug = assignment?.subject.slug
  const md = exportSoulMarkdown(report, {
    subjectName,
    ...(subjectSlug ? { subjectSlug } : {}),
  })
  const fallbackName = subjectSlug ?? report.assignmentId.replace(/^a-/, '')
  const outPath = opts.out ? resolve(opts.out) : resolve(DEFAULT_OUT_DIR, `${fallbackName}.md`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, md, 'utf8')
  const bytes = Buffer.byteLength(md, 'utf8')
  const sourceCount = (md.match(/^\[\^/gm) ?? []).length
  process.stdout.write(
    `[journalist:export-soul] wrote ${bytes} bytes (${sourceCount} cited source${sourceCount === 1 ? '' : 's'}) to ${outPath}\n`,
  )
}

main()
