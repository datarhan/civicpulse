#!/usr/bin/env tsx
/**
 * Pull third-party fact-checks that touch Riba-roja from:
 *   · the Google Fact Check Tools API (ClaimReview-indexed), and
 *   · Maldita.es / Newtral RSS feeds (direct publisher feeds, used
 *     as a fallback for items that don't emit ClaimReview JSON-LD).
 * Writes the merged result to public/data/factcheck.json.
 *
 * Auth: GOOGLE_FACT_CHECK_API_KEY env var (free tier) is OPTIONAL.
 * When the key is absent the API call is skipped but the RSS feeds
 * still run, so the snapshot stays non-empty without a paid quota.
 *
 * Usage:
 *   npm run scrape:factcheck                   # API + both RSS feeds
 *   npm run scrape:factcheck -- --max-pages 2  # cap API pagination
 *   npm run scrape:factcheck -- --no-rss       # API only
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchFactChecks,
  mergeFactCheckRows,
  parseFactCheckResponse,
  describirConsulta,
  seConsultoAlgo,
  type IntentoFuente,
  parseFactcheckRss,
  type FactCheckRow,
  type FactCheckSnapshot,
} from '../src/scraper/factcheck'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/factcheck.json')

const QUERY = '"Riba-roja de Túria"'
const API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search'

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const RSS_FEEDS = [
  {
    url: 'https://maldita.es/feed/',
    reviewerName: 'Maldita.es',
    reviewerSite: 'maldita.es',
  },
  {
    url: 'https://www.newtral.es/feed/',
    reviewerName: 'Newtral',
    reviewerSite: 'newtral.es',
  },
] as const

async function write(payload: FactCheckSnapshot): Promise<void> {
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
}

/** Filas + el parte de lo que le pasó a la fuente. Devolver sólo `[]` era el defecto. */
interface Cosecha {
  rows: FactCheckRow[]
  intento: IntentoFuente
}

const API_NOMBRE = 'Google Fact Check Tools API'

async function fetchApiRows(maxPages: number): Promise<Cosecha> {
  const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY
  if (!apiKey) {
    console.warn(
      '[scrape:factcheck] GOOGLE_FACT_CHECK_API_KEY not set — skipping API call ' +
        '(RSS feeds still run). Set the key in .env to enable ClaimReview indexing.',
    )
    return {
      rows: [],
      intento: {
        fuente: API_NOMBRE,
        estado: 'sin-credencial',
        examinadas: 0,
        aceptadas: 0,
        motivo: 'GOOGLE_FACT_CHECK_API_KEY no está en el entorno (¿falta `set -a; . .env`?)',
      },
    }
  }
  try {
    const pages = await fetchFactChecks({ apiKey, query: QUERY, languageCode: 'es', maxPages })
    // Lo que devolvió la fuente ANTES del filtro de municipio, que vive dentro
    // del parser. Sin este recuento no hay forma de distinguir «la API no
    // encontró nada» de «encontró cosas y ninguna era de este pueblo» — y la
    // segunda es la que ocurre: la consulta arrastra el embalse del Ebro.
    const examinadas = pages.reduce(
      (n, pg) => n + (pg.claims ?? []).reduce((m, c) => m + (c.claimReview ?? []).length, 0),
      0,
    )
    const rows = parseFactCheckResponse(pages)
    return {
      rows,
      intento: {
        fuente: API_NOMBRE,
        estado: 'consultada',
        examinadas,
        aceptadas: rows.length,
      },
    }
  } catch (err) {
    const motivo = (err as Error).message.slice(0, 200)
    console.warn(`[scrape:factcheck] API error: ${motivo}`)
    return {
      rows: [],
      intento: { fuente: API_NOMBRE, estado: 'error', examinadas: 0, aceptadas: 0, motivo },
    }
  }
}

