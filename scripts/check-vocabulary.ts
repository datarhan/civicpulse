#!/usr/bin/env tsx
/**
 * Watch upstream vocabulary for drift.
 *
 *   npm run check:vocabulary             # compare against the committed census
 *   npm run check:vocabulary -- --accept # adopt the current vocabulary
 *
 * Exits 1 on an error-level finding (a field mostly falling back to unknown).
 * New values warn rather than fail — a source adding a word is normal; what is
 * not normal is us not noticing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  censusFindings,
  MAX_ENUM_CARDINALITY,
  type FieldCensus,
} from '../src/scraper/vocabulary-census'

const DATA = resolve('public/data')
const BASELINE = resolve('.vocabulary-census.json')

/** snapshot file → collections inside it worth censusing. */
const WATCHED: Array<[string, string[]]> = [
  ['tenders.json', ['contracts', 'tenders']],
  ['plenos.json', ['items']],
  ['empleo.json', ['items']],
  ['boe.json', ['items']],
  ['bop.json', ['anuncios']],
  ['quejas.json', ['items']],
  ['officials.json', ['officials']],
  ['pleno-votes.json', ['items']],
  ['promises.json', ['items']],
]

function collect(): FieldCensus[] {
  const out: FieldCensus[] = []
  for (const [file, collections] of WATCHED) {
    const p = `${DATA}/${file}`
    if (!existsSync(p)) continue
    let doc: Record<string, unknown>
    try {
      doc = JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      continue
    }
    for (const coll of collections) {
      const rows = doc[coll]
      if (!Array.isArray(rows) || rows.length === 0) continue
      const first = rows[0] as Record<string, unknown>
      for (const field of Object.keys(first)) {
        if (typeof first[field] !== 'string') continue
        const counts: Record<string, number> = {}
        for (const r of rows as Array<Record<string, unknown>>) {
          const v = r[field]
          if (typeof v === 'string') counts[v] = (counts[v] ?? 0) + 1
        }
        const distinct = Object.keys(counts).length
        if (distinct < 2 || distinct > MAX_ENUM_CARDINALITY) continue
        out.push({ path: `${file.replace('.json', '')}.${coll}.${field}`, values: counts })
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function main() {
  const current = collect()
  const accept = process.argv.includes('--accept')

  if (accept || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
    console.log(
      `[vocabulary] ${accept ? 'accepted' : 'baseline created'} · ${current.length} field(s) tracked`,
    )
    return
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as FieldCensus[]
  const findings = censusFindings(current, baseline)
  const errors = findings.filter((f) => f.severity === 'error')

  console.log(
    `[vocabulary] ${current.length} field(s) · ${errors.length} error · ` +
      `${findings.length - errors.length} warn\n`,
  )
  for (const f of findings) {
    console.log(`  ${f.severity === 'error' ? '✗' : '·'} ${f.path}`)
    console.log(`      ${f.detail}`)
  }
  if (findings.length === 0) console.log('  vocabulary unchanged.')
  else console.log(`\n  Accept the current vocabulary with: npm run check:vocabulary -- --accept`)
  if (errors.length > 0) process.exitCode = 1
}

main()
