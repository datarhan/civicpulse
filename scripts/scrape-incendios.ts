#!/usr/bin/env tsx
/**
 * Construye public/data/incendios.json y public/data/incendios-perimetros.json
 * — los perímetros de incendio forestal que tocan el término municipal.
 *
 * Fuente: MapServer del ICV (GVA), servicio
 * `tm_medio_ambiente/prevencion_de_incendios`, CC BY. Una capa por año, 1993
 * en adelante. La cadencia es `manual`: el ICV publica una capa nueva al año y
 * con año y pico de desfase, así que esto no entra en scrape-all.
 *
 * Tres cosas que este script hace a propósito:
 *
 * 1. NO filtra por nombre de municipio. Consulta con la frontera de geo.json
 *    como geometría y deja el cruce al servidor. Filtrar por `nom_mun` pierde
 *    2019 entero —la fuente lo archiva «RIBA-ROJA DEL TÚRIA»— y pierde también
 *    el incendio de 20,97 ha de 2024, que consta en Vilamarxant y ardió aquí.
 *
 * 2. Descubre las capas anuales del servicio en vez de llevar una lista. Una
 *    lista de 32 ids se queda corta el día que el ICV publique 2025, y se
 *    quedaría corta EN SILENCIO.
 *
 * 3. Cuenta dos veces cada capa: una sonda `returnCountOnly` y la descarga.
 *    Si no coinciden, aborta. Durante el diseño una descarga devolvió 81 filas
 *    donde la sonda decía 83, sin error ninguno — «una pasada tiene que
 *    demostrar que hizo el trabajo».
 *
 * Usage: npm run scrape:incendios [-- --refetch]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseIncendios, unirPorProcedencia, CAUSA_SIN_CLASIFICAR } from '../src/scraper/incendios'
import type { Incendio, IncendioSituado } from '../src/scraper/incendios'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/incendios')
const GEO = join(ROOT, 'public/data/geo.json')
const OUT_INDICE = join(ROOT, 'public/data/incendios.json')
const OUT_PERIMETROS = join(ROOT, 'public/data/incendios-perimetros.json')

const BASE =
  'https://carto.icv.gva.es/arcgis/rest/services/tm_medio_ambiente/prevencion_de_incendios/MapServer'
const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'

const ATRIBUCION = 'Institut Cartogràfic Valencià (ICV) — Generalitat Valenciana, CC BY 4.0'
/** El propio ICV lo advierte en la ficha del conjunto. Viaja con el dato. */
const AVISO_FUENTE = 'No están cartografiados todos los incendios forestales del periodo'

/**
 * El MapServer contesta 200 con `{"error":{"code":400}}` EN EL CUERPO cuando la
 * consulta falla. Un 200 con sobre de error no es «cero incendios»: si esto lo
 * dejara pasar, el parser vería `features: []` y publicaríamos un agujero.
 * Revienta, reintenta por si la caída es de red, y sobre todo NO cachea el
 * error — un sobre de error en la caché se repite para siempre.
 */
async function pedir(url: string, cuerpo: URLSearchParams, intentos = 3): Promise<string> {
  let ultimo: Error | null = null
  for (let n = 1; n <= intentos; n += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo,
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) throw new Error(`el MapServer respondió ${res.status}`)
      const texto = await res.text()
      const doc = JSON.parse(texto) as { error?: { code?: number; message?: string } }
      if (doc.error) {
        throw new Error(`sobre de error ${doc.error.code}: ${doc.error.message ?? '?'}`)
      }
      return texto
    } catch (err) {
      ultimo = err instanceof Error ? err : new Error(String(err))
      if (n < intentos) await new Promise((r) => setTimeout(r, 1500 * n))
    }
  }
  throw new Error(`[incendios] ${url} falló tras ${intentos} intentos: ${ultimo?.message}`)
}

/** Las capas anuales del servicio, descubiertas — no una lista escrita a mano. */
async function capasAnuales(): Promise<{ id: number; anyo: number }[]> {
  const res = await fetch(`${BASE}?f=json`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`[incendios] el índice del servicio respondió ${res.status}`)
  const doc = JSON.parse(await res.text()) as {
    layers?: { id: number; name: string; parentLayerId: number }[]
  }
  const capas = doc.layers ?? []
  const grupo = capas.find((c) => /incendios forestales/i.test(c.name))
  if (!grupo) {
    throw new Error('[incendios] no está el grupo «Incendios forestales» — ¿cambió el servicio?')
  }
  const anuales = capas
    .filter((c) => c.parentLayerId === grupo.id)
    .map((c) => ({ id: c.id, anyo: Number(/(\d{4})/.exec(c.name)?.[1] ?? 0) }))
    .filter((c) => c.anyo >= 1990)
    .sort((a, b) => a.anyo - b.anyo)
  if (anuales.length < 30) {
    throw new Error(
      `[incendios] sólo ${anuales.length} capas anuales — el servicio cambió de forma`,
    )
  }
  return anuales
}

/**
 * Cualquiera de las dos preguntas que le hacemos al servicio: la ESPACIAL
 * (pásame lo que cruza esta frontera) o la NOMINAL (pásame lo que archivas en
 * este municipio). Hacen falta las dos porque no dan lo mismo.
 */
