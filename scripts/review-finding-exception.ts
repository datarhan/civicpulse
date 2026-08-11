#!/usr/bin/env tsx
/**
 * review:finding-exception — record that a person judged an exception row and
 * decided the finding earns the exception, so the queue can shrink.
 *
 *   npm run review:finding-exception -- <findingId> \
 *     --reviewer "<name>" --note "<why it earns the exception, ≥20 chars>"
 *   npm run review:finding-exception -- --list      # what is already reviewed
 *   npm run review:finding-exception -- --stale     # reviews whose summary moved
 *
 * Writes `editorial/finding-exception-reviews.json`. **Never `public/`** — it
 * names findings about political groups next to who cleared them.
 *
 * This is the ONLY decision it can record, and deliberately so. "Keep" changes
 * nothing about the finding, so without a log the row returns forever; the
 * other decision — correct the summary — is made with
 * `npm run correct-pleno-finding`, which changes the published file and is its
 * own evidence. There is no path here that edits `pleno-findings.json`.
 *
 * A review is bound to the summary it judged, by hash. Change the summary and
 * the row comes back: the reviewer cleared specific words, not an id.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isReviewed,
  recordReview,
  staleReviews,
  summaryHash,
  type ExceptionReviewLog,
} from '../src/scraper/finding-exception-review'

const FINDINGS = 'public/data/pleno-findings.json'
export const REVIEW_LOG = 'editorial/finding-exception-reviews.json'

function loadLog(): ExceptionReviewLog | null {
  if (!existsSync(resolve(REVIEW_LOG))) return null
  try {
    return JSON.parse(readFileSync(resolve(REVIEW_LOG), 'utf8')) as ExceptionReviewLog
  } catch {
    return null
  }
}

function summaries(): Map<string, string> {
  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as {
    items: Array<{ id: string; summary: string }>
  }
  return new Map(snap.items.map((f) => [f.id, f.summary]))
}

function bail(msg: string): never {
  process.stderr.write(`[review-exception] ${msg}\n`)
  process.exit(2)
}

function main() {
  const argv = process.argv.slice(2)
  const flag = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? (argv[i + 1] ?? null) : null
  }
  const log = loadLog()
  const byId = summaries()

  if (argv.includes('--list')) {
    const rs = log?.reviews ?? []
    for (const r of rs) {
      const live = byId.get(r.findingId)
      const state =
        live === undefined
          ? 'FINDING GONE'
          : summaryHash(live) === r.summaryHash
            ? 'current'
            : 'SUMMARY MOVED — back in the queue'
      process.stdout.write(
        `${r.findingId}\t${r.reviewer}\t${r.reviewedAt.slice(0, 10)}\t${state}\n`,
      )
    }
    process.stdout.write(`\n${rs.length} review(s) on file\n`)
    return
  }

  if (argv.includes('--stale')) {
    const stale = staleReviews(log, byId)
    for (const r of stale) process.stdout.write(`${r.findingId}\t${r.reviewer}\n`)
    process.stdout.write(`\n${stale.length} review(s) no longer describe what is published\n`)
    return
  }

  const findingId = argv.find((a) => !a.startsWith('--') && a.startsWith('f-'))
  const reviewer = flag('--reviewer')
  const note = flag('--note')
  if (!findingId || !reviewer || !note) {
    bail(
      'usage: review:finding-exception <findingId> --reviewer "<name>" --note "<why, ≥20 chars>"\n' +
        '       review:finding-exception --list | --stale',
    )
  }
  // Same floor the corrections trail uses. A note that says "ok" records that
  // somebody clicked, not that somebody judged.
  if (note.trim().length < 20) bail('--note must be ≥20 chars — it is the record of the judgement')

  const summary = byId.get(findingId)
  if (summary === undefined) bail(`no finding with id "${findingId}"`)
  if (isReviewed(log, findingId, summary)) {
    process.stdout.write(`[review-exception] ${findingId} is already reviewed at this summary\n`)
    return
  }

  const next = recordReview(log, {
    findingId,
    decision: 'keep',
    reviewer,
    reviewedAt: new Date().toISOString(),
    summaryHash: summaryHash(summary),
    note: note.trim(),
  })
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(resolve(REVIEW_LOG), JSON.stringify(next, null, 2) + '\n')
  process.stdout.write(
    `[review-exception] ${findingId} recorded as KEEP by ${reviewer}\n` +
      `[review-exception] bound to this summary; if it changes, the row returns\n`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) main()
