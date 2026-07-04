#!/usr/bin/env tsx
/**
 * Street/camino gazetteer for Riba-roja, from OSM Overpass. Names the wikidata
 * area (Q23701) and pulls every named highway way, then merges segments into one
 * point per street. Feeds the tender place-resolver so contract titles that name
 * a street get placed on the map. Idempotent; best-effort in scrape-all (same
 * flaky Overpass upstream as geo / civic-poi).
 *
 * Usage: npm run scrape:streets
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOsmStreets, type StreetKind } from '../src/scraper/streets'
import { fetchOverpass, OVERPASS_ENDPOINTS } from '../src/scraper/overpass-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/streets.json')

const STREETS_QL = `[out:json][timeout:90];
area["wikidata"="Q23701"]->.a;
way(area.a)["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|trunk|service|track|pedestrian)$"]["name"];
out tags geom;`

async function main() {
  const raw = await fetchOverpass(STREETS_QL, { label: 'streets' })
  const streets = parseOsmStreets(raw)

  const byKind = streets.reduce(
    (acc, s) => {
      acc[s.kind] = (acc[s.kind] || 0) + 1
      return acc
    },
    {} as Record<StreetKind, number>,
  )

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      platform: 'OSM Overpass API',
      endpoint: OVERPASS_ENDPOINTS[0],
      area: 'wikidata Q23701',
    },
    streets,
    stats: { total: streets.length, byKind },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[streets] wrote ${streets.length} streets → ${OUT}`)
  console.log('[streets] by kind:', byKind)
}

main().catch((err) => {
  console.error('[streets] failed:', err)
  process.exit(1)
})
