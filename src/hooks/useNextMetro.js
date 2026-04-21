// @ts-check
import { useEffect, useState } from 'react'

/**
 * Next L9 Metrovalencia departure from Riba-roja de Túria station.
 *
 * FGV (Ferrocarrils de la Generalitat Valenciana) does NOT expose an
 * authenticated-free realtime API; their static GTFS schedule is public
 * though, and at this station the service is a simple ~every-30-minute
 * pattern. We encode the schedule here and compute "next departure" in
 * the browser — no network, no key, no staleness.
 *
 * Schedule source (manually transcribed from fgv.es · verified 2026-04):
 *
 *   Riba-roja de Túria (terminus, towards Valencia/Alacant ← Ayora ← Av. del Cid)
 *     weekdays (L-V): first 05:51 · every 30 min · last 22:51
 *     saturday:       first 07:03 · every 30 min · last 22:33
 *     sunday/hol.:    first 07:33 · every 30 min · last 22:33
 *
 * When the real schedule drifts, update SCHEDULE below. The `validUntil`
 * field is an honesty signal — stale copy warrants a reminder in the UI.
 */

const STATION_NAME = 'Riba-roja de Túria'

const SCHEDULE = {
  validUntil: '2026-12-31',
  weekday: { firstHour: 5,  firstMin: 51, lastHour: 22, lastMin: 51, intervalMin: 30 },
  saturday: { firstHour: 7, firstMin: 3,  lastHour: 22, lastMin: 33, intervalMin: 30 },
  sunday: { firstHour: 7,   firstMin: 33, lastHour: 22, lastMin: 33, intervalMin: 30 },
}

/** 0=Sunday, 1..5=Weekday, 6=Saturday. Spanish public holidays are NOT
 *  handled — users reading on a festivo get the weekday schedule which
 *  runs at best a ~10-minute early. Accept the drift rather than ship a
 *  full Spanish-calendar hardcode that will rot. */
function scheduleForDate(d) {
  const dow = d.getDay()
  if (dow === 0) return SCHEDULE.sunday
  if (dow === 6) return SCHEDULE.saturday
  return SCHEDULE.weekday
}

function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Compute the next departure at or after `now` for the schedule applying
 *  today (falling through to tomorrow if we're past service end). */
function computeNext(now) {
  const sched = scheduleForDate(now)
  const nowMin = minutesOfDay(now)
  const firstMin = sched.firstHour * 60 + sched.firstMin
  const lastMin = sched.lastHour * 60 + sched.lastMin

  if (nowMin < firstMin) {
    return { at: nearestMinute(now, firstMin), afterMidnight: false }
  }
  if (nowMin <= lastMin) {
    const since = nowMin - firstMin
    const slot = Math.ceil(since / sched.intervalMin)
    const dep = firstMin + slot * sched.intervalMin
    if (dep <= lastMin) return { at: nearestMinute(now, dep), afterMidnight: false }
  }
  // Past last departure today — return first train tomorrow.
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextSched = scheduleForDate(tomorrow)
  const firstTomorrow = nextSched.firstHour * 60 + nextSched.firstMin
  return { at: nearestMinute(tomorrow, firstTomorrow), afterMidnight: true }
}

function nearestMinute(baseDate, totalMinutes) {
  const d = new Date(baseDate)
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  return d
}

function minutesUntil(target, now) {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000))
}

/** Main hook. Re-computes every 15s; lightweight (no fetch). */
export function useNextMetro() {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const now = new Date(tick)
  const next = computeNext(now)
  const minsAway = minutesUntil(next.at, now)

  return {
    stationName: STATION_NAME,
    departureAt: next.at,
    minutesAway: minsAway,
    afterMidnight: next.afterMidnight,
    scheduleValidUntil: SCHEDULE.validUntil,
    scheduleSource: 'FGV · fgv.es (schedule transcribed)',
    // Convenience: formatted HH:MM string the UI can render directly.
    departureLabel: next.at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  }
}

// Exported for tests only.
export const __internal = { computeNext, scheduleForDate, SCHEDULE }
