import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  routeQueja,
  type OfficialsSnapshot,
  type QuejaInput,
  type QuejaRouting,
} from '../../../src/scraper/queja-router.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

let cached: OfficialsSnapshot | null = null

/**
 * Load the officials.json snapshot once per process. Path is resolved
 * relative to the bot package root; override via OFFICIALS_JSON env var.
 */
export function loadOfficials(): OfficialsSnapshot {
  if (cached) return cached
  const envPath = process.env.OFFICIALS_JSON
  const path = envPath
    ? resolve(process.cwd(), envPath)
    : resolve(HERE, '..', '..', '..', 'public', 'data', 'officials.json')
  const json = JSON.parse(readFileSync(path, 'utf8')) as OfficialsSnapshot
  cached = json
  return json
}

export function routeUsingLocalOfficials(q: QuejaInput): QuejaRouting {
  return routeQueja(q, loadOfficials())
}
