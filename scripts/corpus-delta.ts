#!/usr/bin/env tsx
/**
 * Compare a `check:finding-quotes --json` run against the accepted baseline.
 *
 *   npx tsx scripts/corpus-delta.ts <current.json> <baseline.json> [--baseline]
 *
 * Exits 1 when a quote became untraceable in this run. Called by
 * `scripts/verify-transcript-corpus.sh`, which owns the temp file and the
 * `check:*` invocations.
 *
 * This used to be a `node -e` string inside that shell script. The set
 * arithmetic it does is the part with a wrong answer available, and no test
 * could reach it in there.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { compareCorpus, corpusDeltaBlocks, type DriftedQuote } from '../src/scraper/corpus-baseline'

function main() {
  const [curPath, basePath, flag] = process.argv.slice(2)
  if (!curPath || !basePath) {
    console.error('Usage: corpus-delta <current.json> <baseline.json> [--baseline]')
    process.exit(2)
  }
  const accept = flag === '--baseline'
  const cur = JSON.parse(readFileSync(curPath, 'utf8')) as {
    ok?: number
    driftedCount?: number
    supersededOnlyCount?: number
    drifted?: DriftedQuote[]
  }
  const current = cur.drifted ?? []

  console.log(
    `  traceable ${cur.ok ?? 0} · superseded-only ${cur.supersededOnlyCount ?? 0} · ` +
      `NOT found ${cur.driftedCount ?? 0}`,
  )

  if (accept || !existsSync(basePath)) {
    writeFileSync(basePath, JSON.stringify({ drifted: current }, null, 2))
    console.log(accept ? '  baseline accepted.' : '  baseline created (first run).')
    return
  }

  const baseline = (JSON.parse(readFileSync(basePath, 'utf8')).drifted ?? []) as DriftedQuote[]
  const delta = compareCorpus(current, baseline)

  if (delta.healed.length)
    console.log(`  ✓ ${delta.healed.length} cita(s) vuelven a ser rastreables`)
  if (!corpusDeltaBlocks(delta)) {
    console.log('  ✓ ninguna cita dejó de ser rastreable en esta pasada')
    return
  }

  console.log(
    `\n  ⚠︎ ${delta.appeared.length} cita(s) DEJARON de ser rastreables tras re-transcribir:`,
  )
  for (const k of delta.appeared.slice(0, 10)) {
    const [id, q] = k.split('|')
    console.log(`      ${id}  «${q}…»`)
  }
  if (delta.appeared.length > 10) {
    console.log(`      … y ${delta.appeared.length - 10} más`)
  }
  console.log(
    '\n  Citan un transcript que ha sido reemplazado. El texto viejo se conserva\n' +
      '  bajo pleno-transcripts/superseded/, así que la cita sigue siendo\n' +
      '  comprobable — pero el hallazgo debería refrescarse contra el texto mejor,\n' +
      '  o corregirse vía `npm run correct-pleno-finding`.\n' +
      '  Aceptar el nuevo estado: bash scripts/verify-transcript-corpus.sh --baseline',
  )
  process.exitCode = 1
}

main()
