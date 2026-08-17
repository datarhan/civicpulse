#!/usr/bin/env tsx
/**
 * Build public/data/ipc.json — el índice de precios con el que `/eficiencia`
 * deflacta sus series de coste.
 *
 *   Fuente : https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/24077
 *   Tabla  : INE 24077 · «Índice general nacional», mensual desde 1961
 *
 * Sin esto, las diez series de coste unitario de `/eficiencia` iban en euros
 * corrientes de 2014 a 2024, y el 22,8 % de inflación acumulada del periodo se
 * leía como si fuera gestión. Por qué el IPC y no el deflactor del PIB está
 * razonado en `src/scraper/ipc.ts`, que es donde lo va a buscar quien lo dude.
 *
 * La API es abierta, sin clave y responde en JSON. El payload son ~21 KB, así
 * que no hay caché en disco: no compensa gestionar frescura para eso.
 *
 * Usage: npm run scrape:ipc
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSerieIpc, construirSnapshot, FUENTE_URL } from '../src/scraper/ipc'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public/data/ipc.json')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
/** Meses a pedir. 300 cubre desde 2001, de sobra para las entregas de CESEL. */
const MESES = 300

async function main() {
  const rec = startRun('scrape-ipc', { mode: 'serie', getStats: () => NO_LLM_STATS })

  const url = `${FUENTE_URL}?nult=${MESES}`
  console.log(`[ipc] pidiendo ${MESES} meses al INE…`)
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`[ipc] HTTP ${res.status}`)
  const crudo = await res.json()

  const puntos = parseSerieIpc(crudo)
  if (puntos.length === 0) {
    // Un snapshot vacío publicado es peor que no publicar: dejaría a
    // compute:indicadores deflactando contra nada y a la página diciendo
    // «euros constantes» sobre cifras que no lo son.
    throw new Error('[ipc] la respuesta no trae ningún punto — no se sobrescribe el snapshot')
  }
  rec.attempt(puntos.length)

  const snapshot = construirSnapshot(puntos, new Date().toISOString())
  const anios = Object.keys(snapshot.medias).length
  if (anios < 10) {
    throw new Error(`[ipc] sólo ${anios} años completos; se esperaban al menos 10`)
  }
  // Los meses que no cierran un año no se promedian, y eso es una decisión, no
  // una pérdida: se declara como saltado para que el manifiesto cuadre.
  rec.judge(anios * 12)
  rec.skip('mes-de-anio-incompleto', puntos.length - anios * 12)

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  rec.finish()

  console.log(
    `[ipc] ${anios} años completos · ${snapshot.stats.desde} → ${snapshot.stats.hasta} · ` +
      `base 100 en ${snapshot.anioBase100 ?? 'sin identificar'}`,
  )
  console.log(`[ipc] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
