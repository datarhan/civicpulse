/**
 * Curator CLI — give a published report's cited sources a Wayback copy.
 *
 *   npm run journalist:archive-sources -- <assignmentId> [--dry-run] [--min-gap-ms 10000] [--max N]
 *
 * /laboratorio/agentes promised «las fuentes citadas se archivan en Wayback»
 * and 0 of 380 published sources carried `archiveUrl`: the agent's fetchUrl
 * only looks up an existing snapshot and never saves one (a deliberate choice
 * there — Save Page Now is slow and rate-limited). This CLI makes the promise
 * true after the fact, one report at a time, and proves what it did: every
 * target ends in exactly one of existing / archived / failed, printed
 * separately, and the run manifest carries the same counts (DATA_INTEGRITY
 * rule 2). Anonymous Wayback allows about six saves a minute, so saves are
 * spaced by `--min-gap-ms` (10 s by default); an existing copy costs no gap.
 *
 * Writes journalist-reports.json and the per-id chunk through the validator —
 * this is one of the sanctioned doors the curated-write guard names.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rewriteJsonIfPresent, writeSnapshot } from './lib/snapshot-io'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type SourceCitation,
} from '../src/scraper/journalist'
import { archiveOnWayback, findExistingSnapshot } from '../src/scraper/wayback'
import { NO_LLM_STATS, startRun } from '../src/scraper/run-manifest'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

const ARCHIVABLE_KINDS: ReadonlySet<SourceCitation['kind']> = new Set([
  'web',
  'official-doc',
  'boe',
])

/** Cited sources with a page worth saving that have no copy yet. */
export function archiveTargets(report: JournalistReport): SourceCitation[] {
  return report.sources.filter(
    (s) => ARCHIVABLE_KINDS.has(s.kind) && typeof s.url === 'string' && !s.archiveUrl,
  )
}

/** A new report with `archiveUrl` on the given ids only; the input is untouched. */
export function applyArchiveUrls(
  report: JournalistReport,
  results: ReadonlyArray<{ id: string; archiveUrl: string }>,
): JournalistReport {
  const byId = new Map(results.map((r) => [r.id, r.archiveUrl]))
  return {
    ...report,
    sources: report.sources.map((s) => {
      const archiveUrl = byId.get(s.id)
      return archiveUrl ? { ...s, archiveUrl } : { ...s }
    }),
  }
}

export type ArchiveOneResult = { archiveUrl: string; via: 'existing' | 'saved' } | { error: string }

export interface ArchiveOutcome {
  id: string
  url: string
  status: 'existing' | 'archived' | 'failed'
  detail?: string
}

export async function archiveReportSources(
  report: JournalistReport,
  deps: {
    archiveOne: (url: string) => Promise<ArchiveOneResult>
    sleep: (ms: number) => Promise<void>
    minGapMs: number
    max?: number
  },
): Promise<{ report: JournalistReport; outcomes: ArchiveOutcome[] }> {
  const targets = archiveTargets(report).slice(0, deps.max ?? Number.POSITIVE_INFINITY)
  const outcomes: ArchiveOutcome[] = []
  const found: Array<{ id: string; archiveUrl: string }> = []
  // Only a SAVE consumes the Wayback budget; an availability lookup that
  // returns an existing copy does not, so the gap follows saves only.
  let lastWasSave = false
  for (const t of targets) {
    const url = t.url as string
    if (lastWasSave && deps.minGapMs > 0) await deps.sleep(deps.minGapMs)
    const r = await deps.archiveOne(url)
    if ('error' in r) {
      outcomes.push({ id: t.id, url, status: 'failed', detail: r.error })
      lastWasSave = false
      continue
    }
    found.push({ id: t.id, archiveUrl: r.archiveUrl })
    outcomes.push({
      id: t.id,
      url,
      status: r.via === 'existing' ? 'existing' : 'archived',
      detail: r.archiveUrl,
    })
    lastWasSave = r.via === 'saved'
  }
  return { report: applyArchiveUrls(report, found), outcomes }
}

