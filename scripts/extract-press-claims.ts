#!/usr/bin/env tsx
/**
 * Extract press claims from public/data/press.json using the
 * press-claim-llm two-stage pipeline (headline triage → body fetch
 * when needed → claim extraction). Writes
 * public/data/press-claims-suggestions.json with requiresHumanApproval
 * stamped on every row.
 *
 * Usage:
 *   npm run extract:press-claims                       # all items
 *   npm run extract:press-claims -- --max 20           # cap items
 *   npm run extract:press-claims -- --since 2026-05-01 # date floor
 *   npm run extract:press-claims -- --source levante   # filter by sourceHost substring
 *   npm run extract:press-claims -- --headline-only    # skip body fetch
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractPressClaimsBatch, type PressNewsItem } from '../src/scraper/press-claim-llm'
import { fetchArticleBody } from '../src/scraper/press-fetcher'
import {
  ALLOWED_PRESS_CLAIM_TYPES,
  ALLOWED_CLAIM_TOPICS,
  ALLOWED_ATTRIBUTED_SOURCES,
  type PressClaimsSnapshot,
} from '../src/scraper/press-claim'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import { resetBudget } from '../src/llm/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const IN = join(PROJECT_ROOT, 'public/data/press.json')
const OUT = join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function main() {
  resetBudget()

  const since = getFlag('--since')
  const sourceFilter = getFlag('--source')
  const max = Number(getFlag('--max')) || Infinity
  const headlineOnly = hasFlag('--headline-only')

  const pressRaw = await readFile(IN, 'utf8')
  const press = JSON.parse(pressRaw) as {
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

  let items: PressNewsItem[] = press.items.map((i) => ({
    id: i.id,
    title: i.title,
    link: i.link,
    source: i.source,
    sourceHost: i.sourceHost,
    date: i.date,
    fingerprint: i.fingerprint,
  }))

  if (since) items = items.filter((it) => it.date >= since)
  if (sourceFilter) {
    const needle = sourceFilter.toLowerCase()
    items = items.filter(
      (it) =>
        (it.sourceHost ?? '').toLowerCase().includes(needle) ||
        it.source.toLowerCase().includes(needle),
    )
  }
  // How many were in scope BEFORE the sliding window cut it down. The window
  // is 25 items over a date-desc feed and the snapshot is overwritten whole,
  // so cumulative coverage is 8 of 156 articles — and nothing in the file said
  // so.
  const allItemsCount = items.length
  items = items.slice(0, max)

  console.log(
    `[extract:press-claims] processing ${items.length} items` +
      (since ? ` (since ${since})` : '') +
      (sourceFilter ? ` (source≈${sourceFilter})` : '') +
      (headlineOnly ? ' (headline-only mode)' : ''),
  )

  const result = await extractPressClaimsBatch(items, {
    bodyFetcher: headlineOnly
      ? undefined
      : async (url: string) => {
          const fr = await fetchArticleBody(url)
          return fr.body || null
        },
    forceHeadlineOnly: headlineOnly,
  })

  const byType: Record<string, number> = Object.fromEntries(
    ALLOWED_PRESS_CLAIM_TYPES.map((t) => [t, 0]),
  )
  const byTopic: Record<string, number> = Object.fromEntries(
    ALLOWED_CLAIM_TOPICS.map((t) => [t, 0]),
  )
  const byAttributedSource: Record<string, number> = Object.fromEntries(
    ALLOWED_ATTRIBUTED_SOURCES.map((s) => [s, 0]),
  )
  const bySource: Record<string, number> = {}
  for (const c of result.claims) {
    byType[c.type] = (byType[c.type] || 0) + 1
    byTopic[c.topic] = (byTopic[c.topic] || 0) + 1
    byAttributedSource[c.attributedSource] = (byAttributedSource[c.attributedSource] || 0) + 1
    bySource[c.articleSource] = (bySource[c.articleSource] || 0) + 1
  }

  const snapshot: PressClaimsSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      description: 'Press claims extracted by the laboratory pipeline',
      contract: 'src/scraper/press-claim.ts',
    },
    stats: {
      total: result.claims.length,
      byType: byType as never,
      bySource,
      byTopic: byTopic as never,
      byAttributedSource: byAttributedSource as never,
      articlesProcessed: result.stats.total,
      articlesAvailable: allItemsCount,
      llmUnavailable: result.stats.llmUnavailable,
      windowFrom: items[items.length - 1]?.date ?? null,
      windowTo: items[0]?.date ?? null,
    },
    items: result.claims,
  }

  // Decide BEFORE writing. The original code wrote first and only then checked
  // `llmUnavailable`, which meant a run whose every LLM call failed emitted
  // `total: 0, items: []` over the published corpus and *then* exited 1. The
  // old comment justified that with "the partial snapshot is still written
  // above, so progress is kept" — sound for a genuinely partial run, and wrong
  // for a run that achieved nothing. Zero claims from a dead backend is not
  // progress, it is erasure: on 2026-08-09 it deleted a live published claim
  // (gqglxs-0-num) and the pipeline reported the deletion as its result.
  //
  // The rule the guard encodes, therefore, is about DIRECTION, not emptiness:
  // an incomplete run may add claims but may never remove them. A complete run
  // (llmUnavailable === 0) stays authoritative and always writes, including
  // when it honestly found fewer claims than last time. See
  // decideSnapshotWrite in src/scraper/snapshot-write.ts for the pure decision
  // — shared with summarize:press, which needs the identical rule.
  const existingRaw = await readFile(OUT, 'utf8').catch(() => null)
  const decision = decideSnapshotWrite({
    incomingCount: snapshot.items.length,
    unresolvedCount: result.stats.llmUnavailable,
    existingRaw,
    itemNoun: 'claim',
  })

  if (decision.write) {
    await mkdir(dirname(OUT), { recursive: true })
    await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(
      `[extract:press-claims] wrote ${OUT}` +
        ` · ${result.stats.claimsEmitted} claims · ` +
        `triage=${result.stats.triageHits}/${result.stats.total} hits, ` +
        `body=${result.stats.bodyFetches} fetches` +
        ` · ${decision.reason}`,
    )
  } else {
    console.error(`[extract:press-claims] NOT WRITING ${OUT} · ${decision.reason}`)
  }

  // Either way, an incomplete run must not masquerade as a clean extract: flag
  // it loudly and exit non-zero so the cron marks the step ❌ — and, since the
  // pipeline now honours that, skips the consumers that would derive published
  // numbers from a corpus this run could not refresh.
  if (result.stats.llmUnavailable > 0) {
    console.error(
      `[extract:press-claims] WARNING: LLM backend unavailable for ` +
        `${result.stats.llmUnavailable}/${result.stats.total} items ` +
        `(backend=${process.env.LLM_BACKEND ?? 'auto'}). The suggestions ` +
        `snapshot is incomplete — fix the backend and re-run.`,
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[extract:press-claims] failed:', err)
  process.exit(1)
})
