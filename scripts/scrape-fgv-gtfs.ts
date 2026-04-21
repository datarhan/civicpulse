#!/usr/bin/env tsx
/**
 * Pull the FGV / Metrovalencia GTFS static feed and extract the real
 * departure schedule at the four stations inside the municipality of
 * Riba-roja. No more hand-transcribed tables in useNextMetro.js: this
 * script replaces them with real data refreshed from the official feed.
 *
 * Feed source: MobilityDatabase `mdb-latest` public mirror of the FGV
 * GTFS (feed id 1054). MobilityDB re-hosts the feed daily from FGV's
 * own google-transit endpoint; we pull from the mirror because FGV's
 * own URL is reachable only inside their CDN.
 *
 * Usage: npm run scrape:fgv-gtfs
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/metro-schedule.json')
const TMP_ZIP = join(tmpdir(), 'fgv-gtfs.zip')

const GTFS_URL =
  'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/es-valenciana-metrovalencia-gtfs-1054.zip?alt=media'

// Only these stops interest the civic map right now. Keys = our stable
// slugs; values = GTFS stop_id strings. Expand when we grow coverage.
const TARGET_STOPS: Record<string, { id: string; line: 'L9' | 'L2'; label: string }> = {
  'riba-roja-de-turia': { id: '186', line: 'L9', label: 'Riba-roja de Túria' },
  'masia-de-traver': { id: '185', line: 'L9', label: 'Masia de Traver' },
  'valencia-la-vella': { id: '188', line: 'L9', label: 'València la Vella' },
  'el-clot': { id: '48', line: 'L2', label: 'El Clot' },
}

// Active lines we care about (route.route_short_name).
const TARGET_LINES = new Set(['2', '9'])

// ─── CSV parsing ────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  // Very small CSV parser sufficient for GTFS (no embedded newlines, simple
  // quoted fields if any). Avoids a dependency.
  const out: string[] = []
  let buf = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          buf += '"'
          i++
        } else {
          quoted = false
        }
      } else buf += c
    } else {
      if (c === ',') {
        out.push(buf.trim())
        buf = ''
      } else if (c === '"' && buf === '') quoted = true
      else buf += c
    }
  }
  out.push(buf.trim())
  return out
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  const header = parseCsvLine(lines[0])
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) rows.push(parseCsvLine(lines[i]))
  return { header, rows }
}

function indexCsv(text: string): { columns: Record<string, number>; rows: string[][] } {
  const { header, rows } = parseCsv(text)
  const columns: Record<string, number> = {}
  header.forEach((h, i) => (columns[h] = i))
  return { columns, rows }
}

// ─── GTFS helpers ───────────────────────────────────────────────────────────

type DayType = 'weekday' | 'saturday' | 'sunday'

/** FGV doesn't populate calendar.txt's weekly flags — every service is
 *  listed explicitly by date in calendar_dates.txt. Classify by walking
 *  each service's operating dates and picking the dominant day-of-week
 *  bucket (M–F / Sat / Sun). Requires ≥60% agreement to keep the signal
 *  honest; special/holiday services get skipped. */
function classifyByDates(dates: string[]): DayType | null {
  if (dates.length === 0) return null
  let wd = 0
  let sat = 0
  let sun = 0
  for (const d of dates) {
    // d = 'YYYYMMDD'. Parse as local date and pull getDay().
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const dow = new Date(iso + 'T12:00:00').getDay()
    if (dow === 0) sun++
    else if (dow === 6) sat++
    else wd++
  }
  const total = dates.length
  if (wd / total >= 0.6 && sat === 0 && sun === 0) return 'weekday'
  if (sat / total >= 0.6 && wd === 0 && sun === 0) return 'saturday'
  if (sun / total >= 0.6 && wd === 0 && sat === 0) return 'sunday'
  return null
}

function normaliseHeadsign(s: string, line: 'L9' | 'L2'): string {
  // FGV headsigns use the specific destination ("Alboraia Peris Aragó",
  // "Machado", "Av. del Cid" for L9 outbound; "Empalme", "València Sud",
  // etc. for L2). For the UI we collapse them to the conceptual direction.
  if (line === 'L9') {
    // L9 at Riba-roja has exactly one outbound direction (towards Valencia)
    // and one inbound (returning to Riba-roja).
    const isRibaRoja = /riba-roja/i.test(s)
    return isRibaRoja ? 'Riba-roja' : 'València'
  }
  // L2 can head towards Llíria (NW) or Torrent Avinguda / València Sud (SE).
  if (/llíria|lliria/i.test(s)) return 'Llíria'
  return 'Torrent Avinguda'
}

