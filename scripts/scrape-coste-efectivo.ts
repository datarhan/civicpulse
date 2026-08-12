#!/usr/bin/env tsx
/**
 * Build public/data/coste-efectivo.json — el coste efectivo de los servicios
 * (art. 116 ter LRSAL) de Riba-roja, más la banda de pares `cv-15k-40k`.
 *
 *   Volcado nacional : https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx
 *   Consulta         : https://serviciostelematicosext.hacienda.gob.es/sgcief/Cesel/Consulta/Consulta.aspx
 *   Norma            : Orden HAP/2075/2014 (BOE-A-2014-11492)
 *
 * WHAT THIS CAN AND CANNOT REACH, measured 2026-08-12
 *
 * The ministry publishes eleven entregas (2014–2024) but bulk-publishes only
 * ONE of them. `cesel-2021.xlsx` is a single GET and hands over the entire peer
 * universe. Every other entrega lives behind the consulta application, whose
 * result page carries no cost data at all — just a per-ente Excel download
 * button — and reconstructing that download as an HTTP POST returns the page
 * instead of the file. Other bulk filenames (cesel-2022.xlsx and friends) 404.
 *
 * So this adapter obtains 2021 and DECLARES the rest missing rather than
 * quietly shipping a one-point series that looks like a trend. The run
 * manifest separates «attempted» from «never attempted», which is rule 2 of
 * docs/DATA_INTEGRITY.md: a run must prove what it did and did not do.
 *
 * The workbook is ~45 MB. It is cached under .cache/cesel (gitignored), never
 * committed and never shipped: only the reduced snapshot below reaches
 * public/data.
 *
 * Usage: npm run scrape:coste-efectivo [-- --refetch]
 */
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCeselWorkbook, parseCeselInforme, type CesteRow } from '../src/scraper/coste-efectivo'
import { parseConprelRoster, type ConprelMunicipio } from '../src/scraper/budget'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public/data/coste-efectivo.json')
const CACHE_DIR = join(ROOT, '.cache/cesel')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const INE = '46214'
const CCAA_ID = 17

const CONJUNTO = 'cv-15k-40k'
const POP_MIN = 15_000
const POP_MAX = 40_000

const VOLCADO_URL = 'https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx'
const CONSULTA_URL =
  'https://serviciostelematicosext.hacienda.gob.es/sgcief/Cesel/Consulta/Consulta.aspx'
const ORDEN_URL = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2014-11492'

/** Entrega id → año, read off the consulta's own ddlEntrega. */
const ENTREGAS: Record<number, number> = {
  1: 2014,
  3: 2015,
  5: 2016,
  6: 2017,
  7: 2018,
  8: 2019,
  9: 2020,
  10: 2021,
  11: 2022,
  12: 2023,
  13: 2024,
}
const ANIO_VOLCADO = 2021

const conprelUrl = (year: number) =>
  'https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero' +
  `?CCAA=${CCAA_ID}&TipoDato=Presupuestos&Ejercicio=${year}&TipoPublicacion=Definitiva`

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function fetchBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.ms-excel,application/octet-stream,*/*' },
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** The 45 MB volcado, cached so iterating does not re-download it. */
async function volcado(refetch: boolean): Promise<Buffer> {
  const path = join(CACHE_DIR, 'cesel-2021.xlsx')
  if (!refetch && (await exists(path))) {
    console.log('[cesel] volcado desde caché')
    return readFile(path)
  }
  console.log('[cesel] descargando el volcado nacional (~45 MB)…')
  const buf = await fetchBuffer(VOLCADO_URL, 'cesel')
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(path, buf)
  return buf
}

