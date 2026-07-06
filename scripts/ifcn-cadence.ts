/**
 * IFCN weekly-cadence report. Reads the two published-findings snapshots and
 * reports ISO-week publication coverage since the first finding — the
 * 12-month ≥1/week track the IFCN signatory application requires.
 *
 *   npm run ifcn:cadence              # informational, always exit 0
 *   npm run ifcn:cadence -- --strict  # exit 2 when the current week is empty
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { weeklyCadence } from '../src/lib/findings-cadence.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

function itemsOf(file: string): Array<{ publishedAt?: string }> {
  try {
    return JSON.parse(readFileSync(path.join(root, 'public/data', file), 'utf8')).items ?? []
  } catch {
    return []
  }
}

const items = [...itemsOf('pleno-findings.json'), ...itemsOf('press-findings.json')]
const now = new Date().toISOString().slice(0, 10)
const report = weeklyCadence(items, { now })

if (!report) {
  console.log('ifcn-cadence: no published findings yet — the IFCN clock has not started.')
  process.exit(strict ? 2 : 0)
}

console.log(
  `ifcn-cadence · ${report.firstWeek} → ${report.currentWeek} · ` +
    `${report.coveredWeeks}/${report.totalWeeks} weeks covered ` +
    `(${Math.round(report.coverageRatio * 100)}%) · current week: ${report.currentWeekCount} finding(s)`,
)
if (report.gapWeeks.length) console.log(`gap weeks: ${report.gapWeeks.join(' ')}`)
if (report.currentWeekCount === 0) {
  console.log('⚠ current ISO week has NO published finding — promote one to keep the IFCN cadence.')
  if (strict) process.exit(2)
}
