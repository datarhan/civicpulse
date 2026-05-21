#!/usr/bin/env tsx
/**
 * Verify the press claims emitted by `extract:press-claims` against
 * the municipal data trail (tenders, BDNS, budget, promises) plus the
 * press-only padrón / paro families. Writes
 * public/data/press-claims-verified.json — the file the /laboratorio
 * UI + the auto-curate step read downstream.
 *
 * Usage: npm run verify:press-claims
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyPressClaimsBatch } from '../src/scraper/press-verifier'
import type { PressClaim } from '../src/scraper/press-claim'
import { asTenderRow, type TenderTedRow } from '../src/scraper/tenders-ted'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const PATHS = {
  claims: join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json'),
  tenders: join(PROJECT_ROOT, 'public/data/tenders.json'),
  tendersTed: join(PROJECT_ROOT, 'public/data/tenders-ted.json'),
  bdns: join(PROJECT_ROOT, 'public/data/bdns.json'),
  budget: join(PROJECT_ROOT, 'public/data/budget.json'),
  promises: join(PROJECT_ROOT, 'public/data/promises.json'),
  padron: join(PROJECT_ROOT, 'public/data/padron.json'),
  paro: join(PROJECT_ROOT, 'public/data/paro.json'),
  factcheck: join(PROJECT_ROOT, 'public/data/factcheck.json'),
  out: join(PROJECT_ROOT, 'public/data/press-claims-verified.json'),
}

async function readJson<T = unknown>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function main() {
  const claimsSnap = (await readJson(PATHS.claims)) as { items?: PressClaim[] } | null
  if (!claimsSnap || !Array.isArray(claimsSnap.items)) {
    throw new Error(
      `[verify:press-claims] press-claims-suggestions.json missing or invalid. Run npm run extract:press-claims first.`,
    )
  }
  const claims = claimsSnap.items

  const [tenders, tendersTedSnap, bdns, budget, promises, padron, paro, factcheckSnap] =
    await Promise.all([
      readJson(PATHS.tenders),
      readJson(PATHS.tendersTed),
      readJson(PATHS.bdns),
      readJson(PATHS.budget),
      readJson(PATHS.promises),
      readJson(PATHS.padron),
      readJson(PATHS.paro),
      readJson(PATHS.factcheck),
    ])
  const factchecks =
    (factcheckSnap as { items?: import('../src/scraper/factcheck').FactCheckRow[] } | null)
      ?.items ?? []

  // Project the TED snapshot (TenderTedRow shape) onto the same field set the
  // claim-verifier already understands for PLACSP. Wrapping in `{contracts:…}`
  // lets the existing readTenders() pick them up alongside the local tenders.
  const tedRows = (tendersTedSnap as { items?: TenderTedRow[] } | null)?.items ?? []
  const tendersTed = tedRows.length > 0 ? { contracts: tedRows.map(asTenderRow) } : null

  console.log(
    `[verify:press-claims] verifying ${claims.length} claims` +
      (tedRows.length > 0 ? ` + ${tedRows.length} TED notices` : '') +
      (factchecks.length > 0
        ? ` against ${factchecks.length} third-party fact-checks`
        : ' (no fact-checks indexed)'),
  )

  const snap = verifyPressClaimsBatch(claims, {
    tenders,
    tendersTed,
    bdns,
    budget,
    promises,
    padron,
    paro,
    factchecks,
  })

  await mkdir(dirname(PATHS.out), { recursive: true })
  await writeFile(PATHS.out, JSON.stringify(snap, null, 2) + '\n')

  console.log(
    `[verify:press-claims] wrote ${PATHS.out} · total=${snap.stats.total}` +
      ` · verificado=${snap.stats.byVerdict.verificado}` +
      ` · parcial=${snap.stats.byVerdict.parcial}` +
      ` · contradicho=${snap.stats.byVerdict.contradicho}` +
      ` · sin-datos=${snap.stats.byVerdict['sin-datos']}`,
  )
}

main().catch((err) => {
  console.error('[verify:press-claims] failed:', err)
  process.exit(1)
})
