import { describe, it, expect } from 'vitest'
import {
  decideAutomation,
  explainMissingMeasurement,
  validateMeasurements,
  PUBLISH_MIN_PRECISION,
  PUBLISH_MIN_SAMPLE,
  MEASUREMENT_MAX_AGE_DAYS,
  wilsonLowerBound,
  type Measurement,
} from '../src/scraper/automation-policy'

/** Thresholds imported, never restated — see tests/run-manifest.test.ts. */

const NOW = new Date('2026-08-02T12:00:00.000Z')

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

/**
 * A measurement that genuinely clears the bar. Note the sample: since the gate
 * compares the Wilson LOWER BOUND, a precision exactly at the bar can never
 * clear it at any n, and one near it needs a large n. `PUBLISH_MIN_SAMPLE` is
 * only the floor below which a figure is not evidence at all — it is not
 * sufficient on its own.
 */
const GOOD: Measurement = {
  key: 'finding.informational.bloc',
  precision: 0.98,
  sample: 2000,
  measuredAt: daysAgo(1),
}

describe('Tier A — weakening actions run unattended', () => {
  it('allows a verdict retraction with no measurement at all', () => {
    const d = decideAutomation({ kind: 'retract-verdict' }, [], NOW)
    expect(d.allow).toBe(true)
    expect(d.tier).toBe('autonomous')
  })

  it('allows severity downgrades and unpublishing', () => {
    for (const kind of ['downgrade-severity', 'unpublish'] as const) {
      expect(decideAutomation({ kind }, [], NOW).tier).toBe('autonomous')
    }
  })

  it('still refuses a retraction during an electoral freeze', () => {
    const d = decideAutomation({ kind: 'retract-verdict', frozen: true }, [], NOW)
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('LOREG')
  })

  it('refuses to retract on behalf of a named individual', () => {
    const d = decideAutomation({ kind: 'retract-verdict', namesIndividual: true }, [], NOW)
    expect(d.allow).toBe(false)
    expect(d.tier).toBe('human')
  })
})

