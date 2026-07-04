/**
 * Derived step (no network): match each contract title to the OSM zones and
 * write public/data/tender-geo.json. Mirrors compute-dept-stats.ts. Never
 * mutates tenders.json or geo.json. Runs in scrape:all after both exist.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchContractsToZones, ZONE_ALIASES, type ZoneInput } from '../src/scraper/tender-geo'
import { buildGazetteer } from '../src/scraper/place-resolver'
import { validatePlaceOverrides, type PlaceKind } from '../src/scraper/place-suggestion'

const DATA = resolve('public/data')
const OUT = resolve(DATA, 'tender-geo.json')

async function readJsonIfExists(path: string): Promise<any | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const tPath = resolve(DATA, 'tenders.json')
  const gPath = resolve(DATA, 'geo.json')
  if (!existsSync(tPath) || !existsSync(gPath)) {
    console.error(
      '[compute-tender-geo] tenders.json or geo.json missing — run scrape:tenders + scrape:geo first',
    )
    process.exit(1)
  }
  const tenders = JSON.parse(await readFile(tPath, 'utf8'))
  const geo = JSON.parse(await readFile(gPath, 'utf8'))
  const zones: ZoneInput[] = (geo.neighborhoods || []).map(
    (n: { slug: string; name: string; centroid: [number, number] }) => ({
      slug: n.slug,
      name: n.name,
      centroid: n.centroid,
    }),
  )

  // Optional gazetteer inputs (best-effort scrapers — absence just means fewer
  // precise pins, never a crash). Streets + civic POIs feed the resolver.
  const streetsSnap = await readJsonIfExists(resolve(DATA, 'streets.json'))
  const poiSnap = await readJsonIfExists(resolve(DATA, 'civic-poi.json'))
  const candidates = buildGazetteer({
    streets: streetsSnap?.streets ?? [],
    pois: poiSnap?.pois ?? [],
    zones,
    zoneAliases: ZONE_ALIASES,
  })

  // Curator-approved LLM geocode overrides (place-overrides.json). Absent file →
  // empty map. Validated before use so a malformed override can't reach the map.
  const overridesSnap = await readJsonIfExists(resolve(DATA, 'place-overrides.json'))
  const overrides: Record<
    string,
    {
      sourceId: string
      name: string
      kind: PlaceKind
      point: [number, number]
      matchedText: string
    }
  > = {}
  if (overridesSnap) {
    validatePlaceOverrides(overridesSnap)
    for (const o of overridesSnap.overrides || []) {
      overrides[o.contractId] = {
        sourceId: o.sourceId,
        name: o.name,
        kind: o.kind,
        point: o.point,
        matchedText: o.matchedText,
      }
    }
  }

  const snap = matchContractsToZones(
    tenders.contracts || [],
    zones,
    {
      generatedAt: new Date().toISOString(),
      tendersGeneratedAt: tenders.generatedAt ?? null,
      geoGeneratedAt: geo.generatedAt ?? null,
      overrides,
    },
    candidates,
  )
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(
    `[compute-tender-geo] ${snap.universe.locatedContracts}/${snap.universe.totalContracts} zone-located · ` +
      `${snap.universe.situatedContracts} situated (€${Math.round(snap.universe.situatedAmount)}) ` +
      `across ${snap.places.length} places · ${snap.zones.length} zones · ` +
      `DANA ${snap.universe.danaContracts} (€${Math.round(snap.universe.danaAmount)})`,
  )
}

main().catch((err) => {
  console.error('[compute-tender-geo] failed:', err)
  process.exit(1)
})
