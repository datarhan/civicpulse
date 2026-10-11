#!/usr/bin/env tsx
/**
 * Fetch every BDNS convocatoria mentioning Riba-roja by walking the
 * paginated REST endpoint, then write public/data/bdns.json.
 *
 * La búsqueda también trae Riba-roja d'Ebre (Tarragona). De cada convocatoria
 * recibida —la que no convoca el propio Ayuntamiento— se pide su ficha (región
 * NUTS) y sus concesiones al NIF del Ayuntamiento, y `separarPorMunicipio`
 * (src/scraper/bdns.ts) decide cuáles se publican. Las apartadas van a
 * `descartadas`, con su motivo. Si la separación no se puede creer
 * (`rechazoDeLaCorrida`), no se escribe nada y sale 1: el snapshot de ayer
 * sigue en pie.
 *
 * Después, lo que el Ayuntamiento recibe por su NIF: todas las concesiones a
 * P4621600H (`concesiones`, una fila por concesión, con su importe) y la ficha
 * de cada convocatoria suya que la búsqueda por nombre no trajo, que entra en
 * `items` como recibida. Una convocatoria abierta a todos los municipios no
 * nombra a ninguno, y era la mayoría de lo recibido. Si la vía por NIF no se
 * puede creer (`rechazoDeLasConcesiones`), tampoco se escribe nada.
 *
 * Usage: npm run scrape:bdns
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBdnsConvocatorias,
  separarPorMunicipio,
  rechazoDeLaCorrida,
  parseBdnsConcesiones,
  rechazoDeLasConcesiones,
  resumirConcesiones,
  unirConcesiones,
  NIF_AYUNTAMIENTO,
  type PruebasDeLugar,
} from '../src/scraper/bdns'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/bdns.json')

const API = 'https://www.pap.hacienda.gob.es/bdnstrans/api'
const BASE = `${API}/convocatorias/busqueda`
const QUERY = 'riba-roja'
const PER_PAGE = 50
/** Entre petición y petición a la BDNS: un raspador educado no la martillea. */
const PAUSA_MS = 300

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(url: string): Promise<unknown> {
  let ultimo: unknown
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
          Accept: 'application/json',
        },
        // Per-request budget — a stalled BDNS must not hang the nightly chain.
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      ultimo = err
      if (intento === 1) await espera(2_000)
    }
  }
  throw ultimo
}

async function fetchPage(page: number): Promise<unknown[]> {
  const url = `${BASE}?page=${page}&vpd=GE&descripcion=${encodeURIComponent(QUERY)}`
  const body = (await getJson(url)) as { content?: unknown[] }
  return body.content ?? []
}

async function fichaDe(codigo: string): Promise<unknown> {
  const ficha = await getJson(`${API}/convocatorias?vpd=GE&numConv=${encodeURIComponent(codigo)}`)
  await espera(PAUSA_MS)
  return ficha
}

/** La ficha y las concesiones al Ayuntamiento de una convocatoria, tal cual. */
async function pruebasDe(codigo: string): Promise<PruebasDeLugar> {
  const ficha = await fichaDe(codigo)
  const concesiones = await getJson(
    `${API}/concesiones/busqueda?vpd=GE&page=0&pageSize=50` +
      `&numeroConvocatoria=${encodeURIComponent(codigo)}&nifCif=${NIF_AYUNTAMIENTO}`,
  )
  await espera(PAUSA_MS)
  return { ficha, concesiones }
}

const CONCESIONES = `${API}/concesiones/busqueda?vpd=GE&nifCif=${NIF_AYUNTAMIENTO}`

/**
 * Todas las páginas de concesiones al NIF, tal cual. El tope de páginas es un
 * perro guardián, no un límite: si se alcanza, `rechazoDeLasConcesiones` ve
 * menos filas de las que la API declara y la corrida no se escribe.
 */
async function concesionesDelAyuntamiento(): Promise<unknown[]> {
  const paginas: unknown[] = []
  for (let page = 0; page < 40; page++) {
    const body = (await getJson(`${CONCESIONES}&page=${page}&pageSize=${PER_PAGE}`)) as {
      content?: unknown[]
      last?: boolean
    }
    await espera(PAUSA_MS)
    paginas.push(body)
    if (!body.content || body.content.length < PER_PAGE || body.last) break
  }
  return paginas
}

