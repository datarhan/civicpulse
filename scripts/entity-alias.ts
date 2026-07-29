#!/usr/bin/env tsx
/**
 * Curator CLI: merge a company name variant into a canonical entity.
 *
 *   npm run entity-alias -- "<variant name or key>" "<canonical name or key>" \
 *       [--note "<why>"] [--curator "<name>"]
 *
 * Both arguments are normalized (normalizeCompanyKey) before writing, so
 * you can paste raw razones sociales. Appends to the CURATED
 * public/data/entity-overrides.json (validated: no self-aliases, no
 * chains), then rebuilds public/data/entities.json so the merge is live
 * immediately. Git history is the audit trail — commit both files.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  normalizeCompanyKey,
  validateEntityOverrides,
  type EntityOverrides,
} from '../src/scraper/entities'

const OVERRIDES_PATH = resolve('public/data/entity-overrides.json')
const ENTITIES_PATH = resolve('public/data/entities.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function bail(msg: string): never {
  process.stderr.write(`[entity-alias] ${msg}\n`)
  process.exit(2)
}

function main() {
  const positional = process.argv.slice(2).filter((a, i, arr) => {
    if (a.startsWith('--')) return false
    if (i > 0 && arr[i - 1].startsWith('--')) return false
    return true
  })
  const [variantRaw, canonicalRaw] = positional
  if (!variantRaw || !canonicalRaw) {
    bail('Usage: entity-alias -- "<variant>" "<canonical>" [--note "…"] [--curator "…"]')
  }
  const variantKey = normalizeCompanyKey(variantRaw)
  const canonicalKey = normalizeCompanyKey(canonicalRaw)
  if (!variantKey || !canonicalKey) bail('names normalize to empty keys')
  if (variantKey === canonicalKey) {
    bail(
      `"${variantRaw}" and "${canonicalRaw}" already normalize to the same key ` +
        `("${variantKey}") — no alias needed`,
    )
  }

  const existing: EntityOverrides = existsSync(OVERRIDES_PATH)
    ? validateEntityOverrides(readFileSync(OVERRIDES_PATH, 'utf8'))
    : { version: 1, generatedAt: new Date().toISOString(), aliases: [] }

  // Warn (not fail) when the variant key is unknown to the current registry —
  // it may refer to a contractor that appears in a future scrape.
  if (existsSync(ENTITIES_PATH)) {
    const reg = JSON.parse(readFileSync(ENTITIES_PATH, 'utf8')) as {
      companies?: Array<{ nameKey?: string }>
    }
    const known = new Set((reg.companies ?? []).map((c) => c.nameKey))
    for (const [label, key] of [
      ['variant', variantKey],
      ['canonical', canonicalKey],
    ] as const) {
      if (!known.has(key)) {
        process.stderr.write(
          `[entity-alias] warning: ${label} key "${key}" not present in current entities.json\n`,
        )
      }
    }
  }

  const updated: EntityOverrides = {
    ...existing,
    generatedAt: new Date().toISOString(),
    aliases: [
      ...existing.aliases,
      {
        variantKey,
        canonicalKey,
        note: getFlag('--note') ?? undefined,
        curator: getFlag('--curator') ?? 'curator',
        addedAt: new Date().toISOString().slice(0, 10),
      },
    ],
  }
  // Re-validate the whole file (self/chain/duplicate guards) before writing.
  const validated = validateEntityOverrides(updated)
  writeFileSync(OVERRIDES_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8')
  process.stdout.write(
    `[entity-alias] added: "${variantKey}" → "${canonicalKey}" (${validated.aliases.length} aliases total)\n`,
  )

  // Rebuild the registry so the merge is live immediately.
  execFileSync('npx', ['tsx', 'scripts/compute-entities.ts'], { stdio: 'inherit' })
}

main()
