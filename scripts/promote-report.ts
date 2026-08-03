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
 * Reads the draft from editorial/journalist-drafts/ (gitignored, NOT
 * web-served), strips the `requiresHumanApproval` flag, attaches `promotedBy` /
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
import { existsSync, readFileSync } from 'node:fs'
import { loadSnapshot, writeJsonChunk, writeJsonFile, writeSnapshot } from './lib/snapshot-io'
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
import { pruneUncitedSources } from '../src/scraper/journalist-agent/builders'
import { blocks, checkCitations, type ReportLike } from '../src/scraper/citation-check'
import { classifyUrl, type UrlVerdict } from './lib/doc-fetch'

const ASSIGNMENTS = resolve('public/data/journalist-assignments.json')
const DRAFTS = resolve('editorial/journalist-drafts/journalist-reports-suggestions.json')
const REPORTS = resolve('public/data/journalist-reports.json')
// Promoted reports are public; DRAFTS ARE NOT. An unreviewed draft is a
// machine's first pass over a named living councillor — the Rafael Gómez draft
// carried four sources about a different man of the same name, including a
// 2006 Caso Malaya arrest, which the curator removed before publishing. Those
// drafts were being served from public/ at a guessable URL, so the promote
// gate was decorative: anyone could fetch the pre-curation version.
const CHUNK_DIR = resolve('public/data/journalist-reports')

const DEFAULT_LEGAL_NOTICE =
  'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación. Cada afirmación incluye cita verbatim, enlace de archivo cuando procede y derecho de réplica abierto vía formulario público.'

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run promote-report -- <assignmentId> [--curator "<name>"] [--curator-notes "<text>"] \\\n' +
      '      [--ack-legal-review] [--edit] [--skip-citation-check]\n',
  )
  process.exit(2)
}

interface Opts {
  assignmentId: string
  curator: string
  curatorNotes?: string
  ackLegalReview: boolean
  edit: boolean
  skipCitationCheck: boolean
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    assignmentId: '',
    curator: 'civicpulse-curator',
    ackLegalReview: false,
    skipCitationCheck: false,
    edit: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--curator') o.curator = argv[++i]
    else if (a === '--curator-notes') o.curatorNotes = argv[++i]
    else if (a === '--ack-legal-review') o.ackLegalReview = true
    else if (a === '--skip-citation-check') o.skipCitationCheck = true
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
  return loadSnapshot(REPORTS, validateReportsSnapshot, {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    legalNotice: DEFAULT_LEGAL_NOTICE,
    contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
    methodologyUrl: '/metodologia',
    items: [],
  })
}

function loadAssignments(): JournalistAssignmentsSnapshot | null {
  if (!existsSync(ASSIGNMENTS)) return null
  return validateAssignmentsSnapshot(readFileSync(ASSIGNMENTS, 'utf8'))
}

function writeChunk(report: JournalistReport): string {
  return writeJsonChunk(CHUNK_DIR, `${report.assignmentId}.json`, report)
}

/**
 * Every citation in the draft must resolve and hold before this becomes a page
 * about a named councillor.
 *
 * This step did not exist until 2026-08-03. Promotion stripped
 * `requiresHumanApproval`, stamped `promotedBy`, and wrote — without
 * re-verifying a single citation. The only thing between LLM-written prose and
 * publication was a person reading it, and 27 of the last 109 `fix` commits
 * were on exactly these surfaces.
 *
 * Only `error` blocks. A URL we cannot reach FROM HERE (regmeet.com refuses
 * this IP, two ministries 403 a non-browser UA) is reported and waved through:
 * if being offline could block a promotion, the first thing anyone would do is
 * add a flag to skip the check.
 */
