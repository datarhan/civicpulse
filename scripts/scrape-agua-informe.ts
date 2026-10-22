#!/usr/bin/env tsx
/**
 * Construye public/data/agua-informe-anual.json — las zonas de abastecimiento
 * de Riba-roja en el Anexo I del informe anual «Calidad del agua de consumo
 * humano en España» (Ministerio de Sanidad), año a año.
 *
 * Por qué existe: la consulta de SINAC enseña los últimos boletines de cada
 * red, y con eso publicamos «ninguno no apto en las redes de HIDRAQUA». El
 * anexo de 2021 cuenta 55 «no apto» de 485 en la zona principal. Este es el
 * recuento del año entero, del propio ministerio.
 *
 * Los años van en una lista explícita: cada informe se publica una vez al año
 * en una URL que no sigue un patrón estable (el último está en `docs/`, los
 * anteriores en `informesAnteriores/docs/`, y el nombre cambió de AGUAS a
 * AGUA). Añadir un año es añadir una línea, a propósito. 2019 y 2020 existen
 * pero su texto sale ofuscado de `pdftotext` (fuentes sin mapa): quedan en
 * `pendientes` con el motivo, no fuera sin decirlo.
 *
 * Necesita `pdftotext` (poppler). Caché de los PDF en .cache/agua-informe/.
 * Reutilización: «La totalidad o parte de esta publicación puede reproducirse
 * sin permiso adicional, siempre que se mencione la fuente» (cubierta).
 *
 * Usage: npm run scrape:agua-informe [-- --refetch]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ZONA_PRINCIPAL,
  definicionesAnexo,
  filasRibaRoja,
  formatoAnexo,
  serieZona,
} from '../src/scraper/informe-agua'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/agua-informe')
const OUT = join(ROOT, 'public/data/agua-informe-anual.json')
const UA = 'CivicPulse/1.0 (civic monitor Riba-roja; +https://github.com/datarhan/civicpulse)'
const B =
  'https://www.sanidad.gob.es/areas/sanidadAmbiental/calidadAguas/aguasConsumoHumano/publicaciones'

const INFORMES: { anio: number; url: string }[] = [
  { anio: 2021, url: `${B}/informesAnteriores/docs/2021_INFORME_ANUAL_AGUAS_DE_CONSUMO_ZA.pdf` },
  { anio: 2022, url: `${B}/informesAnteriores/docs/2022_INFORME_ANUAL_AGUAS_DE_CONSUMO_ZA.pdf` },
  { anio: 2023, url: `${B}/informesAnteriores/docs/2023_INFORME_ANUAL_AGUAS_DE_CONSUMO_ZA.pdf` },
  { anio: 2024, url: `${B}/docs/2024_INFORME_ANUAL_AGUA_DE_CONSUMO_ZA.pdf` },
]
const PENDIENTES = [
  {
    anio: 2019,
    motivo:
      'El anexo existe, pero su texto sale ofuscado al extraerlo (fuentes sin mapa): necesita OCR.',
  },
  {
    anio: 2020,
    motivo:
      'El anexo existe, pero su texto sale ofuscado al extraerlo (fuentes sin mapa): necesita OCR.',
  },
]

async function pdf(anio: number, url: string, refetch: boolean): Promise<string> {
  const ruta = join(CACHE, `${anio}.pdf`)
  if (refetch || !existsSync(ruta)) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`[agua-informe] ${anio}: ${url} respondió ${res.status}`)
    await writeFile(ruta, Buffer.from(await res.arrayBuffer()))
    await new Promise((r) => setTimeout(r, 1500))
  }
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', ruta, '-'], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  })
  if (r.error) throw new Error(`[agua-informe] pdftotext no disponible: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`[agua-informe] pdftotext: ${r.stderr}`)
  return r.stdout
}

async function main() {
  const rec = startRun('scrape-agua-informe', { mode: 'fetch', getStats: () => NO_LLM_STATS })
  await mkdir(CACHE, { recursive: true })
  const refetch = process.argv.includes('--refetch')
  rec.owe(INFORMES.length + PENDIENTES.length)
  rec.neverAttempt(PENDIENTES.length)

  const anios = []
  for (const { anio, url } of INFORMES) {
    rec.attempt()
    const texto = await pdf(anio, url, refetch)
    const formato = formatoAnexo(texto)
    const filas = filasRibaRoja(texto)
    // Un anexo sin ninguna fila de Riba-roja no es «sin datos»: es que la
    // lectura no casó. Mejor parar que publicar un año vacío.
    if (!filas.length) throw new Error(`[agua-informe] ${anio}: ninguna zona de Riba-roja`)
    anios.push({ anio, url, formato, definiciones: definicionesAnexo(texto), filas })
    rec.judge()
  }

  const salida = {
    generatedAt: new Date().toISOString(),
    fuente: {
      nombre: 'Calidad del agua de consumo humano en España · Anexo I (Ministerio de Sanidad)',
      url: INFORMES.at(-1)!.url,
      atribucion:
        'Fuente: Ministerio de Sanidad, informe anual de calidad del agua de consumo humano, Anexo I.',
      licencia:
        '«La totalidad o parte de esta publicación puede reproducirse sin permiso adicional, siempre que se mencione la fuente.»',
    },
    zonaPrincipal: ZONA_PRINCIPAL,
    anios,
    serieZonaPrincipal: serieZona(anios, ZONA_PRINCIPAL),
    pendientes: PENDIENTES,
    stats: {
      anios: anios.length,
      pendientes: PENDIENTES.length,
      filas: anios.reduce((s, a) => s + a.filas.length, 0),
    },
  }
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.finish()
  console.log(
    `[agua-informe] ${anios.length} años (${anios.map((a) => `${a.anio}: ${a.filas.length} zonas`).join(', ')}) · ` +
      `${PENDIENTES.length} pendientes de OCR`,
  )
  console.log(`[agua-informe] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
