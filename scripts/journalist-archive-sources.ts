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
 * target ends in exactly one of existing / archived / failed / not attempted,
 * printed separately, and the run manifest carries the same counts (DATA_INTEGRITY
 * rule 2). Anonymous Wayback allows about six saves a minute, so saves are
 * spaced by `--min-gap-ms` (10 s by default); an existing copy costs no gap.
 *
 * Two rules that came from the day Wayback answered 429 to everything
 * (2026-09-20), when a refused LOOKUP was read as «no copy» and the tool spent a
 * save on every source — 23 in one pass, 23 in the next, all refused, each one
 * extending the block:
 *   1. No blind saves. If the lookup could not be made (`lookup: 'failed'`,
 *      after the CDX fallback too), the source fails with that reason and no
 *      save is attempted.
 *   2. After the first 429 from Save Page Now, the rest of that pass stops
 *      saving. Lookups go on — they are what finds existing copies — and what
 *      was left unsaved is reported as NOT ATTEMPTED, apart from what failed.
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
import { archiveOnWayback, findExistingSnapshot, type WaybackResult } from '../src/scraper/wayback'
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

export type ArchiveOneResult =
  /** `redirectedTo`: the copy is of THAT url — where the cited one permanently redirects. */
  | { archiveUrl: string; via: 'existing' | 'saved'; redirectedTo?: string }
  /** `rateLimited`: Save Page Now answered 429 — the caller stops saving for the rest of the pass. */
  | { error: string; rateLimited?: true }
  /** Looked, found no copy, and saving was closed: never asked, so not a failure. */
  | { notAttempted: string }

export interface ArchiveOutcome {
  id: string
  url: string
  status: 'existing' | 'archived' | 'failed' | 'not-attempted'
  detail?: string
}

export const SAVES_CLOSED = 'Wayback limitó los guardados (429) en esta pasada'

