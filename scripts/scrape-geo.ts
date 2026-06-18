#!/usr/bin/env tsx
/**
 * Query Overpass API for Riba-roja's municipal boundary (admin_level 8)
 * and every place=neighbourhood|suburb|quarter|hamlet|village inside
 * that area. Write public/data/geo.json.
 *
 * Usage: npm run scrape:geo
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOsmBoundary, parseOsmNeighborhoods, parseOsmRailways } from '../src/scraper/geo'
import { fetchOverpass, OVERPASS_ENDPOINTS } from '../src/scraper/overpass-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/geo.json')

// Recorded in the emitted payload for provenance; the shared fetcher rotates
// across all OVERPASS_ENDPOINTS with 429/5xx retry.
const OVERPASS = OVERPASS_ENDPOINTS[0]

const BOUNDARY_QL = `[out:json][timeout:30];
relation["name"="Riba-roja de Túria"]["admin_level"="8"]["boundary"="administrative"];
out geom;`

const NEIGH_QL = `[out:json][timeout:30];
area["wikidata"="Q23701"]->.muni;
(
  node(area.muni)["place"~"neighbourhood|suburb|quarter|hamlet|village"];
  way(area.muni)["place"~"neighbourhood|suburb|quarter"];
);
out geom;`

// Railway query: L9 Metrovalencia track (subway/light_rail) + Adif heavy rail
// (the Aranjuez–Valencia line) + their stations. Excludes abandoned/disused
// tracks so the rendered line reflects live service geography.
const RAILWAY_QL = `[out:json][timeout:30];
area["wikidata"="Q23701"]->.muni;
(
  way(area.muni)["railway"~"subway|light_rail|tram|rail"]["railway"!~"abandoned|disused|construction|razed"];
  node(area.muni)["railway"="station"];
  node(area.muni)["railway"="halt"];
);
out geom tags;`

const runQuery = (ql: string) => fetchOverpass(ql, { label: 'geo' })

async function main() {
  console.log('[geo] fetching municipal boundary…')
  const boundaryJson = await runQuery(BOUNDARY_QL)
  console.log('[geo] fetching neighborhoods…')
  const neighJson = await runQuery(NEIGH_QL)
  console.log('[geo] fetching railways + stations…')
  const railwaysJson = await runQuery(RAILWAY_QL)

  const boundary = parseOsmBoundary(boundaryJson)
  const neighborhoods = parseOsmNeighborhoods(neighJson)
  const railways = parseOsmRailways(railwaysJson)

  if (!boundary) throw new Error('No admin_level=8 boundary returned for Riba-roja')

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      boundary: OVERPASS,
      neighborhoods: OVERPASS,
      railways: OVERPASS,
      platform: 'OSM Overpass API',
    },
    boundary,
    neighborhoods,
    railways,
    stats: {
      boundaryPoints: boundary.polygon.length,
      neighborhoods: neighborhoods.length,
      populationSum: neighborhoods.reduce((s, n) => s + (n.population ?? 0), 0),
      railwayWays: railways.ways.length,
      railwayStations: railways.stations.length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[geo] wrote ${OUT}`)
  console.log(
    `[geo] ${boundary.name} · boundary ${boundary.polygon.length} pts · ` +
      `${neighborhoods.length} neighborhoods · ` +
      `${railways.ways.length} railway ways · ${railways.stations.length} stations`,
  )
}

main().catch((err) => {
  console.error('[geo] failed:', err)
  process.exit(1)
})
