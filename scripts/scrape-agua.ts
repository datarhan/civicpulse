#!/usr/bin/env tsx
/**
 * Construye public/data/agua.json — la calidad del agua de consumo de
 * Riba-roja, red a red, desde la consulta ciudadana de SINAC (Ministerio de
 * Sanidad).
 *
 * La consulta es un formulario con sesión y sin descarga, y sólo enseña los
 * últimos boletines de cada sección (10 de control, 10 completos). Por eso
 * este snapshot es un ARCHIVO: cada pasada lee lo que la página enseña hoy y
 * lo funde con lo ya guardado (`fusionarBoletines`), así que lo que el
 * ministerio deja de enseñar no se pierde. Si la pasada deja de correr, el
 * archivo deja de crecer y `check:cadence` lo dice antes de que los diez de
 * control roten fuera de la página.
 *
 * Peticiones: una de entrada (cookie de sesión), una por las redes, una por
 * red, y una por cada análisis COMPLETO que no esté ya en caché — un boletín
 * notificado no cambia, así que su detalle se descarga una vez. Pausa entre
 * peticiones; el User-Agent dice quién pregunta.
 *
 * Fallar antes que publicar a medias: sin redes, con una red que no responde
 * o con la calificación sin reconocer en más de un 10 % de los boletines, la
 * pasada sale 1 y el fichero de ayer sigue en su sitio.
 *
 * Reutilización: aviso legal del Ministerio de Sanidad — permitida citando la
 * fuente y la fecha de la última actualización; el snapshot lleva ambas.
 *
 * Usage: npm run scrape:agua
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CALIFICACIONES, fusionarBoletines, type Boletin } from '../src/scraper/sinac'
import { INE_PROPIO } from '../src/scraper/dea-especificacion'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'
import { ENTRADA, abrirSesion, leerDetalle, leerFicha, leerRedes } from './lib/sinac-fetch'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/sinac')
const OUT = join(ROOT, 'public/data/agua.json')
/** El techo de fallback: más de esto sin reconocer es que cambió el vocabulario. */
const TECHO_SIN_CALIFICAR = 0.1

async function main() {
  const rec = startRun('scrape-agua', { mode: 'fetch', getStats: () => NO_LLM_STATS })
  const hoy = new Date().toISOString().slice(0, 10)
  await mkdir(join(CACHE, 'boletines'), { recursive: true })
  await mkdir(join(CACHE, hoy), { recursive: true })

  const previo = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null
  const archivados: Boletin[] = previo?.boletines ?? []

  const sesion = await abrirSesion()
  const { redes, denMunicipio: den } = await leerRedes(sesion, INE_PROPIO)
  if (redes.length === 0) throw new Error('[agua] SINAC no devolvió ninguna red para el municipio')
  const denMunicipio = den || 'RIBA-ROJA DE TÚRIA'

  const leidos: Boletin[] = []
  const fichas = []
  let detallesNuevos = 0
  for (const r of redes) {
    rec.attempt()
    const { html: fichaHtml, ficha } = await leerFicha(sesion, INE_PROPIO, denMunicipio, r)
    // La ficha de hoy, cruda: es lo único que no se puede volver a pedir mañana.
    await writeFile(join(CACHE, hoy, `red-${r.idRed}.html`), fichaHtml)

    for (const b of ficha.boletines) {
      const boletin: Boletin = { ...b, idRed: r.idRed }
      if (b.tipo === 'completo') {
        const enArchivo = archivados.find((x) => x.id === b.id && x.parametros?.length)
        if (enArchivo) boletin.parametros = enArchivo.parametros
        else {
          const d = await leerDetalle(
            sesion,
            INE_PROPIO,
            denMunicipio,
            r,
            b,
            join(CACHE, 'boletines'),
          )
          if (d.descargado) detallesNuevos++
          boletin.parametros = d.parametros
        }
      }
      leidos.push(boletin)
    }
    const { boletines: _b, seccionesSinReconocer: _s, parametros, ...resto } = ficha
    void _b
    void _s
    fichas.push({
      idRed: r.idRed,
      nombre: r.nombre,
      ...resto,
      // De los ~660 parámetros de la lista legal, la mayoría llega «Sin datos
      // en SINAC». Se guardan los que traen cifra y se cuentan los que no: el
      // recuento dice lo mismo que 470 filas vacías, sin pesar medio mega.
      parametros: parametros.filter((p) => p.valor !== null),
      parametrosSinCifra: parametros.filter((p) => p.valor === null).length,
      poblacion: ficha.suministro.reduce((s, x) => s + (x.poblacion ?? 0), 0),
    })
    rec.judge()
  }

  const boletines = fusionarBoletines(archivados, leidos)
  const porCalificacion = Object.fromEntries(CALIFICACIONES.map((c) => [c, 0])) as Record<
    string,
    number
  >
  let sinReconocer = 0
  for (const b of boletines) {
    if (b.calificacion) porCalificacion[b.calificacion]++
    else sinReconocer++
  }
  if (sinReconocer / boletines.length >= TECHO_SIN_CALIFICAR) {
    const frases = [
      ...new Set(boletines.filter((b) => !b.calificacion).map((b) => b.calificacionTexto)),
    ]
    throw new Error(
      `[agua] ${sinReconocer} de ${boletines.length} boletines con una calificación que no ` +
        `sabemos leer: ${frases.join(' · ')} — añadirla a FRASES en src/scraper/sinac.ts`,
    )
  }
  const completos = boletines.filter((b) => b.tipo === 'completo')
  const sinDetalle = completos.filter((b) => !b.parametros?.length).length
  if (sinDetalle) rec.skip('completo-sin-detalle', sinDetalle)
  rec.record('boletines-archivados', archivados.length)
  rec.record('boletines-leidos', leidos.length)
  rec.record('detalles-descargados', detallesNuevos)

  const salida = {
    generatedAt: new Date().toISOString(),
    consultadoEl: hoy,
    fuente: {
      nombre: 'SINAC · Sistema de Información Nacional de Aguas de Consumo (Ministerio de Sanidad)',
      url: ENTRADA,
      atribucion: `Fuente: Ministerio de Sanidad, SINAC. Consultado el ${hoy}; cada boletín lleva su fecha de toma.`,
      licencia:
        'Aviso legal del Ministerio de Sanidad: reutilización permitida citando la fuente y la fecha de la última actualización, sin desnaturalizar la información',
    },
    municipio: { ine: INE_PROPIO, nombre: denMunicipio },
    redes: fichas,
    boletines,
    stats: {
      redes: fichas.length,
      boletines: boletines.length,
      boletinesNuevos: boletines.length - archivados.length,
      porCalificacion,
      sinReconocer,
      completos: completos.length,
      completosSinDetalle: sinDetalle,
      archivoDesde: boletines.at(-1)?.fecha ?? null,
    },
  }
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.finish()
  console.log(
    `[agua] ${fichas.length} redes · ${boletines.length} boletines (${salida.stats.boletinesNuevos} nuevos, ` +
      `${detallesNuevos} detalles descargados) · ${porCalificacion['no-apta']} «no apta» · ` +
      `${sinReconocer} sin reconocer`,
  )
  console.log(`[agua] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
