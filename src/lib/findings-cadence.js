/**
 * ISO-8601 weekly publication cadence over published findings.
 * IFCN signatory eligibility requires ≥1 published fact-check per week over a
 * 12-month track record — this module is the clock (spec §4.1). Pure: no I/O.
 */

const WEEK_MS = 7 * 86400000

/** 'YYYY-MM-DD' → 'YYYY-Www' (ISO week), or null on garbage. */
export function isoWeekKey(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3) // this ISO week's Thursday
  const isoYear = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)) // Jan 4 is always in ISO week 1
  const jan4Day = (jan4.getUTCDay() + 6) % 7
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - jan4Day + 3))
  const week = 1 + Math.round((d.getTime() - week1Thu.getTime()) / WEEK_MS)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

function mondayOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

/**
 * items: rows with an optional publishedAt 'YYYY-MM-DD'. now: 'YYYY-MM-DD'.
 * Returns null when nothing has ever been published (clock not started).
 */
export function weeklyCadence(items, { now }) {
  const dates = (items ?? [])
    .map((it) => it?.publishedAt)
    .filter((s) => typeof s === 'string' && isoWeekKey(s) !== null)
    .sort()
  if (!dates.length) return null

  const counts = new Map()
  for (const s of dates) {
    const k = isoWeekKey(s)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const perWeek = []
  const cursor = mondayOf(dates[0])
  const end = mondayOf(now)
  while (cursor.getTime() <= end.getTime()) {
    const k = isoWeekKey(cursor.toISOString().slice(0, 10))
    perWeek.push({ week: k, count: counts.get(k) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  if (!perWeek.length) return null // e.g. every publishedAt is in the future of `now`

  const coveredWeeks = perWeek.filter((w) => w.count > 0).length
  return {
    firstWeek: perWeek[0].week,
    currentWeek: perWeek[perWeek.length - 1].week,
    totalWeeks: perWeek.length,
    coveredWeeks,
    coverageRatio: coveredWeeks / perWeek.length,
    currentWeekCount: perWeek[perWeek.length - 1].count,
    gapWeeks: perWeek.filter((w) => w.count === 0).map((w) => w.week),
    perWeek,
  }
}
