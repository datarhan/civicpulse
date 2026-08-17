#!/usr/bin/env tsx
/**
 * Build public/data/criminalidad.json — infracciones penales del municipio,
 * como RESULTADO junto a la tarjeta de policía local de /eficiencia.
 *
 *   Fuente : Portal Estadístico de Criminalidad (Ministerio del Interior)
 *            /sec/jaxiPx/files/_px/es/csv/DatosBalanceAnt/l0/{ID}.csv
 *   Población: INE, Cifras oficiales de población (DPOP), tablas 2856/2865/2903
 *
 * Serie anual = balances T4 (acumulado enero–diciembre) desde 2021; el balance
 * de cada año trae también el anterior, así que 2020 sale del de 2021. La tasa
 * por mil usa la población DEL MISMO AÑO — una tasa de 2021 con padrón de 2025
 * arrastraría el crecimiento del pueblo dentro del crimen.
 *
 * Pares: los municipios de la banda cv-15k-40k que superan 20.000 habitantes
 * (los únicos que el portal publica). Es un N PROPIO y menor que el de las
 * bandas de coste, y el snapshot lo declara — reutilizar el N de coste sería
 * mentir por vecindad.
 *
 * Reutilización: Ley 37/2007; atribución obligatoria en el snapshot.
 *
 * Usage: npm run scrape:criminalidad [-- --refetch]
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBalanceMunicipal,
  unirBalances,
  normalizaNombre,
  type MunicipioCrimen,
} from '../src/scraper/criminalidad'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public/data/criminalidad.json')
const CACHE = join(ROOT, '.cache/criminalidad')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const INE = '46214'
const BASE = 'https://estadisticasdecriminalidad.ses.mir.es/sec/jaxiPx/files/_px/es/csv'
const ATRIBUCION = 'Origen de los datos: Portal Estadístico de Criminalidad'
/** El primer año con tabla municipal >20.000 hab. */
const PRIMER_ANIO = 2021

/** ID determinista del balance T4 (nivel 3 = municipios). */
const idBalanceT4 = (anio: number) => `${anio - 2010}09${String(3 * 3 + 3).padStart(3, '0')}`

/** Tablas DPOP del INE, una por provincia de la Comunitat. */
const TABLAS_POBLACION = [2856, 2865, 2903]

async function existe(p: string) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function traer(url: string, cachePath: string, refetch: boolean): Promise<string> {
  if (!refetch && (await existe(cachePath))) return readFile(cachePath, 'utf8')
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  // El servidor declara ISO-8859-15 pero los bytes son UTF-8 con BOM: se lee
  // el buffer y se decodifica como UTF-8, que es lo que de verdad hay.
  const texto = Buffer.from(await res.arrayBuffer()).toString('utf8')
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, texto)
  return texto
}

interface SerieIne {
  Nombre?: string
  COD?: string
  Data?: { Anyo?: number; Valor?: number }[]
}

/** Población por municipio (nombre normalizado → año → habitantes). */
async function poblaciones(refetch: boolean): Promise<Map<string, Record<number, number>>> {
  const porNombre = new Map<string, Record<number, number>>()
  for (const tabla of TABLAS_POBLACION) {
    const texto = await traer(
      `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${tabla}?nult=8`,
      join(CACHE, `dpop-${tabla}.json`),
      refetch,
    )
    const series = JSON.parse(texto) as SerieIne[]
    for (const s of series) {
      // Una serie por municipio×sexo; sólo el Total, y el nombre viene en la
      // propia cadena («Riba-roja de Túria. Total. Total habitantes…»).
      const nombre = s.Nombre ?? ''
      if (!/\. Total\. Total habitantes/.test(nombre)) continue
      const municipio = nombre.split('.')[0].trim()
      const registro = porNombre.get(normalizaNombre(municipio)) ?? {}
      for (const d of s.Data ?? []) {
        if (typeof d.Anyo === 'number' && typeof d.Valor === 'number') registro[d.Anyo] = d.Valor
      }
      porNombre.set(normalizaNombre(municipio), registro)
    }
  }
  return porNombre
}

