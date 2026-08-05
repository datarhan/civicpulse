/**
 * Cross-snapshot referential-integrity audit over public/data.
 *
 *   npm run check:relations             # strict: exit 1 on error-level breakage
 *   npm run check:relations -- --soft   # report-only: always exit 0 (nightly)
 *
 * Pure checks live in src/scraper/relations-check.ts — this CLI only
 * reads the snapshot files (absent file → that check reports `skip`,
 * never a false failure on a fresh clone) and formats the report.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  runRelationsChecks,
  type RelationsCheckInputs,
  type RelationCheckResult,
} from '../src/scraper/relations-check'

const DATA_DIR = join(process.cwd(), 'public', 'data')
const SOFT = process.argv.includes('--soft')

function readJson(rel: string): any | undefined {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, rel), 'utf8'))
  } catch {
    return undefined
  }
}

function main() {
  const manifest = readJson('pleno-claims/index.json')
  let chunkFiles: RelationsCheckInputs['chunkFiles']
  if (manifest != null) {
    chunkFiles = {}
    for (const p of manifest.plenos ?? []) {
      if (p?.chunkPath) chunkFiles[p.chunkPath] = readJson(p.chunkPath) ?? null
    }
  }

  const inputs: RelationsCheckInputs = {
    verified: readJson('pleno-claims-verified.json'),
    overlay: readJson('pleno-claims-overlay.json'),
    manifest,
    chunkFiles,
    findings: readJson('pleno-findings.json'),
    plenos: readJson('plenos.json'),
    votes: readJson('pleno-votes.json'),
    agendas: readJson('plenos-agendas.json'),
    promises: readJson('promises.json'),
    promiseSuggestions: readJson('promise-suggestions.json'),
    quejas: readJson('quejas.json'),
    tenders: readJson('tenders.json'),
    videos: readJson('pleno-videos.json'),
    relations: readJson('queja-contract-relations.json'),
    approvedRelations: readJson('queja-contract-relations-approved.json'),
    dedicaciones: readJson('dedicaciones.json'),
    officials: readJson('officials.json'),
    social: readJson('officials-social.json'),
    assignments: readJson('journalist-assignments.json'),
    areaFit: readJson('area-fit.json'),
    reports: readJson('journalist-reports.json'),
    entities: readJson('entities.json'),
    entityOverrides: readJson('entity-overrides.json'),
  }

  const results = runRelationsChecks(inputs)
  let errorBroken = 0
  let warnBroken = 0
  for (const r of results) {
    printResult(r)
    if (r.status === 'broken') {
      if (r.level === 'error') errorBroken += 1
      else warnBroken += 1
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length
  const empty = results.filter((r) => r.status === 'empty').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  console.log(
    `\n[check-relations] ${ok} ok · ${empty} empty · ${errorBroken} broken (error) · ${warnBroken} broken (warn) · ${skipped} skipped`,
  )
  if (errorBroken > 0 && !SOFT) {
    console.error('[check-relations] FAILING (strict mode) — error-level referential breakage')
    process.exit(1)
  }
  if (errorBroken > 0 && SOFT) {
    console.log('[check-relations] --soft: reporting only, exit 0')
  }
}

function printResult(r: RelationCheckResult) {
  if (r.status === 'skipped') {
    console.log(`  [skip]        ${r.name} — input file(s) absent`)
    return
  }
  if (r.status === 'empty') {
    // Verified nothing — there were no references to check. Not a failure, but
    // not evidence of integrity either.
    console.log(`  [empty]       ${r.name} — nothing to check (0 refs)`)
    return
  }
  if (r.status === 'ok') {
    console.log(`  [ok]          ${r.name} — ${r.checked} refs`)
    return
  }
  const tag = r.level === 'error' ? '[BROKEN:err]' : '[BROKEN:warn]'
  console.log(
    `  ${tag} ${r.name} — ${r.broken.length}${r.broken.length >= 20 ? '+' : ''} of ${r.checked} refs:`,
  )
  for (const b of r.broken.slice(0, 5)) console.log(`                  · ${b}`)
  if (r.broken.length > 5)
    console.log(`                  · … ${r.broken.length - 5} more (capped sample)`)
}

main()
