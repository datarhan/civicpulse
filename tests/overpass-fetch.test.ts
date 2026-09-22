import { describe, it, expect } from 'vitest'
import {
  clientCeilingMs,
  createOverpassFetcher,
  OVERPASS_BUDGET_MS,
  OVERPASS_ENDPOINTS,
  QUEUE_ALLOWANCE_MS,
} from '../src/scraper/overpass-fetch'

/**
 * La escalera de reintentos de Overpass no tenía techo, y el paso de la
 * nocturna sí: 22 minutos para treinta y cinco adaptadores en serie.
 *
 * Medido en la ejecución 35710338380 (2026-09-22): overpass-api.de devolvía
 * 504 y el espejo de kumi.systems se quedaba colgado; `scrape:civic-poi`
 * tardó 6 min 15 s en una consulta que el 12-09 había tardado 5 s, y el paso
 * agotó su tope once segundos después de arrancar `check:officials-corrections`
 * — que no colgaba: era el proceso que estaba vivo cuando cayó el hacha.
 * Cuatro de las nueve últimas noches murieron igual.
 *
 * El peor caso de la escalera era 180 s × 3 intentos × 3 espejos = 27 min POR
 * CONSULTA, y `scrape:geo` hace tres. Un tope por intento sin tope por
 * proceso no acota nada. De ahí las dos reglas de abajo:
 *
 *   1. Cada intento espera lo que el servidor prometió (`[timeout:N]` de la
 *      propia consulta) más una holgura de cola — no 180 s a un servidor que
 *      ya dijo que se rinde a los 60.
 *   2. Todas las consultas de un proceso comparten UN presupuesto, y un
 *      intento nunca se programa más allá de él: ni la espera del backoff ni
 *      el `Retry-After` del servidor pueden sacar la pasada del presupuesto.
 */

type Paso =
  | { status: number; tookMs: number; retryAfter?: number }
  | { hang: true }
  | { neterr: true; tookMs: number }

function montar(pasos: Paso[], budgetMs = OVERPASS_BUDGET_MS) {
  let t = 0
  const llamadas: { url: string; attemptMs: number; at: number }[] = []
  const esperas: number[] = []
  let i = 0
  const fetchImpl = async (url: string, _init: RequestInit, attemptMs: number) => {
    llamadas.push({ url, attemptMs, at: t })
    const paso = pasos[Math.min(i, pasos.length - 1)]
    i += 1
    if ('hang' in paso) {
      t += attemptMs
      throw new Error('TimeoutError: The operation was aborted due to timeout')
    }
    if ('neterr' in paso) {
      t += Math.min(paso.tookMs, attemptMs)
      throw new Error('fetch failed')
    }
    if (paso.tookMs > attemptMs) {
      t += attemptMs
      throw new Error('TimeoutError: The operation was aborted due to timeout')
    }
    t += paso.tookMs
    const headers = new Headers()
    if (paso.retryAfter) headers.set('retry-after', String(paso.retryAfter))
    return new Response(paso.status === 200 ? '{"elements":[]}' : 'nope', {
      status: paso.status,
      headers,
    })
  }
  const sleepImpl = async (ms: number) => {
    esperas.push(ms)
    t += ms
  }
  const fetchOverpass = createOverpassFetcher({ budgetMs, fetchImpl, sleepImpl, now: () => t })
  return { fetchOverpass, llamadas, esperas, reloj: () => t }
}

const QL = '[out:json][timeout:60];node(1);out;'

