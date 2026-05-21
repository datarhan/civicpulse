#!/usr/bin/env tsx
/**
 * Pull TED (EU Tenders Electronic Daily) notices for Riba-roja and
 * write public/data/tenders-ted.json.
 *
 * Free API, no auth needed. The claim-verifier reads this snapshot
 * alongside tenders.json (PLACSP) so EU-threshold contracts also get
 * cross-referenced against press claims.
 *
 * Usage:
 *   npm run scrape:tenders-ted
 *   npm run scrape:tenders-ted -- --max-pages 1
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchTedNotices,
  parseTedResponse,
  type TenderTedSnapshot,
} from '../src/scraper/tenders-ted'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/tenders-ted.json')
const QUERY = 'buyer-name~"Riba-roja"'

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

async function main() {
  const maxPages = Number(getFlag('--max-pages')) || 3
  console.log(`[scrape:tenders-ted] fetching up to ${maxPages} page(s) for query ${QUERY}`)

  let rows: Awaited<ReturnType<typeof parseTedResponse>> = []
  try {
    const pages = await fetchTedNotices({ query: QUERY, maxPages })
    rows = parseTedResponse(pages)
  } catch (err) {
    console.warn(`[scrape:tenders-ted] API error: ${(err as Error).message}`)
    rows = []
  }

  const byContractNature: Record<string, number> = {}
  for (const r of rows) {
    for (const n of r.contractNature) byContractNature[n] = (byContractNature[n] || 0) + 1
  }

  const snap: TenderTedSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      url: 'https://api.ted.europa.eu/v3/notices/search',
      query: QUERY,
      description:
        'EU Tenders Electronic Daily (TED) — contracts above the EU threshold, free API, no auth.',
    },
    stats: { total: rows.length, byContractNature },
    items: rows,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')

  console.log(
    `[scrape:tenders-ted] wrote ${OUT} · ${rows.length} notices` +
      (rows.length > 0
        ? ` · latest ${rows[0].publicationDate.slice(0, 10)} (${rows[0].buyerName.slice(0, 40)})`
        : ''),
  )
}

main().catch((err) => {
  console.error('[scrape:tenders-ted] failed:', err)
  process.exit(1)
})