async function fetchRssRows(): Promise<Cosecha[]> {
  return Promise.all(
    RSS_FEEDS.map(async (feed): Promise<Cosecha> => {
      const fuente = `${feed.reviewerName} RSS`
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml;q=0.9' },
          redirect: 'follow',
        })
        if (!res.ok) {
          console.warn(`[scrape:factcheck] ${feed.reviewerName} RSS ${res.status} — skipping`)
          return {
            rows: [],
            intento: {
              fuente,
              estado: 'error',
              examinadas: 0,
              aceptadas: 0,
              motivo: `HTTP ${res.status}`,
            },
          }
        }
        const xml = await res.text()
        // Sin filtrar y filtrado, para poder decir cuántas se miraron.
        const todas = parseFactcheckRss(xml, {
          reviewerName: feed.reviewerName,
          reviewerSite: feed.reviewerSite,
          filterByMunicipio: false,
        })
        const rows = parseFactcheckRss(xml, {
          reviewerName: feed.reviewerName,
          reviewerSite: feed.reviewerSite,
        })
        if (rows.length > 0) {
          console.log(`[scrape:factcheck] ${feed.reviewerName} RSS · ${rows.length} matching rows`)
        }
        return {
          rows,
          intento: {
            fuente,
            estado: 'consultada',
            examinadas: todas.length,
            aceptadas: rows.length,
          },
        }
      } catch (err) {
        const motivo = (err as Error).message.slice(0, 200)
        console.warn(`[scrape:factcheck] ${feed.reviewerName} RSS error: ${motivo}`)
        return {
          rows: [],
          intento: { fuente, estado: 'error', examinadas: 0, aceptadas: 0, motivo },
        }
      }
    }),
  )
}

async function main() {
  const maxPages = Number(getFlag('--max-pages')) || 5
  const skipRss = process.argv.includes('--no-rss')
  console.log(
    `[scrape:factcheck] fetching API (up to ${maxPages} page(s)) for query ${QUERY}` +
      (skipRss ? ' · RSS skipped via --no-rss' : ' · plus Maldita + Newtral RSS feeds'),
  )

  const [api, rss] = await Promise.all([
    fetchApiRows(maxPages),
    skipRss ? Promise.resolve([] as Cosecha[]) : fetchRssRows(),
  ])
  const intentos: IntentoFuente[] = [api.intento, ...rss.map((c) => c.intento)]
  // API rows win on dedup — they carry the ClaimReview structured rating
  // which is more authoritative than our RSS category heuristic.
  const rows = mergeFactCheckRows(
    api.rows,
    rss.flatMap((c) => c.rows),
  )

  const byVerdict: Record<string, number> = {}
  const reviewers = new Set<string>()
  for (const row of rows) {
    byVerdict[row.normalizedVerdict] = (byVerdict[row.normalizedVerdict] || 0) + 1
    reviewers.add(row.reviewerName)
  }

  const snap: FactCheckSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      url: API_BASE,
      query: QUERY,
      // Derivada de lo que PASÓ, no de si hubo filas. Ver describirConsulta.
      description: describirConsulta(intentos),
    },
    consulta: { intentos },
    stats: {
      total: rows.length,
      reviewers: reviewers.size,
      byVerdict,
      fuentesConsultadas: intentos.filter((i) => i.estado === 'consultada').length,
      fuentesCaidas: intentos.filter((i) => i.estado !== 'consultada').length,
      revisionesExaminadas: intentos.reduce((n, i) => n + i.examinadas, 0),
    },
    items: rows,
  }

  // Una pasada en la que NINGUNA fuente respondió no es «no hay fact-checks»:
  // es «no se pudo mirar». Se escribe igual —el fichero lo dice— pero se sale
  // distinto, para que el parte de la tubería no lo cuente como éxito.
  if (!seConsultoAlgo(intentos)) {
    await write(snap)
    console.error(
      `[scrape:factcheck] ✗ [sin-fuentes] ninguna fuente respondió · ${describirConsulta(intentos)}`,
    )
    process.exit(1)
  }

  await write(snap)
  console.log(
    `[scrape:factcheck] wrote ${OUT} · ${rows.length} reviews · ${reviewers.size} fact-checkers ` +
      `(${Array.from(reviewers).slice(0, 4).join(', ')}${reviewers.size > 4 ? '…' : ''}) · ` +
      `· ${describirConsulta(intentos)}`,
  )
}

main().catch((err) => {
  console.error('[scrape:factcheck] failed:', err)
  process.exit(1)
})
