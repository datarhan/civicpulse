/**
 * Procesos selectivos del Ayuntamiento → public/data/procesos-selectivos.json.
 *
 * La lista corta el texto de cada enlace a 80 caracteres con «…». Para cada
 * enlace cortado se pide la página del proceso, con pausa, y se toma su título
 * entero (`completaTitulo`). Si la página falla, se reutiliza el título entero
 * de la instantánea anterior para esa misma URL; si no lo hay, se queda el
 * cortado. El recuento dice cuántos se hicieron de cada manera.
 *
 * Una lista sin procesos no se escribe (`exigeProcesos`): el raspado falla y
 * la instantánea anterior sigue publicada.
 *
 * Usage: npm run scrape:procesos-selectivos
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseProcesosList,
  exigeProcesos,
  estaCortado,
  tituloDePagina,
  completaTitulo,
  classify,
  type ProcesoSelectivo,
} from '../src/scraper/procesos-selectivos'
import {
  fetchProcesosHtml,
  fetchPaginaDeProceso,
  PROCESOS_URL,
} from '../src/scraper/procesos-selectivos-fetch'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public/data/procesos-selectivos.json',
)
const PAUSA_MS = 1500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Los títulos enteros de la instantánea anterior, por URL. */
async function titulosAnteriores(): Promise<Map<string, ProcesoSelectivo>> {
  const out = new Map<string, ProcesoSelectivo>()
  if (!existsSync(OUT)) return out
  try {
    const snap = JSON.parse(await readFile(OUT, 'utf8')) as { procesos?: ProcesoSelectivo[] }
    for (const p of snap.procesos || []) if (p.tituloDe === 'pagina') out.set(p.url, p)
  } catch {
    // Una instantánea ilegible no tiene títulos que prestar.
  }
  return out
}

async function main() {
  const html = await fetchProcesosHtml()
  if (!html) throw new Error('procesos-selectivos: list page fetch failed')
  const lista = exigeProcesos(parseProcesosList(html))
  const anteriores = await titulosAnteriores()

  const sinCompletar: { id: string; url: string; motivo: string }[] = []
  let enteros = 0
  let completados = 0
  let reutilizados = 0
  const procesos: ProcesoSelectivo[] = []
  for (const p of lista) {
    if (!estaCortado(p.titulo)) {
      enteros++
      procesos.push(p)
      continue
    }
    await sleep(PAUSA_MS)
    const pagina = await fetchPaginaDeProceso(p.url)
    if ('error' in pagina) {
      const anterior = anteriores.get(p.url)
      if (anterior) {
        reutilizados++
        procesos.push({
          ...p,
          titulo: anterior.titulo,
          tipo: classify(anterior.titulo),
          tituloDe: 'pagina',
        })
      } else {
        sinCompletar.push({ id: p.id, url: p.url, motivo: pagina.error })
        procesos.push(p)
      }
      console.warn(
        `[procesos] página ${p.url} falló (${pagina.error}) — ${anterior ? 'título anterior' : 'se queda cortado'}`,
      )
      continue
    }
    const r = completaTitulo(p, tituloDePagina(pagina.html))
    if (r.resultado === 'completado') completados++
    else sinCompletar.push({ id: p.id, url: p.url, motivo: r.resultado })
    procesos.push(r.proceso)
  }

  const cortados = lista.length - enteros
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: PROCESOS_URL,
        // Lo que se hizo con cada título, por separado: un enlace cortado que
        // no se completó no se cuenta como hecho.
        titulos: { enteros, cortados, completados, reutilizados, sinCompletar },
        procesos,
      },
      null,
      2,
    ),
  )
  console.log(
    `wrote ${procesos.length} procesos selectivos — títulos: ${enteros} enteros en la lista, ${cortados} cortados (${completados} completados de su página, ${reutilizados} del raspado anterior, ${sinCompletar.length} siguen cortados)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
