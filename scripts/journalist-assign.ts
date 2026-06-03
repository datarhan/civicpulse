/**
 * Curator CLI — seed a new journalist assignment.
 *
 *   npm run journalist:assign -- --id a-robert-raga-bio --kind biography \
 *       --subject-slug robert-raga-gadea --subject-name "Robert Raga Gadea" \
 *       --subject-kind official \
 *       --brief "Biografía pública del alcalde con foco en trayectoria política,
 *                expedientes judiciales abiertos y compromisos electorales 2023-2027"
 *       [--created-by "<curator>"]
 *
 * Re-validates the whole assignments snapshot before writing. Refuses to
 * overwrite an existing assignment id unless --force is passed.
 */
import { loadSnapshot, writeSnapshot } from './lib/snapshot-io'
import { resolve } from 'node:path'
import {
  ALLOWED_ASSIGNMENT_KINDS,
  ALLOWED_SUBJECT_KINDS,
  validateAssignmentsSnapshot,
  type AssignmentKind,
  type JournalistAssignment,
  type JournalistAssignmentsSnapshot,
  type SubjectKind,
} from '../src/scraper/journalist'

const PATH = resolve('public/data/journalist-assignments.json')

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist:assign -- --id <id> --kind <biography|investigation|profile|topic-deep-dive> \\\n' +
      '      --subject-name "<name>" --subject-kind <official|topic|entity> \\\n' +
      '      [--subject-slug <slug>] --brief "<≥40 chars>" [--created-by "<curator>"] [--force]\n',
  )
  process.exit(2)
}

interface Opts {
  id: string
  kind: AssignmentKind
  subjectName: string
  subjectKind: SubjectKind
  subjectSlug?: string
  brief: string
  createdBy: string
  force: boolean
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    id: '',
    kind: 'biography',
    subjectName: '',
    subjectKind: 'official',
    brief: '',
    createdBy: 'civicpulse-curator',
    force: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--id') o.id = argv[++i]
    else if (a === '--kind') o.kind = argv[++i] as AssignmentKind
    else if (a === '--subject-name') o.subjectName = argv[++i]
    else if (a === '--subject-kind') o.subjectKind = argv[++i] as SubjectKind
    else if (a === '--subject-slug') o.subjectSlug = argv[++i]
    else if (a === '--brief') o.brief = argv[++i]
    else if (a === '--created-by') o.createdBy = argv[++i]
    else if (a === '--force') o.force = true
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[journalist:assign] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!o.id || !o.subjectName || !o.brief) usage()
  if (!(ALLOWED_ASSIGNMENT_KINDS as readonly string[]).includes(o.kind)) {
    process.stderr.write(
      `[journalist:assign] --kind must be one of ${ALLOWED_ASSIGNMENT_KINDS.join(',')}\n`,
    )
    process.exit(2)
  }
  if (!(ALLOWED_SUBJECT_KINDS as readonly string[]).includes(o.subjectKind)) {
    process.stderr.write(
      `[journalist:assign] --subject-kind must be one of ${ALLOWED_SUBJECT_KINDS.join(',')}\n`,
    )
    process.exit(2)
  }
  if (o.brief.trim().length < 40) {
    process.stderr.write('[journalist:assign] --brief must be ≥40 chars\n')
    process.exit(2)
  }
  return o
}

function main(): void {
  const o = parseArgs(process.argv.slice(2))
  const snap = loadSnapshot(PATH, validateAssignmentsSnapshot, {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    items: [],
  })
  const existingIdx = snap.items.findIndex((a) => a.id === o.id)
  if (existingIdx >= 0 && !o.force) {
    process.stderr.write(
      `[journalist:assign] assignment ${o.id} exists; pass --force to overwrite\n`,
    )
    process.exit(1)
  }
  const next: JournalistAssignment = {
    id: o.id,
    kind: o.kind,
    subject: {
      ...(o.subjectSlug ? { slug: o.subjectSlug } : {}),
      name: o.subjectName.trim(),
      kind: o.subjectKind,
    },
    brief: o.brief.trim(),
    createdBy: o.createdBy,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  const items = [...snap.items]
  if (existingIdx >= 0) items[existingIdx] = next
  else items.push(next)
  const out: JournalistAssignmentsSnapshot = {
    version: snap.version,
    generatedAt: new Date().toISOString(),
    items,
  }
  writeSnapshot(PATH, out, validateAssignmentsSnapshot)
  process.stdout.write(
    `[journalist:assign] ${existingIdx >= 0 ? 'updated' : 'created'} assignment ${o.id} → ${PATH}\n`,
  )
}

main()
