import { describe, it, expect } from 'vitest'
import {
  evaluateHealth,
  alertFingerprint,
  formatAlerts,
  NIGHTLY_STREAK_ALARM,
  type Observations,
} from '../src/scraper/health-monitor'

const NOW = new Date('2026-08-03T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function obs(over: Partial<Observations> = {}): Observations {
  return {
    now: NOW,
    pipelines: [],
    botHealthy: true,
    siteHealthy: true,
    sources: [],
    nightlyFailStreak: 0,
    integrity: [],
    ...over,
  }
}

const codes = (o: Observations) =>
  evaluateHealth(o)
    .map((a) => a.code)
    .sort()

describe('silence when healthy', () => {
  it('says nothing when everything is fine', () => {
    expect(evaluateHealth(obs())).toEqual([])
  })

  it('says nothing about a pipeline with no work pending, however long idle', () => {
    // An idle pipeline with an empty queue is finished, not stalled. Alerting
    // here is how a monitor teaches people to ignore it.
    const o = obs({
      pipelines: [{ name: 'extraction', lastProgressAt: daysAgo(90), pending: 0, stallDays: 2 }],
    })
    expect(evaluateHealth(o)).toEqual([])
  })

  it('does not report unchecked subsystems as broken', () => {
    // null means "not checked", which is not the same as "down".
    expect(evaluateHealth(obs({ botHealthy: null, siteHealthy: null }))).toEqual([])
  })
})

describe('bot and site', () => {
  it('treats a dead bot as critical and explains the stake', () => {
    const a = evaluateHealth(obs({ botHealthy: false }))[0]
    expect(a.severity).toBe('critical')
    expect(a.detail).toMatch(/se pierden/)
    expect(a.remedy).toBeTruthy()
  })

  it('reports a dead site', () => {
    expect(codes(obs({ siteHealthy: false }))).toContain('site-down')
  })
})

describe('stalled pipelines', () => {
  const stalled = (days: number, pending = 5, cause?: string) =>
    obs({
      pipelines: [
        { name: 'extraction', lastProgressAt: daysAgo(days), pending, stallDays: 2, cause },
      ],
    })

  it('fires once past the pipeline’s own threshold', () => {
    expect(codes(stalled(3))).toContain('stall:extraction')
  })

  it('stays quiet just under it', () => {
    expect(evaluateHealth(stalled(1.5))).toEqual([])
  })

  it('carries the diagnosed cause through as the remedy', () => {
    const a = evaluateHealth(stalled(5, 5, 'OpenAI sin saldo'))[0]
    expect(a.remedy).toBe('OpenAI sin saldo')
  })

  it('handles a pipeline that has never made progress', () => {
    const o = obs({
      pipelines: [{ name: 'x', lastProgressAt: null, pending: 3, stallDays: 2 }],
    })
    expect(evaluateHealth(o)[0].detail).toMatch(/ningún avance/)
  })
})

describe('silent sources', () => {
  it('reports a feed past its expected cadence', () => {
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(6), expectDays: 4 }] })
    expect(codes(o)).toContain('silent:press')
  })

  it('is explicit that it CANNOT tell quiet from broken', () => {
    // The honest limit of this signal, stated in the alert itself: the file
    // refreshes nightly either way.
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(9), expectDays: 4 }] })
    expect(evaluateHealth(o)[0].detail).toMatch(/NO distingue/)
  })

  it('stays quiet inside the expected cadence', () => {
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(2), expectDays: 4 }] })
    expect(evaluateHealth(o)).toEqual([])
  })

  it('ignores a source with no items rather than guessing', () => {
    const o = obs({ sources: [{ name: 'boe', newestItemAt: null, expectDays: 4 }] })
    expect(evaluateHealth(o)).toEqual([])
  })
})

describe('nightly streak', () => {
  it('tolerates a flaky night', () => {
    expect(evaluateHealth(obs({ nightlyFailStreak: NIGHTLY_STREAK_ALARM - 1 }))).toEqual([])
  })

  it('fires on a streak', () => {
    expect(codes(obs({ nightlyFailStreak: NIGHTLY_STREAK_ALARM }))).toContain('nightly-red')
  })
})

describe('integrity', () => {
  it('escalates every integrity failure to critical', () => {
    const o = obs({ integrity: [{ check: 'check:json', message: 'snapshot ilegible' }] })
    const a = evaluateHealth(o)[0]
    expect(a.severity).toBe('critical')
    expect(a.remedy).toContain('check:json')
  })
})

describe('fingerprint + formatting', () => {
  it('is stable regardless of alert order', () => {
    const a = evaluateHealth(obs({ botHealthy: false, nightlyFailStreak: 9 }))
    const b = evaluateHealth(obs({ nightlyFailStreak: 9, botHealthy: false }))
    expect(alertFingerprint(a)).toBe(alertFingerprint(b))
  })

  it('changes when a NEW problem appears, so a fixed digest is not resent', () => {
    const one = evaluateHealth(obs({ botHealthy: false }))
    const two = evaluateHealth(obs({ botHealthy: false, siteHealthy: false }))
    expect(alertFingerprint(one)).not.toBe(alertFingerprint(two))
  })

  it('puts critical alerts before warnings', () => {
    const a = evaluateHealth(obs({ botHealthy: false, nightlyFailStreak: 9 }))
    const text = formatAlerts(a)
    expect(text.indexOf('🔴')).toBeLessThan(text.indexOf('🟠'))
  })

  it('formats nothing when there is nothing to say', () => {
    expect(formatAlerts([])).toBe('')
  })
})
