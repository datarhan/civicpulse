/**
 * Paro network walk — the 24-month loop over SEPE's monthly municipal XLS
 * feeds (20-45k municipalities) that feeds parseSepeParoMonth.
 *
 * Salió de scripts/scrape-paro.ts para que las pruebas fijen el recorrido con
 * un `fetchImpl` inyectado, sin red —la misma razón que boe-fetch.ts—: el
 * parser sigue puro en paro.ts y el CLI sólo lee y escribe el fichero.
 *
 * El 2026-10-27 a las 06:20, `scrape-ci-blocked` publicó un paro.json con dos
 * meses menos (2026-09 y 2025-07) y salió con 0. `fetch()` había devuelto las
 * cabeceras a la primera, y el `AbortSignal.timeout` de 30 s cortó después la
 * lectura del cuerpo, `res.arrayBuffer()`, que estaba FUERA del try de los
 * reintentos. La excepción subía a un catch de main() que la anotaba como
 * «skipped», no la contaba para el cortacircuitos y seguía: el mes que nadie
 * llegó a leer se publicó como un mes que no existe, y `latestPeriod`
 * retrocedió de 2026-09 a 2026-08 (clase E05 del atlas; regla 2 de CLAUDE.md).
 * Ahora cada mes acaba en uno de cuatro estados (`MesParo`), la lectura del
 * cuerpo va dentro de cada intento, y la serie se compone sobre la del fichero
 * anterior: un mes sin leer conserva su fila y `stats` lo nombra
 * (`componerSerieParo`, en paro.ts). tests/paro-fetch.test.ts reproduce esa
 * pasada.
 */
import {
  componerSerieParo,
  parseSepeParoMonth,
  type MesParo,
  type ParoSnapshot,
  type ParoStats,
} from './paro'

export const MUNI = 'Riba-roja de Túria'
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const MESES_RECORRIDOS = 24

export function candidateUrl(year: number, monthIdx: number): string {
  const m = MONTHS_ES[monthIdx]
  return (
    `https://sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/` +
    `datos_estadisticos/municipios_20_45/${year}/${m}_${year}/` +
    `Muniacteco_20-45_COM.VALENCIANA.xls`
  )
}

// SEPE's sepe.es host intermittently drops the TLS handshake — undici's
// default 10s connectTimeout then fires as ConnectTimeoutError BEFORE the
// per-download AbortSignal below ever applies. A single such hiccup on any one
// of the 24 months used to throw straight up through main() → exit(1) and red
// the whole nightly (and skip that night's deploy). Retry transient network
// errors a few times with backoff so one slow handshake doesn't lose the
// month. The "0 months read → keep yesterday's snapshot" guard in
// construirParo() stays the real failure backstop, so a genuine SEPE outage
// still reds the run — it is never silently masked.
const FETCH_ATTEMPTS = 3
// Consecutive months with no complete answer (`sin-respuesta`: no handshake,
// a body cut short, or an error status other than 404 — never a 404, which is
// how a not-yet-published month answers and must not count) that abort the
// walk. When SEPE blackholes the caller's IP range (GitHub-runner IPs since
// 2026-07-11), all 24 months fail identically; retrying each one used to
// burn ~15 min of the nightly's 20-min budget, the job timed out CANCELLED,
// and the !cancelled() commit step threw away every other adapter's fresh
// data. Three same-shaped failures in a row are proof the host is
// unreachable, not that a month is missing — stop paying for the rest.
const MAX_CONSECUTIVE_NET_FAILURES = 3

export interface ParoDeps {
  /** Override clock — used by tests. */
  now?: Date
  /** Override fetch — used by tests. */
  fetchImpl?: typeof fetch
  /** Backoff between attempts — tests pass one that does not wait. */
  esperar?: (ms: number) => Promise<void>
  /** Override the parser — tests pass one that needs no 3 MB workbook. */
  parse?: typeof parseSepeParoMonth
  /** La serie del paro.json publicado: de ella sale la fila de un mes que esta pasada no lea. */
  previo?: readonly ParoSnapshot[] | null
}

export interface ParoPayload {
  generatedAt: string
  source: { platform: string; pattern: string }
  municipio: string
  latestPeriod: string | null
  latestTotal: number | null
  stats: ParoStats
  series: ParoSnapshot[]
}

/** `ok: false` means: write nothing, keep the snapshot on disk, exit non-zero. */
export type ResultadoParo = { ok: true; payload: ParoPayload } | { ok: false; motivo: string }

const esperarDeVerdad = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** `buf: null` is SEPE saying the month is not there; `fallo` is no complete answer at all. */
type Descarga = { status: number; buf: Buffer | null } | { fallo: string }