function percentil(ordenada: number[], p: number): number {
  if (!ordenada.length) return 0
  const pos = (ordenada.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? ordenada[lo] : ordenada[lo] + (pos - lo) * (ordenada[hi] - ordenada[lo])
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  const rec = startRun('scrape-criminalidad', { mode: 'balances', getStats: () => NO_LLM_STATS })

  const ahora = new Date().getFullYear()
  const balances: { anioActual: number; filas: MunicipioCrimen[] }[] = []
  // El balance T4 de un año se publica ya entrado el siguiente: se intenta
  // hasta ahora−1 y un 404 del último no es fallo, es calendario.
  for (let anio = PRIMER_ANIO; anio < ahora; anio++) {
    rec.attempt()
    try {
      const texto = await traer(
        `${BASE}/DatosBalanceAnt/l0/${idBalanceT4(anio)}.csv`,
        join(CACHE, `balance-${anio}T4.csv`),
        refetch,
      )
      balances.push({ anioActual: anio, filas: parseBalanceMunicipal(texto, { anioActual: anio }) })
      rec.judge()
      console.log(`[criminalidad] balance ${anio}T4: ${balances.at(-1)!.filas.length} municipios`)
    } catch (e) {
      if (anio === ahora - 1) {
        rec.skip('t4-aun-no-publicado')
        console.warn(`[criminalidad] balance ${anio}T4 aún no publicado (${String(e)})`)
      } else {
        throw e
      }
    }
  }
  if (!balances.length) throw new Error('[criminalidad] ningún balance obtenido')

  const municipios = unirBalances(balances)
  const pob = await poblaciones(refetch)

  // La banda: los de cv-15k-40k que superan 20.000 hab (los únicos publicados).
  const ce = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const banda: { ine: string; nombre: string }[] = ce.pares.miembros.filter(
    (m: { poblacion: number }) => m.poblacion > 20_000,
  )

  const porIne = new Map(municipios.filter((m) => m.ine).map((m) => [m.ine!, m]))
  const porNombre = new Map(municipios.map((m) => [normalizaNombre(m.nombre), m]))
  const resolver = (ine: string, nombre: string) =>
    porIne.get(ine) ?? porNombre.get(normalizaNombre(nombre)) ?? null

  const propio = resolver(INE, 'Riba-roja de Túria')
  if (!propio) throw new Error(`[criminalidad] el municipio ${INE} no está en los balances`)

  const tasa = (m: MunicipioCrimen, nombre: string, anio: number): number | null => {
    const total = m.totales[anio]
    const habitantes =
      pob.get(normalizaNombre(m.nombre))?.[anio] ?? pob.get(normalizaNombre(nombre))?.[anio]
    if (typeof total !== 'number' || !habitantes) return null
    return (1000 * total) / habitantes
  }

  const anios = Object.keys(propio.totales)
    .map(Number)
    .sort((a, b) => a - b)
  const ultimo = anios[anios.length - 1]

  const serie = anios
    .map((anio) => ({
      anio,
      total: propio.totales[anio],
      tasaPorMil: tasa(propio, 'Riba-roja de Túria', anio),
    }))
    .filter((p) => typeof p.total === 'number')

  // Pares del último año, en tasa: los de la banda >20k con total y población.
  const tasasPares: number[] = []
  let sinDato = 0
  for (const b of banda) {
    if (b.ine === INE) continue
    const m = resolver(b.ine, b.nombre)
    const t = m ? tasa(m, b.nombre, ultimo) : null
    if (t === null) {
      sinDato++
      continue
    }
    tasasPares.push(t)
  }
  tasasPares.sort((a, b) => a - b)
  const tasaPropia = tasa(propio, 'Riba-roja de Túria', ultimo)
  const pares =
    tasasPares.length >= 15 && tasaPropia !== null
      ? {
          conjunto: 'cv-15k-40k · >20.000 hab',
          n: tasasPares.length,
          percentil: Math.round(
            (100 * tasasPares.filter((v) => v <= tasaPropia).length) / tasasPares.length,
          ),
          p25: percentil(tasasPares, 0.25),
          mediana: percentil(tasasPares, 0.5),
          p75: percentil(tasasPares, 0.75),
        }
      : null

  const snapshot = {
    generatedAt: new Date().toISOString(),
    fuente: {
      nombre: 'Portal Estadístico de Criminalidad · Ministerio del Interior',
      url: 'https://estadisticasdecriminalidad.ses.mir.es/publico/portalestadistico/',
      atribucion: ATRIBUCION,
    },
    municipio: { ine: INE, nombre: 'Riba-roja de Túria' },
    ultimo: {
      anio: ultimo,
      total: propio.totales[ultimo],
      tasaPorMil: tasaPropia,
    },
    serie,
    pares,
    stats: {
      anios: serie.length,
      desde: serie[0]?.anio ?? null,
      hasta: ultimo,
      paresConDato: tasasPares.length,
      paresSinDato: sinDato,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  rec.finish()
  console.log(
    `[criminalidad] ${serie.length} años (${serie[0]?.anio}–${ultimo}) · último ${propio.totales[ultimo]} ` +
      `infracciones · tasa ${tasaPropia?.toFixed(1)}‰ · pares ${pares ? `n=${pares.n} p${pares.percentil}` : 'insuficientes'}`,
  )
  console.log(`[criminalidad] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