async function citationGate(report: JournalistReport, skip: boolean): Promise<void> {
  if (skip) {
    process.stdout.write(
      '[promote-report] --skip-citation-check: citations NOT verified for this promotion\n',
    )
    return
  }
  const urls = [...new Set(report.sources.map((s) => s.url).filter(Boolean))] as string[]
  const urlStates = new Map<string, UrlVerdict>()
  for (let i = 0; i < urls.length; i += 4) {
    const verdicts = await Promise.all(urls.slice(i, i + 4).map(classifyUrl))
    for (const v of verdicts) urlStates.set(v.url, v)
    if (i + 4 < urls.length) await new Promise((r) => setTimeout(r, 300))
  }
  const result = checkCitations({ reports: [report as unknown as ReportLike], urlStates })
  const c = result.coverage
  process.stdout.write(
    `[promote-report] citations: ${c.sources} source(s), ${c.sourcesWithExcerpt} with an excerpt, ` +
      `${c.urlsChecked}/${c.urls} URLs probed, ${c.quoteCards} quote card(s)\n`,
  )
  for (const f of result.findings.filter((x) => x.severity === 'info')) {
    process.stdout.write(`  · unreachable from here: ${f.detail}\n`)
  }
  for (const f of result.findings.filter((x) => x.severity === 'warn')) {
    process.stdout.write(`  ! ${f.sourceId}: ${f.detail}\n`)
  }
  if (blocks(result)) {
    process.stderr.write('\n[promote-report] REFUSE: this draft has citations that do not hold.\n')
    for (const f of result.findings.filter((x) => x.severity === 'error')) {
      process.stderr.write(`  ${f.sourceId ?? '—'}  [${f.code}]\n      ${f.detail}\n`)
    }
    process.stderr.write(
      '\n  Fix the draft, or repoint a moved document with `npm run repoint-source-url`.\n',
    )
    process.exit(1)
  }
}

async function main(): Promise<void> {
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
  // Published contract = sources cited by the report. The research
  // sweep's unused (often homonym) ledger rows stay in the draft only.
  const citedSources = pruneUncitedSources(draft.sections, draft.sources)
  if (citedSources.length < draft.sources.length) {
    process.stdout.write(
      `[promote-report] pruned ${draft.sources.length - citedSources.length} uncited source rows ` +
        `(${draft.sources.length}→${citedSources.length}); full trail stays in the draft\n`,
    )
  }
  const report: JournalistReport = {
    ...(base as Omit<JournalistReportDraft, 'requiresHumanApproval'>),
    sources: citedSources,
    promotedBy: opts.curator,
    promotedAt: new Date().toISOString(),
    ...(opts.curatorNotes ? { curatorNotes: opts.curatorNotes } : {}),
    corrections: [],
    response: null,
  }

  // Run BEFORE --edit returns: the point of --edit is to see what would be
  // published, and "would this be refused?" is part of that.
  await citationGate(report, opts.skipCitationCheck)

  if (opts.edit) {
    const tmp = `/tmp/journalist-report-${report.id}.json`
    writeJsonFile(tmp, report)
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
  writeSnapshot(REPORTS, out, validateReportsSnapshot)
  const chunkPath = writeChunk(report)

  // Bump the assignment status to "promoted" if the snapshot exists.
  const assignments = loadAssignments()
  if (assignments) {
    const aIdx = assignments.items.findIndex((a) => a.id === opts.assignmentId)
    if (aIdx >= 0) {
      assignments.items[aIdx] = { ...assignments.items[aIdx], status: 'promoted' }
      assignments.generatedAt = new Date().toISOString()
      writeSnapshot(ASSIGNMENTS, assignments, validateAssignmentsSnapshot)
    }
  }

  process.stdout.write(
    `[promote-report] ${rIdx >= 0 ? 'updated' : 'promoted'} report ${report.id} ` +
      `(legalSensitivity=${report.legalSensitivity}${opts.ackLegalReview ? ', legal review acknowledged' : ''}, ${report.sections.length} sections, ${report.sources.length} sources)\n` +
      `[promote-report] index → ${REPORTS}\n` +
      `[promote-report] chunk → ${chunkPath}\n`,
  )
}

main().catch((e) => {
  process.stderr.write(`[promote-report] ${(e as Error).stack ?? e}
`)
  process.exit(1)
})