function consulta(
  modo: { frontera: string } | { where: string },
  extra: Record<string, string>,
): URLSearchParams {
  const base =
    'frontera' in modo
      ? {
          where: '1=1',
          geometry: modo.frontera,
          geometryType: 'esriGeometryPolygon',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
        }
      : { where: modo.where }
  return new URLSearchParams({ ...base, ...extra })
}

/**
 * La consulta nominal. No lleva el nombre exacto: la fuente archiva el mismo
 * pueblo como «Riba-roja de Túria» y como «RIBA-ROJA DEL TÚRIA», y un IN con
 * las grafías conocidas se queda corto en cuanto aparezca la siguiente.
 */
const WHERE_NOMINAL = "UPPER(nom_mun) LIKE '%RIBA%ROJA%'"

/** La frontera municipal de geo.json, en el formato de anillos de ArcGIS. */
async function fronteraArcgis(): Promise<string> {
  const geo = JSON.parse(await readFile(GEO, 'utf8')) as {
    boundary?: { polygon?: [number, number][] }
  }
  const poligono = geo.boundary?.polygon
  if (!poligono?.length) throw new Error('[incendios] geo.json no trae la frontera municipal')
  // geo.json guarda [lat, lng]; ArcGIS quiere [x=lng, y=lat].
  return JSON.stringify({ rings: [poligono.map(([lat, lng]) => [lng, lat])] })
}

const CAMPOS = {
  // `*` y no la lista de campos: el esquema CAMBIA entre capas. `detecp_txt`
  // (medio de detección) no existe en las capas viejas —2003 no lo tiene— y
  // ArcGIS responde 400 «Failed to execute query» ante un campo que no conoce,
  // en vez de ignorarlo. Pedir la lista explícita tumbaba media serie con un
  // error que parecía intermitente y era determinista.
  outFields: '*',
  returnGeometry: 'true',
  outSR: '4326',
  f: 'geojson',
}

/**
 * Una consulta con su sonda. El recuento se pide aparte y se coteja contra lo
 * descargado: es la prueba de que la pasada hizo el trabajo. Durante el diseño
 * una descarga trajo 81 filas donde la sonda decía 83, sin error ninguno.
 */