/** Las concesiones del snapshot que se va a sustituir, o null si no lo hay. */
async function concesionesAnteriores(): Promise<number | null> {
  try {
    const previo = JSON.parse(await readFile(OUT, 'utf8')) as {
      stats?: { concesiones?: { total?: unknown } }
    }
    const n = previo.stats?.concesiones?.total
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

async function main() {
  const rows: unknown[] = []
  for (let page = 0; page < 20; page++) {
    console.log(`[bdns] fetching page ${page}…`)
    const chunk = await fetchPage(page)
    if (chunk.length === 0) break
    rows.push(...chunk)
    if (chunk.length < PER_PAGE) break
  }

  const vistas = parseBdnsConvocatorias(JSON.stringify(rows))
  const recibidas = vistas.filter((i) => i.direction === 'received')
  console.log(`[bdns] ${vistas.length} convocatorias · ${recibidas.length} recibidas que situar`)

  // Un fallo de red aquí aborta la corrida entera (getJson lanza): una fila sin
  // consultar no es una fila ajena.
  const pruebas = new Map<string, PruebasDeLugar>()
  for (const r of recibidas) pruebas.set(r.bdnsCode, await pruebasDe(r.bdnsCode))

  const separacion = separarPorMunicipio(vistas, pruebas)
  for (const d of separacion.descartadas) {
    console.log(
      `[bdns] apartada ${d.bdnsCode} (${d.lugar}): ${d.motivo} · ${d.description.slice(0, 80)}`,
    )
  }
  const rechazo = rechazoDeLaCorrida(separacion)
  if (rechazo) {
    console.error(`[bdns] no se escribe ${OUT}: ${rechazo}`)
    process.exit(1)
  }

  console.log(`[bdns] concesiones a ${NIF_AYUNTAMIENTO}…`)
  const leidas = parseBdnsConcesiones(JSON.stringify(await concesionesDelAyuntamiento()))
  const yaPublicadas = new Set(separacion.propias.map((i) => i.bdnsCode))
  const fichas = new Map<string, unknown>()
  for (const [codigo, p] of pruebas) fichas.set(codigo, p.ficha)
  const nuevas = [...new Set(leidas.concesiones.map((c) => c.bdnsCode))].filter(
    (c) => !yaPublicadas.has(c) && !fichas.has(c),
  )
  console.log(
    `[bdns] ${leidas.concesiones.length} concesiones en ` +
      `${new Set(leidas.concesiones.map((c) => c.bdnsCode)).size} convocatorias · ` +
      `${nuevas.length} fichas que pedir`,
  )
  for (const codigo of nuevas) fichas.set(codigo, await fichaDe(codigo))
  const unida = unirConcesiones(separacion, leidas.concesiones, fichas)
  for (const c of unida.sinFicha) console.log(`[bdns] sin ficha legible: ${c}`)
  const rechazoNif = rechazoDeLasConcesiones(leidas, {
    anterior: await concesionesAnteriores(),
    sinFicha: unida.sinFicha,
  })
  if (rechazoNif) {
    console.error(`[bdns] no se escribe ${OUT}: ${rechazoNif}`)
    process.exit(1)
  }

  const items = unida.propias
  const descartadas = unida.descartadas
  const concesiones = leidas.concesiones
  const resumen = resumirConcesiones(concesiones)
  const granted = items.filter((i) => i.direction === 'granted')
  const received = items.filter((i) => i.direction === 'received')

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      url: BASE,
      query: QUERY,
      platform: 'MinHac BDNS (Base de Datos Nacional de Subvenciones)',
      concesiones: CONCESIONES,
    },
    stats: {
      total: items.length,
      granted: granted.length,
      received: received.length,
      descartadas: descartadas.length,
      latestDate: items[0]?.date ?? null,
      concesiones: { ...resumen, sinFicha: unida.sinFicha },
    },
    items,
    descartadas,
    concesiones,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[bdns] wrote ${OUT}`)
  console.log(
    `[bdns] vistas ${vistas.length} · publicadas ${items.length} ` +
      `(${granted.length} municipales · ${received.length} recibidas) · ` +
      `apartadas ${descartadas.length} ` +
      `(${descartadas.filter((d) => d.lugar === 'ajeno').length} de otro municipio · ` +
      `${descartadas.filter((d) => d.lugar === 'sin-determinar').length} sin situar)`,
  )
  console.log(
    `[bdns] concesiones ${resumen.total} · convocatorias ${resumen.convocatorias} ` +
      `(${unida.anadidas.length} nuevas en items · ${unida.sinFicha.length} sin ficha) · ` +
      `${resumen.importe.toLocaleString('es-ES')} € concedidos · ${resumen.desde}…${resumen.hasta}`,
  )
}

main().catch((err) => {
  console.error('[bdns] failed:', err)
  process.exit(1)
})
