#!/usr/bin/env tsx
/**
 * check:queues — do the curator worklists still describe what is published?
 *
 *   npm run check:queues
 *   npm run check:queues -- --json
 *
 * A `triage:*` pass writes a queue once; nothing invalidates it when its
 * subjects disappear. On 2026-08-11, after eleven findings were withdrawn,
 * roughly a third of an apparent 175-row backlog was rows about findings that
 * no longer existed — and one whole queue (`area-fit`) had been fully curated
 * a week earlier and never cleared. Nothing published was wrong; the backlog
 * simply lied about its own size, which is how a queue stops being worked.
 *
 * Reports, never rewrites. Re-running the named `triage:*` pass is the fix; a
 * checker that quietly edited a curator's worklist would be its own defect.
 *
 * See `src/scraper/queue-staleness.ts` for why retracted and orphaned ids are
 * counted apart.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  QUEUE_SOURCES,
  assessQueue,
  isClean,
  type CorpusView,
  type QueueReport,
} from '../src/scraper/queue-staleness'

const FINDINGS = 'public/data/pleno-findings.json'

function corpus(): CorpusView {
  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as {
    items: Array<{ id: string }>
    retractions?: Array<{ findingId: string }>
  }
  return {
    published: new Set(snap.items.map((f) => f.id)),
    retracted: new Set((snap.retractions ?? []).map((r) => r.findingId)),
  }
}

function readQueue(path: string): unknown | null {
  const p = resolve(path)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function main() {
  const asJson = process.argv.includes('--json')
  const view = corpus()
  const reports: QueueReport[] = QUEUE_SOURCES.map((s) => assessQueue(s, readQueue(s.path), view))

  if (asJson) {
    process.stdout.write(JSON.stringify({ reports }, null, 2) + '\n')
    if (reports.some((r) => !isClean(r))) process.exitCode = 1
    return
  }

  const present = reports.filter((r) => r.present)
  for (const r of reports) {
    const name = r.path.replace('editorial/', '').replace('.json', '')
    if (!r.present) {
      process.stdout.write(`  · ${name.padEnd(26)} sin fichero — nada que revisar\n`)
      continue
    }
    // An empty queue is not a clean queue. `attribution-queue` is empty right
    // now because no session has a speaker map, so nothing could be compared —
    // reporting that with the same ✓ as "43 rows, all live" would be this
    // check telling the same lie it exists to catch.
    if (r.total === 0) {
      process.stdout.write(
        `  · ${name.padEnd(26)}   0 filas — vacía, que NO es lo mismo que revisada.\n` +
          `      qué la llena: ${r.regenerate}\n`,
      )
      continue
    }
    if (isClean(r)) {
      process.stdout.write(
        `  ✓ ${name.padEnd(26)} ${String(r.total).padStart(3)} fila(s), todas vivas\n`,
      )
      continue
    }
    process.stdout.write(
      `  ✗ ${name.padEnd(26)} ${String(r.total).padStart(3)} fila(s): ${r.live} viva(s), ` +
        `${r.retracted.length} sobre hallazgos retirados` +
        (r.orphaned.length ? `, ${r.orphaned.length} HUÉRFANA(S)` : '') +
        (r.unkeyed ? `, ${r.unkeyed} sin id` : '') +
        `\n      se regenera con: ${r.regenerate}\n`,
    )
    // An orphan is not ordinary drift — it names a finding that was never
    // published and never retracted either, so nobody can say where it went.
    for (const id of r.orphaned.slice(0, 5)) {
      process.stdout.write(`      huérfana: ${id}\n`)
    }
  }

  const stale = present.filter((r) => !isClean(r))
  process.stdout.write(
    `\n[check-queues] ${present.length} cola(s) con fichero · ` +
      `${present.reduce((n, r) => n + r.total, 0)} fila(s) · ` +
      `${present.reduce((n, r) => n + r.live, 0)} viva(s) · ${stale.length} cola(s) desactualizada(s)\n`,
  )

  // A run that found no queues on disk has not shown the worklists are clean —
  // it has shown it looked nowhere, which is a broken check.
  if (present.length === 0) {
    process.stderr.write(
      '[check-queues] FATAL: ninguna cola en disco. Con cero ficheros este check no puede\n' +
        '               encontrar nada, así que «todo limpio» no significa nada.\n',
    )
    process.exitCode = 1
    return
  }
  if (stale.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
