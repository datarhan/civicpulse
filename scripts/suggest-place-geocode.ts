#!/usr/bin/env tsx
/**
 * LLM place-geocode SUGGESTION pass (curator-run, metered). For every awarded
 * contract the deterministic resolver could NOT situate, ask the LLM to read the
 * place name out of the title; resolve that name to a REAL gazetteer point; and
 * write a human-approval-gated suggestion to public/data/place-suggestions.json.
 *
 * Nothing here touches the public map: suggestions are reviewed and promoted via
 * `npm run promote-place`, which writes place-overrides.json (what the map reads).
 * The LLM never emits a coordinate — points always come from the gazetteer.
 *
 * Usage:
 *   npm run suggest:place-geocode -- [--min-confidence 0.5] [--limit N]
 * Backend selection follows the standard LLM_BACKEND / callLLM auto-detect.
 * NOTE (repo policy): for unattended/auto runs force a $0 backend
 * (LLM_BACKEND=gemini | claude-code); this CLI is curator-invoked, so metered
 * backends are acceptable here.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildGazetteer } from '../src/scraper/place-resolver'
import { ZONE_ALIASES } from '../src/scraper/tender-geo'
import { geocodeContractsWithLlm, type GeocodeContract } from '../src/scraper/place-geocode-llm'
import { validatePlaceSuggestions } from '../src/scraper/place-suggestion'
import { PLACE_GEOCODE_PROMPT_VERSION } from '../src/llm/prompts'
import { isCommittedContract } from '../src/lib/contract-status.js'

const DATA = resolve('public/data')
const OUT = resolve(DATA, 'place-suggestions.json')

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, 'utf8'))
}

function amountOf(c: any): number {
  return c.finalAmountNoTaxes > 0 ? c.finalAmountNoTaxes : c.finalAmount || 0
}
function dateOf(c: any): string | null {
  return c.awardDate || c.startDate || c.formalizedDate || null
}

async function main() {
  for (const f of ['tenders.json', 'geo.json', 'tender-geo.json']) {
    if (!existsSync(resolve(DATA, f))) {
      console.error(
        `[place-geocode] missing ${f} — run scrape:tenders + scrape:geo + compute:tender-geo first`,
      )
      process.exit(1)
    }
  }
  const minConfidence = Number(arg('--min-confidence', '0.5'))
  const limitRaw = arg('--limit')
  const limit = limitRaw ? Number(limitRaw) : undefined

  const tenders = await readJson(resolve(DATA, 'tenders.json'))
  const geo = await readJson(resolve(DATA, 'geo.json'))
  const tgeo = await readJson(resolve(DATA, 'tender-geo.json'))
  const streets = existsSync(resolve(DATA, 'streets.json'))
    ? await readJson(resolve(DATA, 'streets.json'))
    : null
  const pois = existsSync(resolve(DATA, 'civic-poi.json'))
    ? await readJson(resolve(DATA, 'civic-poi.json'))
    : null

  const zones = (geo.neighborhoods || []).map((n: any) => ({
    slug: n.slug,
    name: n.name,
    centroid: n.centroid,
  }))
  const gazetteer = buildGazetteer({
    streets: streets?.streets ?? [],
    pois: pois?.pois ?? [],
    zones,
    zoneAliases: ZONE_ALIASES,
  })

  // Candidate set: awarded contracts NOT already situated by the resolver.
  const situated = new Set<string>(
    (tgeo.assignments || []).filter((a: any) => a.point).map((a: any) => a.id),
  )
  const candidates: GeocodeContract[] = (tenders.contracts || [])
    .filter((c: any) => isCommittedContract(c) && amountOf(c) > 0 && !situated.has(c.id))
    .map((c: any) => ({ id: c.id, title: c.title, amount: amountOf(c), date: dateOf(c) }))

  console.log(
    `[place-geocode] ${candidates.length} unsituated awarded contracts · gazetteer ${gazetteer.length} places · minConf ${minConfidence}${limit ? ` · limit ${limit}` : ''}`,
  )

  const { suggestions, stats } = await geocodeContractsWithLlm(candidates, gazetteer, {
    minConfidence,
    limit,
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    promptVersion: PLACE_GEOCODE_PROMPT_VERSION,
    backend: process.env.LLM_BACKEND ?? null,
    stats,
    suggestions: suggestions.sort((a, b) => b.confidence - a.confidence),
  }
  validatePlaceSuggestions(payload)

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[place-geocode] wrote ${suggestions.length} suggestions → ${OUT} ` +
      `(scanned ${stats.candidatesScanned}, noPlace ${stats.noPlace}, unmatched ${stats.unmatched}, lowConf ${stats.lowConfidence})`,
  )
  console.log(
    '[place-geocode] review + approve with: npm run promote-place -- <contractId> --curator "<name>"',
  )
}

main().catch((err) => {
  console.error('[place-geocode] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