/** Peer band, resolved once and committed, so a change to it shows in a diff. */
async function bandaDePares(): Promise<ConprelMunicipio[]> {
  const path = join(CACHE_DIR, 'conprel-cv.xls')
  let buf: Buffer
  if (await exists(path)) {
    buf = await readFile(path)
  } else {
    for (const year of [2025, 2024, 2023]) {
      try {
        buf = await fetchBuffer(conprelUrl(year), 'conprel')
        if (buf.slice(0, 15).toString().includes('<!DOCTYPE')) continue
        await mkdir(CACHE_DIR, { recursive: true })
        await writeFile(path, buf)
        break
      } catch {
        /* try the previous year */
      }
    }
  }
  const roster = parseConprelRoster(buf!)
  if (!roster.length) throw new Error('[cesel] el censo CONPREL vino vacío — sin banda de pares')
  const banda = roster.filter((m) => m.poblacion >= POP_MIN && m.poblacion <= POP_MAX)
  if (!banda.some((m) => m.ine === INE)) {
    const propio = roster.find((m) => m.ine === INE)
    if (propio) banda.push(propio)
  }
  return banda.sort((a, b) => a.ine.localeCompare(b.ine))
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  let filasMunicipio: CesteRow[] = []
  let filasPares: CesteRow[] = []
  let miembros: ConprelMunicipio[] = []

  const rec = startRun('scrape-coste-efectivo', {
    mode: 'volcado',
    // Deterministic adapter: no LLM anywhere in this pipeline.
    getStats: () => NO_LLM_STATS,
  })

  miembros = await bandaDePares()
  console.log(`[cesel] banda ${CONJUNTO}: ${miembros.length} municipios`)
  const soloEntes = new Set(miembros.map((m) => m.ine))

  // Every entrega is attempted in the sense that we know it exists and want it.
  for (const [id, anio] of Object.entries(ENTREGAS)) {
    rec.attempt()
    if (anio !== ANIO_VOLCADO) {
      // NOT «unchanged» and NOT «empty» — never obtained. The consulta's result
      // page has no cost data and its download button cannot be reconstructed
      // as a POST; see the header. Recorded so check:runs can see the hole.
      rec.skip('entrega-sin-volcado-publico')
      console.warn(`[cesel] entrega ${id} (${anio}): sin ruta de descarga — no obtenida`)
    }
  }

  const buf = await volcado(refetch)
  const todas = parseCeselWorkbook(buf, { anio: ANIO_VOLCADO, soloEntes })
  filasMunicipio = todas.filter((r) => r.ine === INE)
  filasPares = todas.filter((r) => r.ine !== INE)
  if (!filasMunicipio.length) throw new Error(`[cesel] el volcado no trae filas de ${INE}`)
  rec.judge()
  rec.record('filas', todas.length)

  // Informes por ente descargados a mano de la consulta (ver el encabezado):
  // son la única vía a las entregas que el ministerio no vuelca en masa.
  // Nombre: cesel-informe-<ine>-<anio>.xlsx
  const informesDir = join(CACHE_DIR, 'informes')
  let ficheros: string[] = []
  try {
    ficheros = (await readdir(informesDir)).filter((f) => f.endsWith('.xlsx'))
  } catch {
    /* sin informes descargados todavía */
  }
  for (const f of ficheros) {
    const m = /cesel-informe-(\d{5})-(\d{4})\.xlsx$/.exec(f)
    if (!m || m[1] !== INE) continue
    const anio = Number(m[2])
    if (anio === ANIO_VOLCADO) continue // el volcado manda para su propia entrega
    const filas = parseCeselInforme(await readFile(join(informesDir, f)), {
      anio,
      ine: INE,
      nombre: filasMunicipio[0].nombre,
    })
    if (!filas.length) {
      console.warn(`[cesel] ${f}: 0 filas, se ignora`)
      continue
    }
    filasMunicipio.push(...filas)
    rec.judge()
    console.log(`[cesel] entrega ${anio}: ${filas.length} filas desde informe por ente`)
  }
  filasMunicipio.sort((a, b) => a.anio - b.anio || a.programa.localeCompare(b.programa))

  const nombre = filasMunicipio[0].nombre
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: { volcado: VOLCADO_URL, consulta: CONSULTA_URL, orden: ORDEN_URL },
    municipio: { ine: INE, nombre, filas: filasMunicipio },
    pares: {
      conjunto: CONJUNTO,
      criterios: { ccaa: CCAA_ID, popMin: POP_MIN, popMax: POP_MAX, tipoEnte: 'AA' },
      resolvedAt: new Date().toISOString(),
      anio: ANIO_VOLCADO,
      miembros,
      filas: filasPares,
    },
    cobertura: {
      entregasPublicadas: Object.values(ENTREGAS).sort(),
      entregasObtenidas: [...new Set(filasMunicipio.map((f) => f.anio))].sort(),
      motivoFaltantes:
        'El ministerio sólo publica volcado masivo de 2021. El resto de entregas ' +
        'sólo salen del informe por ente de la aplicación de consulta, cuyo botón ' +
        'de descarga no se deja reconstruir como POST: hay que pedirlo desde un ' +
        'navegador y dejar el fichero en .cache/cesel/informes.',
    },
    stats: {
      anios: [...new Set(filasMunicipio.map((f) => f.anio))].sort(),
      filasMunicipio: filasMunicipio.length,
      filasPares: filasPares.length,
      miembros: miembros.length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  const { manifest } = rec.finish()
  console.log(
    `[cesel] ${filasMunicipio.length} filas propias · ${filasPares.length} de pares · ` +
      `${miembros.length} municipios · entregas ${manifest.judged}/${manifest.attempted}`,
  )
  console.log(`[cesel] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
