/**
 * Automation policy — what may run without a human, and on what evidence.
 *
 * This replaces a blanket `requiresHumanApproval` on every machine-written
 * surface. That rule looked like caution and behaved like a queue: 9 of 21
 * councillor biographies, the findings backlog, and the promise status drafts
 * all sat behind a gate nobody had capacity to walk, while the largest source
 * of wrong published claims in the repo — the DETERMINISTIC verifier, no model
 * involved — shipped 744 verdicts nobody reviewed, 176 of them `verificado`,
 * including a subjective opinion about a dance conservatory and a fragment
 * typed `afirmacion_numerica` containing no number.
 *
 * So the axis is not deterministic-vs-LLM and not gated-vs-automated. It is:
 *
 *   MEASURED vs UNMEASURED   — do we know this class's precision?
 *   REVERSIBLE vs NOT        — what does being wrong cost?
 *   NAMES A PERSON vs NOT    — is this a liability boundary?
 *
 * Three tiers follow:
 *
 *   A · autonomous   Weakening actions — retract a verdict, downgrade a
 *                    severity, unpublish. Reversible, and being wrong means
 *                    saying LESS than we could have, which is the safe error
 *                    for a watchdog. No bar; these run unattended by design.
 *
 *   B · measured     Additive publication that names no individual. Runs with
 *                    no human ONLY when that class has a recorded precision at
 *                    or above PUBLISH_MIN_PRECISION on at least
 *                    PUBLISH_MIN_SAMPLE items, measured within
 *                    MEASUREMENT_MAX_AGE_DAYS. The bar is higher than for
 *                    retraction because the error adds exposure rather than
 *                    removing it.
 *
 *   C · human        Naming an individual, high legal sensitivity, anything
 *                    irreversible or outward-facing. Not because a human is
 *                    more accurate — because liability needs a signature.
 *
 * The load-bearing rule is the DEFAULT: an unmeasured class falls to Tier C.
 * Nothing is unlocked by assertion. The way to automate something is to
 * measure it, and `explainMissingMeasurement` names exactly which measurement
 * is absent so the path forward is never a guess.
 *
 * `decideAutomation` is pure — no fs, no network, no clock of its own (`now` is
 * injected) — and is the part under test. File I/O sits at the bottom.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ActionKind =
  // Weakening — Tier A candidates.
  | 'retract-verdict'
  | 'downgrade-severity'
  | 'unpublish'
  // Additive publication — Tier B candidates.
  | 'publish-finding'
  | 'publish-status-change'
  | 'publish-report'
  // Always Tier C.
  | 'name-individual'
  | 'outward-action'

const WEAKENING: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'retract-verdict',
  'downgrade-severity',
  'unpublish',
])

const ALWAYS_HUMAN: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'name-individual',
  'outward-action',
])

/**
 * Precision an additive class must hit before it publishes unattended.
 *
 * Scaled by exposure, because a single bar treats "the council discussed the
 * drainage budget" and "this group's claim is contradicted by the record" as
 * the same risk, and they are not.
 *
 *   informational · a neutral, bloc-level observation with right-of-reply
 *                   attached. Being wrong is embarrassing and correctable.
 *   notable       · asserts something adverse. Being wrong is a retraction.
 *   critical      · never unattended at any precision. `pleno-finding.ts`
 *                   already refuses a critical finding without cited evidence;
 *                   this is the same judgement expressed as a policy.
 */
export const PUBLISH_MIN_PRECISION = 0.95

export const PUBLISH_MIN_PRECISION_BY_SEVERITY: Readonly<Record<string, number>> = {
  informational: 0.9,
  notable: 0.95,
}

export function precisionBarFor(severity?: string): number {
  if (!severity) return PUBLISH_MIN_PRECISION
  return PUBLISH_MIN_PRECISION_BY_SEVERITY[severity] ?? PUBLISH_MIN_PRECISION
}

/** Below this many judged items a precision figure is noise, not evidence. */
export const PUBLISH_MIN_SAMPLE = 50

/**
 * Lower bound of the Wilson score interval for a binomial proportion.
 *
 * The gate compares this, NOT the raw precision, against the bar — because a
 * point estimate from a small sample cannot tell you which side of the bar you
 * are on. The real case: an audit of all 52 published findings found 4 defects,
 * giving 92.3%, comfortably over the 0.90 informational bar. But 48/52 has a
 * 95% interval of roughly 81–98%: the bar sits INSIDE it, so the measurement is
 * equally consistent with a true precision of 0.85. Publishing unattended on
 * that is a coin-flip dressed as evidence.
 *
 * Wilson rather than the normal approximation because the latter misbehaves
 * badly exactly where we live — small n, proportions near 1.
 *
 * The practical effect is that the sample floor becomes self-scaling: a class
 * measured near the bar needs far more items than one measured well above it,
 * which is the correct incentive and needs no second threshold to tune.
 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0
  const p = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const centre = p + z2 / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denom)
}

/**
 * Prompts, models and corpora all move. A precision measured against a prompt
 * version that no longer runs is a historical fact, not a current guarantee.
 */
