#!/usr/bin/env tsx
/**
 * Fetch citizen-participation blog posts from participa.ribarroja.es
 * (WordPress v2 REST API) and write public/data/participa.json.
 *
 * Usage: npm run scrape:participa
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseParticipaPosts } from '../src/scraper/participa'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/participa.json')

const BASE = 'https://participa.ribarroja.es/wp-json/wp/v2'
const POSTS_URL = `${BASE}/posts?per_page=100&_fields=id,date,title,link,excerpt,content,categories,slug,status`
const CATEGORIES_URL = `${BASE}/categories?per_page=100`

async function fetchJson(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

async function main() {
  console.log('[participa] fetching posts…')
  const postsJson = await fetchJson(POSTS_URL)
  console.log('[participa] fetching categories…')
  const categoriesJson = await fetchJson(CATEGORIES_URL)

  const items = parseParticipaPosts(postsJson, { categoriesJson })

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      posts: POSTS_URL,
      categories: CATEGORIES_URL,
      host: 'https://participa.ribarroja.es',
      platform: 'WordPress (Votiveu)',
    },
    stats: {
      total: items.length,
      activities: items.filter((i) => i.kind === 'activity').length,
      surveys: items.filter((i) => i.kind === 'survey').length,
      other: items.filter((i) => i.kind === 'other').length,
      latestDate: items[0]?.date ?? null,
    },
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[participa] wrote ${OUT}`)
  console.log(
    `[participa] ${items.length} posts · ${payload.stats.activities} actividades · ${payload.stats.surveys} encuestas`
  )
}

main().catch((err) => {
  console.error('[participa] failed:', err)
  process.exit(1)
})
