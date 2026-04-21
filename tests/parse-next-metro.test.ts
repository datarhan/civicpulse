/**
 * Schedule-logic tests for the L9 next-departure computation. No fetch,
 * no browser — pure function over a fixed schedule table. Asserts the
 * edge cases that actually matter: first train of the day, mid-service
 * rounding, last train, past-last-train → tomorrow, weekend variant.
 */
import { describe, it, expect } from 'vitest'
// Dynamic import to avoid the React runtime cost in tests that don't need it.
// @ts-expect-error — JS module, tsx resolves types at runtime
import { __internal } from '../src/hooks/useNextMetro.js'

const { computeNextTerminusDeparture: computeNext, scheduleForDate, SCHEDULE } = __internal

function at(iso: string): Date {
  // Avoid TZ drift: interpret as local time-of-day string like
  //   "2026-04-21T06:00:00"  (plain, no Z, no offset).
  return new Date(iso)
}

describe('next-metro · scheduleForDate', () => {
  it('returns the weekday table Mon–Fri', () => {
    const mon = new Date('2026-04-20T10:00:00') // Monday
    expect(scheduleForDate(mon)).toBe(SCHEDULE.weekday)
  })
  it('returns the saturday table on Saturdays', () => {
    const sat = new Date('2026-04-25T10:00:00') // Saturday
    expect(scheduleForDate(sat)).toBe(SCHEDULE.saturday)
  })
  it('returns the sunday table on Sundays', () => {
    const sun = new Date('2026-04-26T10:00:00') // Sunday
    expect(scheduleForDate(sun)).toBe(SCHEDULE.sunday)
  })
})

describe('next-metro · computeNext · weekday', () => {
  it('before the first train returns today’s first train', () => {
    const now = at('2026-04-21T04:30:00') // Tuesday, pre-service
    const next = computeNext(now)
    expect(next.at.getHours()).toBe(5)
    expect(next.at.getMinutes()).toBe(51)
    expect(next.afterMidnight).toBe(false)
  })

  it('rounds up to the next 30-minute slot at mid-day', () => {
    const now = at('2026-04-21T12:15:00')
    const next = computeNext(now)
    // Weekday pattern starts 05:51 → :21 / :51 slots. 12:15 rounds to 12:21.
    expect(next.at.getHours()).toBe(12)
    expect(next.at.getMinutes()).toBe(21)
  })

  it('returns the last train when queried right before it', () => {
    const now = at('2026-04-21T22:45:00') // Tuesday, 6 min before last
    const next = computeNext(now)
    expect(next.at.getHours()).toBe(22)
    expect(next.at.getMinutes()).toBe(51)
    expect(next.afterMidnight).toBe(false)
  })

  it('past last train returns tomorrow’s first train', () => {
    const now = at('2026-04-21T23:30:00') // Tuesday post-service
    const next = computeNext(now)
    // Wednesday weekday first train.
    expect(next.afterMidnight).toBe(true)
    expect(next.at.getHours()).toBe(5)
    expect(next.at.getMinutes()).toBe(51)
    expect(next.at.getDate()).toBe(22)
  })
})

describe('next-metro · computeNext · saturday', () => {
  it('first train is later on Saturday', () => {
    const now = at('2026-04-25T06:00:00') // Saturday
    const next = computeNext(now)
    expect(next.at.getHours()).toBe(7)
    expect(next.at.getMinutes()).toBe(3)
  })
})

describe('next-metro · computeNext · after-hours Sunday → Monday', () => {
  it('Sunday 23:00 rolls over to Monday weekday first train', () => {
    const now = at('2026-04-26T23:00:00') // Sunday post-service
    const next = computeNext(now)
    expect(next.afterMidnight).toBe(true)
    expect(next.at.getDate()).toBe(27) // Monday
    expect(next.at.getHours()).toBe(5) // weekday first
    expect(next.at.getMinutes()).toBe(51)
  })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { computeStationSchedule, L9_STATIONS } from '../src/hooks/useNextMetro.js'

describe('next-metro · computeStationSchedule · intermediate station', () => {
  const masia = L9_STATIONS.find((s) => s.id === 'masia-de-traver')!

  it('outbound at Masia is 2 min after Riba-roja terminus departure', () => {
    const now = at('2026-04-21T08:00:00') // Tuesday weekday, mid-service
    const sched = computeStationSchedule(masia, now)
    // Terminus next departure after 08:00 is 08:21 (05:51 + 30*5). Masia is
    // at offset 2 min from terminus, so outbound passes at 08:23.
    expect(sched.outbound.at.getHours()).toBe(8)
    expect(sched.outbound.at.getMinutes()).toBe(23)
    expect(sched.outbound.heading).toBe('València')
  })

  it('inbound at Masia is 13 min after a terminus tick (phase 15 - offset 2)', () => {
    const now = at('2026-04-21T08:00:00')
    const sched = computeStationSchedule(masia, now)
    // Inbound train matching terminus tick 07:51 arrives Riba-roja at 08:06
    // and was at Masia 2 min earlier → 08:04, the first ≥ 08:00.
    expect(sched.inbound.at.getHours()).toBe(8)
    expect(sched.inbound.at.getMinutes()).toBe(4)
    expect(sched.inbound.heading).toBe('Riba-roja')
  })

  it('returns approximateInbound honesty flag', () => {
    const now = at('2026-04-21T08:00:00')
    const sched = computeStationSchedule(masia, now)
    expect(sched.approximateInbound).toBe(true)
  })
})

describe('next-metro · computeStationSchedule · terminus', () => {
  const riba = L9_STATIONS.find((s) => s.id === 'riba-roja-de-turia')!

  it('outbound at Riba-roja terminus matches computeNext departure', () => {
    const now = at('2026-04-21T08:00:00')
    const sched = computeStationSchedule(riba, now)
    const direct = computeNext(now)
    expect(sched.outbound.at.getTime()).toBe(direct.at.getTime())
  })
})