describe('Tier C — the irreducible human boundary', () => {
  it('never automates naming an individual, however well measured', () => {
    const perfect: Measurement = { ...GOOD, key: 'k', precision: 1, sample: 10_000 }
    const d = decideAutomation(
      { kind: 'publish-finding', namesIndividual: true, measurementKey: 'k', reversible: true },
      [perfect],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('libel boundary')
  })

  it('never automates an outward-facing action', () => {
    expect(decideAutomation({ kind: 'outward-action' }, [], NOW).allow).toBe(false)
  })

  it('never automates high legal sensitivity', () => {
    const d = decideAutomation(
      {
        kind: 'publish-report',
        legalSensitivity: 'high',
        measurementKey: GOOD.key,
        reversible: true,
      },
      [GOOD],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('legal review')
  })

  it('never automates an irreversible action', () => {
    const d = decideAutomation(
      { kind: 'publish-finding', reversible: false, measurementKey: GOOD.key },
      [GOOD],
      NOW,
    )
    expect(d.allow).toBe(false)
  })
})

describe('Tier B — measurement is the unlock, and the default is gated', () => {
  const base = {
    kind: 'publish-finding',
    reversible: true,
    measurementKey: 'finding.informational.bloc',
  } as const

  it('publishes unattended when the class clears the bar', () => {
    const d = decideAutomation(base, [GOOD], NOW)
    expect(d.allow).toBe(true)
    expect(d.tier).toBe('measured')
  })

  it('gates when the class has never been measured', () => {
    const d = decideAutomation(base, [], NOW)
    expect(d.allow).toBe(false)
    expect(d.tier).toBe('human')
    expect(d.missingMeasurement).toBe(base.measurementKey)
  })

  it('gates when no measurement key is declared at all', () => {
    const d = decideAutomation({ kind: 'publish-finding', reversible: true }, [GOOD], NOW)
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('unmeasured means gated')
  })

  it('gates on precision just below the bar', () => {
    const d = decideAutomation(base, [{ ...GOOD, precision: PUBLISH_MIN_PRECISION - 0.001 }], NOW)
    expect(d.allow).toBe(false)
    expect(d.bar).toBe(PUBLISH_MIN_PRECISION)
  })

  it('gates a precision exactly AT the bar — a bound can never clear its own centre', () => {
    const d = decideAutomation(base, [{ ...GOOD, precision: PUBLISH_MIN_PRECISION }], NOW)
    expect(d.allow).toBe(false)
  })

  it('gates on too small a sample, however high the precision', () => {
    const d = decideAutomation(
      base,
      [{ ...GOOD, precision: 1, sample: PUBLISH_MIN_SAMPLE - 1 }],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('too few')
  })

  it('gates on a stale measurement — prompts and models move', () => {
    const d = decideAutomation(
      base,
      [{ ...GOOD, measuredAt: daysAgo(MEASUREMENT_MAX_AGE_DAYS + 1) }],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('re-measure')
  })

  it('accepts a measurement right at the age limit', () => {
    const d = decideAutomation(
      base,
      [{ ...GOOD, measuredAt: daysAgo(MEASUREMENT_MAX_AGE_DAYS - 1) }],
      NOW,
    )
    expect(d.allow).toBe(true)
  })

  it('is not fooled by a measurement for a different class', () => {
    const d = decideAutomation(base, [{ ...GOOD, key: 'some.other.class' }], NOW)
    expect(d.allow).toBe(false)
    expect(d.missingMeasurement).toBe(base.measurementKey)
  })

  it('freeze outranks a clearing measurement', () => {
    expect(decideAutomation({ ...base, frozen: true }, [GOOD], NOW).allow).toBe(false)
  })
})

describe('the bar scales with editorial exposure', () => {
  const at = (precision: number) => [{ ...GOOD, precision }]

  it('lets an informational class publish at a precision a notable one may not', () => {
    const p = 0.92 // above the informational bar, below the notable one
    const info = decideAutomation(
      {
        kind: 'publish-finding',
        reversible: true,
        measurementKey: GOOD.key,
        severity: 'informational',
      },
      at(p),
      NOW,
    )
    const notable = decideAutomation(
      { kind: 'publish-finding', reversible: true, measurementKey: GOOD.key, severity: 'notable' },
      at(p),
      NOW,
    )
    expect(info.allow).toBe(true)
    expect(notable.allow).toBe(false)
  })

  it('refuses critical at any precision, because it is an accusation', () => {
    const d = decideAutomation(
      {
        kind: 'publish-finding',
        reversible: true,
        measurementKey: GOOD.key,
        severity: 'critical',
      },
      [{ ...GOOD, precision: 1, sample: 100_000 }],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('accusation')
  })

  it('falls back to the strict default when no severity is declared', () => {
    const d = decideAutomation(
      { kind: 'publish-finding', reversible: true, measurementKey: GOOD.key },
      at(0.92),
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain(String(PUBLISH_MIN_PRECISION))
  })
})

describe('the gate compares the confidence bound, not the point estimate', () => {
  it('refuses the real 48/52 audit: 0.923 measured, but the bar is inside the interval', () => {
    const d = decideAutomation(
      {
        kind: 'publish-finding',
        reversible: true,
        severity: 'informational',
        measurementKey: GOOD.key,
      },
      [{ ...GOOD, precision: 48 / 52, sample: 52 }],
      NOW,
    )
    expect(d.allow).toBe(false)
    expect(d.reason).toContain('lower bound')
  })

  it('accepts the same precision once the sample is large enough to resolve it', () => {
    const d = decideAutomation(
      {
        kind: 'publish-finding',
        reversible: true,
        severity: 'informational',
        measurementKey: GOOD.key,
      },
      [{ ...GOOD, precision: 48 / 52, sample: 800 }],
      NOW,
    )
    expect(d.allow).toBe(true)
  })

  it('accepts a small sample when the precision is far above the bar', () => {
    // The floor is self-scaling: measure well above the bar and you need less.
    const d = decideAutomation(
      {
        kind: 'publish-finding',
        reversible: true,
        severity: 'informational',
        measurementKey: GOOD.key,
      },
      [{ ...GOOD, precision: 1, sample: 60 }],
      NOW,
    )
    expect(d.allow).toBe(true)
  })

  it('wilsonLowerBound stays below the point estimate and inside [0,1]', () => {
    expect(wilsonLowerBound(48, 52)).toBeLessThan(48 / 52)
    expect(wilsonLowerBound(48, 52)).toBeGreaterThan(0.8)
    expect(wilsonLowerBound(0, 10)).toBe(0)
    expect(wilsonLowerBound(10, 10)).toBeLessThan(1)
    expect(wilsonLowerBound(1, 0)).toBe(0)
  })

  it('tightens as the sample grows, for a fixed proportion', () => {
    expect(wilsonLowerBound(90, 100)).toBeLessThan(wilsonLowerBound(900, 1000))
  })
})

describe('explainMissingMeasurement', () => {
  it('names the missing evidence and how to record it', () => {
    const d = decideAutomation(
      { kind: 'publish-finding', reversible: true, measurementKey: 'promise.status.forward' },
      [],
      NOW,
    )
    const msg = explainMissingMeasurement(d)
    expect(msg).toContain('promise.status.forward')
    expect(msg).toContain(String(PUBLISH_MIN_SAMPLE))
  })

  it('says nothing for an allowed action', () => {
    expect(explainMissingMeasurement(decideAutomation({ kind: 'retract-verdict' }, [], NOW))).toBe(
      null,
    )
  })
})

describe('validateMeasurements', () => {
  it('keeps well-formed rows', () => {
    const out = validateMeasurements({ measurements: [GOOD] })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe(GOOD.key)
  })

  it('drops rows with an out-of-range precision, so a typo cannot unlock publishing', () => {
    const out = validateMeasurements({
      measurements: [
        { ...GOOD, precision: 95 },
        { ...GOOD, precision: -1 },
      ],
    })
    expect(out).toEqual([])
  })

  it('drops rows with an unparseable date', () => {
    expect(validateMeasurements({ measurements: [{ ...GOOD, measuredAt: 'soon' }] })).toEqual([])
  })

  it('tolerates a missing or malformed file', () => {
    expect(validateMeasurements(null)).toEqual([])
    expect(validateMeasurements({})).toEqual([])
    expect(validateMeasurements({ measurements: 'nope' })).toEqual([])
  })
})
