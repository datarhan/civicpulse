#!/usr/bin/env tsx
/**
 * Construye public/data/coste-esperado.json — el gasto observado contra el
 * esperado dada la población, en /laboratorio.
 *
 * Composición pura sobre lo que ya hay en disco: el libro CCAA-17 más
 * reciente de `.cache/cesel/ccaa/` parseado SIN `soloEntes` (toda la
 * comunidad, ~500 municipios) y el censo CONPREL (`conprel-cv.xls`) para la
 * población. Sin red y sin LLM; si falta la caché, el mensaje dice qué comando
 * la rellena, igual que scrape:coste-efectivo.
 *
 * El año NO se fija a mano: se toma el libro más reciente, para que una
 * entrega nueva no deje el snapshot describiendo la anterior sin decirlo.
 * Toda la política (mínimo muestral, sólo directa, anonimato de la muestra)
 * vive en src/scraper/coste-esperado.ts; esto lee, llama y escribe.
 *
 * Usage: npm run compute:coste-esperado
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCeselInforme } from '../src/scraper/coste-efectivo'
import { parseConprelRoster } from '../src/scraper/budget'
import {
  INE_PROPIO,
  MIN_MUESTRA,
  NIVEL_ALFA,
  analizarServicio,
} from '../src/scraper/coste-esperado'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CCAA_DIR = join(ROOT, '.cache/cesel/ccaa')
const CONPREL = join(ROOT, '.cache/cesel/conprel-cv.xls')
const OUT = join(ROOT, 'public/data/coste-esperado.json')

async function main() {
  let nombres: string[]
  try {
    nombres = await readdir(CCAA_DIR)
  } catch {
    throw new Error(
      `[coste-esperado] no hay libros en ${CCAA_DIR} — se rellenan con npm run fetch:cesel-ccaa`,
    )
  }
  const libros = nombres
    .map((n) => ({ n, m: n.match(/^cesel-ccaa17-(\d{4})\.xlsx$/) }))
    .filter((x) => x.m)
    .map((x) => ({ nombre: x.n, anio: Number(x.m![1]) }))
    .sort((a, b) => b.anio - a.anio)
  if (!libros.length) {
    throw new Error('[coste-esperado] la caché existe pero no trae ningún cesel-ccaa17-*.xlsx')
  }
  const libro = libros[0]

  const rec = startRun('compute-coste-esperado', { mode: 'compose', getStats: () => NO_LLM_STATS })

  const filas = parseCeselInforme(await readFile(join(CCAA_DIR, libro.nombre)), {
    anio: libro.anio,
    // Sin soloEntes, a propósito: la muestra es la comunidad entera.
  })
  if (!filas.length) throw new Error(`[coste-esperado] ${libro.nombre} parseó cero filas`)

  const roster = parseConprelRoster(await readFile(CONPREL))
  if (!roster.length) {
    throw new Error('[coste-esperado] el censo CONPREL vino vacío — sin población no hay recta')
  }
  const poblaciones = new Map(roster.map((m) => [m.ine, m.poblacion]))
  const propioEnCenso = poblaciones.has(INE_PROPIO)
  if (!propioEnCenso) {
    throw new Error('[coste-esperado] el censo no trae al municipio propio')
  }

  const especificaciones = Object.keys(SERVICIOS).map((programa) => {
    rec.attempt()
    const a = analizarServicio(programa, { filas, poblaciones })
    if (a.estado === 'publicada') rec.judge()
    else rec.skip(a.estado)
    return { ...a, label: SERVICIOS[programa].label }
  })

  const publicadas = especificaciones.filter((e) => e.estado === 'publicada')
  const insuficientes = especificaciones.filter((e) => e.estado === 'muestra-insuficiente')
  const sinPropia = especificaciones.filter((e) => e.estado === 'sin-declaracion-propia')
  rec.record('publicadas', publicadas.length)
  rec.record('municipiosCenso', roster.length)

  const salida = {
    generatedAt: new Date().toISOString(),
    fuente: {
      libro: libro.nombre,
      entrega: libro.anio,
      comunidad: 'Comunitat Valenciana',
      censo: 'CONPREL (población por municipio, censo vigente al descargarlo)',
      municipiosCenso: roster.length,
    },
    modelo: {
      impulsores: ['log(población)'],
      forma: 'recta de mínimos cuadrados sobre (ln población, ln coste), por servicio',
      intervalo: 'predicción analítica con t de Student, sin remuestreo',
      minMuestra: MIN_MUESTRA,
      nivelAlfa: NIVEL_ALFA,
      soloModo: 'directa',
      // Publicado junto al resultado por la misma razón que en la DEA: que la
      // negativa a nombrar municipios no se lea como opacidad. El método está
      // entero y cualquiera puede rehacer la tabla desde los libros del
      // ministerio.
      inePropio: INE_PROPIO,
    },
    especificaciones,
    stats: {
      especificaciones: especificaciones.length,
      publicadas: publicadas.length,
      insuficientes: insuficientes.length,
      sinDeclaracionPropia: sinPropia.length,
      entrega: libro.anio,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.finish()

  console.log(
    `[coste-esperado] entrega ${libro.anio} · ${roster.length} municipios en el censo · ` +
      `mínimo muestral ${MIN_MUESTRA}`,
  )
  for (const e of especificaciones) {
    const cab = `${e.programa.padEnd(14)} ${String(e.cobertura.incluidas).padStart(3)}/${String(
      e.cobertura.filas,
    ).padEnd(3)}`
    if (e.estado === 'publicada') {
      const p = e.propia!
      console.log(
        `  ${cab} β ${e.modelo!.beta.toFixed(2)} R² ${e.modelo!.r2.toFixed(2)}  ` +
          `observado ${Math.round(p.costeObservado).toLocaleString('es-ES')} € · ` +
          `esperado ${Math.round(p.esperado).toLocaleString('es-ES')} € · ×${p.razon.toFixed(2)}` +
          (p.dentroDeLoEsperado ? '  (dentro de la banda)' : '  FUERA DE LA BANDA'),
      )
    } else {
      console.log(`  ${cab} ${e.estado.toUpperCase()} — ${e.motivoEstado?.slice(0, 70)}…`)
    }
  }
  console.log(`[coste-esperado] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
