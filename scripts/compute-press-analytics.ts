#!/usr/bin/env tsx
/**
 * Compute the three press-laboratory analytics reports and write them
 * to public/data/:
 *
 *   - press-trust.json           — Trust Project indicators per article
 *                                  + per-outlet scoreboard
 *   - press-triangulation.json   — fingerprint-clustered cross-outlet
 *                                  coverage + numeric drift
 *   - press-coverage-gaps.json   — pleno items + promises with no
 *                                  press echo in the last 14 days
 *
 * Reads:
 *   public/data/press.json
 *   public/data/press-claims-verified.json   (optional)
 *   public/data/plenos-agendas.json          (optional)
 *   public/data/promises.json                (optional)
 *
 * Usage: npm run compute:press-analytics
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeTrustIndicators,
  computeTriangulation,
  computeCoverageGaps,
  type PressArticleLite,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const PATHS = {
  press: join(PROJECT_ROOT, 'public/data/press.json'),
  verified: join(PROJECT_ROOT, 'public/data/press-claims-verified.json'),
  agendas: join(PROJECT_ROOT, 'public/data/plenos-agendas.json'),
  promises: join(PROJECT_ROOT, 'public/data/promises.json'),
  trust: join(PROJECT_ROOT, 'public/data/press-trust.json'),
  triangulation: join(PROJECT_ROOT, 'public/data/press-triangulation.json'),
  gaps: join(PROJECT_ROOT, 'public/data/press-coverage-gaps.json'),
}

async function readJson<T = unknown>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function write(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n')
}

async function main() {
  const press = (await readJson(PATHS.press)) as { items?: PressArticleLite[] } | null
  if (!press || !Array.isArray(press.items)) {
    throw new Error('[compute:press-analytics] press.json missing or invalid')
  }
  const verifiedSnap = (await readJson(PATHS.verified)) as {
    items?: VerifiedClaimRow[]
  } | null
  const verified = verifiedSnap?.items ?? []
  const agendas = (await readJson(PATHS.agendas)) as
    | {
        plenos?: Array<{
          id: string
          date: string
          agenda?: Array<{ number: number; title: string; department?: string }>
        }>
      }
    | null
  const promises = (await readJson(PATHS.promises)) as
    | { items?: Array<{ id: string; title: string; madeAt: string }> }
    | null

  const trust = computeTrustIndicators({ press: press.items, verified })
  const triangulation = computeTriangulation({ press: press.items, verified })
  const gaps = computeCoverageGaps({
    press: press.items,
    agendas: agendas ?? undefined,
    promises: promises ?? undefined,
  })

  await write(PATHS.trust, trust)
  await write(PATHS.triangulation, triangulation)
  await write(PATHS.gaps, gaps)

  console.log(
    `[compute:press-analytics] wrote trust(${trust.articles.length} articles, ${trust.outlets.length} outlets)` +
      ` · triangulation(${triangulation.stats.totalClusters} clusters, ${triangulation.stats.triangulated3Plus} 3+)` +
      ` · gaps(${gaps.stats.plenoItemsUncovered + gaps.stats.promisesUncovered} uncovered)`,
  )
}

main().catch((err) => {
  console.error('[compute:press-analytics] failed:', err)
  process.exit(1)
})
