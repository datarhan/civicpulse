/**
 * Journalist runner CLI — execute the 4-stage agent for one assignment
 * and persist the draft to public/data/journalist-reports-suggestions.json.
 *
 *   npm run journalist:run -- <assignmentId> [--token-budget N] [--dry-run] [--stop-after plan|research|synth|verify]
 *
 * The draft is also written as a chunk under
 *   public/data/journalist-reports/<assignmentId>.draft.json
 * so the curator dashboard can preview a single assignment without
 * loading the whole suggestions snapshot.
 *
 * Flips the matching assignment's status to "drafted" on success or
 * "failed" with an error message on exception. Re-validates both
 * snapshots before writing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { loadSnapshot, writeSnapshot, writeJsonChunk } from './lib/snapshot-io'
import { resolve } from 'node:path'
import {
  validateAssignmentsSnapshot,
  validateDraftsSnapshot,
  type JournalistAssignmentsSnapshot,
  type JournalistDraftsSnapshot,
  type JournalistReportDraft,
} from '../src/scraper/journalist'
import { runJournalistAgent, JournalistAgentError } from '../src/scraper/journalist-agent'

const ASSIGNMENTS = resolve('public/data/journalist-assignments.json')
const DRAFTS = resolve('public/data/journalist-reports-suggestions.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist:run -- <assignmentId> [--token-budget N] [--dry-run] [--stop-after plan|research|synth|verify]\n',
  )
  process.exit(2)
}

interface Opts {
  assignmentId: string
  tokenBudget?: number
  dryRun: boolean
  stopAfter?: 'plan' | 'research' | 'synth' | 'verify'
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { assignmentId: '', dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--token-budget') o.tokenBudget = Number(argv[++i])
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--stop-after') {
      const v = argv[++i] as Opts['stopAfter']
      if (v !== 'plan' && v !== 'research' && v !== 'synth' && v !== 'verify') {
        process.stderr.write('[journalist:run] --stop-after must be plan|research|synth|verify\n')
        process.exit(2)
      }
      o.stopAfter = v
    } else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[journalist:run] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.assignmentId) o.assignmentId = a
  }
  if (!o.assignmentId) usage()
  return o
}

function loadAssignments(): JournalistAssignmentsSnapshot {
  if (!existsSync(ASSIGNMENTS)) {
    process.stderr.write(
      `[journalist:run] ${ASSIGNMENTS} missing — seed via npm run journalist:assign\n`,
    )
    process.exit(1)
  }
  return validateAssignmentsSnapshot(readFileSync(ASSIGNMENTS, 'utf8'))
}

function loadDrafts(): JournalistDraftsSnapshot {
  return loadSnapshot(DRAFTS, validateDraftsSnapshot, {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    items: [],
  })
}

function writeDraftChunk(draft: JournalistReportDraft): string {
  return writeJsonChunk(CHUNK_DIR, `${draft.assignmentId}.draft.json`, draft)
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const assignmentsSnap = loadAssignments()
  const idx = assignmentsSnap.items.findIndex((a) => a.id === opts.assignmentId)
  if (idx < 0) {
    process.stderr.write(
      `[journalist:run] assignment ${opts.assignmentId} not found in ${ASSIGNMENTS}\n`,
    )
    process.exit(1)
  }
  const assignment = assignmentsSnap.items[idx]

  // Flip status to running before executing.
  const runningCopy = JSON.parse(JSON.stringify(assignmentsSnap)) as JournalistAssignmentsSnapshot
  runningCopy.items[idx] = { ...assignment, status: 'running' }
  runningCopy.generatedAt = new Date().toISOString()
  if (!opts.dryRun) {
    writeSnapshot(ASSIGNMENTS, runningCopy, validateAssignmentsSnapshot)
  }

  let draft: JournalistReportDraft | null = null
  let errMsg = ''
  try {
    process.stdout.write(
      `[journalist:run] starting agent for ${assignment.id} · subject="${assignment.subject.name}"\n`,
    )
    const out = await runJournalistAgent(assignment, {
      ...(opts.tokenBudget ? { tokenBudget: opts.tokenBudget } : {}),
      ...(opts.stopAfter ? { stopAfter: opts.stopAfter } : {}),
    })
    draft = out.draft
    process.stdout.write(
      `[journalist:run] research summary: ${JSON.stringify(out.debug.researchSummary)}\n` +
        `[journalist:run] draft → ${draft.sections.length} section(s), ${draft.sources.length} source(s), legalSensitivity=${draft.legalSensitivity}, warnings=${draft.warnings.length}\n`,
    )
  } catch (err) {
    if (err instanceof JournalistAgentError) {
      errMsg = err.message
    } else {
      errMsg = `unhandled: ${(err as Error).message}`
    }
  }

  // Update assignment status (drafted | failed).
  const next = JSON.parse(JSON.stringify(assignmentsSnap)) as JournalistAssignmentsSnapshot
  if (draft) {
    next.items[idx] = {
      ...assignment,
      status: 'drafted',
      lastRunAt: new Date().toISOString(),
    }
  } else {
    next.items[idx] = {
      ...assignment,
      status: 'failed',
      lastRunAt: new Date().toISOString(),
      lastErrorMsg: errMsg.slice(0, 280),
    }
  }
  next.generatedAt = new Date().toISOString()

  if (opts.dryRun) {
    process.stdout.write('[journalist:run] DRY RUN — not persisting draft or status change\n')
    if (draft)
      process.stdout.write(
        `[journalist:run] would write ${JSON.stringify(draft).length} bytes to ${DRAFTS}\n`,
      )
    if (errMsg) {
      process.stderr.write(`[journalist:run] error: ${errMsg}\n`)
      process.exit(1)
    }
    return
  }

  // Persist assignment status.
  writeSnapshot(ASSIGNMENTS, next, validateAssignmentsSnapshot)

  if (!draft) {
    process.stderr.write(`[journalist:run] agent failed: ${errMsg}\n`)
    process.exit(1)
  }

  // Persist the draft into both the suggestions snapshot AND the per-id chunk.
  const drafts = loadDrafts()
  const dIdx = drafts.items.findIndex((d) => d.id === draft!.id)
  const items = [...drafts.items]
  if (dIdx >= 0) items[dIdx] = draft
  else items.push(draft)
  const draftsOut: JournalistDraftsSnapshot = {
    version: drafts.version,
    generatedAt: new Date().toISOString(),
    items,
  }
  writeSnapshot(DRAFTS, draftsOut, validateDraftsSnapshot)
  const chunkPath = writeDraftChunk(draft)
  process.stdout.write(
    `[journalist:run] saved draft ${draft.id} → ${DRAFTS}\n` +
      `[journalist:run] per-assignment chunk → ${chunkPath}\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[journalist:run] fatal: ${(err as Error).message}\n`)
  process.exit(1)
})
