/**
 * Post-processing pass that derives cross-source department metrics
 * from the already-scraped JSON snapshots and writes a scalar back
 * into plenos-agendas.json.stats.plazosVencidosCount.
 *
 * Runs after scrape:all so the landing page can read ONE number to
 * drive the LiveTicker chip instead of fetching five JSON files on
 * the most-trafficked route.
 *
 * This script never mutates the curated files (promises.json,
 * pleno-votes.json, quejas.json) — it only writes stats back into
 * plenos-agendas.json, which is an autonomous-scraper output.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeDepartmentStats } from '../src/lib/department-stats'

const DATA = resolve('public/data')
const AGENDAS_PATH = resolve(DATA, 'plenos-agendas.json')

async function loadIfExists(filename: string): Promise<unknown> {
  const p = resolve(DATA, filename)
  if (!existsSync(p)) return null
  return JSON.parse(await readFile(p, 'utf8'))
}

async function main() {
  const [officials, promises, agendas, votes, quejas] = await Promise.all([
    loadIfExists('officials.json'),
    loadIfExists('promises.json'),
    loadIfExists('plenos-agendas.json'),
    loadIfExists('pleno-votes.json'),
    loadIfExists('quejas.json'),
  ])

  if (!agendas) {
    console.error('[compute-dept-stats] plenos-agendas.json not found — run npm run scrape:pleno-agendas first')
    process.exit(1)
  }

  const stats = computeDepartmentStats({
    officials,
    promises,
    agendas,
    votes,
    quejas,
  })

  const next = agendas as Record<string, unknown>
  const statsBlock = (next.stats && typeof next.stats === 'object'
    ? { ...(next.stats as Record<string, unknown>) }
    : {}) as Record<string, unknown>
  statsBlock.plazosVencidosCount = stats.plazosVencidosCount
  statsBlock.deptCoverage = stats.list.filter((b) => b.responsableOfficial != null).length
  next.stats = statsBlock

  await writeFile(AGENDAS_PATH, JSON.stringify(next, null, 2) + '\n')
  console.log(
    `[compute-dept-stats] plazosVencidosCount=${stats.plazosVencidosCount} · ` +
      `depts with concejal=${statsBlock.deptCoverage}/${stats.list.length}`,
  )
}

main().catch((err) => {
  console.error('[compute-dept-stats] failed:', err)
  process.exit(1)
})
