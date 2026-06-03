#!/usr/bin/env tsx
/**
 * Set or clear the LOREG electoral-freeze on the promises tracker.
 *
 * Usage:
 *   npm run freeze:set -- 2027-06-10     # freeze until polling day + 10
 *   npm run freeze:clear                  # lift the freeze (must be explicit)
 *   npm run freeze:status                 # report current state
 *
 * Behaviour:
 *   - Rewrites only `frozenUntil` and `generatedAt` in promises.json.
 *   - Validates the updated snapshot through the same schema validator
 *     the test suite uses, so a malformed edit can't ship.
 *   - Prints a diff-style summary of what changed.
 *
 * Intended flow: when Junta Electoral publishes the election convocatoria
 * via Real Decreto, run `freeze:set` with the official proclamation date
 * + a couple of weeks of safety margin; this lands as a one-line PR that
 * CI tests + nightly cron will honour from the next deploy onwards.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePromisesSnapshot } from '../src/scraper/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const PROMISES = join(PROJECT_ROOT, 'public/data/promises.json')

function usage(): never {
  console.error(`Usage:
  npm run freeze:set -- <YYYY-MM-DD>   set frozenUntil to the given date
  npm run freeze:clear                  clear frozenUntil (explicit)
  npm run freeze:status                 print the current freeze state`)
  process.exit(2)
}

async function main() {
  const action = process.argv[2]
  if (!action) usage()

  const raw = await readFile(PROMISES, 'utf8')
  // Validate the file as it is today — catch malformed snapshots early.
  const before = validatePromisesSnapshot(raw)

  if (action === 'status') {
    const state = before.frozenUntil ? `frozen until ${before.frozenUntil}` : 'not frozen'
    const now = new Date()
    const active = before.frozenUntil ? now < new Date(before.frozenUntil) : false
    console.log(`[freeze] ${state} · active now: ${active}`)
    return
  }

  let nextFrozenUntil: string | null = null
  if (action === 'set') {
    const arg = process.argv[3]
    if (!arg || !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      console.error('[freeze] set requires an ISO YYYY-MM-DD argument')
      usage()
    }
    const d = new Date(arg + 'T00:00:00Z')
    if (!Number.isFinite(d.getTime())) {
      console.error(`[freeze] ${arg} is not a real date`)
      process.exit(2)
    }
    nextFrozenUntil = arg
  } else if (action === 'clear') {
    nextFrozenUntil = null
  } else {
    usage()
  }

  const mutated = {
    ...before,
    frozenUntil: nextFrozenUntil,
    generatedAt: new Date().toISOString(),
  }

  const serialized = JSON.stringify(mutated, null, 2) + '\n'
  // Re-validate the new JSON before writing — defence in depth.
  validatePromisesSnapshot(serialized)

  await writeFile(PROMISES, serialized)
  console.log(
    `[freeze] ${before.frozenUntil || 'null'} → ${nextFrozenUntil || 'null'} (${before.items.length} promesas)`,
  )
  if (nextFrozenUntil) {
    console.log(
      `[freeze] /promesas UI entrará en modo solo-lectura hasta ${nextFrozenUntil}. Las sugerencias del motor seguirán ejecutándose pero no alterarán estados.`,
    )
  } else {
    console.log(`[freeze] tracker de vuelta a modo curación normal.`)
  }
}

main().catch((err) => {
  console.error('[freeze] failed:', err)
  process.exit(1)
})
