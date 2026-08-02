/**
 * check:automation — what runs unattended today, what does not, and exactly
 * what would have to be measured to change that.
 *
 * The point is that "why is this still manual?" should never be an archaeology
 * exercise. Every gated class prints the measurement it is waiting on.
 *
 *   npm run check:automation
 *   npm run check:automation -- --json
 */
import {
  decideAutomation,
  explainMissingMeasurement,
  loadMeasurements,
  MEASUREMENTS_PATH,
  PUBLISH_MIN_PRECISION,
  PUBLISH_MIN_SAMPLE,
  MEASUREMENT_MAX_AGE_DAYS,
  type ActionContext,
} from '../src/scraper/automation-policy'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** The real action classes in this repo, in the order a reader meets them. */
const SURFACES: { label: string; ctx: ActionContext }[] = [
  {
    label: 'Retract a verdict (verify:pleno-claims:engine --base)',
    ctx: { kind: 'retract-verdict' },
  },
  {
    label: 'Downgrade a finding severity',
    ctx: { kind: 'downgrade-severity' },
  },
  {
    label: 'Publish a bloc-level informational finding (auto-curate)',
    // auto-curate hard-codes severity=informational, so it faces that bar.
    ctx: {
      kind: 'publish-finding',
      reversible: true,
      severity: 'informational',
      measurementKey: 'finding.informational.bloc',
    },
  },
  {
    label: 'Publish a notable/critical finding',
    ctx: {
      kind: 'publish-finding',
      reversible: true,
      severity: 'critical',
      measurementKey: 'finding.critical.bloc',
    },
  },
  {
    label: 'Publish a promise status change (promise status miner)',
    ctx: {
      kind: 'publish-status-change',
      reversible: true,
      measurementKey: 'promise.status.forward',
    },
  },
  {
    label: 'Publish a journalist report (promote-report)',
    ctx: {
      kind: 'publish-report',
      reversible: true,
      measurementKey: 'journalist.report.biography',
    },
  },
  {
    label: 'Attach individual attribution to a finding',
    ctx: { kind: 'name-individual', namesIndividual: true },
  },
  {
    label: 'Publish a report flagged legalSensitivity=high',
    ctx: { kind: 'publish-report', legalSensitivity: 'high', reversible: true },
  },
  {
    label: 'Register a queja at the sede / broadcast to the channel',
    ctx: { kind: 'outward-action' },
  },
]

function isFrozen(): boolean {
  const p = resolve('public/data/promises.json')
  if (!existsSync(p)) return false
  try {
    const snap = JSON.parse(readFileSync(p, 'utf8')) as { frozenUntil?: string | null }
    return Boolean(snap.frozenUntil && snap.frozenUntil > new Date().toISOString().slice(0, 10))
  } catch {
    return false
  }
}

function main() {
  const json = process.argv.includes('--json')
  const measurements = loadMeasurements()
  const frozen = isFrozen()

  const rows = SURFACES.map((s) => {
    const d = decideAutomation({ ...s.ctx, frozen }, measurements)
    return { label: s.label, ...d }
  })

  if (json) {
    process.stdout.write(JSON.stringify({ frozen, measurements, decisions: rows }, null, 2) + '\n')
    return
  }

  process.stdout.write(
    `\nAutomation policy — bar for unattended publication: precision ≥ ${PUBLISH_MIN_PRECISION} ` +
      `on ≥ ${PUBLISH_MIN_SAMPLE} items, measured within ${MEASUREMENT_MAX_AGE_DAYS} days\n` +
      `Measurements: ${MEASUREMENTS_PATH} (${measurements.length} recorded)` +
      `${frozen ? '\n⚠︎  LOREG electoral freeze ACTIVE — everything is gated' : ''}\n\n`,
  )

  const mark = (t: string) => (t === 'autonomous' ? '▶' : t === 'measured' ? '▶' : '·')
  for (const r of rows) {
    process.stdout.write(
      `${mark(r.tier)} ${r.allow ? 'UNATTENDED' : 'CURATOR   '} [${r.tier}] ${r.label}\n` +
        `    ${r.reason}\n`,
    )
  }

  const missing = rows.map(explainMissingMeasurement).filter(Boolean) as string[]
  if (missing.length > 0) {
    process.stdout.write(`\nTo automate the gated classes, record these measurements:\n`)
    for (const m of [...new Set(missing)]) process.stdout.write(`  · ${m}\n`)
  }

  const auto = rows.filter((r) => r.allow).length
  process.stdout.write(`\n${auto}/${rows.length} action classes run unattended\n`)

  // A measurement ageing out silently demotes a class from automatic back to
  // manual. Nothing else would report that: the pipeline keeps running, the
  // drafts keep being written, and publication simply stops. Exit non-zero so
  // it surfaces the night it happens rather than whenever someone notices the
  // findings stopped appearing.
  const stale = measurements.filter((m) => {
    const age = (Date.now() - new Date(m.measuredAt).getTime()) / 86_400_000
    return age > MEASUREMENT_MAX_AGE_DAYS
  })
  if (stale.length > 0) {
    process.stdout.write(
      `\n⚠︎  ${stale.length} measurement(s) older than ${MEASUREMENT_MAX_AGE_DAYS} days — ` +
        `any class relying on them has silently reverted to curator-only:\n`,
    )
    for (const m of stale) {
      const age = Math.round((Date.now() - new Date(m.measuredAt).getTime()) / 86_400_000)
      process.stdout.write(`  · ${m.key} (${age}d old, ${m.against ?? 'unrecorded target'})\n`)
    }
    process.exitCode = 1
  }
}

main()
