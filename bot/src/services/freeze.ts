/**
 * LOREG electoral freeze hook — reuses the promises.json frozenUntil
 * field as the single source of truth. During a freeze window:
 *   - channel broadcasts must be suspended (art. 50 LOREG — no
 *     institutional campaigning);
 *   - batch registration pauses automatically;
 *   - silencio-cron auto-transitions pause.
 *
 * Reads the same public/data/promises.json the front-end reads.
 *
 * `PROMISES_JSON`, if set, points elsewhere — the bot's test run sets it to a
 * fixture (bot/vitest.config.ts). The tests used to read the live file, and
 * since the deploy waits for them (bot-deploy.yml) a `npm run freeze:set` would
 * have turned them red, skipped the deploy and left the bot running the
 * UNFROZEN image through the campaign: the opposite of what this file is for.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

interface PromisesSnapshotLite {
  frozenUntil?: string | null
}

let cachedAt = 0
let cachedPath = ''
let cached: PromisesSnapshotLite | null = null

function promisesPath(): string {
  const fijada = process.env.PROMISES_JSON?.trim()
  return fijada
    ? resolve(fijada)
    : resolve(HERE, '..', '..', '..', 'public', 'data', 'promises.json')
}

function loadPromisesSnapshot(): PromisesSnapshotLite | null {
  // Refresh every 60s so a freeze toggled via `npm run freeze:set` is
  // picked up without a bot restart.
  const now = Date.now()
  const path = promisesPath()
  if (path !== cachedPath) {
    // Otro fichero: lo de la caché era de otro. Sin esto, cambiar la variable
    // seguiría contestando con el fichero anterior durante un minuto.
    cached = null
    cachedAt = 0
    cachedPath = path
  }
  if (cached && now - cachedAt < 60_000) return cached
  try {
    cached = JSON.parse(readFileSync(path, 'utf8'))
    cachedAt = now
    return cached
  } catch (err) {
    // Keep the LAST KNOWN state on a transient read failure (e.g. the file
    // mid-atomic-replace by a scrape run) instead of silently flipping to
    // "not frozen" — that flip is a LOREG art. 50 hazard. Log so the
    // operator sees a persistent failure in the launchd log.
    console.error('[freeze] promises.json read failed:', (err as Error).message)
    cachedAt = now // back off for the cache window before retrying
    return cached
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