async function consultar(
  id: number,
  anyo: number,
  modo: { frontera: string } | { where: string },
  etiqueta: string,
  refetch: boolean,
): Promise<Incendio[]> {
  const url = `${BASE}/${id}/query`
  const sonda = JSON.parse(
    await pedir(url, consulta(modo, { returnCountOnly: 'true', f: 'json' })),
  ) as { count?: number }
  if (typeof sonda.count !== 'number') {
    throw new Error(`[incendios] la sonda ${etiqueta} de ${anyo} no devolvió un recuento`)
  }

  const fichero = join(CACHE, `${anyo}.${etiqueta}.json`)
  let crudo: string
  if (!refetch && existsSync(fichero)) {
    crudo = await readFile(fichero, 'utf8')
  } else {
    crudo = await pedir(url, consulta(modo, CAMPOS))
    // Sólo se cachea lo que de verdad es una colección de features: cachear un
    // sobre de error lo convierte en permanente.
    if ((JSON.parse(crudo) as { type?: string }).type !== 'FeatureCollection') {
      throw new Error(`[incendios] ${anyo} ${etiqueta}: la respuesta no es una FeatureCollection`)
    }
    await mkdir(CACHE, { recursive: true })
    await writeFile(fichero, crudo)
  }

  const filas = parseIncendios(crudo)
  if (filas.length !== sonda.count) {
    throw new Error(
      `[incendios] ${anyo} ${etiqueta}: la sonda dice ${sonda.count} y la descarga trae ` +
        `${filas.length} — relanza con --refetch; no se publica un recuento que no cuadra`,
    )
  }
  return filas
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  const rec = startRun('scrape-incendios', { mode: 'fetch', getStats: () => NO_LLM_STATS })

  const frontera = await fronteraArcgis()
  const capas = await capasAnuales()
  rec.owe(capas.length)
  console.log(
    `[incendios] ${capas.length} capas anuales (${capas[0].anyo}–${capas[capas.length - 1].anyo})`,
  )

  const espaciales: Incendio[][] = []
  const nominales: Incendio[][] = []
  let conDatos = 0
  for (const { id, anyo } of capas) {
    const porFrontera = await consultar(id, anyo, { frontera }, 'frontera', refetch)
    const porNombre = await consultar(id, anyo, { where: WHERE_NOMINAL }, 'nombre', refetch)
    rec.attempt()
    if (porFrontera.length > 0) conDatos += 1
    espaciales.push(porFrontera)
    nominales.push(porNombre)
  }

  const incendios = unirPorProcedencia(espaciales, nominales)
  if (incendios.length === 0) {
    throw new Error('[incendios] cero incendios en 30+ años — eso no es un dato, es un fallo')
  }
  const pintados = incendios.filter((i) => i.intersecta)
  const sinGeometria = pintados.filter((i) => i.anillos.length === 0)
  if (sinGeometria.length > 0) {
    throw new Error(
      `[incendios] ${sinGeometria.length} incendios sin perímetro (${sinGeometria[0].id}) — ` +
        'esta capa se dibuja, no se pinta un punto inventado',
    )
  }

  // La GVA lo archiva aquí pero lo cartografía fuera del término. No se pinta
  // —sería una cicatriz donde no ardió— y no se calla: el recuento sale en el
  // universo para que la cobertura pueda decir por qué no cuadra con el suyo.
  const discrepantes = incendios.filter((i) => i.propio && !i.intersecta)
  for (const d of discrepantes) {
    console.warn(
      `[incendios] ${d.id} (${d.anyo}, ${d.superficieHa} ha) lo atribuye la GVA a ` +
        `«${d.municipio}» y lo cartografía FUERA del término — se publica sin pintar`,
    )
  }

  const propios = incendios.filter((i) => i.propio)
  const anyos = pintados.map((i) => i.anyo)
  const sinClasificar = pintados.filter((i) => i.causa === CAUSA_SIN_CLASIFICAR).length
  const suma = (xs: IncendioSituado[]) =>
    Number(xs.reduce((t, i) => t + i.superficieHa, 0).toFixed(4))

  const porCausa: Record<string, number> = {}
  for (const i of pintados) porCausa[i.causa] = (porCausa[i.causa] ?? 0) + 1
  const porAnyo: Record<string, number> = {}
  for (const i of pintados) porAnyo[String(i.anyo)] = (porAnyo[String(i.anyo)] ?? 0) + 1

  const generatedAt = new Date().toISOString()
  const fuente = {
    nombre: 'Institut Cartogràfic Valencià / GVA — Incendios forestales de la Comunitat Valenciana',
    url: 'https://dadesobertes.gva.es/es/dataset/incendios-forestales-de-la-comunitat-valenciana-1993-2024',
    servicio: BASE,
    licencia: 'CC BY 4.0',
    atribucion: ATRIBUCION,
    aviso: AVISO_FUENTE,
  }

  const indice = {
    generatedAt,
    fuente,
    // Lo que la capa NO enseña, con las cifras de la propia capa, para que
    // IncendiosCobertura no pueda desviarse de los polígonos que tiene al lado.
    universe: {
      totalIncendios: incendios.length,
      // Los que se dibujan: su perímetro cruza el término.
      dibujados: pintados.length,
      propios: propios.length,
      ajenos: incendios.length - propios.length,
      // Atribuidos a Riba-roja por la GVA y cartografiados por la GVA fuera
      // del término. Su propia atribución contra su propia cartografía.
      atribuidosSinPerimetroAqui: discrepantes.length,
      superficieHaSinPerimetroAqui: suma(discrepantes),
      superficieHaTotal: suma(pintados),
      superficieHaPropios: suma(propios.filter((i) => i.intersecta)),
      anyoMin: Math.min(...anyos),
      // La cartografía llega hasta aquí: los incendios posteriores existen y
      // NO están dibujados. La frase se deriva de esto, no se escribe a mano.
      anyoMax: Math.max(...anyos),
      capasConsultadas: capas.length,
      capasConDatos: conDatos,
      sinClasificar,
      aviso: AVISO_FUENTE,
    },
    // Sin anillos: /datos llama al hook sólo para leer `stats`, y no debe
    // arrastrar 170 KB de geometría para pintar un recuento de filas.
    incendios: incendios.map(({ anillos: _anillos, ...resto }) => resto),
    stats: { total: pintados.length, porCausa, porAnyo },
  }

  const perimetros = {
    generatedAt,
    fuente: { nombre: fuente.nombre, licencia: fuente.licencia, atribucion: ATRIBUCION },
    // Sólo geometría, indexada por el parte oficial.
    // Sólo la geometría de lo que se pinta.
    anillos: Object.fromEntries(pintados.map((i) => [i.id, i.anillos])),
    stats: {
      total: pintados.length,
      vertices: pintados.reduce((t, i) => t + i.anillos.reduce((s, a) => s + a.length, 0), 0),
    },
  }

  await mkdir(dirname(OUT_INDICE), { recursive: true })
  await writeFile(OUT_INDICE, `${JSON.stringify(indice, null, 2)}\n`)
  await writeFile(OUT_PERIMETROS, `${JSON.stringify(perimetros, null, 2)}\n`)

  rec.record('incendios', pintados.length)
  rec.finish()
  console.log(
    `[incendios] ${pintados.length} incendios dibujados (${propios.length} propios, ` +
      `${incendios.length - propios.length} de términos vecinos, ` +
      `${discrepantes.length} atribuidos aquí sin perímetro aquí) · ` +
      `${indice.universe.anyoMin}–${indice.universe.anyoMax} · ` +
      `${indice.universe.superficieHaTotal} ha · ${perimetros.stats.vertices} vértices`,
  )
  console.log(`[incendios] → ${OUT_INDICE}`)
  console.log(`[incendios] → ${OUT_PERIMETROS}`)
}

main().catch((err) => {
  console.error('[incendios] failed:', err)
  process.exit(1)
})
