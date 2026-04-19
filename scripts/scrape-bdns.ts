#!/usr/bin/env tsx
/**
 * Fetch every BDNS convocatoria mentioning Riba-roja by walking the
 * paginated REST endpoint, then write public/data/bdns.json.
 *
 * Usage: npm run scrape:bdns
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBdnsConvocatorias } from '../src/scraper/bdns'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/bdns.json')

const BASE =
  'https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias/busqueda'
const QUERY = 'riba-roja'
const PER_PAGE = 50

async function fetchPage(page: number): Promise<unknown[]> {
  const url = `${BASE}?page=${page}&vpd=GE&descripcion=${encodeURIComponent(QUERY)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const body = (await res.json()) as { content?: unknown[] }
  return body.content ?? []
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

  const items = parseBdnsConvocatorias(JSON.stringify(rows))
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
      latestDate: items[0]?.date ?? null,
    },
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[bdns] wrote ${OUT}`)
  console.log(
    `[bdns] ${items.length} convocatorias · ${granted.length} municipales · ${received.length} externas`
  )
}

main().catch((err) => {
  console.error('[bdns] failed:', err)
  process.exit(1)
})
