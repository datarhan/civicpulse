#!/usr/bin/env tsx
/**
 * Generate neutral 2-3 sentence editorial summaries for the press
 * articles that the extractor flagged as carrying contrastable claims.
 *
 * Reads:
 *   public/data/press.json                        (article headlines)
 *   public/data/press-claims-suggestions.json     (which articles to summarise)
 *
 * Writes:
 *   public/data/press-summaries.json
 *
 * Falls back to summarising the entire press.json when the suggestions
 * file isn't on disk yet (first run / extractor hasn't shipped). Bounded
 * by --max so the LLM cost stays predictable.
 *
 * Usage:
 *   npm run summarize:press               # default
 *   npm run summarize:press -- --max 30
 *   npm run summarize:press -- --since 2026-05-01
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  summarizePressBatch,
  unresolvedSummaries,
  type PressSummaryInput,
} from '../src/scraper/press-summary-llm'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import { resetBudget } from '../src/llm/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const PRESS_IN = join(PROJECT_ROOT, 'public/data/press.json')
const CLAIMS_IN = join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json')
const OUT = join(PROJECT_ROOT, 'public/data/press-summaries.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

async function maybeReadJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  resetBudget()

  const since = getFlag('--since')
  const max = Number(getFlag('--max')) || Infinity

  const press = JSON.parse(await readFile(PRESS_IN, 'utf8')) as {
    items: Array<{
      id: string
      title: string
      link: string
      source: string
      sourceHost: string | null
      date: string
      fingerprint: string
    }>
  }
  const claims = (await maybeReadJson(CLAIMS_IN)) as { items: Array<{ articleId: string }> } | null

  const allow = claims
    ? new Set(claims.items.map((c) => c.articleId))
    : new Set(press.items.map((p) => p.id))

  let items = press.items.filter((p) => allow.has(p.id))
  if (since) items = items.filter((p) => p.date >= since)
  items = items.slice(0, max)

  console.log(
    `[summarize:press] summarising ${items.length} articles` +
      (since ? ` (since ${since})` : '') +
      (claims ? ` (filtered by claim suggestions)` : ' (all press items — no claims file yet)'),
  )

  const inputs: PressSummaryInput[] = items.map((p) => ({
    articleId: p.id,
    fingerprint: p.fingerprint,
    source: p.source,
    title: p.title,
    date: p.date,
  }))

  const { summaries, stats } = await summarizePressBatch(inputs)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      description: 'Neutral editorial summaries for press articles audited by the lab',
      contract: 'src/scraper/press-summary-llm.ts',
    },
    stats: {
      total: summaries.length,
      requested: items.length,
      // Provenance of the RUN, not of the summaries. Without these, "0
      // summaries" from a healthy pass that found nothing worth summarising, a
      // pass where the backend was dead, and a pass where no article had a body
      // are the same file — and the snapshot is what /laboratorio and
      // /lab-health read. Attempted / done / never attempted, reported
      // separately (CLAUDE.md data-integrity rule 2).
      summarized: stats.summarized,
      skippedNoBody: stats.skippedNoBody,
      llmUnavailable: stats.llmUnavailable,
    },
    items: summaries,
  }

  // Decide BEFORE writing, on the same shared gate extract:press-claims uses.
  //
  // This file is overwritten whole, so a run that produced nothing publishes
  // `items: []` over whatever was there. On 2026-08-09 the equivalent write in
  // extract:press-claims deleted a live claim and the pipeline reported the
  // deletion as its result; summarize:press escaped only because the file was
  // already empty.
  //
  // BOTH unfinished categories count as unresolved, not just the dead backend:
  // a body that never arrived is no more evidence that an existing summary
  // should be deleted than an unreachable model is. An incomplete run may add
  // summaries, never remove them; a complete one stays authoritative.
  const existingRaw = await readFile(OUT, 'utf8').catch(() => null)
  const decision = decideSnapshotWrite({
    incomingCount: summaries.length,
    unresolvedCount: unresolvedSummaries(stats),
    existingRaw,
    itemNoun: 'summary',
  })

  if (decision.write) {
    await mkdir(dirname(OUT), { recursive: true })
    await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
    console.log(
      `[summarize:press] wrote ${OUT} · ${stats.summarized} summarised, ` +
        `${stats.skippedNoBody} never attempted (sin cuerpo de artículo), ` +
        `${stats.llmUnavailable} backend caído · of ${stats.total} requested` +
        ` · ${decision.reason}`,
    )
  } else {
    console.error(`[summarize:press] NOT WRITING ${OUT} · ${decision.reason}`)
  }

  // A dead backend must not read as a clean run. Same shape as
  // extract-press-claims.ts: flag it and exit non-zero so the pipeline's
  // free_step logs ❌ and withholds press-summaries.json from the commit.
  //
  // Only the ATTEMPTED-AND-FAILED count trips this. `skippedNoBody` does not:
  // it is a disclosed policy skip (8b149d0 — the summariser refuses to
  // elaborate a headline into invented prose), it is currently every item, and
  // failing on it would paint the step ❌ every night for a backend that is
  // perfectly healthy. That is the mirror-image lie of the one being fixed.
  if (stats.llmUnavailable > 0) {
    console.error(
      `[summarize:press] WARNING: LLM backend unavailable for ` +
        `${stats.llmUnavailable}/${stats.total} articles ` +
        `(backend=${process.env.LLM_BACKEND ?? 'auto'}). The summaries ` +
        `snapshot is incomplete — fix the backend and re-run.`,
    )
    process.exitCode = 1
  }
  // A run that declined to publish its own output has not succeeded either,
  // even when every failure was a policy skip: the pipeline stages a step's
  // snapshot only if that step is in CHAIN_OK, so exiting 0 here would let it
  // report ✅ for a refresh it deliberately withheld.
  if (!decision.write) process.exitCode = 1
}

main().catch((err) => {
  console.error('[summarize:press] failed:', err)
  process.exit(1)
})
