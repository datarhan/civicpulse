#!/usr/bin/env tsx
/**
 * ¿Ha leído alguien las páginas públicas, y hace cuánto?
 *
 * Barato y determinista: no llama a ningún modelo. Mira lo que la caché de
 * `review:surfaces` ya guarda por ruta —hash, señalamientos y fecha— y responde
 * dos cosas. Está pensado para entrar en la lista de `check:*` que
 * `scripts/monitor-health.ts` recorre, de modo que lo que encuentre salga por
 * el digest de Telegram que ya existe en vez de por un canal nuevo que nadie
 * mire.
 *
 * Quien LEE de verdad es `scripts/review-sweep.sh`, el barrido nocturno. Esto
 * sólo comprueba que ese barrido esté ocurriendo y que lo que encontró no se
 * haya quedado sin arreglar.
 *
 *   npm run check:surfaces
 *
 * Sale ≠ 0 —y por tanto habla— cuando alguna ruta arrastra señalamientos vivos,
 * o cuando alguna lleva más de `DIAS_FRESCURA` sin leerse, o nunca.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { construirGrafoRutas } from './lib/route-graph'
import { medirFrescura, parteFrescura, DIAS_FRESCURA } from '../src/scraper/surface-freshness'
import type { ReviewCacheEntry } from '../src/scraper/reader-review'

const CACHE = resolve('.review-cache.json')

/** Las mismas 27 que barre el nocturno: del grafo, no de una lista. */
function rutasPublicas(): string[] {
  return construirGrafoRutas(resolve('src')).rutas.filter(
    (r) => !r.includes(':') && r !== '/curator',
  )
}

function main() {
  const rutas = rutasPublicas()
  // Un fichero ausente NO es un fichero vacío que da todo por bueno: es cero
  // revisiones, y `medirFrescura` lo cuenta como «ninguna leída».
  const cache: Record<string, string | ReviewCacheEntry> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, 'utf8'))
    : {}

  const f = medirFrescura(rutas, cache, new Date())
  const parte = parteFrescura(f)
  const leidas = rutas.length - f.sinLeer.length - f.rancias.length

  if (!parte) {
    // El recuento va SIEMPRE, también cuando todo está bien. «✓ sin avisos» sin
    // cifra es indistinguible de un control que no midió nada, que es la avería
    // que este fichero existe para no cometer.
    console.log(
      `[check-surfaces] ${rutas.length} ruta(s) públicas, todas leídas en los últimos ` +
        `${DIAS_FRESCURA} días y sin señalamientos vivos`,
    )
    return
  }

  console.error(`[check-surfaces] ${parte}`)
  console.error(
    `[check-surfaces] ${leidas} de ${rutas.length} al día · ` +
      'el barrido es scripts/review-sweep.sh (cron 07:30); a mano: npm run review:surfaces -- --all',
  )
  process.exitCode = 1
}

main()
