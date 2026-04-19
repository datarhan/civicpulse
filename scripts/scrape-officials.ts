#!/usr/bin/env tsx
/**
 * Scrape the live Riba-roja corporation page and produce:
 *   - public/data/officials.json   (canonical Official[])
 *   - public/data/photos/<slug>.jpg  (mirrored portrait photos)
 *
 * Usage:
 *   npm run scrape:officials
 *
 * Runs idempotent: re-running refreshes everything. Photos that 404 on
 * the source site are silently skipped and `photoUrl` is left empty in
 * the JSON.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCorporacion, type Official } from '../src/scraper/corporacion'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const SOURCE_URL = 'http://www.ribarroja.es/ayuntamiento/corporacion_municipal'
const OUT_JSON = join(PROJECT_ROOT, 'public/data/officials.json')
const OUT_PHOTOS = join(PROJECT_ROOT, 'public/data/photos')

async function fetchLiveHtml(): Promise<string> {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech scraper, respects robots.txt',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) throw new Error(`Source returned ${res.status} ${res.statusText}`)
  return res.text()
}

async function downloadPhoto(url: string, slug: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const filename = `${slug}.${ext}`
    const bytes = Buffer.from(await res.arrayBuffer())
    await writeFile(join(OUT_PHOTOS, filename), bytes)
    return `/data/photos/${filename}`
  } catch (err) {
    console.warn(`[photo] ${slug} failed:`, (err as Error).message)
    return null
  }
}

async function main() {
  console.log(`[scrape] fetching ${SOURCE_URL}`)
  const html = await fetchLiveHtml()

  console.log('[scrape] parsing HTML…')
  const officials = parseCorporacion(html, { baseUrl: 'http://www.ribarroja.es' })
  console.log(`[scrape] parsed ${officials.length} officials`)

  if (officials.length < 21) {
    console.warn(
      `[scrape] WARNING: expected at least 21 officials (full council), got ${officials.length}`
    )
  }

  await mkdir(OUT_PHOTOS, { recursive: true })

  // Mirror photos locally so the SPA has stable, CORS-friendly URLs.
  const enriched: Official[] = []
  for (const o of officials) {
    let localPhoto: string = ''
    if (o.photoUrl) {
      const mirrored = await downloadPhoto(o.photoUrl, o.slug)
      if (mirrored) localPhoto = mirrored
    }
    enriched.push({ ...o, photoUrl: localPhoto || o.photoUrl })
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    count: enriched.length,
    composition: enriched.reduce((acc, o) => {
      acc[o.party] = (acc[o.party] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    officials: enriched,
  }

  await mkdir(dirname(OUT_JSON), { recursive: true })
  await writeFile(OUT_JSON, JSON.stringify(payload, null, 2) + '\n')

  console.log(`[scrape] wrote ${OUT_JSON}`)
  console.log('[scrape] composition:', payload.composition)
}

main().catch((err) => {
  console.error('[scrape] failed:', err)
  process.exit(1)
})
