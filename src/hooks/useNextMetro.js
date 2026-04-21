// @ts-check
import { useEffect, useState } from 'react'

/**
 * L9 Metrovalencia schedule — two directions + four stations.
 *
 * FGV does not expose a free realtime API; their static GTFS schedule is
 * public though, and we encode the headway pattern here so the UI can
 * compute "next departure" in the browser (no network, no key, no
 * staleness). Every station on the line between Riba-roja (terminus)
 * and València has an offset in minutes from the Riba-roja departure;
 * the opposite direction ("hacia Riba-roja") runs on the same 30-min
 * headway but is phase-shifted by ~15 min — a honest approximation
 * published alongside the times, not hidden.
 *
 * Base schedule at the terminus (manually transcribed from fgv.es,
 * verified 2026-04):
 *
 *   Riba-roja de Túria — hacia València
 *     weekdays (L-V): first 05:51 · every 30 min · last 22:51
 *     saturday:       first 07:03 · every 30 min · last 22:33
 *     sunday/hol.:    first 07:33 · every 30 min · last 22:33
 *
 * The reverse direction ("hacia Riba-roja") is approximated as the
 * outbound schedule shifted by +15 min at the terminus.
 */

const STATION_NAME = 'Riba-roja de Túria'

const SCHEDULE = {
  validUntil: '2026-12-31',
  weekday: { firstHour: 5, firstMin: 51, lastHour: 22, lastMin: 51, intervalMin: 30 },
  saturday: { firstHour: 7, firstMin: 3, lastHour: 22, lastMin: 33, intervalMin: 30 },
  sunday: { firstHour: 7, firstMin: 33, lastHour: 22, lastMin: 33, intervalMin: 30 },
}

/** Minutes inbound trains arrive at Riba-roja after the matching outbound
 *  train departs — derived from a ~25-min one-way trip + turnaround.
 *  Published as "aproximado" in the UI. */
const INBOUND_PHASE_MIN = 15

/** L9 Metrovalencia stations inside the municipality, with travel-time
 *  offsets from the Riba-roja terminus. OSM tags `network=Metrovalencia`
 *  + `operator=FGV` are the source of truth — stations on the Adif
 *  heavy-rail line that share the map (e.g. "El Clot") are deliberately
 *  *not* in this list. They get a generic popup redirecting users to
 *  renfe.com/cercanias. */
export const L9_STATIONS = [
  {
    id: 'riba-roja-de-turia',
    osmName: 'Riba-roja de Túria',
    label: 'Riba-roja de Túria',
    offsetFromTerminusMin: 0,
    terminus: true,
  },
  {
    id: 'masia-de-traver',
    osmName: 'Masia de Traver',
    label: 'Masia de Traver',
    offsetFromTerminusMin: 2,
    terminus: false,
  },
  {
    id: 'valencia-la-vella',
    osmName: 'València la Vella',
    label: 'València la Vella',
    offsetFromTerminusMin: 4,
    terminus: false,
  },
]

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

function nearestMinute(baseDate, totalMinutes) {
  const d = new Date(baseDate)
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  return d
}

function minutesUntil(target, now) {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000))
}

function fmtHHMM(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/** Next departure at Riba-roja terminus for the outbound direction at or
 *  after `now`, falling through to tomorrow if past last service. */
function computeNextTerminusDeparture(now) {
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
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextSched = scheduleForDate(tomorrow)
  const firstTomorrow = nextSched.firstHour * 60 + nextSched.firstMin
  return { at: nearestMinute(tomorrow, firstTomorrow), afterMidnight: true }
}

/** Generate the full sequence of outbound terminus departures for a given
 *  local date — used to find the next departure whose station-passing
 *  time is still in the future (for intermediate stations). */
function listTerminusDepartures(forDate) {
  const sched = scheduleForDate(forDate)
  const out = []
  const firstMin = sched.firstHour * 60 + sched.firstMin
  const lastMin = sched.lastHour * 60 + sched.lastMin
  for (let m = firstMin; m <= lastMin; m += sched.intervalMin) {
    out.push(nearestMinute(forDate, m))
  }
  return out
}

/** Next "pass time" at a given station for a given direction at or after
 *  `now`. Returns the Date plus afterMidnight flag (for the "(mañana)"
 *  label when we've wrapped to tomorrow's first service). */
function computeStationNext(stationOffsetMin, direction, now) {
  // Direction='outbound' — train departs terminus at T, passes station at
  // T + stationOffset.
  // Direction='inbound'  — train arrives terminus at T + PHASE, and was
  // at station at (T + PHASE) - stationOffset.
  const addPerDeparture =
    direction === 'outbound' ? stationOffsetMin : INBOUND_PHASE_MIN - stationOffsetMin

  // Walk today's terminus departures in order; first one whose station-time
  // is ≥ now wins.
  for (const dep of listTerminusDepartures(now)) {
    const passes = new Date(dep.getTime() + addPerDeparture * 60_000)
    if (passes.getTime() >= now.getTime()) return { at: passes, afterMidnight: false }
  }
  // Past last service today — use first departure tomorrow.
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const firstTomorrow = listTerminusDepartures(tomorrow)[0]
  return {
    at: new Date(firstTomorrow.getTime() + addPerDeparture * 60_000),
    afterMidnight: true,
  }
}

/** Public: the full two-direction pair for a given station at a given
 *  instant. Null-direction when the train can't depart in that direction
 *  from that station (outbound from a terminus returns the terminus
 *  schedule; inbound at the terminus means an arriving train). */
export function computeStationSchedule(station, now) {
  const out = computeStationNext(station.offsetFromTerminusMin, 'outbound', now)
  const inb = computeStationNext(station.offsetFromTerminusMin, 'inbound', now)
  return {
    station,
    outbound: {
      at: out.at,
      afterMidnight: out.afterMidnight,
      label: fmtHHMM(out.at),
      minutesAway: minutesUntil(out.at, now),
      heading: 'València',
    },
    inbound: {
      at: inb.at,
      afterMidnight: inb.afterMidnight,
      label: fmtHHMM(inb.at),
      minutesAway: minutesUntil(inb.at, now),
      heading: 'Riba-roja',
    },
    scheduleValidUntil: SCHEDULE.validUntil,
    approximateInbound: true,
  }
}

/** Topbar hook: next outbound departure from the Riba-roja terminus.
 *  Re-computes every 15s; no network. Kept backward-compatible. */
export function useNextMetro() {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const now = new Date(tick)
  const next = computeNextTerminusDeparture(now)
  const minsAway = minutesUntil(next.at, now)

  return {
    stationName: STATION_NAME,
    departureAt: next.at,
    minutesAway: minsAway,
    afterMidnight: next.afterMidnight,
    scheduleValidUntil: SCHEDULE.validUntil,
    scheduleSource: 'FGV · fgv.es (schedule transcribed)',
    departureLabel: fmtHHMM(next.at),
    heading: 'València',
  }
}

// Exported for tests only.
export const __internal = {
  computeNextTerminusDeparture,
  scheduleForDate,
  computeStationNext,
  SCHEDULE,
  INBOUND_PHASE_MIN,
}
