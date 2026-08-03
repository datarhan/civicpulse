#!/usr/bin/env tsx
/**
 * Does every published claim still have a citation you can follow?
 *
 *   npm run check:citations              # published reports, with URL probing
 *   npm run check:citations -- --offline # skip the network, run the free gates
 *   npm run check:citations -- --draft editorial/journalist-drafts/x.draft.json
 *   npm run check:citations -- --json
 *
 * Exit code is 0 unless something BLOCKS (see `blocks()` in
 * src/scraper/citation-check.ts). Unreachable-from-here URLs are reported and
 * never block.
 *
 * Two modes on purpose:
 *
 *   · at promote time, against a draft — blocking. A draft whose citations do
 *     not resolve must not become a page about a named councillor.
 *   · in the nightly, against what is already published — report-only. Link rot
 *     is upstream's doing and arrives without a commit of ours; freezing the
 *     site over it would punish us for the council reorganising its website.
 *     It found exactly that on 2026-08-03: two acta PDFs that backed 68
 *     citations across 12 of 21 biographies had moved.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyUrl, type UrlVerdict } from './lib/doc-fetch'
import {
  blocks,
  checkCitations,
  type CitationCheckResult,
  type ReportLike,
} from '../src/scraper/citation-check'

const REPORTS = resolve('public/data/journalist-reports.json')
/** Polite: the council's site is a small municipal box, not a CDN. */
const CONCURRENCY = 4
const PAUSE_MS = 300

const out = (s = '') => process.stdout.write(`${s}\n`)

async function probe(urls: string[]): Promise<Map<string, UrlVerdict>> {
  const map = new Map<string, UrlVerdict>()
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY)
    const verdicts = await Promise.all(batch.map(classifyUrl))
    for (const v of verdicts) map.set(v.url, v)
    if (i + CONCURRENCY < urls.length) await new Promise((r) => setTimeout(r, PAUSE_MS))
    process.stderr.write(`\r  probing ${Math.min(i + CONCURRENCY, urls.length)}/${urls.length}`)
  }
  if (urls.length) process.stderr.write('\r' + ' '.repeat(30) + '\r')
  return map
}

function report(result: CitationCheckResult, asJson: boolean): void {
  if (asJson) {
    out(JSON.stringify(result, null, 2))
    return
  }
  const { coverage: c, findings } = result
  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')

  for (const group of [
    { label: 'BLOCKING', rows: errors },
    { label: 'warning', rows: warns },
    { label: 'not reachable from here', rows: infos },
  ]) {
    if (!group.rows.length) continue
    out(`\n── ${group.label} (${group.rows.length})`)
    for (const f of group.rows) {
      out(`  ${f.reportId}${f.sourceId ? ` / ${f.sourceId}` : ''}  [${f.code}]`)
      out(`      ${f.detail}`)
    }
  }

  // Coverage always, findings or not: a check that says nothing is read as a
  // pass, so it has to say what it looked at.
  out()
  out(
    `${c.reports} report(s) · ${c.sources} source(s) · ${c.sourcesWithExcerpt} with an excerpt · ` +
      `${c.quoteCards} quote card(s)`,
  )
  out(
    `URLs: ${c.urlsChecked}/${c.urls} probed` +
      (c.urlsChecked < c.urls ? `  ← ${c.urls - c.urlsChecked} NOT checked this run` : ''),
  )
  out(`${errors.length} blocking · ${warns.length} warning · ${infos.length} unreachable-from-here`)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const offline = argv.includes('--offline')
  const draftIdx = argv.indexOf('--draft')
  const draftPath = draftIdx >= 0 ? argv[draftIdx + 1] : null

  let reports: ReportLike[]
  let label: string
  if (draftPath) {
    if (!existsSync(draftPath)) {
      process.stderr.write(`[check:citations] ${draftPath} not found\n`)
      process.exit(1)
    }
    const draft = JSON.parse(readFileSync(draftPath, 'utf8'))
    reports = [draft as ReportLike]
    label = draftPath
  } else {
    if (!existsSync(REPORTS)) {
      process.stderr.write(`[check:citations] ${REPORTS} missing\n`)
      process.exit(1)
    }
    reports = JSON.parse(readFileSync(REPORTS, 'utf8')).items as ReportLike[]
    label = 'public/data/journalist-reports.json'
  }

  const urls = [
    ...new Set(reports.flatMap((r) => r.sources.map((s) => s.url).filter(Boolean))),
  ] as string[]
  const urlStates = offline ? undefined : await probe(urls)

  out(`[check:citations] ${label}${offline ? '  (offline — URLs not probed)' : ''}`)
  const result = checkCitations({ reports, urlStates })
  report(result, asJson)

  if (blocks(result)) {
    out('\nBLOCKED — a published claim has a citation that does not hold.')
    process.exit(1)
  }
}

main().catch((e) => {
  process.stderr.write(`[check:citations] ${(e as Error).stack ?? e}\n`)
  process.exit(1)
})
