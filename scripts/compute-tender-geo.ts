/**
 * Derived step (no network): match each contract title to the OSM zones and
 * write public/data/tender-geo.json. Mirrors compute-dept-stats.ts. Never
 * mutates tenders.json or geo.json. Runs in scrape:all after both exist.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchContractsToZones, type ZoneInput } from '../src/scraper/tender-geo'

const DATA = resolve('public/data')
const OUT = resolve(DATA, 'tender-geo.json')

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
  const snap = matchContractsToZones(tenders.contracts || [], zones, {
    generatedAt: new Date().toISOString(),
    tendersGeneratedAt: tenders.generatedAt ?? null,
    geoGeneratedAt: geo.generatedAt ?? null,
  })
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(
    `[compute-tender-geo] ${snap.universe.locatedContracts}/${snap.universe.totalContracts} located · ` +
      `€${Math.round(snap.universe.locatedAmount)} across ${snap.zones.length} zones · ` +
      `DANA ${snap.universe.danaContracts} (€${Math.round(snap.universe.danaAmount)})`,
  )
}

main().catch((err) => {
  console.error('[compute-tender-geo] failed:', err)
  process.exit(1)
})
