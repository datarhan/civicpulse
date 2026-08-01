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
import { classifyClaimVisibility } from '../src/scraper/claim-public-gate'

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
  boe: join(PROJECT_ROOT, 'public/data/boe.json'),
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
  const claimsSnap = (await readJson(PATHS.claims)) as {
    items?: PressClaim[]
    generatedAt?: string
  } | null
  if (!claimsSnap || !Array.isArray(claimsSnap.items)) {
    throw new Error(
      `[verify:press-claims] press-claims-suggestions.json missing or invalid. Run npm run extract:press-claims first.`,
    )
  }
  const claims = claimsSnap.items

  const [tenders, tendersTedSnap, bdns, budget, promises, padron, paro, factcheckSnap, boeSnap] =
    await Promise.all([
      readJson(PATHS.tenders),
      readJson(PATHS.tendersTed),
      readJson(PATHS.bdns),
      readJson(PATHS.budget),
      readJson(PATHS.promises),
      readJson(PATHS.padron),
      readJson(PATHS.paro),
      readJson(PATHS.factcheck),
      readJson(PATHS.boe),
    ])
  const factchecks =
    (factcheckSnap as { items?: import('../src/scraper/factcheck').FactCheckRow[] } | null)
      ?.items ?? []
  const boe = (boeSnap as { items?: import('../src/scraper/boe').BoeRow[] } | null)?.items ?? []

  // Project the TED snapshot (TenderTedRow shape) onto the same field set the
  // claim-verifier already understands for PLACSP. Wrapping in `{contracts:…}`
  // lets the existing readTenders() pick them up alongside the local tenders.
  const tedRows = (tendersTedSnap as { items?: TenderTedRow[] } | null)?.items ?? []
  const tendersTed = tedRows.length > 0 ? { contracts: tedRows.map(asTenderRow) } : null

  console.log(
    `[verify:press-claims] verifying ${claims.length} claims` +
      (tedRows.length > 0 ? ` + ${tedRows.length} TED notices` : '') +
      (boe.length > 0 ? ` + ${boe.length} BOE entries` : '') +
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
    boe,
  })

  // Apply the SAME editorial gate the pleno ledger uses, at WRITE time.
  //
  // The pleno monoliths are kept out of the deploy entirely (.vercelignore) so
  // ungated accusation verbatim is never fetchable; the SPA reads pre-gated
  // chunks instead. /laboratorio has no chunk layer — it fetches this file
  // directly — and it was neither excluded nor gated, while
  // ALLOWED_PRESS_CLAIM_TYPES includes `acusacion_publica` with an `opinativa`
  // subtype. Latent only because the extractor has emitted zero accusations so
  // far; the first one would have published an ungated opinion-accusation
  // naming a person, verbatim.
  const kept = snap.items.filter((it) => classifyClaimVisibility(it as never) !== 'hidden')
  const dropped = snap.items.length - kept.length
  if (dropped > 0) {
    console.warn(
      `[verify:press-claims] withheld ${dropped} claim(s) from the public file ` +
        `(opinion accusations / ungrounded accusations)`,
    )
  }
  snap.items = kept
  // Where the CLAIMS came from, alongside when we last re-verified them.
  // `verifyPressClaimsBatch` stamps `generatedAt` with "now" unconditionally,
  // so on 2026-08-01 the extraction step timed out (exit 124, every LLM
  // backend exhausted), the verifier ran anyway over the previous day's
  // suggestions, and the page's freshness chip read "hoy" over 1-day-old
  // claims with nothing in the snapshot recording that the upstream step had
  // failed.
  ;(snap as unknown as { sourceGeneratedAt?: string | null }).sourceGeneratedAt =
    (claimsSnap as { generatedAt?: string }).generatedAt ?? null

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