export const MEASUREMENT_MAX_AGE_DAYS = 90

export type Tier = 'autonomous' | 'measured' | 'human'

export interface Measurement {
  /** Class key, e.g. `finding.informational.bloc`. */
  key: string
  precision: number
  /** Number of judged items the precision was computed over. */
  sample: number
  measuredAt: string
  /** Prompt/model the measurement was taken against, for the audit trail. */
  against?: string
  /** How it was measured — eval name, gold set, reviewer. */
  method?: string
}

export interface ActionContext {
  kind: ActionKind
  /** Does this attach a named natural person to a claim? */
  namesIndividual?: boolean
  legalSensitivity?: 'low' | 'medium' | 'high'
  /** Can this be undone by a later automated run without a correction notice? */
  reversible?: boolean
  /** Which `Measurement.key` governs this action. */
  measurementKey?: string
  /** Editorial exposure — selects the precision bar. `critical` never automates. */
  severity?: 'informational' | 'notable' | 'critical'
  /** LOREG electoral freeze active. */
  frozen?: boolean
}

export interface Decision {
  allow: boolean
  tier: Tier
  reason: string
  /** Set when the action was refused for want of evidence. */
  missingMeasurement?: string
  /** The precision bar this action actually faced, given its severity. */
  bar?: number
}

export function decideAutomation(
  ctx: ActionContext,
  measurements: readonly Measurement[] = [],
  now: Date = new Date(),
): Decision {
  // LOREG art. 50 outranks every other consideration, including a perfect
  // measurement. Same gate as /promesas and auto-curate-findings.
  if (ctx.frozen) {
    return {
      allow: false,
      tier: 'human',
      reason: 'LOREG electoral freeze active — no automated publication or retraction',
    }
  }

  if (ALWAYS_HUMAN.has(ctx.kind) || ctx.namesIndividual === true) {
    return {
      allow: false,
      tier: 'human',
      reason:
        ctx.kind === 'outward-action'
          ? 'outward-facing action — a human sends it'
          : 'names an individual — a curator promotes individual attribution, per the libel boundary',
    }
  }

  if (ctx.severity === 'critical') {
    return {
      allow: false,
      tier: 'human',
      reason:
        'severity=critical — never published unattended at any measured precision; ' +
        'a critical finding is an accusation and carries a signature',
    }
  }

  if (ctx.legalSensitivity === 'high') {
    return {
      allow: false,
      tier: 'human',
      reason: 'legalSensitivity=high — requires explicit legal review',
    }
  }

  // Weakening actions are safe BY CONSTRUCTION, not by measurement: they can
  // only remove or soften a published claim. Deliberately no precision bar —
  // requiring one would have kept 744 unreviewed deterministic verdicts live
  // while we assembled a gold set to prove we were allowed to take them down.
  if (WEAKENING.has(ctx.kind)) {
    return {
      allow: true,
      tier: 'autonomous',
      reason: `${ctx.kind} only removes or softens a published claim — reversible, reduces exposure`,
    }
  }

  if (ctx.reversible === false) {
    return {
      allow: false,
      tier: 'human',
      reason: 'irreversible action — a human confirms it',
    }
  }

  if (!ctx.measurementKey) {
    return {
      allow: false,
      tier: 'human',
      reason: 'no measurement key declared for this action class — unmeasured means gated',
      missingMeasurement: `(undeclared for kind=${ctx.kind})`,
    }
  }

  const m = measurements.find((x) => x.key === ctx.measurementKey)
  if (!m) {
    return {
      allow: false,
      tier: 'human',
      reason: `no recorded precision for ${ctx.measurementKey} — unmeasured means gated`,
      missingMeasurement: ctx.measurementKey,
      bar: precisionBarFor(ctx.severity),
    }
  }

  const ageDays = (now.getTime() - new Date(m.measuredAt).getTime()) / 86_400_000
  if (!Number.isFinite(ageDays) || ageDays > MEASUREMENT_MAX_AGE_DAYS) {
    return {
      allow: false,
      tier: 'human',
      reason:
        `measurement for ${ctx.measurementKey} is ${Math.round(ageDays)} days old ` +
        `(max ${MEASUREMENT_MAX_AGE_DAYS}) — re-measure before publishing unattended`,
      missingMeasurement: ctx.measurementKey,
    }
  }

  if (m.sample < PUBLISH_MIN_SAMPLE) {
    return {
      allow: false,
      tier: 'human',
      reason:
        `${ctx.measurementKey} measured on only ${m.sample} item(s) ` +
        `(need ${PUBLISH_MIN_SAMPLE}) — too few to be evidence`,
      missingMeasurement: ctx.measurementKey,
    }
  }

  const bar = precisionBarFor(ctx.severity)
  // Compare the LOWER CONFIDENCE BOUND, not the point estimate. See
  // wilsonLowerBound: 48/52 reads as 0.923 and cannot be distinguished from
  // 0.85 at that sample size.
  const lower = wilsonLowerBound(Math.round(m.precision * m.sample), m.sample)
  if (lower < bar) {
    return {
      allow: false,
      tier: 'human',
      reason:
        `${ctx.measurementKey} measured ${m.precision.toFixed(3)} on ${m.sample} items, but the ` +
        `95% lower bound is ${lower.toFixed(3)}, under the ${bar} bar` +
        `${ctx.severity ? ` for severity=${ctx.severity}` : ''} — the sample cannot tell which ` +
        `side of the bar this class is on. More judged items, or a higher measured precision.`,
      bar,
    }
  }

  return {
    allow: true,
    tier: 'measured',
    reason:
      `${ctx.measurementKey} measured ${m.precision.toFixed(3)} on ${m.sample} items ` +
      `(95% lower bound ${lower.toFixed(3)}) — clears the ${bar} bar` +
      `${ctx.severity ? ` for severity=${ctx.severity}` : ''}`,
    bar,
  }
}

