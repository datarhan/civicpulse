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
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
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
    `[participa] ${items.length} posts · ${payload.stats.activities} actividades · ${payload.stats.surveys} encuestas`,
  )
}

main().catch((err) => {
  // participa.ribarroja.es was decommissioned mid-2026: the host now serves
  // the main municipal portal (HTTP 404) behind a TLS certificate valid only
  // for an unrelated municipality (ERR_TLS_CERT_ALTNAME_INVALID). We keep
  // hitting the original URL so the adapter self-heals if the Votiveu
  // WordPress API is ever restored. Until then scrape-all.sh treats participa
  // as best-effort (its failure does not red the nightly) and main() throws
  // before writing, so the last good participa.json stays in place.
  const msg = String((err as { message?: unknown })?.message ?? err)
  if (/altname|certificate|ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed/i.test(msg)) {
    console.error(
      '[participa] upstream unreachable — participa.ribarroja.es appears decommissioned ' +
        '(wrong-host TLS cert / portal 404). Keeping the existing participa.json. ' +
        'If the participation platform moved, repoint BASE in this script. Detail: ' +
        msg,
    )
  } else {
    console.error('[participa] failed:', err)
  }
  process.exit(1)
})