async function fetchMonthXls(
  url: string,
  fetchImpl: typeof fetch,
  esperar: (ms: number) => Promise<void>,
): Promise<Descarga> {
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: {
          'User-Agent':
            'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
          Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
        },
        // Per-attempt budget — a healthy SEPE serves the XLS in ~1-2 s; a
        // stalled/blackholed connection must fail fast, not hang the chain
        // (30 s × 3 attempts × 3 breaker months ≈ 5 min worst case).
        signal: AbortSignal.timeout(30_000),
      })
      // 404 es como contesta el SEPE un mes que aún no ha publicado (medido el
      // 2026-10-27 con octubre): un no, y nada que reintentar.
      if (res.status === 404 || res.status === 410) return { status: res.status, buf: null }
      // Cualquier otro error no dice nada del mes: se reintenta como un
      // apretón de manos caído, y si persiste es `sin-respuesta`.
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // El cuerpo se lee DENTRO del intento: la señal de 30 s también lo
      // corta, y fuera de este try ese corte se saltaba los reintentos y el
      // cortacircuitos (la cabecera cuenta el 2026-10-27).
      return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      if (attempt === FETCH_ATTEMPTS) {
        console.warn(`[paro] ${url} — network error after ${FETCH_ATTEMPTS} attempts: ${detail}`)
        return { fallo: detail }
      }
      const backoffMs = attempt * 2000
      console.warn(
        `[paro] transient fetch error (attempt ${attempt}/${FETCH_ATTEMPTS}), retrying in ${backoffMs}ms: ${detail}`,
      )
      await esperar(backoffMs)
    }
  }
  return { fallo: `${FETCH_ATTEMPTS} attempts` }
}

async function leerMes(
  year: number,
  monthIdx: number,
  fetchImpl: typeof fetch,
  esperar: (ms: number) => Promise<void>,
  parse: typeof parseSepeParoMonth,
): Promise<MesParo> {
  const period = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
  const d = await fetchMonthXls(candidateUrl(year, monthIdx), fetchImpl, esperar)
  if ('fallo' in d) return { period, estado: 'sin-respuesta', motivo: d.fallo }
  if (!d.buf) return { period, estado: 'ausente', motivo: `HTTP ${d.status}` }
  // SEPE XLS starts with D0 CF 11 E0 (CDFV2); anything else is the nav page
  if (d.buf[0] !== 0xd0 || d.buf[1] !== 0xcf)
    return { period, estado: 'ausente', motivo: 'la página de SEPE en lugar del XLS' }
  try {
    const snap = parse(d.buf, { municipio: MUNI, period })
    return snap
      ? { period, estado: 'leido', snap }
      : { period, estado: 'ilegible', motivo: `el XLS no trae la fila de ${MUNI}` }
  } catch (err) {
    return { period, estado: 'ilegible', motivo: err instanceof Error ? err.message : String(err) }
  }
}

export async function construirParo(deps: ParoDeps = {}): Promise<ResultadoParo> {
  const now = deps.now ?? new Date()
  const fetchImpl = deps.fetchImpl ?? fetch
  const esperar = deps.esperar ?? esperarDeVerdad
  const parse = deps.parse ?? parseSepeParoMonth
  const meses: MesParo[] = []
  let consecutiveNetFailures = 0
  // Walk back 24 months from now. A month that fails on its own never aborts
  // the walk: leerMes() turns every network or parse failure into a state, and
  // componerSerieParo() keeps that month's published row. The one exception:
  // MAX_CONSECUTIVE_NET_FAILURES months in a row with no complete answer means
  // WE are unreachable/blocked — walking the rest would only burn the
  // nightly's time budget.
  for (let back = 0; back < MESES_RECORRIDOS; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const mes = await leerMes(d.getFullYear(), d.getMonth(), fetchImpl, esperar, parse)
    meses.push(mes)
    if (mes.estado === 'leido') {
      const s = mes.snap
      console.log(`[paro] ${s.period}: ${s.total} total (${s.men}H / ${s.women}M)`)
    } else {
      const log = mes.estado === 'ausente' ? console.log : console.warn
      log(`[paro] ${mes.period}: ${mes.estado} — ${mes.motivo}`)
    }
    consecutiveNetFailures = mes.estado === 'sin-respuesta' ? consecutiveNetFailures + 1 : 0
    if (consecutiveNetFailures >= MAX_CONSECUTIVE_NET_FAILURES) {
      // Writing the partial walk would shrink the published series (same
      // reasoning as the 0-read guard below: an unreachable host is not a
      // data state). Keep yesterday's snapshot and red the run.
      const leidos = meses.filter((m) => m.estado === 'leido').length
      return {
        ok: false,
        motivo:
          `${consecutiveNetFailures} consecutive months unreachable at the network level — ` +
          `sepe.es is down or blocking this IP range; aborting the walk early ` +
          `(${leidos} months read, existing snapshot left untouched)`,
      }
    }
  }

  // Zero months read across the walk is never a real data state — it means
  // SEPE moved/blocked the feed. Refuse to rewrite yesterday's snapshot, even
  // though the previous rows could fill the whole series: that would be
  // yesterday's file with today's date (the silent-freeze failure mode).
  if (!meses.some((m) => m.estado === 'leido')) {
    return {
      ok: false,
      motivo: `0/${MESES_RECORRIDOS} months read — leaving the existing snapshot untouched`,
    }
  }

  const { series, stats } = componerSerieParo(meses, deps.previo ?? null)
  for (const a of stats.arrastrados) {
    console.warn(
      `[paro] ${a.period}: kept from the previous snapshot — not read this run (${a.estado}: ${a.motivo})`,
    )
  }
  return {
    ok: true,
    payload: {
      generatedAt: new Date().toISOString(),
      source: {
        platform: 'SEPE Muniacteco 20-45',
        pattern:
          'https://sepe.es/SiteSepe/…/municipios_20_45/<YEAR>/<MES>_<YEAR>/Muniacteco_20-45_COM.VALENCIANA.xls',
      },
      municipio: MUNI,
      latestPeriod: series[series.length - 1]?.period ?? null,
      latestTotal: series[series.length - 1]?.total ?? null,
      stats,
      series,
    },
  }
}