/**
 * What would have to be measured for this action to run unattended. Used by
 * `check:automation` to print the backlog of missing evidence rather than
 * leaving "why is this still manual?" as an archaeology exercise.
 */
export function explainMissingMeasurement(d: Decision): string | null {
  if (d.allow || !d.missingMeasurement) return null
  return (
    `${d.missingMeasurement}: record a precision ≥ ${d.bar ?? PUBLISH_MIN_PRECISION} over ` +
    `≥ ${PUBLISH_MIN_SAMPLE} judged items via \`npm run record-measurement\``
  )
}

/**
 * Committed on purpose, like `.vocabulary-census.json`. A gitignored file would
 * be regenerated empty on every CI run, every class would read as unmeasured,
 * and the gate would silently become permanent.
 */
export const MEASUREMENTS_PATH = '.automation-measurements.json'

/** Rewritten on every save, so the file explains itself to whoever opens it next. */
export const MEASUREMENTS_FILE_COMMENT = [
  'Measured precision per action class. Read by src/scraper/automation-policy.ts.',
  'A class with no row here CANNOT publish unattended.',
  '',
  'The gate compares the WILSON LOWER BOUND of the proportion against the bar, not',
  'the raw precision: a point estimate from a small sample cannot say which side of',
  'the bar it is on. So a precision AT the bar never clears it, and one near it needs',
  'a large sample. Raising `sample` honestly is the way through; there is no other.',
  '',
  'Write via `npm run record-measurement`, never by hand — the CLI re-validates the',
  'whole set, and a precision typed as 95 instead of 0.95 is dropped rather than',
  'treated as clearing the bar.',
].join('\n')

export function loadMeasurements(path = MEASUREMENTS_PATH): Measurement[] {
  const abs = resolve(path)
  if (!existsSync(abs)) return []
  try {
    return validateMeasurements(JSON.parse(readFileSync(abs, 'utf8')))
  } catch {
    process.stderr.write(
      `[automation-policy] ${path} unreadable — treating every class as unmeasured\n`,
    )
    return []
  }
}

/** Upsert by key. Re-validates the whole set before writing. */
export function saveMeasurement(m: Measurement, path = MEASUREMENTS_PATH): Measurement[] {
  const kept = loadMeasurements(path).filter((x) => x.key !== m.key)
  const next = validateMeasurements({ measurements: [...kept, m] })
  if (!next.some((x) => x.key === m.key)) {
    throw new Error(
      `refusing to write: measurement for ${m.key} failed validation ` +
        `(precision must be 0–1, sample a non-negative number, measuredAt an ISO date)`,
    )
  }
  next.sort((a, b) => a.key.localeCompare(b.key))
  writeFileSync(
    resolve(path),
    JSON.stringify(
      {
        _comment: MEASUREMENTS_FILE_COMMENT,
        generatedAt: new Date().toISOString(),
        measurements: next,
      },
      null,
      2,
    ) + '\n',
  )
  return next
}

export function validateMeasurements(raw: unknown): Measurement[] {
  if (!raw || typeof raw !== 'object') return []
  const rows = (raw as { measurements?: unknown }).measurements
  if (!Array.isArray(rows)) return []
  const out: Measurement[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const m = r as Partial<Measurement>
    if (typeof m.key !== 'string' || !m.key) continue
    if (typeof m.precision !== 'number' || m.precision < 0 || m.precision > 1) continue
    if (typeof m.sample !== 'number' || m.sample < 0) continue
    if (typeof m.measuredAt !== 'string' || Number.isNaN(Date.parse(m.measuredAt))) continue
    out.push({
      key: m.key,
      precision: m.precision,
      sample: m.sample,
      measuredAt: m.measuredAt,
      against: typeof m.against === 'string' ? m.against : undefined,
      method: typeof m.method === 'string' ? m.method : undefined,
    })
  }
  return out
}
