#!/usr/bin/env tsx
/**
 * Watch upstream vocabulary for drift.
 *
 *   npm run check:vocabulary             # compare against the committed census
 *   npm run check:vocabulary -- --accept # adopt the current vocabulary
 *
 * Exits 1 on ANY finding: a field mostly falling back to unknown, a new value,
 * a common value gone. A source adding a word is normal; us not noticing is
 * not, and until 2026-10-19 a new value exited 0 and died in the nightly log
 * (src/scraper/vocabulary-census.ts tells how). `monitor:health` runs this and
 * sends what it finds; `scrape-all.sh` counts it as a soft failure, never a
 * fatal one. Words our own parser writes (`CAMPOS_TRADUCIDOS`) are not findings.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  censoDe,
  censusFindings,
  informeDeVocabulario,
  WATCHED,
  type FieldCensus,
} from '../src/scraper/vocabulary-census'

const DATA = resolve('public/data')
const BASELINE = resolve('.vocabulary-census.json')

/** Los snapshots vigilados que existen y se dejan leer; qué se censa lo decide `censoDe`. */
function leerSnapshots(): Record<string, unknown> {
  const docs: Record<string, unknown> = {}
  for (const [file] of WATCHED) {
    const p = `${DATA}/${file}`
    if (!existsSync(p)) continue
    try {
      docs[file] = JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      continue
    }
  }
  return docs
}

function main() {
  const current = censoDe(leerSnapshots())
  const accept = process.argv.includes('--accept')

  if (accept || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
    console.log(
      `[vocabulary] ${accept ? 'accepted' : 'baseline created'} · ${current.length} field(s) tracked`,
    )
    return
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as FieldCensus[]
  const { texto, codigo } = informeDeVocabulario(current.length, censusFindings(current, baseline))
  console.log(texto)
  process.exitCode = codigo
}

main()
