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
import {
  parseCeselWorkbook,
  parseCeselInforme,
  parseCe4,
  type CesteRow,
  type Ce4Row,
} from '../src/scraper/coste-efectivo'
import { parseConprelRoster, type ConprelMunicipio } from '../src/scraper/budget'
import { SERVICIOS } from '../src/scraper/indicador-registry'
// La lista de entregas y las URLs de la fuente viven en un solo sitio: estaban
// copiadas aquí y en fetch-cesel-ccaa.ts, y `check:cesel-entregas` las coteja
// ahora con el desplegable vivo del ministerio.
import { ENTREGAS, CONSULTA_URL, ORDEN_URL } from '../src/scraper/cesel-entregas'
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
  const enRegistro = (programa: string) => programa in SERVICIOS
  /**
   * De un par sólo se usa la magnitud que el registro divide. Guardar las demás
   * multiplicaba por tres el peso de un fichero que se sirve entero desde
   * public/, sin que ninguna de ellas llegue nunca a leerse.
   */
  const podar = (r: CesteRow): CesteRow => ({
    ...r,
    unidades: r.unidades.filter((u) => u.atributo === SERVICIOS[r.programa]?.denominador),
  })

  const buf = await volcado(refetch)
  const todas = parseCeselWorkbook(buf, { anio: ANIO_VOLCADO, soloEntes })
  filasMunicipio = todas.filter((r) => r.ine === INE)
  filasPares = todas.filter((r) => r.ine !== INE && enRegistro(r.programa)).map(podar)
  if (!filasMunicipio.length) throw new Error(`[cesel] el volcado no trae filas de ${INE}`)
  rec.judge()
  rec.record('filas', todas.length)
  const aniosConDatos = new Set<number>([ANIO_VOLCADO])
  const noPresentadas: number[] = []
  const filasSupra: Ce4Row[] = []

  // Informes de la consulta descargados a mano (ver el encabezado). Dos
  // variantes, misma función de lectura:
  //   ccaa/cesel-ccaa<CCAA>-<anio>.xlsx  → toda la comunidad: municipio Y PARES
  //   informes/cesel-informe-<ine>-<anio>.xlsx → sólo el municipio
  // La de comunidad es la única que da pares de otros años; sin ella la
  // comparación quedaría anclada a 2021 para siempre.
  const leerInformes = async (sub: string, re: RegExp) => {
    const dir = join(CACHE_DIR, sub)
    let ficheros: string[] = []
    try {
      ficheros = (await readdir(dir)).filter((f) => f.endsWith('.xlsx'))
    } catch {
      return
    }
    for (const f of ficheros.sort()) {
      const m = re.exec(f)
      if (!m) continue
      const anio = Number(m[m.length - 1])
      const buf = await readFile(join(dir, f))
      // CE4 se lee ANTES de cualquier salto de año: es la declaración de OTRO
      // ente (quién sirve a este municipio), así que existe aunque el
      // ayuntamiento no presentara la suya — en 2020 la Mancomunitat declara
      // servir a Riba-roja mientras Riba-roja no aparece en CE1/CE2/CE3, y
      // saltarse el fichero se habría comido justo esa fila.
      if (sub === 'ccaa') {
        filasSupra.push(
          ...parseCe4(buf, { anio }).filter((r) => /riba-?roja/i.test(r.municipioServido)),
        )
      }
      if (aniosConDatos.has(anio)) continue
      const filas = parseCeselInforme(buf, { anio, soloEntes })
      const propias = filas.filter((r) => r.ine === INE)
      if (!propias.length) {
        // Tenemos el fichero y el municipio NO está en él: eso no es un hueco
        // nuestro, es una entrega que el ayuntamiento no presentó. Colapsar los
        // dos estados en «falta el dato» borraría un hecho sobre su rendición
        // de cuentas — regla 3 de DATA_INTEGRITY, un centinela no es un valor.
        const universo = new Set(filas.map((r) => r.ine)).size
        if (universo > 50) {
          noPresentadas.push(anio)
          console.warn(
            `[cesel] entrega ${anio}: el fichero trae ${universo} municipios y ${INE} NO está — ` +
              `no presentó`,
          )
        } else {
          console.warn(`[cesel] ${f}: fichero sospechoso (${universo} municipios), se ignora`)
        }
        continue
      }
      filasMunicipio.push(...propias)
      // Sólo los servicios del registro: es lo único que el motor compara, y
      // publicar el resto convertía el snapshot en un volcado de 15 MB bajo
      // public/, que se sirve entero tanto si alguien lo pide como si no.
      filasPares.push(...filas.filter((r) => r.ine !== INE && enRegistro(r.programa)).map(podar))
      aniosConDatos.add(anio)
      rec.judge()
      console.log(
        `[cesel] entrega ${anio}: ${propias.length} filas propias · ` +
          `${new Set(filas.map((r) => r.ine)).size} municipios`,
      )
    }
  }
  await leerInformes('ccaa', /cesel-ccaa\d+-(\d{4})\.xlsx$/)
  await leerInformes('informes', new RegExp(`cesel-informe-${INE}-(\\d{4})\\.xlsx$`))

  filasMunicipio.sort((a, b) => a.anio - b.anio || a.programa.localeCompare(b.programa))

  // La contabilidad va AQUÍ, cuando ya se sabe qué entregas se consiguieron.
  // Hacerlo antes de leer los informes hacía que el manifiesto declarase «no
  // obtenida» una entrega que a la línea siguiente se obtenía: un manifiesto
  // que miente es peor que no tenerlo, porque check:runs se lo cree.
  for (const [id, anio] of Object.entries(ENTREGAS)) {
    rec.attempt()
    if (aniosConDatos.has(anio)) continue
    if (noPresentadas.includes(anio)) {
      // Estado propio: el dato existe como obligación y el ayuntamiento no lo
      // presentó. No es lo mismo que no haberlo podido descargar.
      rec.skip('entrega-no-presentada-por-el-municipio')
      console.warn(`[cesel] entrega ${id} (${anio}): el municipio no la presentó`)
    } else {
      rec.skip('entrega-sin-descargar')
      console.warn(`[cesel] entrega ${id} (${anio}): sin descargar — falta el fichero`)
    }
  }

  const nombre = filasMunicipio[0].nombre
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: { volcado: VOLCADO_URL, consulta: CONSULTA_URL, orden: ORDEN_URL },
    municipio: { ine: INE, nombre, filas: filasMunicipio },
    pares: {
      conjunto: CONJUNTO,
      criterios: { ccaa: CCAA_ID, popMin: POP_MIN, popMax: POP_MAX, tipoEnte: 'AA' },
      resolvedAt: new Date().toISOString(),
      anios: [...aniosConDatos].sort(),
      miembros,
      filas: filasPares,
    },
    cobertura: {
      entregasPublicadas: Object.values(ENTREGAS).sort(),
      entregasObtenidas: [...new Set(filasMunicipio.map((f) => f.anio))].sort(),
      entregasNoPresentadas: [...noPresentadas].sort(),
      // Esta frase habla SÓLO de cómo se obtienen los ficheros. Lo que el
      // ayuntamiento presentó o dejó de presentar va en `entregasNoPresentadas`,
      // que se calcula arriba comprobando que el libro esté y el municipio no.
      //
      // Iban juntas y era un error de bulto: la frase describía el mecanismo de
      // descarga y se renderizaba justo detrás de la lista de entregas
      // obtenidas, así que el lector entendía que 2020 falta porque este sitio
      // no supo bajarla. Falta porque no está: el libro de la Comunitat
      // Valenciana de 2020 está descargado, lo presentaron 503 ayuntamientos
      // valencianos —más que en 2018, 2019, 2021 o 2022— y Riba-roja no figura
      // en ninguna de sus tablas de coste, gestión ni unidades físicas.
      motivoFaltantes:
        'El ministerio sólo publica volcado masivo de 2021; el resto de entregas ' +
        'se obtienen del informe por comunidad autónoma de la aplicación de ' +
        'consulta, que se pide con `npm run fetch:cesel-ccaa` y se guarda en ' +
        '.cache/cesel/ccaa.',
    },
    supramunicipal: {
      // Filas de CE4 en las que un ente supramunicipal declara servir a ESTE
      // municipio. Explican los ceros de turismo, ferias, deporte y ocio: no
      // es que no existan, es que parte de la función la rinde otro.
      filas: filasSupra.sort((a, b) => a.anio - b.anio || a.programa.localeCompare(b.programa)),
    },
    stats: {
      anios: [...new Set(filasMunicipio.map((f) => f.anio))].sort(),
      filasMunicipio: filasMunicipio.length,
      filasPares: filasPares.length,
      miembros: miembros.length,
      filasSupramunicipales: filasSupra.length,
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
