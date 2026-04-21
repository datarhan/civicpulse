/**
 * Pure parsers for the Spain-wide "live ticker" adapter.
 *
 * Each function takes a raw string payload (JSON or XML/HTML) and returns a
 * typed snapshot fragment. None of these functions perform I/O; the CLI
 * wrapper at scripts/scrape-spain-ticker.ts does fetching and composition.
 *
 * Resilience: every parser returns { ok: false, error } rather than throwing
 * so a single upstream outage never breaks the nightly scrape. Downstream
 * consumers decide to hide the chip when `ok === false`.
 */

/* ============================================================
 * 1. REE PVPC (precio de la luz)
 * ============================================================ */

export interface PvpcSnapshot {
  ok: boolean
  error?: string
  asOf: string // YYYY-MM-DD (Europe/Madrid)
  unit: '€/kWh'
  currentValue: number | null
  currentHour: number | null
  dayMin: number | null
  dayMax: number | null
  hourlyCurve: number[] | null // 24 entries (€/kWh), 0h..23h
  deltaVsYesterdayPct: number | null
  sourceUrl: string
}

export function parsePvpc(
  raw: string,
  opts: { previousDayRaw?: string; now?: Date } = {},
): PvpcSnapshot {
  const base: PvpcSnapshot = {
    ok: false,
    asOf: '',
    unit: '€/kWh',
    currentValue: null,
    currentHour: null,
    dayMin: null,
    dayMax: null,
    hourlyCurve: null,
    deltaVsYesterdayPct: null,
    sourceUrl: 'https://www.ree.es/es/datos/mercados/precios-mercados-tiempo-real',
  }
  let json: any
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { ...base, error: 'invalid json' }
  }
  const series = (json?.included || []).find((i: any) => {
    const t = (i?.type || '').toString().toUpperCase()
    return t === 'PVPC' || t.startsWith('PVPC')
  })
  const values: any[] = series?.attributes?.values || []
  if (values.length === 0) return { ...base, error: 'no PVPC values' }

  const curve = new Array(24).fill(null) as (number | null)[]
  let dayKey: string | null = null
  for (const v of values) {
    if (typeof v?.value !== 'number') continue
    const dt = v?.datetime as string
    if (!dt) continue
    const hour = Number(dt.slice(11, 13))
    if (Number.isNaN(hour) || hour < 0 || hour > 23) continue
    curve[hour] = v.value / 1000 // €/MWh → €/kWh
    if (!dayKey) dayKey = dt.slice(0, 10)
  }
  const filled = curve.filter((v): v is number => typeof v === 'number')
  if (filled.length === 0) return { ...base, error: 'no numeric values' }

  const dayMin = Math.min(...filled)
  const dayMax = Math.max(...filled)
  const now = opts.now || new Date()
  const nowHour = Number(
    now.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }),
  )
  const currentHour = Number.isFinite(nowHour) ? nowHour % 24 : 0
  const currentValue = curve[currentHour] ?? filled[filled.length - 1]

  let deltaVsYesterdayPct: number | null = null
  if (opts.previousDayRaw) {
    try {
      const prev = JSON.parse(opts.previousDayRaw)
      const prevSeries = (prev?.included || []).find((i: any) => {
        const t = (i?.type || '').toString().toUpperCase()
        return t === 'PVPC' || t.startsWith('PVPC')
      })
      const prevValues = (prevSeries?.attributes?.values || []) as any[]
      const prevNums = prevValues
        .map((v) => (typeof v?.value === 'number' ? v.value / 1000 : null))
        .filter((v): v is number => typeof v === 'number')
      if (prevNums.length > 0 && filled.length > 0) {
        const prevAvg = prevNums.reduce((a, b) => a + b, 0) / prevNums.length
        const todayAvg = filled.reduce((a, b) => a + b, 0) / filled.length
        if (prevAvg !== 0) deltaVsYesterdayPct = ((todayAvg - prevAvg) / prevAvg) * 100
      }
    } catch {
      // ignore — delta is optional
    }
  }

  return {
    ok: true,
    asOf: dayKey || '',
    unit: '€/kWh',
    currentValue,
    currentHour,
    dayMin,
    dayMax,
    hourlyCurve: curve.map((v) => (typeof v === 'number' ? v : 0)),
    deltaVsYesterdayPct,
    sourceUrl: 'https://www.ree.es/es/datos/mercados/precios-mercados-tiempo-real',
  }
}

/* ============================================================
 * 2. Minetur Carburantes (gasolina / diésel)
 * ============================================================ */

export interface CarburantesSnapshot {
  ok: boolean
  error?: string
  asOf: string // from Fecha field
  unit: '€/L'
  gasolina95: number | null
  diesel: number | null
  stationCount: number
  sourceUrl: string
}

