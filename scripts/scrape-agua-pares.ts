#!/usr/bin/env tsx
/**
 * Construye public/data/agua-pares.json — los municipios de la banda del coste
 * efectivo (cv-15k-40k) leídos en SINAC, para dos preguntas que el nitrato de
 * Riba-roja no contesta solo:
 *
 *  1. ¿Es mucho o poco? La banda del nitrato necesita el MISMO dato en cada
 *     municipio: la media anual de los análisis completos de su red principal.
 *     Así que de la red principal se lee el detalle de cada análisis completo;
 *     de las demás, sólo la ficha.
 *  2. ¿Es raro un «no apta», y lo es en una red de otro gestor? Cuenta todas
 *     las redes de cada municipio, con su gestor (`noAptaEnPares`).
 *
 * Archivo, como agua.json: SINAC enseña los últimos boletines y cada pasada
 * funde lo leído con lo guardado. El detalle de un boletín se lee una vez (si
 * ya está archivado con su nitrato, no se vuelve a pedir).
 *
 * Semanal, no diario: son unas 400 peticiones por pasada a un ministerio para
 * un dato que cambia con cada análisis completo, dos o tres veces al año. Si el
 * fichero tiene menos de 7 días la pasada no hace nada y lo dice; `--forzar`
 * la obliga.
 *
 * Un municipio que falla se salta con su motivo (`fallidos`); si fallan más de
 * un 20 %, la pasada sale 1 y el fichero de la semana anterior sigue.
 *
 * Usage: npm run scrape:agua-pares [-- --forzar]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fusionarBoletines,
  redPrincipal,
  type Boletin,
  type MunicipioAgua,
} from '../src/scraper/sinac'
import { INE_PROPIO } from '../src/scraper/dea-especificacion'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'
import { ENTRADA, abrirSesion, leerDetalle, leerFicha, leerRedes } from './lib/sinac-fetch'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/sinac/boletines')
const OUT = join(ROOT, 'public/data/agua-pares.json')
const DIAS_ENTRE_PASADAS = 7
const TECHO_FALLIDOS = 0.2
const TECHO_SIN_CALIFICAR = 0.1

async function main() {
  const rec = startRun('scrape-agua-pares', { mode: 'fetch', getStats: () => NO_LLM_STATS })
  const hoy = new Date().toISOString().slice(0, 10)
  const previo = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null
  if (previo && !process.argv.includes('--forzar')) {
    const dias = (Date.parse(hoy) - Date.parse(previo.consultadoEl)) / 86_400_000
    if (dias < DIAS_ENTRE_PASADAS) {
      rec.skip('pasada-reciente')
      rec.finish()
      console.log(
        `[agua-pares] consultado el ${previo.consultadoEl} (hace ${dias} días): la pasada es ` +
          `semanal, no hace nada hoy. --forzar para obligarla.`,
      )
      return
    }
  }
  await mkdir(CACHE, { recursive: true })

  const cesel = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const banda = new Map<string, string>()
  for (const f of cesel.pares?.filas ?? []) if (f.ine !== INE_PROPIO) banda.set(f.ine, f.nombre)
  const conjunto: string = cesel.pares?.conjunto ?? 'cv-15k-40k'
  if (banda.size === 0) throw new Error('[agua-pares] coste-efectivo.json no trae banda')
  rec.owe(banda.size)

  const archivo = new Map<string, MunicipioAgua>(
    (previo?.municipios ?? []).map((m: MunicipioAgua) => [m.ine, m]),
  )
  const sesion = await abrirSesion()
  const municipios: MunicipioAgua[] = []
  const fallidos: { ine: string; nombre: string; motivo: string }[] = []
  let detalles = 0

  for (const [ine, nombre] of banda) {
    rec.attempt()
    try {
      const { redes, denMunicipio } = await leerRedes(sesion, ine)
      if (redes.length === 0) throw new Error('SINAC no devuelve ninguna red')
      const fichas = []
      for (const r of redes) {
        const { ficha } = await leerFicha(sesion, ine, denMunicipio, r)
        fichas.push({ red: r, ficha })
      }
      const redesM = fichas.map(({ red, ficha }) => ({
        idRed: red.idRed,
        nombre: red.nombre,
        gestor: ficha.gestor,
        poblacion: ficha.suministro.reduce((s, x) => s + (x.poblacion ?? 0), 0),
      }))
      const principal = redPrincipal({ redes: redesM })
      const guardados = archivo.get(ine)?.boletines ?? []
      const leidos: Boletin[] = []
      for (const { red, ficha } of fichas) {
        for (const b of ficha.boletines) {
          const boletin: Boletin = { ...b, idRed: red.idRed }
          // De la red principal, el nitrato de cada completo: es el dato de la banda.
          if (principal && red.idRed === principal.idRed && b.tipo === 'completo') {
            const ya = guardados.find((x) => x.id === b.id && x.parametros?.length)
            if (ya) boletin.parametros = ya.parametros
            else {
              const d = await leerDetalle(sesion, ine, denMunicipio, red, b, CACHE)
              if (d.descargado) detalles++
              boletin.parametros = d.parametros.filter((p) => p.nombre === 'Nitrato')
            }
          }
          leidos.push(boletin)
        }
      }
      municipios.push({
        ine,
        nombre: denMunicipio || nombre,
        redes: redesM,
        boletines: fusionarBoletines(guardados, leidos),
      })
      rec.judge()
    } catch (err) {
      const motivo = (err as Error).message ?? String(err)
      fallidos.push({ ine, nombre, motivo })
      rec.skip('municipio-fallido')
      console.warn(`[agua-pares] ${ine} ${nombre}: ${motivo}`)
      // Lo archivado de ese municipio no se pierde por una mala noche.
      const guardado = archivo.get(ine)
      if (guardado) municipios.push(guardado)
    }
  }

  // El techo de fallback de la regla 1: una calificación que no sabemos leer
  // no cuenta ni como apta ni como no apta, así que si crecen, el recuento de
  // «no apta» de la banda mide menos de lo que dice.
  const todos = municipios.flatMap((m) => m.boletines)
  const sinLeer = todos.filter((b) => !b.calificacion)
  if (todos.length && sinLeer.length / todos.length >= TECHO_SIN_CALIFICAR) {
    rec.finish({ exitCode: 1 })
    throw new Error(
      `[agua-pares] ${sinLeer.length} de ${todos.length} boletines con una calificación que no ` +
        `sabemos leer: ${[...new Set(sinLeer.map((b) => b.calificacionTexto))].join(' · ')} — ` +
        'añadirla a FRASES en src/scraper/sinac.ts',
    )
  }

  if (fallidos.length / banda.size > TECHO_FALLIDOS) {
    rec.finish({ exitCode: 1 })
    throw new Error(
      `[agua-pares] fallaron ${fallidos.length} de ${banda.size} municipios: no se publica una ` +
        'banda a medias; sigue el fichero anterior',
    )
  }

  const salida = {
    generatedAt: new Date().toISOString(),
    consultadoEl: hoy,
    conjunto,
    fuente: {
      nombre: 'SINAC · Sistema de Información Nacional de Aguas de Consumo (Ministerio de Sanidad)',
      url: ENTRADA,
      atribucion: `Fuente: Ministerio de Sanidad, SINAC. Consultado el ${hoy}; cada boletín lleva su fecha de toma.`,
    },
    municipios: municipios.sort((a, b) => a.ine.localeCompare(b.ine)),
    fallidos,
    stats: {
      banda: banda.size,
      leidos: banda.size - fallidos.length,
      fallidos: fallidos.length,
      redes: municipios.reduce((s, m) => s + m.redes.length, 0),
      boletines: todos.length,
      sinCalificacionLeida: sinLeer.length,
      detallesDescargados: detalles,
      peticiones: sesion.peticiones(),
    },
  }
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.record('detalles-descargados', detalles)
  rec.finish()
  console.log(
    `[agua-pares] ${salida.stats.leidos}/${banda.size} municipios · ${salida.stats.redes} redes · ` +
      `${salida.stats.boletines} boletines · ${detalles} detalles · ${sesion.peticiones()} peticiones` +
      (fallidos.length ? ` · ${fallidos.length} fallidos` : ''),
  )
  console.log(`[agua-pares] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
