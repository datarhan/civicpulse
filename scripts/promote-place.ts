#!/usr/bin/env tsx
/**
 * Curator promotion: turn an LLM place-geocode SUGGESTION into a published
 * OVERRIDE. Reads public/data/place-suggestions.json, finds the row by contract
 * id, and appends a validated record to public/data/place-overrides.json — which
 * compute-tender-geo applies to the map. This is the human gate: nothing the LLM
 * suggested reaches the public map until it passes through here.
 *
 * Usage:
 *   npm run promote-place -- <contractId> --curator "<name>" [--note "<text>"] [--edit]
 *   npm run promote-place -- <contractId> --reject                # drop an existing override
 * --edit writes to /tmp instead of persisting (dry run).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  overrideFromSuggestion,
  validatePlaceOverrides,
  type PlaceOverride,
  type PlaceSuggestion,
} from '../src/scraper/place-suggestion'

const DATA = resolve('public/data')
const SUGGESTIONS = resolve(DATA, 'place-suggestions.json')
const OVERRIDES = resolve(DATA, 'place-overrides.json')

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : undefined
}
function has(name: string): boolean {
  return process.argv.includes(name)
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const contractId = process.argv[2]
  if (!contractId || contractId.startsWith('--')) {
    console.error(
      'usage: npm run promote-place -- <contractId> --curator "<name>" [--note "…"] [--reject] [--edit]',
    )
    process.exit(1)
  }
  const reject = has('--reject')
  const edit = has('--edit')

  const existing: PlaceOverride[] = existsSync(OVERRIDES)
    ? (await readJson(OVERRIDES)).overrides || []
    : []
  const others = existing.filter((o) => o.contractId !== contractId)

  let overrides: PlaceOverride[]
  if (reject) {
    if (others.length === existing.length) {
      console.error(`[promote-place] no existing override for ${contractId}`)
      process.exit(1)
    }
    overrides = others
    console.log(`[promote-place] removed override for ${contractId}`)
  } else {
    const curator = flag('--curator')
    if (!curator) {
      console.error('[promote-place] --curator "<name>" is required')
      process.exit(1)
    }
    if (!existsSync(SUGGESTIONS)) {
      console.error(`[promote-place] ${SUGGESTIONS} not found — run suggest:place-geocode first`)
      process.exit(1)
    }
    const sugSnap = await readJson(SUGGESTIONS)
    const suggestion: PlaceSuggestion | undefined = (sugSnap.suggestions || []).find(
      (s: PlaceSuggestion) => s.contractId === contractId,
    )
    if (!suggestion) {
      console.error(`[promote-place] no suggestion for ${contractId} in place-suggestions.json`)
      process.exit(1)
    }
    const ov = overrideFromSuggestion(suggestion, curator, new Date().toISOString(), flag('--note'))
    overrides = [...others, ov]
    console.log(
      `[promote-place] «${suggestion.title.slice(0, 60)}» → «${ov.name}» (${ov.kind}) situado por LLM «${suggestion.llmPlaceName}» · conf ${suggestion.confidence}`,
    )
  }

  const snapshot = { generatedAt: new Date().toISOString(), overrides }
  validatePlaceOverrides(snapshot)

  const out = edit ? join(tmpdir(), 'place-overrides.json') : OVERRIDES
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`[promote-place] wrote ${overrides.length} override(s) → ${out}`)
  if (!edit) console.log('[promote-place] run `npm run compute:tender-geo` to apply to the map.')
}

main().catch((err) => {
  console.error('[promote-place] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