function hhmmOnly(t: string): string {
  // GTFS times may exceed 24:00:00 (e.g. 26:15 = 02:15 next day). Clamp
  // into HH:MM; we record `afterMidnight` separately when hours≥24.
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return t
  let h = Number(m[1])
  let afterMidnight = false
  if (h >= 24) {
    h -= 24
    afterMidnight = true
  }
  const hh = String(h).padStart(2, '0')
  return `${hh}:${m[2]}${afterMidnight ? '+' : ''}`
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[fgv-gtfs] downloading feed…')
  execFileSync('curl', ['-sSL', '--max-time', '60', '-o', TMP_ZIP, GTFS_URL])

  function extract(file: string): string {
    return execFileSync('unzip', ['-p', TMP_ZIP, file], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  }

  console.log('[fgv-gtfs] parsing calendar_dates…')
  const calendarDates = indexCsv(extract('calendar_dates.txt'))
  const datesByService = new Map<string, string[]>()
  for (const row of calendarDates.rows) {
    const sid = row[calendarDates.columns.service_id]
    const date = row[calendarDates.columns.date]
    const type = row[calendarDates.columns.exception_type]
    if (type !== '1') continue // ignore removals
    const arr = datesByService.get(sid) || []
    arr.push(date)
    datesByService.set(sid, arr)
  }
  const serviceDayType = new Map<string, DayType>()
  for (const [sid, dates] of datesByService) {
    const dt = classifyByDates(dates)
    if (dt) serviceDayType.set(sid, dt)
  }
  console.log(
    `[fgv-gtfs] classified ${serviceDayType.size}/${datesByService.size} services by dominant day-of-week`,
  )

  // Also parse calendar.txt just for validThrough info.
  const calendar = indexCsv(extract('calendar.txt'))

  console.log('[fgv-gtfs] parsing routes…')
  const routes = indexCsv(extract('routes.txt'))
  const routeLine = new Map<string, 'L9' | 'L2'>()
  for (const row of routes.rows) {
    const short = row[routes.columns.route_short_name]
    if (!TARGET_LINES.has(short)) continue
    routeLine.set(row[routes.columns.route_id], `L${short}` as 'L9' | 'L2')
  }

  console.log('[fgv-gtfs] parsing trips…')
  const trips = indexCsv(extract('trips.txt'))
  interface TripMeta {
    line: 'L9' | 'L2'
    dayType: DayType
    headsign: string
  }
  const tripMeta = new Map<string, TripMeta>()
  for (const row of trips.rows) {
    const routeId = row[trips.columns.route_id]
    const line = routeLine.get(routeId)
    if (!line) continue
    const dayType = serviceDayType.get(row[trips.columns.service_id])
    if (!dayType) continue
    tripMeta.set(row[trips.columns.trip_id], {
      line,
      dayType,
      headsign: row[trips.columns.trip_headsign] || '',
    })
  }
  console.log(`[fgv-gtfs] target trips: ${tripMeta.size.toLocaleString()}`)

  console.log('[fgv-gtfs] scanning stop_times (11 MB)…')
  const stopIds = new Set(Object.values(TARGET_STOPS).map((s) => s.id))
  const stopTimesRaw = extract('stop_times.txt')
  const stopTimes = indexCsv(stopTimesRaw)
  const { trip_id, departure_time, stop_id } = stopTimes.columns

  // accumulator[stopId][line][direction][dayType] = Set<HH:MM+?>
  type Bucket = Map<string, Map<string, Map<string, Map<DayType, Set<string>>>>>
  const acc: Bucket = new Map()

  for (const row of stopTimes.rows) {
    const sid = row[stop_id]
    if (!stopIds.has(sid)) continue
    const meta = tripMeta.get(row[trip_id])
    if (!meta) continue
    const direction = normaliseHeadsign(meta.headsign, meta.line)
    const time = hhmmOnly(row[departure_time])

    if (!acc.has(sid)) acc.set(sid, new Map())
    const byLine = acc.get(sid)!
    if (!byLine.has(meta.line)) byLine.set(meta.line, new Map())
    const byDir = byLine.get(meta.line)!
    if (!byDir.has(direction)) byDir.set(direction, new Map())
    const byDayType = byDir.get(direction)!
    if (!byDayType.has(meta.dayType)) byDayType.set(meta.dayType, new Set())
    byDayType.get(meta.dayType)!.add(time)
  }

  // Max validThrough across all active services — honesty signal.
  let validThrough = '1970-01-01'
  for (const row of calendar.rows) {
    const end = row[calendar.columns.end_date]
    if (!end || end.length !== 8) continue
    const iso = `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`
    if (iso > validThrough) validThrough = iso
  }

  // Emit.
  const stops: Record<string, unknown> = {}
  for (const [slug, stop] of Object.entries(TARGET_STOPS)) {
    const byLine = acc.get(stop.id)
    if (!byLine) continue
    const lineOut: Record<string, unknown> = {}
    for (const [line, byDir] of byLine) {
      const directions: Array<{
        heading: string
        departures: Record<DayType, string[]>
      }> = []
      for (const [heading, byDayType] of byDir) {
        const dep: Record<DayType, string[]> = { weekday: [], saturday: [], sunday: [] }
        for (const dt of ['weekday', 'saturday', 'sunday'] as DayType[]) {
          const set = byDayType.get(dt)
          if (set) dep[dt] = [...set].sort()
        }
        directions.push({ heading, departures: dep })
      }
      directions.sort((a, b) => a.heading.localeCompare(b.heading))
      lineOut[line] = { directions }
    }
    stops[slug] = { id: stop.id, label: stop.label, line: stop.line, lines: lineOut }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      feed: 'Metrovalencia (FGV) GTFS static',
      mirror: 'MobilityDatabase mdb-1054',
      url: GTFS_URL,
    },
    validThrough,
    stops,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')

  // Quick summary for the console.
  for (const [slug, data] of Object.entries(stops)) {
    const byLine = (data as { lines: Record<string, { directions: Array<{ heading: string; departures: Record<DayType, string[]> }> }> }).lines
    const parts: string[] = []
    for (const [line, info] of Object.entries(byLine)) {
      for (const d of info.directions) {
        const wd = d.departures.weekday?.length ?? 0
        parts.push(`${line}→${d.heading} ${wd}w`)
      }
    }
    console.log(`[fgv-gtfs]   ${slug}: ${parts.join(' · ')}`)
  }
  console.log(`[fgv-gtfs] wrote ${OUT} · valid through ${validThrough}`)
}

main().catch((err) => {
  console.error('[fgv-gtfs] failed:', err)
  process.exit(1)
})
