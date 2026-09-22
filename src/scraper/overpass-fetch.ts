/**
 * Shared OSM Overpass fetcher — mirror rotation + 429/5xx retry with backoff,
 * under ONE time budget per process.
 *
 * Both scrape-geo.ts and scrape-metro-network.ts hit Overpass, which routinely
 * load-sheds with HTTP 429 under contention. The primary (overpass-api.de) and
 * two mirrors run the same software against the same planet, so any one
 * answering suffices. This lives next to boe-fetch.ts / tenders-ted-fetch.ts as
 * a node-only network sibling — pure fetch, no parser logic — so the two
 * scrapers share one definition of "talk to Overpass" instead of drifting
 * copies. Uses only universal APIs (fetch / AbortSignal / setTimeout), so it is
 * safe wherever fetch exists.
 *
 * La escalera tenía techo por intento (180 s) y ninguno por proceso: 180 s ×
 * 3 intentos × 3 espejos = 27 min por CONSULTA, y `scrape:geo` hace tres,
 * dentro de un paso de la nocturna de 22 minutos para treinta y cinco
 * adaptadores. El 22-09-2026 (ejecución 35710338380) overpass-api.de devolvía
 * 504 y kumi.systems se quedaba colgado los 180 s enteros: `scrape:civic-poi`
 * tardó 6 min 15 s en lo que diez días antes tardaba 5 s, y el paso murió con
 * once segundos de `check:officials-corrections` en marcha. Cuatro de las
 * nueve últimas noches, igual. Dos reglas desde entonces:
 *
 *   1. Cada intento espera lo que el servidor prometió —el `[timeout:N]` de
 *      la propia consulta— más una holgura de cola. Esperar 180 s a un
 *      servidor que ya dijo que se rinde a los 60 es pagar tres veces la
 *      misma respuesta.
 *   2. Todas las consultas de un proceso comparten UN presupuesto
 *      (`OVERPASS_BUDGET_MS`), y nada se programa más allá de él: ni un
 *      intento, ni la espera del backoff, ni el `Retry-After` del servidor.
 *      El peor caso de un adaptador es el presupuesto, no la suma de sus
 *      techos.
 */

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Holgura de cola por encima del `[timeout:N]` que declara la consulta. */
export const QUEUE_ALLOWANCE_MS = 30_000
/** Techo por intento cuando la consulta no declara `[timeout:N]` (el de antes). */
const DEFAULT_CEILING_MS = 180_000
/** Presupuesto total de Overpass por proceso: un adaptador, todas sus consultas. */
export const OVERPASS_BUDGET_MS = 5 * 60_000
/** Por debajo de esto no vale la pena programar otro intento. */
const MIN_ATTEMPT_MS = 5_000

/**
 * Techo cliente de un intento: lo que el servidor prometió más la cola. Una
 * opción explícita manda; sin `[timeout:]` en la consulta, el techo antiguo.
 */
export function clientCeilingMs(ql: string, override?: number): number {
  if (typeof override === 'number') return override
  const m = /\[timeout:(\d+)\]/.exec(ql)
  return m ? Number(m[1]) * 1_000 + QUEUE_ALLOWANCE_MS : DEFAULT_CEILING_MS
}

export interface OverpassOptions {
  /** Log prefix, e.g. 'geo' or 'metro-network'. */
  label?: string
  /** Per-attempt client-side ceiling; default derived from the query's `[timeout:N]`. */
  timeoutMs?: number
  /** Retries per endpoint before rotating to the next mirror. */
  maxAttempts?: number
}

/** Un `fetch` al que se le dice cuánto puede durar ESTE intento. */
export type OverpassFetchImpl = (
  url: string,
  init: RequestInit,
  attemptMs: number,
) => Promise<Response>

export interface OverpassFetcherDeps {
  /** Presupuesto total del proceso; el reloj arranca en la primera consulta. */
  budgetMs?: number
  fetchImpl?: OverpassFetchImpl
  sleepImpl?: (ms: number) => Promise<void>
  now?: () => number
}

const realFetch: OverpassFetchImpl = (url, init, attemptMs) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(attemptMs) })

