#!/usr/bin/env tsx
/**
 * Construye public/data/reciclaje.json — el corte 2022 de recogida selectiva.
 *
 * Fuente: WFS del ICV (GVA), capa 0503_Residuos,
 * `ms:TasasGeneracion.Municipios_wfs`, CC BY 4.0. UNA edición machine-readable
 * (la posterior sólo existe en un visor Power BI sin datos descargables), así
 * que esto es un corte transversal fechado, no una serie — y la cadencia del
 * snapshot es `manual` con presupuesto largo.
 *
 * La banda de comparación es la del coste efectivo (cv-15k-40k) restringida a
 * quien tiene tasa calculable, con su n declarado — nunca el n del coste.
 *
 * Usage: npm run scrape:reciclaje [-- --refetch]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTasasResiduos, tasaSelectiva } from '../src/scraper/reciclaje'
import { INE_PROPIO } from '../src/scraper/dea-especificacion'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/residuos/tasas-municipios.csv')
const OUT = join(ROOT, 'public/data/reciclaje.json')
const URL_WFS =
  'https://terramapas.icv.gva.es/0503_Residuos?service=WFS&request=GetFeature&version=2.0.0&typenames=ms:TasasGeneracion.Municipios_wfs&outputformat=csv'

async function csv(refetch: boolean): Promise<string> {
  if (!refetch && existsSync(CACHE)) {
    console.log('[reciclaje] CSV desde caché')
    return readFile(CACHE, 'utf8')
  }
  console.log('[reciclaje] descargando la capa del ICV (~17 MB)…')
  const res = await fetch(URL_WFS, {
    headers: { 'User-Agent': 'CivicPulse/1.0 (civic monitor Riba-roja; slutchenko@gmail.com)' },
  })
  if (!res.ok) throw new Error(`[reciclaje] WFS respondió ${res.status}`)
  const texto = await res.text()
  if (!texto.startsWith('WKT,') && !texto.includes('codinemun')) {
    throw new Error('[reciclaje] la respuesta no parece el CSV de la capa — ¿cambió el WFS?')
  }
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, texto)
  return texto
}

async function main() {
  const rec = startRun('scrape-reciclaje', { mode: 'fetch', getStats: () => NO_LLM_STATS })
  const filas = parseTasasResiduos(await csv(process.argv.includes('--refetch')))
  if (filas.length < 400) {
    throw new Error(`[reciclaje] sólo ${filas.length} municipios — la capa cambió de forma`)
  }
  rec.attempt()

  const propio = filas.find((f) => f.ine === INE_PROPIO)
  if (!propio) throw new Error('[reciclaje] el municipio propio no está en la capa')
  const tasaPropia = tasaSelectiva(propio)
  if (!tasaPropia) throw new Error('[reciclaje] el municipio propio no tiene tasa calculable')

  // La edición no la declara la capa: se estableció midiendo (habitantes del
  // fichero = padrón INE 2022). Si una edición nueva llega, esta igualdad se
  // rompe y ESTE control lo dice en vez de publicar «2022» sobre otro año.
  if (propio.habitantes !== 23050) {
    throw new Error(
      `[reciclaje] los habitantes del fichero (${propio.habitantes}) ya no son el padrón 2022 ` +
        '(23.050): puede haber edición nueva — verificar el año antes de publicar',
    )
  }

  const cesel = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const banda = new Set<string>(
    (cesel.pares?.filas ?? []).map((f: { ine: string }) => f.ine as string),
  )
  banda.add(INE_PROPIO)
  const conjunto: string = cesel.pares?.conjunto ?? 'cv-15k-40k'

  const bandaConTasa = filas
    .filter((f) => banda.has(f.ine))
    .map((f) => ({ f, t: tasaSelectiva(f) }))
    .filter((x): x is { f: (typeof filas)[0]; t: NonNullable<ReturnType<typeof tasaSelectiva>> } =>
      Boolean(x.t),
    )
  const vals = bandaConTasa.map((x) => x.t.pct).sort((a, b) => a - b)
  const q = (p: number) => {
    const i = (vals.length - 1) * p
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (i - lo)
  }
  const pares =
    vals.length >= 15
      ? {
          conjunto: `${conjunto} · con tasa calculable en la capa`,
          n: vals.length,
          percentil: Math.round(
            (100 * vals.filter((v) => v <= tasaPropia.pct).length) / vals.length,
          ),
          p25: q(0.25),
          mediana: q(0.5),
          p75: q(0.75),
        }
      : null

  const salida = {
    generatedAt: new Date().toISOString(),
    fuente: {
      nombre: 'Institut Cartogràfic Valencià / GVA — capa 0503_Residuos (WFS)',
      url: 'https://terramapas.icv.gva.es/0503_Residuos',
      licencia: 'CC BY 4.0',
      atribucion: 'Institut Cartogràfic Valencià · Generalitat Valenciana',
      edicion: 2022,
      comprobacionEdicion:
        'la capa no declara el año; los habitantes del fichero coinciden con el padrón INE 2022 (Riba-roja: 23.050), y el scraper falla si esa igualdad se rompe',
    },
    upstream: {
      status: 'frozen-2022',
      nota: 'las ediciones posteriores sólo se publican en un visor Power BI sin datos descargables',
    },
    municipio: {
      ine: propio.ine,
      nombre: propio.nombre,
      habitantes: propio.habitantes,
      consorcio: propio.consorcio,
      fracciones: {
        rumTn: propio.rumTn,
        forsTn: propio.forsTn,
        vidrioTn: propio.vidrioTn,
        eellTn: propio.eellTn,
        pycTn: propio.pycTn,
      },
      tasa: tasaPropia,
    },
    pares,
    stats: {
      municipios: filas.length,
      conTasa: filas.filter((f) => tasaSelectiva(f)).length,
      bandaConTasa: vals.length,
      edicion: 2022,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.judge()
  rec.finish()
  console.log(
    `[reciclaje] ${filas.length} municipios · banda con tasa ${vals.length} · ` +
      `Riba-roja ${tasaPropia.pct.toFixed(2)} % selectiva (p${pares?.percentil ?? '—'})`,
  )
  console.log(`[reciclaje] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
