#!/usr/bin/env tsx
/**
 * Apply an approved right-of-reply into public/data/promises.json.
 *
 * Curator workflow:
 *   1. A party opens a GitHub issue using the "Derecho de réplica" template.
 *   2. Maintainer reviews; if accepted, runs this script with the details.
 *   3. Script mutates ONLY the target promise's `response` field.
 *   4. Script re-validates the full snapshot before writing.
 *   5. Maintainer commits with a reference to the originating issue.
 *
 * Usage:
 *   npm run reply -- <promise-id> <PARTY> "<verbatim quote>" [<source-url> <publisher>] [<responded-at>]
 *
 * Example:
 *   npm run reply -- pp-voto-contra-fondos-dana PP \
 *     "Como portavoz del grupo municipal del PP, matizamos..." \
 *     https://example.com/nota 'Nota de prensa PP' 2026-04-20
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validatePromisesSnapshot,
  ALLOWED_PARTIES,
  type Party,
} from '../src/scraper/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const PROMISES = join(PROJECT_ROOT, 'public/data/promises.json')

function usage(): never {
  console.error(
    `Usage:
  npm run reply -- <promise-id> <PARTY> "<verbatim quote>" [<source-url> <publisher>] [<responded-at>]

Arguments:
  promise-id   The id field of the target promise (e.g. pp-voto-contra-fondos-dana)
  PARTY        One of: ${ALLOWED_PARTIES.join(' | ')}
  quote        Verbatim response (≥20 chars). Will be published as-is.
  source-url   Optional. Absolute http(s) URL to the party's public statement.
  publisher    Optional. Where the statement was published.
  responded-at Optional ISO date. Defaults to today.`
  )
  process.exit(2)
}

async function main() {
  const [promiseId, partyRaw, quoteRaw, sourceUrl, sourcePublisher, respondedAtRaw] =
    process.argv.slice(2)

  if (!promiseId || !partyRaw || !quoteRaw) usage()
  if (!(ALLOWED_PARTIES as readonly string[]).includes(partyRaw)) {
    console.error(
      `[reply] party must be one of: ${ALLOWED_PARTIES.join(', ')} (got "${partyRaw}")`
    )
    process.exit(2)
  }
  const party = partyRaw as Party
  const quote = quoteRaw.trim()
  if (quote.length < 20) {
    console.error(`[reply] verbatim quote must be ≥20 characters (got ${quote.length})`)
    process.exit(2)
  }
  const respondedAt =
    respondedAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(respondedAtRaw)
      ? respondedAtRaw
      : new Date().toISOString().slice(0, 10)

  const raw = await readFile(PROMISES, 'utf8')
  // Validate the file as-is — never write on top of a broken snapshot.
  validatePromisesSnapshot(raw)
  const snap = JSON.parse(raw) as Record<string, unknown>
  const items = (snap.items as Array<Record<string, unknown>>) || []
  const target = items.find((p) => p.id === promiseId)
  if (!target) {
    console.error(`[reply] promise id "${promiseId}" not found`)
    process.exit(1)
  }

  const response: Record<string, unknown> = {
    from: party,
    quote,
    respondedAt,
  }
  if (sourceUrl && sourcePublisher) {
    response.source = { url: sourceUrl, publisher: sourcePublisher }
  }
  target.response = response
  target.updatedAt = new Date().toISOString().slice(0, 10)

  const mutated = {
    ...snap,
    generatedAt: new Date().toISOString(),
    items,
  }

  const serialized = JSON.stringify(mutated, null, 2) + '\n'
  // Revalidate defence-in-depth before writing.
  validatePromisesSnapshot(serialized)
  await writeFile(PROMISES, serialized)

  console.log(`[reply] applied to "${promiseId}": ${party} replied (${quote.length} chars)`)
}

main().catch((err) => {
  console.error('[reply] failed:', err)
  process.exit(1)
})
