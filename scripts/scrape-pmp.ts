#!/usr/bin/env tsx
/**
 * Build public/data/pmp.json — el periodo medio de pago a proveedores de
 * Riba-roja, su serie desde 2018 y su posición entre todos los municipios que
 * publican con la misma norma.
 *
 *   Fuente : https://www.hacienda.gob.es/cdi/pmp/pmp-series-rd-1040-2017.xlsx
 *   Norma  : RD 1040/2017 · plazo legal 30 días (Ley 3/2004, LOEPSF art. 13.6)
 *
 * A diferencia de CESEL, aquí el ministerio SÍ publica la serie completa y a
 * todos los municipios en un único fichero, así que este es el único indicador
 * del panel que tiene a la vez umbral legal, tendencia y pares de verdad.
 *
 * El fichero pesa ~8 MB y se cachea en .cache/pmp (gitignorado). Sólo se
 * publica el municipio y el reparto por periodo: los seis mil y pico
 * ayuntamientos no se sirven —un listado así no es una tabla de referencia,
 * es un volcado— pero sus cifras sí sostienen los cuantiles.
 *
 * Usage: npm run scrape:pmp [-- --refetch]
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parsePmpWorkbook,
  distribucionEn,
  percentilEn,
  PLAZO_LEGAL_DIAS,
  type PmpDistribucion,
} from '../src/scraper/pmp'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public/data/pmp.json')
const CACHE = join(ROOT, '.cache/pmp/pmp-series.xlsx')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const URL = 'https://www.hacienda.gob.es/cdi/pmp/pmp-series-rd-1040-2017.xlsx'
const NORMA = 'https://www.boe.es/buscar/act.php?id=BOE-A-2017-15446'
const INE = '46214'

async function existe(p: string) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  const rec = startRun('scrape-pmp', { mode: 'series', getStats: () => NO_LLM_STATS })

  let buf: Buffer
  if (!refetch && (await existe(CACHE))) {
    console.log('[pmp] serie desde caché')
    buf = await readFile(CACHE)
  } else {
    console.log('[pmp] descargando la serie (~8 MB)…')
    const res = await fetch(URL, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) throw new Error(`[pmp] HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, buf)
  }

  const { municipios } = parsePmpWorkbook(buf)
  const mio = municipios.find((m) => m.ine === INE)
  if (!mio) throw new Error(`[pmp] la serie no trae al municipio ${INE}`)

  // Un punto por trimestre declarado, cada uno con su reparto nacional: así la
  // tendencia y la comparación salen de la misma pasada y no pueden divergir.
  const serie = mio.serie.map((p) => {
    rec.attempt()
    const dist = distribucionEn(municipios, p.periodo)
    const pct = percentilEn(municipios, p.periodo, p.dias)
    if (dist) rec.judge()
    else rec.skip('periodo-sin-reparto')
    return { periodo: p.periodo, dias: p.dias, percentil: pct, distribucion: dist }
  })

  const ultimo = serie[serie.length - 1]
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: { serie: URL, norma: NORMA, hoja: 'Tabla 6.3' },
    plazoLegalDias: PLAZO_LEGAL_DIAS,
    municipio: { ine: INE, nombre: mio.nombre },
    ultimo,
    serie,
    stats: {
      puntos: serie.length,
      desde: serie[0]?.periodo ?? null,
      hasta: ultimo?.periodo ?? null,
      universo: (ultimo?.distribucion as PmpDistribucion | null)?.n ?? 0,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  rec.finish()

  console.log(
    `[pmp] ${serie.length} trimestres · ${snapshot.stats.desde} → ${snapshot.stats.hasta} · ` +
      `último ${ultimo.dias.toFixed(1)} días (límite ${PLAZO_LEGAL_DIAS}) · ` +
      `percentil ${ultimo.percentil} de ${ultimo.distribucion?.n} municipios`,
  )
  console.log(`[pmp] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