/** The real adapter: availability lookup first, Save Page Now only when needed. */
async function archiveOneLive(url: string): Promise<ArchiveOneResult> {
  const existing = await findExistingSnapshot(url)
  if (existing.ok && existing.archivedUrl)
    return { archiveUrl: existing.archivedUrl, via: 'existing' }
  const saved = await archiveOnWayback(url)
  if (saved.ok && saved.archivedUrl) return { archiveUrl: saved.archivedUrl, via: 'saved' }
  return { error: saved.error ?? existing.error ?? 'unknown wayback error' }
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist:archive-sources -- <assignmentId> [--dry-run] [--min-gap-ms 10000] [--max N]\n',
  )
  process.exit(2)
}

interface CliOpts {
  assignmentId: string
  dryRun: boolean
  minGapMs: number
  max?: number
}

function parseArgs(argv: string[]): CliOpts {
  const o: CliOpts = { assignmentId: '', dryRun: false, minGapMs: 10_000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') o.dryRun = true
    else if (a === '--min-gap-ms') o.minGapMs = Number(argv[++i])
    else if (a === '--max') o.max = Number(argv[++i])
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[journalist:archive-sources] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.assignmentId) o.assignmentId = a
  }
  if (!o.assignmentId || !Number.isFinite(o.minGapMs) || (o.max !== undefined && !(o.max > 0)))
    usage()
  return o
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[journalist:archive-sources] ${REPORTS} missing\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const idx = snap.items.findIndex((r) => r.assignmentId === opts.assignmentId)
  if (idx < 0) {
    process.stderr.write(
      `[journalist:archive-sources] no published report for ${opts.assignmentId}\n`,
    )
    process.exit(1)
  }
  const report = snap.items[idx]
  const targets = archiveTargets(report)
  const rec = startRun('journalist-archive-sources', {
    mode: opts.assignmentId,
    getStats: () => NO_LLM_STATS,
  })
  rec.owe(targets.length)

  if (opts.dryRun) {
    process.stdout.write(
      `[journalist:archive-sources] DRY RUN — ${targets.length} target(s) of ${report.sources.length} sources:\n` +
        targets.map((t) => `  · ${t.id} ${t.url}\n`).join(''),
    )
    rec.neverAttempt(targets.length)
    rec.finish()
    return
  }

  const { report: updated, outcomes } = await archiveReportSources(report, {
    archiveOne: archiveOneLive,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    minGapMs: opts.minGapMs,
    ...(opts.max !== undefined ? { max: opts.max } : {}),
  })
  const counts = { existing: 0, archived: 0, failed: 0 }
  for (const o of outcomes) {
    counts[o.status] += 1
    process.stdout.write(
      `  · ${o.status.padEnd(8)} ${o.id} ${o.url}${o.detail ? ` → ${o.detail}` : ''}\n`,
    )
  }
  rec.attempt(outcomes.length)
  rec.judge(counts.existing + counts.archived)
  if (counts.failed > 0) rec.skip('wayback-failed', counts.failed)
  rec.record('existing', counts.existing)
  rec.record('saved', counts.archived)
  // Targets beyond --max were never asked.
  rec.neverAttempt(Math.max(0, targets.length - outcomes.length))

  if (counts.existing + counts.archived > 0) {
    const items = [...snap.items]
    items[idx] = updated
    writeSnapshot(
      REPORTS,
      { ...snap, generatedAt: new Date().toISOString(), items },
      validateReportsSnapshot,
    )
    rewriteJsonIfPresent(resolve(CHUNK_DIR, `${updated.assignmentId}.json`), updated)
  }
  process.stdout.write(
    `[journalist:archive-sources] ${report.id}: attempted ${outcomes.length} of ${targets.length} target(s) · ` +
      `archived ${counts.archived} · existing ${counts.existing} · failed ${counts.failed}\n`,
  )
  rec.finish({ exitCode: 0 })
}

// Guarded so the pure helpers can be unit-tested without the CLI running
// against public/data on import (same shape as correct-journalist-report.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[journalist:archive-sources] ${(err as Error).message}\n`)
    process.exit(1)
  })
}