export async function archiveReportSources(
  report: JournalistReport,
  deps: {
    archiveOne: (url: string, o: { allowSave: boolean }) => Promise<ArchiveOneResult>
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
  // Closed by the first 429 from Save Page Now and never reopened in this pass:
  // every further save would be refused too, and each refusal extends the block.
  let savesOpen = true
  for (const t of targets) {
    const url = t.url as string
    if (lastWasSave && deps.minGapMs > 0) await deps.sleep(deps.minGapMs)
    const r = await deps.archiveOne(url, { allowSave: savesOpen })
    if ('notAttempted' in r) {
      outcomes.push({ id: t.id, url, status: 'not-attempted', detail: r.notAttempted })
      lastWasSave = false
      continue
    }
    if ('error' in r) {
      outcomes.push({ id: t.id, url, status: 'failed', detail: r.error })
      if (r.rateLimited) savesOpen = false
      lastWasSave = false
      continue
    }
    found.push({ id: t.id, archiveUrl: r.archiveUrl })
    outcomes.push({
      id: t.id,
      url,
      status: r.via === 'existing' ? 'existing' : 'archived',
      detail: r.redirectedTo
        ? `${r.archiveUrl} (copia de ${r.redirectedTo}, adonde redirige la citada)`
        : r.archiveUrl,
    })
    lastWasSave = r.via === 'saved'
  }
  return { report: applyArchiveUrls(report, found), outcomes }
}

/** Host without `www.`, path without a trailing slash: what Wayback already treats as one URL. */
function mismaParaWayback(a: URL, b: URL): boolean {
  const host = (u: URL) => u.hostname.replace(/^www\./, '').toLowerCase()
  const ruta = (u: URL) => u.pathname.replace(/\/+$/, '')
  return host(a) === host(b) && ruta(a) === ruta(b) && a.search === b.search
}

/** A path a CMS sends a dead or gated article to. Not the article. */
const NO_ES_EL_ARTICULO =
  /(^|\/)(404|error|not-?found|no-?encontrad|login|acceso|registro|suscri|subscri|paywall)/i

/**
 * Whether the page a cited URL permanently redirects to may stand in for it
 * when looking for a copy.
 *
 * It exists because of one source: El Periódico de Aquí's cited link
 * (`/epda-noticias/<slug>/194308`) answers 301 to its canonical URL
 * (`/<slug>_194308_102.html`); Save Page Now followed the redirect and archived
 * the canonical one on the first pass, and five passes kept asking for the cited
 * one — a different key to Wayback — and reporting «no copy».
 *
 * Like the place-resolver, it under-matches on purpose: an honest miss beats a
 * wrong link. A CMS that sends a dead article «up» redirects too, and a copy of
 * the home page is not a copy of the article.
 */
export function redirectTargetStandsIn(cited: string, target: string): boolean {
  let a: URL
  let b: URL
  try {
    a = new URL(cited)
    b = new URL(target)
  } catch {
    return false
  }
  if (!/^https?:$/.test(b.protocol)) return false
  const host = (u: URL) => u.hostname.replace(/^www\./, '').toLowerCase()
  if (host(a) !== host(b)) return false
  // Same URL to Wayback: the first lookup already covered it.
  if (mismaParaWayback(a, b)) return false
  const destino = b.pathname.replace(/\/+$/, '')
  if (destino === '') return false // the home page
  // A section the cited path hangs from: the soft 404 of a CMS.
  if (a.pathname.startsWith(`${destino}/`)) return false
  if (NO_ES_EL_ARTICULO.test(b.pathname)) return false
  return true
}

/**
 * Lookup first, Save Page Now only when the lookup ANSWERED «none» — and only
 * while the pass is still allowed to save. Injectable so the policy is tested
 * without a network; `archiveOneLive` below is the same thing over real Wayback.
 *
 * `resolve` says where the cited URL permanently redirects, or null. It is asked
 * only after a «none»: a copy of the cited URL needs no request to the publisher.
 */
export function makeArchiveOne(io: {
  find: (url: string) => Promise<WaybackResult>
  save: (url: string) => Promise<WaybackResult>
  resolve?: (url: string) => Promise<string | null>
}): (url: string, o: { allowSave: boolean }) => Promise<ArchiveOneResult> {
  const motivo = (r: WaybackResult) =>
    `${r.error ?? 'sin motivo'}${r.cdxError ? ` · CDX: ${r.cdxError}` : ''}`
  return async (url, { allowSave }) => {
    const existing = await io.find(url)
    if (existing.ok && existing.archivedUrl)
      return { archiveUrl: existing.archivedUrl, via: 'existing' }
    // Only an ANSWERED «none» opens the door to a save. Anything else — a
    // refusal, a timeout, a result that does not say — is «could not look».
    if (existing.lookup !== 'none') return { error: `consulta fallida: ${motivo(existing)}` }
    // The copy may be under the URL the cited one redirects to.
    const target = (await io.resolve?.(url)) ?? null
    if (target && redirectTargetStandsIn(url, target)) {
      const underTarget = await io.find(target)
      if (underTarget.ok && underTarget.archivedUrl)
        return { archiveUrl: underTarget.archivedUrl, via: 'existing', redirectedTo: target }
      if (underTarget.lookup !== 'none') {
        return {
          error: `consulta fallida (destino de la redirección, ${target}): ${motivo(underTarget)}`,
        }
      }
    }
    if (!allowSave) return { notAttempted: SAVES_CLOSED }
    const saved = await io.save(url)
    if (saved.ok && saved.archivedUrl) return { archiveUrl: saved.archivedUrl, via: 'saved' }
    const error = saved.error ?? 'unknown wayback error'
    return error === 'HTTP 429' ? { error, rateLimited: true } : { error }
  }
}

// This CLI owes the reader a copy, so it pays for the slow second opinion — the
// CDX index, seconds per URL instead of ms — whenever the Availability API does
// not produce one. A save is the scarce thing; the API's «none» is not reliable.
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

/**
 * Where a URL PERMANENTLY redirects (301/308), hop by hop, or null. Temporary
 * redirects are not followed: a 302 is how consent walls, logins and geo-blocks
 * answer, and none of those is the publisher saying «this page lives there now».
 * A publisher that cannot be reached is null too — no redirect known, the normal
 * path goes on.
 */
export async function resolvePermanentRedirect(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    let res: Response
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': UA, Range: 'bytes=0-0', Accept: 'text/html,*/*;q=0.5' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return null
    }
    const location = res.headers.get('location')
    if ((res.status !== 301 && res.status !== 308) || !location) break
    try {
      current = new URL(location, current).toString()
    } catch {
      return null
    }
  }
  return current === url ? null : current
}

const archiveOneLive = makeArchiveOne({
  find: (url) => findExistingSnapshot(url, { cdxFallback: true }),
  save: (url) => archiveOnWayback(url),
  resolve: (url) => resolvePermanentRedirect(url),
})

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
  const counts = { existing: 0, archived: 0, failed: 0, 'not-attempted': 0 }
  for (const o of outcomes) {
    counts[o.status] += 1
    process.stdout.write(
      `  · ${o.status.padEnd(13)} ${o.id} ${o.url}${o.detail ? ` → ${o.detail}` : ''}\n`,
    )
  }
  // «Not attempted» is its own number: a save the pass declined to make is
  // neither a failure nor work done.
  rec.attempt(outcomes.length - counts['not-attempted'])
  rec.judge(counts.existing + counts.archived)
  if (counts.failed > 0) rec.skip('wayback-failed', counts.failed)
  rec.record('existing', counts.existing)
  rec.record('saved', counts.archived)
  rec.record('saves-closed-by-429', counts['not-attempted'])
  // Targets beyond --max were never asked either.
  rec.neverAttempt(counts['not-attempted'] + Math.max(0, targets.length - outcomes.length))

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
      `archived ${counts.archived} · existing ${counts.existing} · failed ${counts.failed} · ` +
      `not attempted ${counts['not-attempted']}\n`,
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
