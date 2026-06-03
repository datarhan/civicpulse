#!/usr/bin/env tsx
/**
 * Fetch the Wikidata entity JSON for Riba-roja de Túria (Q23701) and write
 * normalized municipal facts to public/data/wikidata.json.
 *
 * Usage: npm run scrape:wikidata
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWikidataEntity } from '../src/scraper/wikidata'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/wikidata.json')
const QID = 'Q23701'
const URL = `https://www.wikidata.org/wiki/Special:EntityData/${QID}.json`

async function main() {
  console.log('[wikidata] fetching', URL)
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.text()
  const facts = parseWikidataEntity(json)
  if (!facts) throw new Error(`entity ${QID} not found`)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { url: URL, platform: 'Wikidata' },
    facts,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[wikidata] wrote ${OUT} — ${facts.label} · INE ${facts.identifiers.ine} · ` +
      `pop ${facts.population?.value} (${facts.population?.year}) · ` +
      `${facts.areaKm2} km² · ${facts.elevation} m`,
  )
}

main().catch((err) => {
  console.error('[wikidata] failed:', err)
  process.exit(1)
})