describe('overpass-fetch — el techo de cada intento sale de la propia consulta', () => {
  it('espera lo que el servidor prometió más la holgura de cola', () => {
    expect(clientCeilingMs('[out:json][timeout:60];')).toBe(60_000 + QUEUE_ALLOWANCE_MS)
    expect(clientCeilingMs('[out:json][timeout:90];')).toBe(90_000 + QUEUE_ALLOWANCE_MS)
    expect(clientCeilingMs('[out:json][timeout:30];')).toBe(30_000 + QUEUE_ALLOWANCE_MS)
  })
  it('sin [timeout:] en la consulta conserva el techo antiguo, y una opción explícita manda', () => {
    expect(clientCeilingMs('[out:json];node(1);out;')).toBe(180_000)
    expect(clientCeilingMs('[out:json][timeout:60];', 12_345)).toBe(12_345)
  })
})

describe('overpass-fetch — un presupuesto por proceso que ningún intento puede rebasar', () => {
  it('con los dos espejos colgados se rinde AL PRESUPUESTO, no a la suma de sus techos', async () => {
    const { fetchOverpass, llamadas, reloj } = montar([{ hang: true }], 300_000)
    await expect(fetchOverpass(QL, { label: 't' })).rejects.toThrow(/presupuesto/)
    // Sin presupuesto: 9 intentos × 90 s + backoffs = 837 s. Con él: 300 s.
    expect(reloj()).toBeLessThanOrEqual(300_000)
    // Y el último intento se recortó a lo que quedaba, no a su techo.
    const ultimo = llamadas[llamadas.length - 1]
    expect(ultimo.attemptMs).toBeLessThan(90_000)
    expect(ultimo.at + ultimo.attemptMs).toBeLessThanOrEqual(300_000)
    // Se rotó a un segundo espejo antes de rendirse: el presupuesto acota, no
    // impide la rotación. (Al tercero no se llega: 3 × 90 s + backoffs del
    // primero ya son 279 de los 300.)
    const espejos = new Set(llamadas.map((l) => l.url)).size
    expect(espejos).toBeGreaterThanOrEqual(2)
    expect(espejos).toBeLessThanOrEqual(OVERPASS_ENDPOINTS.length)
  })

  it('el presupuesto es del PROCESO: la segunda consulta hereda lo que gastó la primera', async () => {
    const { fetchOverpass, reloj } = montar(
      [{ hang: true }, { status: 200, tookMs: 50_000 }, { hang: true }],
      300_000,
    )
    // Primera consulta: un intento colgado (90 s) + 3 s de backoff + 50 s ok.
    await expect(fetchOverpass(QL, { label: 'a' })).resolves.toContain('elements')
    expect(reloj()).toBe(143_000)
    // Segunda: sólo le quedan 157 s de presupuesto, no 300 nuevos.
    await expect(fetchOverpass(QL, { label: 'b' })).rejects.toThrow(/presupuesto/)
    expect(reloj()).toBeLessThanOrEqual(300_000)
  })

  it('un Retry-After mayor que lo que queda no se espera: se rinde antes de dormir', async () => {
    const { fetchOverpass, esperas, reloj } = montar(
      [{ status: 429, tookMs: 1_000, retryAfter: 600 }],
      120_000,
    )
    await expect(fetchOverpass(QL, { label: 't' })).rejects.toThrow(/presupuesto/)
    expect(esperas).toEqual([])
    expect(reloj()).toBeLessThan(120_000)
  })

  it('cada fetcher nuevo estrena presupuesto, y el que exporta el módulo lleva el de defecto', async () => {
    const a = montar([{ hang: true }], 100_000)
    await expect(a.fetchOverpass(QL)).rejects.toThrow(/presupuesto/)
    const b = montar([{ status: 200, tookMs: 1_000 }], 100_000)
    await expect(b.fetchOverpass(QL)).resolves.toContain('elements')
    expect(OVERPASS_BUDGET_MS).toBe(5 * 60_000)
  })

  it('el mensaje de rendición dice cuánto se gastó y cuántos intentos hubo', async () => {
    const { fetchOverpass } = montar([{ hang: true }], 100_000)
    await expect(fetchOverpass(QL, { label: 'civic-poi' })).rejects.toThrow(
      /\[civic-poi\].*presupuesto.*100 s.*intento/,
    )
  })
})
