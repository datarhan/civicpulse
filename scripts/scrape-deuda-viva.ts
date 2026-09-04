#!/usr/bin/env tsx
/**
 * Build public/data/deuda-viva.json — lo que el ayuntamiento DEBE, y desde
 * cuándo.
 *
 *   Fuente : https://www.hacienda.gob.es/es-ES/CDI/Paginas/SistemasFinanciacionDeuda/InformacionEELLs/DeudaViva.aspx
 *   Ficheros: /cdi/sist financiacion y deuda/informacioneells/<AAAA>/deuda-viva-ayuntamientos-<AAAA>12.xlsx
 *
 * No es el capítulo «Deuda pública» que ya enseña `/presupuesto`: aquél es el
 * dinero que el presupuesto aparta ESE año para atender deuda, y esto es el
 * saldo vivo a 31 de diciembre.
 *
 * Una entrega por ejercicio y ~715 KB cada una, así que se cachean en
 * `.cache/deuda-viva/` y una re-ejecución sólo pide los años que faltan. El
 * ministerio publica el ejercicio cerrado con meses de retraso: un año que aún
 * no existe se informa como `no-publicado`, que NO es lo mismo que un fallo de
 * red, y ninguno de los dos es un cero.
 *
 * Del resto de España sólo sale el REPARTO —cuántos municipios y en qué
 * cuantiles—, nunca un nombre. Publicar la tabla entera sería firmar una
 * afirmación sobre ocho mil ayuntamientos que no tienen derecho de réplica
 * aquí; el reparto sostiene la comparación sin nombrar a nadie.
 *
 * Usage: npm run scrape:deuda-viva [-- --refetch]
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseDeudaViva, repartoDeuda, percentilDeuda, urlsDeuda } from '../src/scraper/deuda-viva'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public/data/deuda-viva.json')
const CACHE = join(ROOT, '.cache/deuda-viva')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const INE = '46214'
const PRIMER_EJERCICIO = 2021
const PORTAL =
  'https://www.hacienda.gob.es/es-ES/CDI/Paginas/SistemasFinanciacionDeuda/InformacionEELLs/DeudaViva.aspx'

async function existe(p: string) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** El libro de un ejercicio: de caché, de red, o `null` si aún no está. */
async function libroDe(anio: number, refetch: boolean): Promise<Buffer | null> {
  const local = join(CACHE, `deuda-viva-${anio}.xlsx`)
  if (!refetch && (await existe(local))) return readFile(local)
  // Los dos nombres que usa el ministerio. Sólo se da por no publicado cuando
  // fallan LOS DOS: con un patrón solo, 2021 salía inexistente teniéndolo ahí.
  for (const url of urlsDeuda(anio)) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(180_000),
    })
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`[deuda-viva] ${anio}: HTTP ${res.status} en ${url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    // Un 200 puede traer una página de error en el cuerpo. Un xlsx empieza por
    // `PK`: si no, no es el libro, y guardarlo en caché envenenaría los runs
    // siguientes.
    if (buf.subarray(0, 2).toString() !== 'PK') {
      throw new Error(`[deuda-viva] ${anio}: la respuesta no es un xlsx (${buf.length} bytes)`)
    }
    await mkdir(CACHE, { recursive: true })
    await writeFile(local, buf)
    return buf
  }
  return null
}

/** Los saldos de TODOS los ayuntamientos del libro, en miles de euros. */
function saldosDe(buf: Buffer): number[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const hoja = wb.Sheets['Datos'] ?? wb.Sheets[wb.SheetNames[0]]
  if (!hoja) return []
  const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })
  return filas.map((f) => f[7]).filter((v): v is number => typeof v === 'number')
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  const rec = startRun('scrape-deuda-viva', { mode: 'series', getStats: () => NO_LLM_STATS })

  const serie: {
    ejercicio: number
    fecha: string
    deudaEuros: number
    reparto: ReturnType<typeof repartoDeuda>
    percentil: number | null
  }[] = []
  const noPublicados: number[] = []

  // Hasta el último ejercicio CERRADO: un año en curso no tiene saldo a 31 de
  // diciembre, y pedirlo para informar «no publicado» es ruido, no una medida.
  const ultimoCerrado = new Date().getFullYear() - 1
  for (let anio = PRIMER_EJERCICIO; anio <= ultimoCerrado; anio++) {
    rec.attempt()
    const buf = await libroDe(anio, refetch)
    if (!buf) {
      // El ejercicio todavía no lo ha publicado el ministerio. Es un desenlace
      // declarado, no un hueco silencioso ni un cero.
      noPublicados.push(anio)
      rec.skip('ejercicio-no-publicado')
      continue
    }
    const mio = parseDeudaViva(buf, { ineCode: INE })
    if (!mio) {
      rec.skip('municipio-ausente-en-la-entrega')
      continue
    }
    const saldos = saldosDe(buf)
    serie.push({
      ejercicio: mio.ejercicio,
      fecha: mio.fecha,
      deudaEuros: mio.deudaEuros,
      reparto: repartoDeuda(saldos),
      percentil: percentilDeuda(saldos, mio.deudaEuros),
    })
    rec.judge()
  }

  if (serie.length === 0) throw new Error('[deuda-viva] ninguna entrega dio dato: no se publica')

  const ultimo = serie[serie.length - 1]
  const primero = serie[0]
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: { portal: PORTAL, fichero: urlsDeuda(ultimo.ejercicio)[0] },
    municipio: { ine: INE, nombre: 'Riba-roja de Túria' },
    unidad: 'euros',
    ultimo,
    serie,
    // Los ejercicios que el ministerio aún no ha publicado, dichos por su
    // nombre: una serie que se corta sin explicar por qué se lee como un dato
    // que dejó de existir.
    noPublicados,
    stats: {
      puntos: serie.length,
      desde: primero?.ejercicio ?? null,
      hasta: ultimo?.ejercicio ?? null,
      variacionEuros: ultimo.deudaEuros - primero.deudaEuros,
      universo: ultimo.reparto?.n ?? 0,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  rec.finish()

  const eur = (n: number) => (n / 1e6).toFixed(2) + ' M€'
  console.log(
    `[deuda-viva] ${serie.length} ejercicio(s) · ${snapshot.stats.desde}–${snapshot.stats.hasta} · ` +
      `último ${eur(ultimo.deudaEuros)} · percentil ${ultimo.percentil} de ` +
      `${ultimo.reparto?.n} municipios (${ultimo.reparto?.aCero} a cero)` +
      (noPublicados.length ? ` · sin publicar: ${noPublicados.join(', ')}` : ''),
  )
  console.log(`[deuda-viva] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