/**
 * Construye un fetcher con su propio presupuesto. El módulo exporta uno con
 * el presupuesto de defecto (`fetchOverpass`); las pruebas montan el suyo con
 * reloj y red fingidos.
 */
export function createOverpassFetcher(deps: OverpassFetcherDeps = {}) {
  const budgetMs = deps.budgetMs ?? OVERPASS_BUDGET_MS
  const fetchImpl = deps.fetchImpl ?? realFetch
  const sleepImpl = deps.sleepImpl ?? sleep
  const now = deps.now ?? Date.now
  // El reloj arranca en la PRIMERA consulta, no al cargar el módulo: lo que
  // se acota es lo que se pasa hablando con Overpass, no la vida del proceso.
  let started: number | null = null
  let attemptsTotal = 0

  /**
   * POST an Overpass QL query and return the raw response body. Rotates through
   * OVERPASS_ENDPOINTS; within each, retries 429 / 5xx (honoring Retry-After,
   * else exponential backoff). Other 4xx won't self-heal, so jumps straight to
   * the next mirror. Throws when every mirror is exhausted — or, antes, cuando
   * el presupuesto del proceso no da para otro intento.
   */
  return async function fetchOverpass(ql: string, opts: OverpassOptions = {}): Promise<string> {
    const label = opts.label ?? 'overpass'
    const ceilingMs = clientCeilingMs(ql, opts.timeoutMs)
    const maxAttempts = opts.maxAttempts ?? 3
    if (started === null) started = now()
    const deadline = started + budgetMs
    const remaining = () => deadline - now()
    const rendirse = (lastErr: string) =>
      new Error(
        `Overpass [${label}]: presupuesto de ${Math.round(budgetMs / 1_000)} s agotado tras ` +
          `${attemptsTotal} intento(s) (${Math.round((now() - started!) / 1_000)} s desde la ` +
          `primera consulta del proceso) — último: ${lastErr}`,
      )
    // Dormir sólo si al despertar queda con qué intentar; si no, rendirse
    // ANTES de dormir: un `Retry-After: 600` no puede sacar la pasada del
    // presupuesto.
    const esperar = async (ms: number, lastErr: string) => {
      if (remaining() - ms < MIN_ATTEMPT_MS) throw rendirse(lastErr)
      await sleepImpl(ms)
    }

    const body = new URLSearchParams({ data: ql }).toString()
    const headers = {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }
    let lastErr = 'no attempt made'
    for (const endpoint of OVERPASS_ENDPOINTS) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const left = remaining()
        if (left < MIN_ATTEMPT_MS) throw rendirse(lastErr)
        // Un intento nunca dura más de lo que queda.
        const attemptMs = Math.min(ceilingMs, left)
        attemptsTotal += 1
        let res: Response
        try {
          res = await fetchImpl(endpoint, { method: 'POST', headers, body }, attemptMs)
        } catch (err) {
          // Network error / timeout — retryable on the same endpoint.
          lastErr = `${endpoint}: ${String(err).slice(0, 120)}`
          console.warn(`[${label}] ${lastErr} — attempt ${attempt}/${maxAttempts}`)
          if (attempt < maxAttempts) await esperar(attempt * 3_000, lastErr)
          continue
        }
        if (res.ok) return res.text()
        lastErr = `${endpoint} -> HTTP ${res.status}`
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'))
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 3_000
          console.warn(
            `[${label}] ${lastErr} — backoff ${Math.round(waitMs / 1_000)}s, attempt ${attempt}/${maxAttempts}`,
          )
          if (attempt < maxAttempts) await esperar(waitMs, lastErr)
          continue
        }
        console.warn(`[${label}] ${lastErr} — non-retryable, trying next mirror`)
        break
      }
    }
    throw new Error(
      `Overpass [${label}]: all ${OVERPASS_ENDPOINTS.length} mirror(s) exhausted — last: ${lastErr}`,
    )
  }
}

/** El fetcher del proceso: un presupuesto compartido por todas sus consultas. */
export const fetchOverpass = createOverpassFetcher()
