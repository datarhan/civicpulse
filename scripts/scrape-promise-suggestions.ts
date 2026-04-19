#!/usr/bin/env tsx
/**
 * Run the promise inference engine against the curated promises.json +
 * the latest press + plenos snapshots, and write the results to
 *   public/data/promise-suggestions.json
 *
 * This script NEVER mutates public/data/promises.json. Curators apply
 * suggestions by editing promises.json via a normal PR.
 *
 * Freeze mode: when promises.json's frozenUntil is in the future, the
 * script writes an empty suggestion set and leaves a banner note. The
 * UI honours this.
 *
 * Usage: npm run scrape:promise-suggestions
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inferPromiseSuggestions } from '../src/scraper/promise-inference'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/promise-suggestions.json')

async function readJson(path: string): Promise<any> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const promisesPath = join(PROJECT_ROOT, 'public/data/promises.json')
  const promisesText = await readFile(promisesPath, 'utf8')
  const snap = validatePromisesSnapshot(promisesText)
  const frozen = isFrozen(snap)

  const press = await readJson(join(PROJECT_ROOT, 'public/data/press.json'))
  const plenos = await readJson(join(PROJECT_ROOT, 'public/data/plenos.json'))

  const suggestions = frozen
    ? []
    : inferPromiseSuggestions(snap.items, { press, plenos })

  const payload = {
    generatedAt: new Date().toISOString(),
    frozen,
    frozenUntil: snap.frozenUntil,
    notice: frozen
      ? 'Estado congelado durante el periodo electoral oficial (LOREG art. 50). El motor de sugerencias no actualiza estados hasta la proclamación definitiva.'
      : 'Sugerencias generadas automáticamente. Requieren aprobación humana antes de aplicarse al estado de cada promesa.',
    counts: {
      total: suggestions.length,
      byProposedStatus: suggestions.reduce<Record<string, number>>((a, s) => {
        a[s.proposedStatus] = (a[s.proposedStatus] || 0) + 1
        return a
      }, {}),
    },
    suggestions,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[promise-suggestions] wrote ${OUT}${frozen ? ' (frozen)' : ''} — ${suggestions.length} propuestas`
  )
}

main().catch((err) => {
  console.error('[promise-suggestions] failed:', err)
  process.exit(1)
})