export function parseCarburantesMunicipio(raw: string): CarburantesSnapshot {
  const base: CarburantesSnapshot = {
    ok: false,
    asOf: '',
    unit: '€/L',
    gasolina95: null,
    diesel: null,
    stationCount: 0,
    sourceUrl: 'https://geoportalgasolineras.es',
  }
  let json: any
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { ...base, error: 'invalid json' }
  }
  const stations = (json?.ListaEESSPrecio || []) as any[]
  if (stations.length === 0) return { ...base, error: 'no stations' }

  const parseNum = (v: unknown): number | null => {
    if (typeof v !== 'string' || v.trim() === '') return null
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const avg = (key: string) => {
    const values = stations
      .map((s) => parseNum(s[key]))
      .filter((v): v is number => typeof v === 'number' && v > 0)
    if (values.length === 0) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }
  const g95 = avg('Precio Gasolina 95 E5')
  const d = avg('Precio Gasoleo A')
  const fecha = (json?.Fecha as string) || ''
  // Fecha looks like "21/04/2026 11:59:24" → ISO day
  let asOf = ''
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) asOf = `${m[3]}-${m[2]}-${m[1]}`

  if (g95 == null && d == null) {
    return { ...base, asOf, stationCount: stations.length, error: 'no prices present' }
  }
  return {
    ok: true,
    asOf,
    unit: '€/L',
    gasolina95: g95,
    diesel: d,
    stationCount: stations.length,
    sourceUrl: 'https://geoportalgasolineras.es',
  }
}

/* ============================================================
 * 3. ECB SDMX (Euribor 12m & BCE MRO)
 * ============================================================ */

export interface EcbSdmxSnapshot {
  ok: boolean
  error?: string
  asOf: string // period label from SDMX (YYYY-MM or YYYY-MM-DD)
  value: number
  unit: '%'
  history: Array<{ period: string; value: number }> | null
}

export function parseEcbSdmxObservations(raw: string): EcbSdmxSnapshot {
  const base: EcbSdmxSnapshot = {
    ok: false,
    asOf: '',
    value: 0,
    unit: '%',
    history: null,
  }
  let json: any
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { ...base, error: 'invalid json' }
  }
  const ds = json?.dataSets?.[0]
  const periods = json?.structure?.dimensions?.observation?.[0]?.values || []
  const seriesMap = ds?.series
  if (!seriesMap || !periods.length) return { ...base, error: 'missing series/periods' }

  // Pick the only series (SDMX keys are like "0:0:0:0:0:0:0")
  const seriesKey = Object.keys(seriesMap)[0]
  const obs = seriesMap[seriesKey]?.observations || {}
  const history: Array<{ period: string; value: number }> = []
  for (const k of Object.keys(obs)) {
    const idx = Number(k)
    const period = periods[idx]?.id || periods[idx]?.name || ''
    const pair = obs[k]
    const val = Array.isArray(pair) ? pair[0] : null
    if (typeof val !== 'number') continue
    history.push({ period, value: val })
  }
  history.sort((a, b) => (a.period > b.period ? 1 : -1))
  if (history.length === 0) return { ...base, error: 'no observations' }
  const latest = history[history.length - 1]
  return {
    ok: true,
    asOf: latest.period,
    value: latest.value,
    unit: '%',
    history,
  }
}

/* ============================================================
 * 4. INE IPC interanual
 * ============================================================ */

export interface IpcSnapshot {
  ok: boolean
  error?: string
  period: string // YYYY-MM
  yoyChange: number // % year-over-year
  unit: '%'
  history: Array<{ period: string; value: number }> | null
  sourceUrl: string
}

export function parseInIpc(raw: string): IpcSnapshot {
  const base: IpcSnapshot = {
    ok: false,
    period: '',
    yoyChange: 0,
    unit: '%',
    history: null,
    sourceUrl: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=1894',
  }
  let json: any
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { ...base, error: 'invalid json' }
  }
  const items = (json?.Data || []) as any[]
  if (items.length === 0) return { ...base, error: 'no data' }

  const history = items
    .map((d) => ({
      period: `${d.Anyo}-${String(d.FK_Periodo).padStart(2, '0')}`,
      value: typeof d.Valor === 'number' ? d.Valor : Number(d.Valor),
    }))
    .filter((d) => Number.isFinite(d.value))
  history.sort((a, b) => (a.period > b.period ? 1 : -1))
  if (history.length === 0) return { ...base, error: 'no numeric values' }

  const latest = history[history.length - 1]
  return {
    ok: true,
    period: latest.period,
    yoyChange: latest.value,
    unit: '%',
    history,
    sourceUrl: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=1894',
  }
}

