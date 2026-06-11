// @ts-check
import { useMemo } from 'react'
import { useJsonFetch } from './useJsonFetch'

/**
 * Load the GTFS-derived metro schedule written by
 * `scripts/scrape-fgv-gtfs.ts` into `public/data/metro-schedule.json`.
 *
 * Per stop slug (riba-roja-de-turia, masia-de-traver, valencia-la-vella,
 * el-clot), the shape is:
 *
 *   { id, label, line, lines: { L9: { directions: [{heading, departures:
 *       {weekday: ['HH:MM', ...], saturday: [...], sunday: [...] }}] } } }
 *
 * Times with a trailing '+' are after-midnight departures (GTFS allows
 * values like 25:30 for 01:30 next day). The hook returns a thin
 * `findNext(slug, now)` helper that hands the UI a compact object:
 *
 *   [{ line: 'L9', heading: 'València', label: '06:06', afterMidnight,
 *      minutesAway, sourceHhmm }]
 *
 * If the data is unavailable (fetch error, slug not covered) the caller
 * should fall back to the hardcoded tables in `useNextMetro.js`.
 */
export function useMetroSchedule() {
  const state = useJsonFetch('/data/metro-schedule.json')

  const findNext = useMemo(() => {
    const data = state.data
    return (slug, now) => {
      if (!data?.stops?.[slug]) return null
      const stop = data.stops[slug]
      const dayType = dayTypeFor(now)
      const out = []
      for (const [line, info] of Object.entries(stop.lines || {})) {
        for (const dir of info.directions || []) {
          const list = dir.departures?.[dayType] || []
          const next = findNextDeparture(list, now)
          if (next) {
            out.push({
              line,
              heading: dir.heading,
              label: next.label,
              afterMidnight: next.afterMidnight,
              minutesAway: next.minutesAway,
            })
          }
        }
      }
      return {
        stop,
        validThrough: data.validThrough,
        source: data.source,
        departures: out,
      }
    }
  }, [state.data])

  return { ...state, findNext }
}

function dayTypeFor(d) {
  const dow = d.getDay()
  if (dow === 0) return 'sunday'
  if (dow === 6) return 'saturday'
  return 'weekday'
}

function findNextDeparture(list, now) {
  if (!Array.isArray(list) || list.length === 0) return null
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  // Tonight's same-day entries first.
  for (const raw of list) {
    const parsed = parseGtfsTime(raw)
    if (!parsed) continue
    if (parsed.afterMidnight) continue // handled in pass 2
    if (parsed.minutes < nowMin) continue
    return {
      label: parsed.label,
      afterMidnight: false,
      minutesAway: Math.max(0, Math.round(parsed.minutes - nowMin)),
    }
  }
  // After-midnight entries (GTFS 24:00+). These represent the tail of
  // tonight's service — compare against "time since today's midnight".
  for (const raw of list) {
    const parsed = parseGtfsTime(raw)
    if (!parsed || !parsed.afterMidnight) continue
    const minsSinceTodayMidnight = parsed.minutes + 24 * 60
    if (minsSinceTodayMidnight < nowMin) continue
    return {
      label: parsed.label,
      afterMidnight: true,
      minutesAway: Math.max(0, Math.round(minsSinceTodayMidnight - nowMin)),
    }
  }
  return null
}

function parseGtfsTime(raw) {
  const m = String(raw).match(/^(\d{1,2}):(\d{2})(\+?)$/)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  return {
    label: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
    minutes: h * 60 + mi,
    afterMidnight: m[3] === '+',
  }
}
