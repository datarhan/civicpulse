/**
 * LOREG electoral freeze hook — reuses the promises.json frozenUntil
 * field as the single source of truth. During a freeze window:
 *   - channel broadcasts must be suspended (art. 50 LOREG — no
 *     institutional campaigning);
 *   - batch registration pauses automatically;
 *   - silencio-cron auto-transitions pause.
 *
 * Reads the same public/data/promises.json the front-end reads.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

interface PromisesSnapshotLite {
  frozenUntil?: string | null
}

let cachedAt = 0
let cached: PromisesSnapshotLite | null = null

function loadPromisesSnapshot(): PromisesSnapshotLite | null {
  // Refresh every 60s so a freeze toggled via `npm run freeze:set` is
  // picked up without a bot restart.
  const now = Date.now()
  if (cached && now - cachedAt < 60_000) return cached
  const path = resolve(HERE, '..', '..', '..', 'public', 'data', 'promises.json')
  try {
    cached = JSON.parse(readFileSync(path, 'utf8'))
    cachedAt = now
    return cached
  } catch {
    cached = null
    cachedAt = now
    return null
  }
}

export function isLoregFrozen(now: Date = new Date()): boolean {
  const snap = loadPromisesSnapshot()
  if (!snap?.frozenUntil) return false
  const until = new Date(snap.frozenUntil)
  if (Number.isNaN(until.getTime())) return false
  return now < until
}

export function frozenUntil(): string | null {
  return loadPromisesSnapshot()?.frozenUntil ?? null
}
