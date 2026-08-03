#!/usr/bin/env tsx
/**
 * Curator CLI — a cited document moved; point the citations at where it is now.
 *
 *   npm run repoint-source-url -- --old <url> --new <url> \
 *       --reason "<≥20 chars>" [--editor "<name>"] [--dry-run] [--force]
 *
 * Why this is not `correct-journalist-report`: nothing about the reporting was
 * wrong. The council restructured its transparency portal on 2026-08 and the
 * 2023 acta PDFs moved from `files/2023-09/ACTA PLENO <date>.pdf` to
 * `files/migrate/<nodeId>/filesGroup/<code>.pdf`. The claim, the excerpt and
 * `retrievedAt` are all unchanged. Filing an upstream file move under
 * `corrections[]` would tell readers we got something wrong when we did not,
 * and an IFCN-style corrections ledger only means anything if every row in it
 * is a real correction.
 *
 * The guard that makes this safe to automate at all:
 *
 *   A relocation is REFUSED unless every affected citation's frozen `excerpt`
 *   still appears verbatim in the document at the new URL.
 *
 * Without it, "repoint a URL" is indistinguishable from "quietly swap the
 * evidence under a published claim about a named councillor". With it, the
 * failure mode is impossible rather than merely discouraged — Level 0 of the
 * ladder in docs/DATA_INTEGRITY.md.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rewriteJsonIfPresent, writeSnapshot } from './lib/snapshot-io'
import { classifyUrl, fetchDocumentText } from './lib/doc-fetch'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

interface Opts {
  oldUrl: string
  newUrl: string
  reason: string
  editor: string
  dryRun: boolean
  force: boolean
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run repoint-source-url -- --old <url> --new <url> \\\n' +
      '      --reason "<≥20 chars>" [--editor "<name>"] [--dry-run] [--force]\n' +
      '\n' +
      '  --force  repoint even if the OLD url still resolves (the publisher\n' +
      '           serves both). Without it, a live old url is refused: if it\n' +
      '           still works there is no relocation to record.\n',
  )
  process.exit(2)
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    oldUrl: '',
    newUrl: '',
    reason: '',
    editor: 'curator',
    dryRun: false,
    force: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--old') o.oldUrl = argv[++i] ?? ''
    else if (a === '--new') o.newUrl = argv[++i] ?? ''
    else if (a === '--reason') o.reason = argv[++i] ?? ''
    else if (a === '--editor') o.editor = argv[++i] ?? 'curator'
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--force') o.force = true
    else if (a === '--help' || a === '-h') usage()
    else {
      process.stderr.write(`[repoint-source-url] unknown argument ${a}\n`)
      usage()
    }
  }
  if (!o.oldUrl || !o.newUrl) usage()
  if (o.oldUrl === o.newUrl) {
    process.stderr.write('[repoint-source-url] --old and --new are the same URL\n')
    process.exit(2)
  }
  if (o.reason.trim().length < 20) {
    process.stderr.write('[repoint-source-url] --reason must be at least 20 characters\n')
    process.exit(2)
  }
  return o
}

const log = (s: string) => process.stdout.write(`[repoint-source-url] ${s}\n`)
const err = (s: string) => process.stderr.write(`[repoint-source-url] ${s}\n`)

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    err(`${REPORTS} missing`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))

  // 1. Who is affected?
  const affected: Array<{ report: JournalistReport; sourceId: string; excerpt?: string }> = []
  for (const r of snap.items) {
    for (const s of r.sources) {
      if (s.url === opts.oldUrl) affected.push({ report: r, sourceId: s.id, excerpt: s.excerpt })
    }
  }
  if (affected.length === 0) {
    err(`no source cites ${opts.oldUrl}`)
    process.exit(1)
  }
  const reportIds = [...new Set(affected.map((a) => a.report.id))]
  log(`${affected.length} citation(s) across ${reportIds.length} report(s) cite the old URL`)

  // 2. Is there actually a relocation to record?
  const oldVerdict = await classifyUrl(opts.oldUrl)
  log(
    `old URL → ${oldVerdict.state}${oldVerdict.status ? ` (${oldVerdict.status})` : ''}${oldVerdict.reason ? ` (${oldVerdict.reason})` : ''}`,
  )
  if (oldVerdict.state === 'alive' && !opts.force) {
    err('the old URL still resolves — nothing has moved. Use --force if the publisher serves both.')
    process.exit(1)
  }

  // 3. Does the new URL hold the SAME document?
  const newVerdict = await classifyUrl(opts.newUrl)
  log(`new URL → ${newVerdict.state}${newVerdict.status ? ` (${newVerdict.status})` : ''}`)
  if (newVerdict.state !== 'alive') {
    err(`new URL is ${newVerdict.state}; refusing to point published citations at it`)
    process.exit(1)
  }

  let text: string
  try {
    text = await fetchDocumentText(opts.newUrl)
  } catch (e) {
    err(`could not read the new document: ${(e as Error).message}`)
    process.exit(1)
  }
  log(`new document: ${text.length.toLocaleString('es-ES')} chars of text`)

  // 4. THE GATE. Every frozen excerpt must still be in there, verbatim.
  const withExcerpt = affected.filter((a) => a.excerpt && a.excerpt.trim())
  const missing = withExcerpt.filter((a) => !quoteAppearsIn(a.excerpt as string, text))
  log(
    `excerpt check: ${withExcerpt.length - missing.length}/${withExcerpt.length} still verbatim in the new document`,
  )
  if (affected.length !== withExcerpt.length) {
    log(
      `  (${affected.length - withExcerpt.length} citation(s) carry no excerpt — nothing to verify)`,
    )
  }
  if (missing.length > 0) {
    err('')
    err('REFUSED — the document at the new URL does not contain what these citations quote:')
    for (const m of missing) {
      const cov = quoteCoverage(m.excerpt as string, text)
      err(`  ${m.report.id} / ${m.sourceId}  (longest run present: ${(cov * 100).toFixed(0)}%)`)
      err(`      "${(m.excerpt as string).replace(/\s+/g, ' ').slice(0, 120)}…"`)
    }
    err('')
    err('This is either a different document or a different version of it.')
    err('Repointing anyway would swap the evidence under a published claim.')
    process.exit(1)
  }

  if (opts.dryRun) {
    log('dry run — every excerpt verified, nothing written')
    return
  }

  // 5. Write.
  const relocatedAt = new Date().toISOString()
  const items = snap.items.map((r) => {
    if (!r.sources.some((s) => s.url === opts.oldUrl)) return r
    return {
      ...r,
      sources: r.sources.map((s) =>
        s.url === opts.oldUrl
          ? { ...s, url: opts.newUrl, previousUrl: opts.oldUrl, relocatedAt }
          : s,
      ),
    }
  })
  const out: JournalistReportsSnapshot = { ...snap, generatedAt: relocatedAt, items }
  writeSnapshot(REPORTS, out, validateReportsSnapshot)
  for (const r of items) {
    if (reportIds.includes(r.id)) {
      rewriteJsonIfPresent(resolve(CHUNK_DIR, `${r.assignmentId}.json`), r)
    }
  }
  log(
    `repointed ${affected.length} citation(s) in ${reportIds.length} report(s) · editor=${opts.editor}`,
  )
  log(`reason: ${opts.reason.trim()}`)
}

main().catch((e) => {
  err(String((e as Error).stack ?? e))
  process.exit(1)
})
