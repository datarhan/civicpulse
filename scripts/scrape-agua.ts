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
import {
  CALIFICACIONES,
  fusionarBoletines,
  parseBoletin,
  parseDetalleRed,
  parseRedes,
  type Boletin,
} from '../src/scraper/sinac'
import { INE_PROPIO } from '../src/scraper/dea-especificacion'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/sinac')
const OUT = join(ROOT, 'public/data/agua.json')
const BASE = 'https://sinac.sanidad.gob.es/CiudadanoWeb/ciudadano'
const ENTRADA = `${BASE}/informacionAbastecimientoActionEntrada.do`
const UA = 'CivicPulse/1.0 (civic monitor Riba-roja; +https://github.com/datarhan/civicpulse)'
const PAUSA_MS = 1200
/** El techo de fallback: más de esto sin reconocer es que cambió el vocabulario. */
const TECHO_SIN_CALIFICAR = 0.1

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

let cookie = ''
async function pedir(url: string, form?: Record<string, string>): Promise<string> {
  await esperar(PAUSA_MS)
  const res = await fetch(url, {
    method: form ? 'POST' : 'GET',
    headers: {
      'User-Agent': UA,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const nuevas = res.headers.getSetCookie?.() ?? []
  if (nuevas.length) cookie = nuevas.map((c) => c.split(';')[0]).join('; ')
  if (!res.ok) throw new Error(`[agua] ${url} respondió ${res.status}`)
  // La cabecera dice iso-8859-1; el cuerpo es UTF-8 (comprobado el 22-10-2026).
  const html = new TextDecoder('utf-8').decode(await res.arrayBuffer())
  if (html.includes('Debido a un problema técnico'))
    throw new Error(`[agua] ${url} contestó con su página de error técnico`)
  return html
}

async function main() {
  const rec = startRun('scrape-agua', { mode: 'fetch', getStats: () => NO_LLM_STATS })
  const hoy = new Date().toISOString().slice(0, 10)
  await mkdir(join(CACHE, 'boletines'), { recursive: true })
  await mkdir(join(CACHE, hoy), { recursive: true })

  const previo = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null
  const archivados: Boletin[] = previo?.boletines ?? []

  await pedir(ENTRADA)
  const formMunicipio = {
    provinciaMapa: '',
    codComunidad: '10',
    codProvincia: INE_PROPIO.slice(0, 2),
    codMunicipio: INE_PROPIO,
  }
  const redesHtml = await pedir(`${BASE}/informacionRedes.do`, formMunicipio)
  const redes = parseRedes(redesHtml)
  if (redes.length === 0) throw new Error('[agua] SINAC no devolvió ninguna red para el municipio')
  const denMunicipio =
    redesHtml.match(/name="denMunicipio" value="([^"]*)"/)?.[1] ?? 'RIBA-ROJA DE TÚRIA'

  const leidos: Boletin[] = []
  const fichas = []
  let detallesNuevos = 0
  for (const r of redes) {
    rec.attempt()
    const base = {
      codMunicipio: INE_PROPIO,
      codProvincia: INE_PROPIO.slice(0, 2),
      denProvincia: '',
      denComunidad: '',
      denMunicipio,
      idRed: String(r.idRed),
      provinciaMapa: '',
    }
    const fichaHtml = await pedir(`${BASE}/informacionAbastecimientoActionDetalleRed.do`, base)
    // La ficha de hoy, cruda: es lo único que no se puede volver a pedir mañana.
    await writeFile(join(CACHE, hoy, `red-${r.idRed}.html`), fichaHtml)
    const ficha = parseDetalleRed(fichaHtml)
    if (ficha.seccionesSinReconocer.length)
      throw new Error(
        `[agua] la red ${r.idRed} trae secciones que no sabemos leer: ` +
          `${ficha.seccionesSinReconocer.join(' · ')} — añadirlas a TIPOS_ANALISIS`,
      )
    if (ficha.boletines.length === 0 && ficha.parametros.length === 0)
      throw new Error(`[agua] la ficha de la red ${r.idRed} llegó vacía — ¿cambió la página?`)

    for (const b of ficha.boletines) {
      const boletin: Boletin = { ...b, idRed: r.idRed }
      if (b.tipo === 'completo') {
        const enArchivo = archivados.find((x) => x.id === b.id && x.parametros?.length)
        if (enArchivo) boletin.parametros = enArchivo.parametros
        else {
          const cache = join(CACHE, 'boletines', `${b.id}.html`)
          let html: string
          if (existsSync(cache)) html = await readFile(cache, 'utf8')
          else {
            html = await pedir(`${BASE}/detalleBoletin.do`, {
              ...base,
              idBoletin: String(b.id),
              denRed: r.nombre,
            })
            await writeFile(cache, html)
            detallesNuevos++
          }
          const d = parseBoletin(html)
          // La sesión mezcla formularios: un detalle de otra red o de otra
          // fecha no se archiva bajo ésta.
          if (d.id !== b.id || d.fecha !== b.fecha || d.red !== r.nombre)
            throw new Error(
              `[agua] el boletín ${b.id} no casa con su fila (${d.id}, ${d.fecha}, ${d.red})`,
            )
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
