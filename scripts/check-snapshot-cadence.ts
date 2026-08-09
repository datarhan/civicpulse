#!/usr/bin/env tsx
/**
 * Report snapshots that have quietly stopped refreshing.
 *
 *   npm run check:cadence            # human table
 *   npm run check:cadence -- --json  # machine-readable
 *
 * Exits 1 when something is stale, so a caller can notice. A retired upstream
 * is NOT stale — it is a known, surfaced end-of-life.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyFreshness,
  DEFAULT_EXPECTATIONS,
  type SnapshotFacts,
} from '../src/scraper/snapshot-cadence'

const DATA = resolve('public/data')

function facts(): SnapshotFacts[] {
  const now = Date.now()
  return DEFAULT_EXPECTATIONS.map((e) => {
    const p = `${DATA}/${e.file}`
    if (!existsSync(p)) return { file: e.file, ageDays: null }
    try {
      const d = JSON.parse(readFileSync(p, 'utf8')) as {
        generatedAt?: string
        upstream?: { status?: string }
      }
      const g = d.generatedAt ? Date.parse(d.generatedAt) : NaN
      return {
        file: e.file,
        ageDays: Number.isFinite(g) ? Math.floor((now - g) / 86_400_000) : null,
        upstreamStatus: d.upstream?.status ?? null,
      }
    } catch {
      return { file: e.file, ageDays: null }
    }
  })
}

function main() {
  const rows = classifyFreshness(facts())
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2))
  } else {
    const bad = rows.filter((r) => r.status !== 'ok')
    console.log(
      `[freshness] ${rows.length} dataset(s) · ` +
        `${rows.filter((r) => r.status === 'ok').length} ok · ` +
        `${rows.filter((r) => r.status === 'stale').length} stale · ` +
        `${rows.filter((r) => r.status === 'retired').length} retired · ` +
        `${rows.filter((r) => r.status === 'unknown').length} unknown\n`,
    )
    for (const r of bad) {
      const age = r.ageDays == null ? '  ?' : `${r.ageDays}d`.padStart(4)
      console.log(`  ${r.status.toUpperCase().padEnd(8)} ${age}  ${r.file.padEnd(28)} ${r.note}`)
    }
  }
  if (rows.some((r) => r.status === 'stale')) process.exitCode = 1
}

main()
