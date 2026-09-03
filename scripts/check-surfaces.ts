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
import { construirGrafoRutas, rutasRevisables } from './lib/route-graph'
import { medirFrescura, parteFrescura, DIAS_FRESCURA } from '../src/scraper/surface-freshness'
import {
  validarDescartes,
  descartesHuerfanos,
  type RegistroDescartes,
} from '../src/scraper/surface-dismissals'
import type { ReviewCacheEntry } from '../src/scraper/reader-review'

const CACHE = resolve('.review-cache.json')
const DESCARTES = resolve('review-dismissals.json')

function main() {
  // Las claves con estado cuentan como superficie propia. Si el barrido las
  // lee y este parte no las conoce, nunca se reportarían rancias: la prosa de
  // las capas volvería a envejecer sin que nada lo dijera, que es el agujero
  // que estas claves vienen a tapar.
  const rutas = rutasRevisables(construirGrafoRutas(resolve('src')))
  // Un fichero ausente NO es un fichero vacío que da todo por bueno: es cero
  // revisiones, y `medirFrescura` lo cuenta como «ninguna leída».
  const cache: Record<string, string | ReviewCacheEntry> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, 'utf8'))
    : {}

  // Un registro ilegible NO se trata como «sin descartes»: eso silenciaría el
  // hecho de que alguien lo rompió, y el fichero existe justo para no silenciar
  // por accidente.
  const descartes: RegistroDescartes | null = existsSync(DESCARTES)
    ? validarDescartes(JSON.parse(readFileSync(DESCARTES, 'utf8')))
    : null

  const f = medirFrescura(rutas, cache, new Date(), descartes)
  const parte = parteFrescura(f)
  const leidas = rutas.length - f.sinLeer.length - f.rancias.length

  // Descartes que hoy no corresponden a ningún señalamiento vivo. Siguen
  // armados por si esa frase vuelve.
  // «Sobran» era el veredicto, y no se sigue de lo que esta comprobación
  // sabe. Un descarte sin señalamiento vivo puede ser dos cosas muy
  // distintas: la frase desapareció de la página, o la frase SIGUE ahí y el
  // modelo no la ha vuelto a señalar en esta pasada. Sólo la primera sobra.
  //
  // Medido el 2026-08-29 sobre los tres que llevaban semanas anunciándose
  // como sobrantes: los tres seguían publicados palabra por palabra —
  // `indicadores-friccion.ts:538` y `QuejasSpendOverlap.jsx:80` y `:109`—,
  // así que borrarlos habría tirado tres juicios humanos y devuelto los tres
  // avisos en el siguiente barrido. El aviso decía «sobran» y casi se le
  // hace caso.
  //
  // Se dice lo que se sabe, y lo que hay que comprobar antes de tocar nada.
  const vivos = new Map(
    rutas.map((r) => [
      r,
      (cache[r] && typeof cache[r] === 'object' ? cache[r].findings : []) ?? [],
    ]),
  )
  const huerfanos = descartesHuerfanos(descartes, vivos)
  if (huerfanos.length > 0) {
    console.error(
      `[check-surfaces] ${huerfanos.length} descarte(s) sin señalamiento vivo hoy ` +
        `(siguen armados; comprueba si la frase sigue publicada antes de quitarlos): ` +
        huerfanos.map((d) => `${d.route} «${d.quote.slice(0, 40).replace(/\n/g, ' ')}»`).join(', '),
    )
  }

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
