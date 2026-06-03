/**
 * Curator CLI — apply a right-of-reply to a published journalist report.
 *
 *   npm run journalist-reply -- <reportId> <FROM> "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD]
 *
 * FROM must be one of:
 *   PSOE | PP | VOX | Compromís | Ciudadanos | Otro | person
 *
 * "person" is the catch-all for individual public figures who exercise
 * derecho de réplica in their own name (alcalde, concejal, opposition
 * spokesperson) rather than on behalf of a parliamentary group.
 *
 * Mirrors apply-finding-response.ts. The GitHub workflow at
 * .github/workflows/ingest-journalist-responses.yml (label
 * `derecho-replica`) calls this CLI after parsing the issue form.
 *
 * Re-validates the whole reports snapshot before writing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportResponse,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

const ALLOWED_FROM = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro', 'person']

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist-reply -- <reportId> <FROM> "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD]\n' +
      '\n' +
      `FROM ∈ ${ALLOWED_FROM.join(' | ')}\n`,
  )
  process.exit(2)
}

interface Opts {
  reportId: string
  from: string
  quote: string
  sourceUrl?: string
  respondedAt: string
}

function parseArgs(argv: string[]): Opts {
  const args = argv.filter((a) => {
    if (a === '-h' || a === '--help') usage()
    return true
  })
  if (args.length < 3) usage()
  const [reportId, from, quote, ...rest] = args
  let sourceUrl: string | undefined
  let respondedAt = new Date().toISOString().slice(0, 10)
  for (const r of rest) {
    if (/^https?:\/\//.test(r)) sourceUrl = r
    else if (/^\d{4}-\d{2}-\d{2}$/.test(r)) respondedAt = r
    else {
      process.stderr.write(
        `[journalist-reply] cannot interpret extra arg "${r}" (expected URL or YYYY-MM-DD)\n`,
      )
      process.exit(2)
    }
  }
  if (!ALLOWED_FROM.includes(from)) {
    process.stderr.write(`[journalist-reply] FROM must be one of ${ALLOWED_FROM.join('|')}\n`)
    process.exit(2)
  }
  if (quote.trim().length < 20) {
    process.stderr.write('[journalist-reply] quote must be verbatim ≥20 chars\n')
    process.exit(2)
  }
  return {
    reportId,
    from,
    quote: quote.trim(),
    ...(sourceUrl ? { sourceUrl } : {}),
    respondedAt,
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[journalist-reply] ${REPORTS} missing\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const idx = snap.items.findIndex((r) => r.id === opts.reportId)
  if (idx < 0) {
    process.stderr.write(`[journalist-reply] report ${opts.reportId} not found\n`)
    process.exit(1)
  }
  const response: JournalistReportResponse = {
    from: opts.from,
    quote: opts.quote,
    respondedAt: opts.respondedAt,
    ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
  }
  const next: JournalistReport = { ...snap.items[idx], response }
  const items = [...snap.items]
  items[idx] = next
  const out: JournalistReportsSnapshot = { ...snap, generatedAt: new Date().toISOString(), items }
  const serialized = JSON.stringify(out, null, 2) + '\n'
  validateReportsSnapshot(serialized)
  writeFileSync(REPORTS, serialized, 'utf8')
  const chunkPath = resolve(CHUNK_DIR, `${next.assignmentId}.json`)
  if (existsSync(chunkPath)) {
    writeFileSync(chunkPath, JSON.stringify(next, null, 2) + '\n')
  }
  process.stdout.write(
    `[journalist-reply] attached response to ${opts.reportId} · from=${opts.from} · respondedAt=${opts.respondedAt}\n`,
  )
}

main()
