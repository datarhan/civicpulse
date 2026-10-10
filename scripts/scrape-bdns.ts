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
 * Usage: npm run scrape:bdns
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBdnsConvocatorias,
  separarPorMunicipio,
  rechazoDeLaCorrida,
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

/** La ficha y las concesiones al Ayuntamiento de una convocatoria, tal cual. */
async function pruebasDe(codigo: string): Promise<PruebasDeLugar> {
  const ficha = await getJson(`${API}/convocatorias?vpd=GE&numConv=${encodeURIComponent(codigo)}`)
  await espera(PAUSA_MS)
  const concesiones = await getJson(
    `${API}/concesiones/busqueda?vpd=GE&page=0&pageSize=50` +
      `&numeroConvocatoria=${encodeURIComponent(codigo)}&nifCif=${NIF_AYUNTAMIENTO}`,
  )
  await espera(PAUSA_MS)
  return { ficha, concesiones }
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

  const items = separacion.propias
  const descartadas = separacion.descartadas
  const granted = items.filter((i) => i.direction === 'granted')
  const received = items.filter((i) => i.direction === 'received')

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      url: BASE,
      query: QUERY,
      platform: 'MinHac BDNS (Base de Datos Nacional de Subvenciones)',
    },
    stats: {
      total: items.length,
      granted: granted.length,
      received: received.length,
      descartadas: descartadas.length,
      latestDate: items[0]?.date ?? null,
    },
    items,
    descartadas,
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
}

main().catch((err) => {
  console.error('[bdns] failed:', err)
  process.exit(1)
})
