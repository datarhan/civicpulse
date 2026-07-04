#!/usr/bin/env tsx
/**
 * Civic points of interest (schools, health, parks, sport, culture, civic
 * buildings) inside Riba-roja, from OSM Overpass. Names the wikidata area
 * (Q23701). Requires a `name` on the noisy `leisure` bucket so the ~1.5k
 * private backyard swimming pools in the urbanitzacions never reach the map.
 * Idempotent; best-effort in scrape-all (same flaky Overpass upstream as geo).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOsmPoi, type PoiCategory } from '../src/scraper/civic-poi'
import { fetchOverpass, OVERPASS_ENDPOINTS } from '../src/scraper/overpass-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/civic-poi.json')
const OVERPASS = OVERPASS_ENDPOINTS[0]

const POI_QL = `[out:json][timeout:60];
area["wikidata"="Q23701"]->.a;
(
  nwr["amenity"~"^(school|kindergarten|college|university|hospital|clinic|doctors|dentist|pharmacy|library|theatre|arts_centre|community_centre|townhall|police|fire_station|post_office|courthouse)$"](area.a);
  nwr["leisure"~"^(park|garden|sports_centre|pitch|stadium|swimming_pool|track|fitness_centre)$"]["name"](area.a);
  nwr["healthcare"](area.a);
  nwr["tourism"="museum"](area.a);
);
out center tags;`

async function main() {
  const raw = await fetchOverpass(POI_QL, { label: 'civic-poi' })
  const pois = parseOsmPoi(raw)

  const byCategory = pois.reduce(
    (acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1
      return acc
    },
    {} as Record<PoiCategory, number>,
  )

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { platform: 'OSM Overpass API', endpoint: OVERPASS, area: 'wikidata Q23701' },
    pois,
    stats: { total: pois.length, byCategory },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[civic-poi] wrote ${pois.length} POIs → ${OUT}`)
  console.log(`[civic-poi] by category:`, byCategory)
}

main().catch((err) => {
  console.error('[civic-poi] failed:', err)
  process.exit(1)
})
