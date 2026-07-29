#!/usr/bin/env tsx
/**
 * Build the canonical entity registry (companies + people) from
 * tenders.json + officials.json, applying the curated alias overrides.
 *
 *   npm run compute:entities
 *
 * Deterministic, no network — runs inside scrape:all after
 * compute:tender-geo. Writes public/data/entities.json (machine-written;
 * the curated input is public/data/entity-overrides.json, mutated only
 * via `npm run entity-alias`). Missing overrides file → registry builds
 * with zero aliases (fresh-clone safe).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildEntityRegistry,
  validateEntityOverrides,
  type EntityOverrides,
} from '../src/scraper/entities'

const DATA_DIR = resolve('public/data')

function readJson(name: string): unknown {
  const p = resolve(DATA_DIR, name)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

function main() {
  const tenders = readJson('tenders.json') as Parameters<typeof buildEntityRegistry>[0]['tenders']
  if (!tenders) {
    process.stderr.write(
      '[compute-entities] public/data/tenders.json missing — run scrape:tenders first\n',
    )
    process.exit(2)
  }
  const officials = readJson('officials.json') as Parameters<
    typeof buildEntityRegistry
  >[0]['officials']

  let overrides: EntityOverrides | null = null
  const rawOverrides = readJson('entity-overrides.json')
  if (rawOverrides != null) {
    try {
      overrides = validateEntityOverrides(rawOverrides)
    } catch (err) {
      process.stderr.write(`[compute-entities] ${(err as Error).message}\n`)
      process.exit(2)
    }
  }

  const registry = buildEntityRegistry({ tenders, officials, overrides })
  const out = resolve(DATA_DIR, 'entities.json')
  writeFileSync(out, JSON.stringify(registry, null, 2) + '\n', 'utf8')

  const top = registry.companies[0]
  process.stdout.write(
    `[compute-entities] ${registry.stats.companies} companies ` +
      `(${registry.stats.variantsMerged} with merged variants) · ` +
      `${registry.stats.people} people · ${registry.stats.contractRefs} contract refs · ` +
      `${overrides?.aliases.length ?? 0} curated aliases\n`,
  )
  if (top) {
    process.stdout.write(
      `[compute-entities] top: ${top.canonicalName} · €${top.awardedTotalEur.toLocaleString('es-ES')} · ${top.contractCount} contratos\n`,
    )
  }
}

main()
