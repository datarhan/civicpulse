#!/usr/bin/env tsx
/**
 * Promise auto-curator — daily orchestrator (Plan A / Phase 1: discovery).
 *
 * LLM discovery over fresh press + pleno agendas → deterministic grounding →
 * decision tiering → writes new-promise drafts to editorial/promise-review-
 * queue.json (local-only) and auto-publishes the grounded, high-confidence
 * documentada drafts into promises.json.
 *
 * LOREG freeze fail-closed: missing promises.json → exit 1; frozen → exit 0.
 *
 * Usage:
 *   npm run auto-curate-promises -- [--max 10] [--min-confidence 0.7] \
 *       [--phase discovery] [--dry-run] [--no-auto-publish]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { validatePromisesSnapshot, isFrozen, type PromisesSnapshot } from '../src/scraper/promises'
import {
  makeDraftId,
  validateReviewQueue,
  emptyQueue,
  type DraftNewPromise,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'
import { groundDraft } from '../src/scraper/promise-grounding'
import { selectPromiseDrafts } from '../src/scraper/promise-auto-curate'
import { newPromiseFromDraft, insertPromise } from '../src/scraper/promise-apply'
import { discoverPromises } from '../src/llm/promise-discovery'
import type { PromiseDiscoveryInput } from '../src/llm/prompts'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const PROMISES = resolve('public/data/promises.json')
const PRESS = resolve('public/data/press.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')
const QUEUE = resolve('editorial/promise-review-queue.json')
const ARCHIVE = resolve('editorial/promise-review-archive.json')
const LOGDIR = resolve('scripts/logs')

interface CliArgs {
  max: number
  minConfidence: number
  phase: 'discovery'
  dryRun: boolean
  noAutoPublish: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    max: 10,
    minConfidence: 0.7,
    phase: 'discovery',
    dryRun: false,
    noAutoPublish: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i])
    else if (a === '--phase') {
      const p = argv[++i]
      if (p !== 'discovery') {
        process.stderr.write(
          `[auto-curate-promises] --phase ${p} not supported in Plan A (discovery only)\n`,
        )
        process.exit(2)
      }
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--no-auto-publish') out.noAutoPublish = true
    else {
      process.stderr.write(`[auto-curate-promises] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(out.max) || out.max < 1 || out.max > 50) {
    process.stderr.write('--max must be 1..50\n')
    process.exit(2)
  }
  if (!Number.isFinite(out.minConfidence) || out.minConfidence < 0 || out.minConfidence > 1) {
    process.stderr.write('--min-confidence must be 0..1\n')
    process.exit(2)
  }
  return out
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function loadQueue(path: string): PromiseReviewQueue {
  if (!existsSync(path)) return emptyQueue(new Date().toISOString())
  return validateReviewQueue(readFileSync(path, 'utf8'))
}

function buildDiscoveryInput(
  snap: PromisesSnapshot,
  press: { items?: Array<{ title: string; link: string; date: string; source?: string }> } | null,
  agendas: { items?: Array<{ title: string; url?: string; date?: string }> } | null,
): PromiseDiscoveryInput {
  const existingTitles = snap.items.map((p) => p.title)
  const pressItems = (press?.items ?? []).slice(0, 60).map((n) => ({
    title: n.title,
    url: n.link,
    date: (n.date || '').slice(0, 10),
    publisher: n.source,
  }))
  const agendaItems = (agendas?.items ?? [])
    .filter((a) => a.url && a.date)
    .slice(0, 60)
    .map((a) => ({
      title: a.title,
      url: a.url as string,
      date: (a.date as string).slice(0, 10),
      publisher: 'Ayuntamiento Riba-roja',
    }))
  return {
    existingTitles,
    sources: [
      { kind: 'press', items: pressItems },
      { kind: 'pleno_agenda', items: agendaItems },
    ],
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  resetBudget()
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[auto-curate-promises] backend=${config.backend} · max=${opts.max} · min-conf=${opts.minConfidence} · dry-run=${opts.dryRun} · no-auto-publish=${opts.noAutoPublish}\n`,
  )

  // Fail CLOSED: unknowable freeze state must not publish.
  const rawPromises = existsSync(PROMISES) ? readFileSync(PROMISES, 'utf8') : null
  if (!rawPromises) {
    process.stderr.write(
      `[auto-curate-promises] ${PROMISES} missing — cannot determine LOREG freeze, refusing\n`,
    )
    process.exit(1)
  }
  const snap = validatePromisesSnapshot(rawPromises)
  if (isFrozen(snap)) {
    process.stderr.write(
      `[auto-curate-promises] LOREG freeze active until ${snap.frozenUntil} — exiting\n`,
    )
    process.exit(0)
  }

  const press = loadJson<{
    items?: Array<{ title: string; link: string; date: string; source?: string }>
  }>(PRESS)
  const agendas = loadJson<{ items?: Array<{ title: string; url?: string; date?: string }> }>(
    AGENDAS,
  )

  const input = buildDiscoveryInput(snap, press, agendas)
  const batch = await discoverPromises(input)
  if (!batch) {
    process.stderr.write(
      '[auto-curate-promises] LLM returned null (backend/budget) — nothing to do\n',
    )
    return
  }
  process.stdout.write(
    `[auto-curate-promises] LLM proposed ${batch.promises.length} candidate(s)\n`,
  )

  // Project LLM items → drafts, then ground each.
  const now = new Date()
  const nowIso = now.toISOString()
  const candidates: DraftNewPromise[] = []
  for (const it of batch.promises) {
    const draftId = makeDraftId(it.party, it.title, it.sourceUrl)
    const draft: DraftNewPromise = {
      draftId,
      kind: 'new-promise',
      requiresHumanApproval: true,
      confidence: it.confidence,
      grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: nowIso },
      decision: 'queue',
      proposed: {
        party: it.party,
        title: it.title,
        quote: it.quote,
        source: { url: it.sourceUrl, publisher: it.publisher },
        madeAt: it.madeAt,
        topic: it.topic,
        kind: it.kind,
        status: 'documentada',
      },
      reasoning: [
        {
          url: it.sourceUrl,
          date: it.madeAt,
          quote: it.reasoning,
          publisher: it.publisher,
          matchedKeywords: [],
        },
      ],
      generatedAt: nowIso,
    }
    draft.grounding = await groundDraft(draft, undefined, now)
    candidates.push(draft)
  }

  const existingQueue = loadQueue(QUEUE)
  const archive = loadQueue(ARCHIVE)
  const seen = new Set<string>([...existingQueue.drafts, ...archive.drafts].map((d) => d.draftId))

  const sel = selectPromiseDrafts({
    candidates,
    existingPromises: snap.items,
    seenDraftIds: seen,
    frozen: false,
    minConfidence: opts.minConfidence,
    max: opts.max,
  })

  // With --no-auto-publish, force everything to the queue for review.
  const autoPublish = opts.noAutoPublish ? [] : sel.autoPublish
  const toQueue = opts.noAutoPublish
    ? [...sel.queue, ...sel.autoPublish.map((d) => ({ ...d, decision: 'queue' as const }))]
    : sel.queue

  process.stdout.write(
    `[auto-curate-promises] auto-publish=${autoPublish.length} · queue=${toQueue.length} · skipped=${sel.skipped.length}\n`,
  )

  if (opts.dryRun) {
    const preview = `/tmp/auto-curate-promises-preview-${now.getTime()}.json`
    writeFileSync(
      preview,
      JSON.stringify({ autoPublish, toQueue, skipped: sel.skipped }, null, 2) + '\n',
    )
    process.stdout.write(
      `[auto-curate-promises] DRY RUN — wrote preview to ${preview} (no persistence)\n`,
    )
    return
  }

  // Persist queue (merge new queue/fast-track drafts onto the existing queue).
  mkdirSync(resolve('editorial'), { recursive: true })
  const mergedQueue: PromiseReviewQueue = {
    version: existingQueue.version,
    generatedAt: nowIso,
    drafts: [...existingQueue.drafts, ...toQueue],
  }
  writeFileSync(QUEUE, JSON.stringify(mergedQueue, null, 2) + '\n')

  // Apply auto-publish drafts to promises.json (single validated write).
  if (autoPublish.length > 0) {
    let next: PromisesSnapshot = snap
    for (const d of autoPublish) {
      next = insertPromise(
        next,
        newPromiseFromDraft(d, nowIso, { confidence: d.confidence, at: nowIso }),
      )
    }
    const serialized = JSON.stringify({ ...next, generatedAt: nowIso }, null, 2) + '\n'
    validatePromisesSnapshot(serialized) // defence-in-depth
    writeFileSync(PROMISES, serialized)
    process.stdout.write(
      `[auto-curate-promises] auto-published ${autoPublish.length} promise(s) to promises.json\n`,
    )
  }

  // Digest.
  mkdirSync(LOGDIR, { recursive: true })
  const digest = [
    `# Promise auto-curator digest — ${nowIso}`,
    ``,
    `- auto-published: ${autoPublish.length}`,
    ...autoPublish.map(
      (d) => `  - ${d.proposed.party} · ${d.proposed.title} (conf ${d.confidence.toFixed(2)})`,
    ),
    `- queued for review: ${toQueue.length}`,
    ...toQueue.map(
      (d) =>
        `  - [${d.decision}] ${d.proposed.party} · ${d.proposed.title} (conf ${d.confidence.toFixed(2)}, grounded=${d.grounding.grounded})`,
    ),
    `- skipped: ${sel.skipped.length}`,
    ...sel.skipped.map((s) => `  - ${s.draftId}: ${s.reason}`),
    ``,
  ].join('\n')
  writeFileSync(resolve(LOGDIR, `auto-curate-promises-${nowIso.slice(0, 10)}.md`), digest)
  process.stdout.write(
    `[auto-curate-promises] digest → scripts/logs/auto-curate-promises-${nowIso.slice(0, 10)}.md\n`,
  )
}

main().catch((err) => {
  process.stderr.write(
    `[auto-curate-promises] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
