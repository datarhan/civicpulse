#!/usr/bin/env tsx
/**
 * Crawl the Ayuntamiento's plenos index for the current year and the two
 * prior years, merge all sessions into one newest-first list, write
 * public/data/plenos.json.
 *
 * Usage: npm run scrape:plenos
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePlenosIndex, type PlenoItem } from '../src/scraper/plenos'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/plenos.json')
const BASE = 'http://www.ribarroja.es'

async function fetchYear(year: number): Promise<PlenoItem[]> {
  const res = await fetch(`${BASE}/plenos/${year}`, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'text/html',
    },
  })
  if (!res.ok) return []
  return parsePlenosIndex(await res.text(), { year, baseUrl: BASE })
}

async function main() {
  const nowYear = new Date().getFullYear()
  const years = [nowYear, nowYear - 1, nowYear - 2, nowYear - 3]
  const all: PlenoItem[] = []
  for (const y of years) {
    console.log(`[plenos] fetching ${y}…`)
    const rows = await fetchYear(y)
    all.push(...rows)
  }

  // Dedup by id, keep newest-first.
  const byId = new Map<string, PlenoItem>()
  for (const it of all) if (!byId.has(it.id)) byId.set(it.id, it)
  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))

  const byYear: Record<number, number> = {}
  for (const it of items) {
    const y = parseInt(it.date.slice(0, 4), 10)
    byYear[y] = (byYear[y] || 0) + 1
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: BASE,
      platform: 'Ayuntamiento de Riba-roja de Túria — /plenos/<year>',
    },
    stats: {
      total: items.length,
      byYear,
      latestDate: items[0]?.date ?? null,
    },
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[plenos] wrote ${OUT} — ${items.length} sesiones`)
}

main().catch((err) => {
  console.error('[plenos] failed:', err)
  process.exit(1)
})
