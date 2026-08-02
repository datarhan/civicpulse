/**
 * record-measurement — write a measured precision for an action class into
 * `.automation-measurements.json`, which is what allows that class to publish
 * without a curator.
 *
 * This is the ONLY supported way to unlock automation. Hand-editing the file is
 * how a precision of `95` (meant as 95%) becomes a number the policy reads as
 * clearing a 0.95 bar by a factor of a hundred; the validator drops
 * out-of-range rows rather than trusting them, and this CLI re-validates the
 * whole set before writing.
 *
 *   npm run record-measurement -- --key finding.informational.bloc \
 *       --precision 0.96 --sample 120 \
 *       --against "auto-curate, claude-code/sonnet, prompt v4" \
 *       --method "manual review of 120 published findings, 2 curators"
 *
 * `--method` is required and must be specific: a precision with no stated
 * provenance is a number someone remembers, not evidence.
 */
import { saveMeasurement, type Measurement } from '../src/scraper/automation-policy'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main() {
  const key = arg('key')
  const precision = Number(arg('precision'))
  const sample = Number(arg('sample'))
  const method = arg('method')
  const against = arg('against')
  const measuredAt = arg('measured-at') ?? new Date().toISOString()

  const missing: string[] = []
  if (!key) missing.push('--key')
  if (!arg('precision')) missing.push('--precision')
  if (!arg('sample')) missing.push('--sample')
  if (!method) missing.push('--method')
  if (missing.length > 0) {
    process.stderr.write(`[record-measurement] missing ${missing.join(', ')}\n`)
    process.exit(2)
  }
  if (!Number.isFinite(precision) || precision < 0 || precision > 1) {
    process.stderr.write(
      `[record-measurement] --precision must be a fraction between 0 and 1, got "${arg('precision')}". ` +
        `96% is 0.96, not 96.\n`,
    )
    process.exit(2)
  }
  if (!Number.isFinite(sample) || sample < 0) {
    process.stderr.write(`[record-measurement] --sample must be a non-negative number\n`)
    process.exit(2)
  }
  if ((method as string).length < 20) {
    process.stderr.write(
      `[record-measurement] --method must say how this was measured (≥20 chars): which eval, ` +
        `which gold set, who reviewed. A bare number is not evidence.\n`,
    )
    process.exit(2)
  }

  const m: Measurement = {
    key: key as string,
    precision,
    sample,
    measuredAt,
    against,
    method,
  }
  const all = saveMeasurement(m)
  process.stdout.write(
    `[record-measurement] recorded ${m.key} · precision ${precision} on ${sample} items\n` +
      `[record-measurement] ${all.length} measurement(s) on file. ` +
      `Run \`npm run check:automation\` to see what this unlocked.\n`,
  )
}

main()