/* ============================================================
 * 5. AEMET avisos Valencia (HTML with embedded alert icons)
 * ============================================================ */

export interface AemetSnapshot {
  ok: boolean
  error?: string
  asOf: string
  active: boolean
  highestLevel: 'amarillo' | 'naranja' | 'rojo' | null
  counts: { amarillo: number; naranja: number; rojo: number } | null
  sourceUrl: string
}

export function parseAemetAvisosHtml(raw: string): AemetSnapshot {
  const base: AemetSnapshot = {
    ok: false,
    asOf: new Date().toISOString(),
    active: false,
    highestLevel: null,
    counts: null,
    sourceUrl: 'https://www.aemet.es/es/eltiempo/prediccion/avisos?p=46',
  }
  if (!raw || typeof raw !== 'string') return { ...base, error: 'empty input' }
  // AEMET's page embeds one <div class="ico_redondeado_aviso_{color}">
  // per active day/zone in the provincial view. Count them as a proxy.
  const reAmarillo = /ico_redondeado_aviso_amarillo/g
  const reNaranja = /ico_redondeado_aviso_naranja/g
  const reRojo = /ico_redondeado_aviso_rojo/g
  const nAmarillo = (raw.match(reAmarillo) || []).length
  const nNaranja = (raw.match(reNaranja) || []).length
  const nRojo = (raw.match(reRojo) || []).length
  const counts = { amarillo: nAmarillo, naranja: nNaranja, rojo: nRojo }
  const active = nAmarillo + nNaranja + nRojo > 0
  const highestLevel =
    nRojo > 0 ? 'rojo' : nNaranja > 0 ? 'naranja' : nAmarillo > 0 ? 'amarillo' : null
  return {
    ok: true,
    asOf: new Date().toISOString(),
    active,
    highestLevel,
    counts,
    sourceUrl: 'https://www.aemet.es/es/eltiempo/prediccion/avisos?p=46',
  }
}

/* ============================================================
 * 6. DGT DATEX II (tráfico)
 * ============================================================ */

export interface DgtIncident {
  road: string
  description: string
  severity: string | null
  location: string | null
}

export interface DgtSnapshot {
  ok: boolean
  error?: string
  asOf: string
  incidents: DgtIncident[]
  sourceUrl: string
}

export function parseDgtDatex2(raw: string, opts: { roads: string[] }): DgtSnapshot {
  const base: DgtSnapshot = {
    ok: false,
    asOf: new Date().toISOString(),
    incidents: [],
    sourceUrl: 'https://infocar.dgt.es',
  }
  if (!raw || typeof raw !== 'string') return { ...base, error: 'empty input' }

  const pubTime = raw.match(/<com:publicationTime>([^<]+)<\/com:publicationTime>/)?.[1] || ''
  const situationRe = /<sit:situation\s[^>]*>([\s\S]*?)<\/sit:situation>/g
  const roadSet = new Set(opts.roads.map((r) => r.toUpperCase()))
  const incidents: DgtIncident[] = []

  let m: RegExpExecArray | null
  while ((m = situationRe.exec(raw)) !== null) {
    const block = m[1]
    const roads = Array.from(block.matchAll(/<loc:roadName>([^<]+)<\/loc:roadName>/g)).map(
      (x) => x[1],
    )
    const matchedRoad = roads.find((r) => roadSet.has(r.toUpperCase()))
    if (!matchedRoad) continue

    // Pick a value-like textual description. DATEX uses <com:value> inside
    // generalPublicComment / comment / descriptor blocks. Grab the first
    // meaningful non-empty value string.
    const valuesRe = /<com:value[^>]*>([^<]+)<\/com:value>/g
    const candidates: string[] = []
    let v: RegExpExecArray | null
    while ((v = valuesRe.exec(block)) !== null) {
      const txt = v[1].trim()
      if (txt.length > 3 && !/^es$|^en$/i.test(txt)) candidates.push(txt)
    }
    const description = candidates.sort((a, b) => b.length - a.length)[0] || matchedRoad

    const severity = block.match(/<sit:overallSeverity>([^<]+)<\/sit:overallSeverity>/)?.[1] || null
    const location =
      block.match(/<lse:administrativeAreaOfAuthority>[\s\S]*?<com:value[^>]*>([^<]+)<\//)?.[1] ||
      null

    incidents.push({ road: matchedRoad, description, severity, location })
  }

  return {
    ok: true,
    asOf: pubTime || new Date().toISOString(),
    incidents,
    sourceUrl: 'https://infocar.dgt.es',
  }
}
