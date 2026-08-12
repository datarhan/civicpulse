#!/usr/bin/env tsx
/**
 * Build public/data/indicadores.json — el panel de coste unitario por servicio.
 *
 * Composición pura sobre coste-efectivo.json: sin red, sin LLM. Toda la
 * política vive en src/scraper/indicadores.ts; esto sólo lee, llama y escribe.
 *
 * Usage: npm run compute:indicadores
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirIndicadores, situacion } from '../src/scraper/indicadores'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const IN = join(ROOT, 'public/data/coste-efectivo.json')
const OUT = join(ROOT, 'public/data/indicadores.json')

async function main() {
  const fuente = JSON.parse(await readFile(IN, 'utf8'))
  const anioBase = fuente.pares.anio as number

  const rec = startRun('compute-indicadores', {
    mode: 'compose',
    getStats: () => NO_LLM_STATS,
  })

  const snap = construirIndicadores({
    municipio: fuente.municipio,
    pares: fuente.pares,
    anioBase,
    citaUrl: fuente.source.volcado,
  })

  // Attempted = every service in the registry. Judged = the ones that produced
  // a ratio. Everything else is skipped WITH ITS REASON, so a page that shows
  // four cards instead of thirteen can say which seven the source blocked.
  for (const i of snap.indicadores) {
    rec.attempt()
    const s = situacion(i)
    if (s === 'con-ratio') rec.judge()
    else rec.skip(s)
  }
  rec.record('comparables', snap.universe.comparables)

  const salida = {
    generatedAt: new Date().toISOString(),
    conjunto: fuente.pares.conjunto,
    anioBase,
    source: fuente.source,
    cobertura: fuente.cobertura,
    ...snap,
    stats: {
      indicadores: snap.indicadores.length,
      conRatio: snap.universe.conRatio,
      comparables: snap.universe.comparables,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(salida, null, 2) + '\n')
  rec.finish()

  console.log(
    `[indicadores] ${snap.indicadores.length} servicios · ${snap.universe.conRatio} con cociente · ` +
      `${snap.universe.comparables} comparables · entrega ${anioBase}`,
  )
  for (const i of snap.indicadores) {
    const s = situacion(i)
    const cifra =
      i.valor === null
        ? `— (${i.numerador.motivo ?? i.denominador.motivo ?? s})`
        : `${i.valor.toFixed(2)} ${i.unidad}`
    console.log(
      `  ${i.servicio!.padEnd(15)} ${cifra.padStart(22)}  ${i.pares ? `pares n=${i.pares.n} p${i.pares.percentil}` : ''}`,
    )
  }
  if (Object.keys(SERVICIOS).length !== snap.indicadores.length) {
    throw new Error('[indicadores] el registro y la salida no cuadran')
  }
  console.log(`[indicadores] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
