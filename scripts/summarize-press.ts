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

import { summarizePressBatch, type PressSummaryInput } from '../src/scraper/press-summary-llm'
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

  const results = await summarizePressBatch(inputs)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      description: 'Neutral editorial summaries for press articles audited by the lab',
      contract: 'src/scraper/press-summary-llm.ts',
    },
    stats: { total: results.length, requested: items.length },
    items: results,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')

  console.log(
    `[summarize:press] wrote ${OUT} · ${results.length} summaries (of ${items.length} requested)`,
  )
}

main().catch((err) => {
  console.error('[summarize:press] failed:', err)
  process.exit(1)
})
