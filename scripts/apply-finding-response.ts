/**
 * Curator CLI that attaches a bloc's right-of-reply to an existing editorial
 * finding. Writes into public/data/pleno-findings.json and re-validates.
 *
 *   npm run finding-reply -- <findingId> <PARTY> "<verbatim quote ≥20 chars>" \
 *                            [source-url] [responded-at=today]
 *
 * Called by both humans (directly) and by the GH Issue workflow
 * (ingest-finding-responses.yml) once the affected group files a response
 * via the finding-response.yml template.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { SPEAKER_GROUPS, type SpeakerGroup } from '../src/scraper/pleno-votes'

const FINDINGS = resolve('public/data/pleno-findings.json')
// Imported, not restated. The hand-copied version of this set had drifted:
// it omitted EU-Podem (so that group could not file a reply at all) and
// carried `Otro`, which the findings validator no longer accepts.
const ALLOWED_PARTIES = new Set<string>(SPEAKER_GROUPS)

function usage(): never {
  process.stderr.write(
    'usage: npm run finding-reply -- <findingId> <PARTY> "<verbatim ≥20 chars>" [source-url] [YYYY-MM-DD]\n',
  )
  process.exit(2)
}

function main() {
  const [findingId, party, quote, maybeUrl, maybeDate] = process.argv.slice(2)
  if (!findingId || !party || !quote) usage()
  if (!ALLOWED_PARTIES.has(party)) {
    process.stderr.write(`unknown party "${party}" — allowed: ${[...ALLOWED_PARTIES].join(', ')}\n`)
    process.exit(2)
  }
  if (quote.trim().length < 20) {
    process.stderr.write('quote must be ≥20 chars verbatim\n')
    process.exit(2)
  }
  if (!existsSync(FINDINGS)) {
    process.stderr.write(`${FINDINGS} not found\n`)
    process.exit(1)
  }

  const snapshot = validateFindingsSnapshot(readFileSync(FINDINGS, 'utf8'))
  const idx = snapshot.items.findIndex((f) => f.id === findingId)
  if (idx < 0) {
    process.stderr.write(`finding ${findingId} not found\n`)
    process.exit(1)
  }

  const respondedAt =
    maybeDate && /^\d{4}-\d{2}-\d{2}$/.test(maybeDate)
      ? maybeDate
      : new Date().toISOString().slice(0, 10)
  const sourceUrl =
    maybeUrl && maybeUrl.trim().length > 0 && /^https?:\/\//.test(maybeUrl)
      ? maybeUrl.trim()
      : undefined

  snapshot.items[idx] = {
    ...snapshot.items[idx],
    response: {
      from: party as SpeakerGroup,
      quote: quote.trim(),
      ...(sourceUrl ? { sourceUrl } : {}),
      respondedAt,
    },
  }
  snapshot.generatedAt = new Date().toISOString()

  const serialized = JSON.stringify(snapshot, null, 2) + '\n'
  validateFindingsSnapshot(serialized)
  writeFileSync(FINDINGS, serialized, 'utf8')
  process.stdout.write(
    `[finding-reply] attached response to ${findingId} from ${party} (${quote.length} chars) → ${FINDINGS}\n`,
  )
}

main()
