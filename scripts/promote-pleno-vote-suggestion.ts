/**
 * Curator shortcut: promote an auto-inferred vote suggestion into
 * public/data/pleno-votes.json with a single command.
 *
 * The minimum human-in-the-loop flow is:
 *   1. Run `npm run extract:pleno-votes -- <plenoId> --engine llm` (or regex)
 *      → writes public/data/pleno-votes-suggestions.json
 *   2. Open the suggestion, eyeball it against the acta / YouTube video
 *   3. `npm run promote-vote -- <plenoId> <itemNumber> [sourceUrl]`
 *      → fills title (from plenos-agendas.json), dueBy + dueBySource (from
 *        the suggestion), and calls the existing apply-pleno-vote CLI which
 *        re-validates the whole snapshot before writing.
 *
 * If the curator passes --edit, the generated vote.json is NOT applied — it
 * is written to /tmp/vote-<id>.json for hand-review before manual `npm run
 * pleno-vote -- --file`.
 *
 * NOTE: this script never bypasses validation. If the suggestion is
 * incomplete (missing title, sourceUrl, etc.) it prints a precise error and
 * refuses to write. No autopilot past the V1 legal gate.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  transcriptRefUrl,
  TRANSCRIPT_SOURCE_PUBLISHER,
  validateVote,
  voteSourceKindForUrl,
  type PlenoVote,
} from '../src/scraper/pleno-votes'
import type { InferredVote } from '../src/scraper/pleno-vote-inference'

const SUGGESTIONS = resolve('public/data/pleno-votes-suggestions.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')
const PLENOS = resolve('public/data/plenos.json')

interface AgendaPleno {
  id: string
  date: string
  link: string
  agenda: Array<{
    number: number
    title: string
    department?: string | null
    expediente?: string | null
  }>
}

function usage(): never {
  process.stderr.write(
    'usage:\n' +
      '  npm run promote-vote -- <plenoId> <itemNumber> [sourceUrl] [--edit]\n\n' +
      'Example:\n' +
      '  npm run promote-vote -- k4olcs 3\n\n' +
      'sourceUrl is the OUTCOME source and defaults to the link in plenos.json.\n' +
      'Pass one only to override it, and only a URL voteSourceKindForUrl can\n' +
      'recognise — an unknown host is refused, never guessed. (There is no\n' +
      'example acta URL here on purpose: no acta is reachable, the portal has\n' +
      'moved twice, and every path once printed here now 404s.)\n\n' +
      'The script reads pleno-votes-suggestions.json (auto-inferred) and\n' +
      'fills the curated fields (title, department, expediente, dueBy,\n' +
      'dueBySource) from agenda + suggestion data. You still eyeball the\n' +
      'match before running — no autopilot.\n',
  )
  process.exit(2)
}

function loadJson<T>(path: string, label: string): T {
  if (!existsSync(path)) {
    process.stderr.write(`[promote-vote] ${label} not found — have you run the pipeline?\n`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function main() {
  const args = process.argv.slice(2)
  const editMode = args.includes('--edit')
  const positional = args.filter((a) => !a.startsWith('--'))
  if (positional.length < 2 || positional.length > 3) usage()
  const [plenoId, itemStr, maybeUrl] = positional
  const itemNumber = Number(itemStr)
  if (!Number.isInteger(itemNumber) || itemNumber <= 0) usage()

  const suggestions = loadJson<{ items: InferredVote[] }>(
    SUGGESTIONS,
    'pleno-votes-suggestions.json',
  )
  const agendasDoc = loadJson<{ plenos: AgendaPleno[] }>(AGENDAS, 'plenos-agendas.json')
  const plenosDoc = loadJson<{ items: Array<{ id: string; date: string; link: string }> }>(
    PLENOS,
    'plenos.json',
  )

  const suggestion = suggestions.items.find(
    (s) => s.plenoId === plenoId && s.itemNumber === itemNumber,
  )
  if (!suggestion) {
    process.stderr.write(
      `[promote-vote] no suggestion found for plenoId=${plenoId} itemNumber=${itemNumber}.\n` +
        `Run: npx tsx scripts/extract-pleno-votes.ts ${plenoId} --engine llm\n`,
    )
    process.exit(1)
  }
  if (suggestion.votes.length === 0) {
    process.stderr.write('[promote-vote] suggestion has no votes — cannot promote.\n')
    process.exit(1)
  }
  if (!suggestion.outcome) {
    process.stderr.write(
      '[promote-vote] suggestion outcome is null — the automatic engine was not confident.\n' +
        'Edit manually via `npm run pleno-vote -- --file`.\n',
    )
    process.exit(1)
  }

  const agendaPleno = agendasDoc.plenos.find((p) => p.id === plenoId)
  const agendaItem = agendaPleno?.agenda.find((a) => a.number === itemNumber)
  if (!agendaItem) {
    process.stderr.write(
      `[promote-vote] no agenda item for plenoId=${plenoId} itemNumber=${itemNumber}.\n` +
        'The title must come from the orden del día — it is not safe to fabricate.\n',
    )
    process.exit(1)
  }
  if (agendaItem.title.trim().length < 20) {
    process.stderr.write(
      `[promote-vote] agenda title "${agendaItem.title}" is <20 chars; expand it manually before promoting.\n`,
    )
    process.exit(1)
  }

  const plenoMeta = plenosDoc.items.find((p) => p.id === plenoId)
  const sourceUrl = maybeUrl || plenoMeta?.link
  if (!sourceUrl) {
    process.stderr.write(
      '[promote-vote] no sourceUrl — pass it as the 3rd positional argument (acta PDF preferred).\n',
    )
    process.exit(1)
  }

  // The suggestion's OUTCOME is checked against regmeet (which publishes it);
  // its per-bloc tally is read out of the session transcript by the extractor
  // and regmeet publishes no tally at all. Promoting used to hang both off the
  // regmeet link, which is the defect the 2026-08-05 migration corrected — so
  // the promoted row now cites the transcript for the half that came from it,
  // `sin-verificar` until a curator cotejes it against the acta.
  const outcomeKind = voteSourceKindForUrl(sourceUrl)
  if (outcomeKind == null) {
    process.stderr.write(
      `[promote-vote] unrecognised source url "${sourceUrl}" — cannot say what kind of ` +
        'document it is. Pass the acta or the regmeet link explicitly.\n',
    )
    process.exit(1)
  }
  const today = new Date().toISOString().slice(0, 10)
  const transcriptPath = resolve(`public/data/pleno-transcripts/${plenoId}.txt`)
  if (suggestion.votes.length > 0 && !existsSync(transcriptPath)) {
    process.stderr.write(
      `[promote-vote] the per-bloc tally comes from the session transcript, but ` +
        `public/data/pleno-transcripts/${plenoId}.txt is not in the build — refusing to ` +
        'cite a source a reader cannot open.\n',
    )
    process.exit(1)
  }

  const paddedItem = String(itemNumber).padStart(2, '0')
  const candidate: Partial<PlenoVote> & Record<string, unknown> = {
    id: `${plenoId}-${paddedItem}`,
    plenoId,
    plenoDate: suggestion.plenoDate,
    itemNumber,
    title: agendaItem.title.trim(),
    outcome: suggestion.outcome,
    votes: suggestion.votes,
    ...(agendaItem.department ? { department: agendaItem.department } : {}),
    ...(agendaItem.expediente ? { expediente: agendaItem.expediente } : {}),
    ...(suggestion.dueBy && suggestion.dueBySource
      ? { dueBy: suggestion.dueBy, dueBySource: suggestion.dueBySource }
      : {}),
    provenance: {
      outcome: {
        kind: outcomeKind,
        url: sourceUrl,
        publisher: 'Ayuntamiento de Riba-roja de Túria',
        retrievedAt: today,
        verification: 'sin-verificar',
      },
      breakdown:
        suggestion.votes.length > 0
          ? {
              kind: 'transcripcion',
              url: transcriptRefUrl(plenoId),
              publisher: TRANSCRIPT_SOURCE_PUBLISHER,
              retrievedAt: today,
              verification: 'sin-verificar',
            }
          : null,
    },
    sourceUrl,
    sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
    retrievedAt: today,
  }

  // Defensive: run the validator before writing to disk or invoking the CLI.
  // If this throws, the curator sees precisely what field is missing.
  validateVote(candidate)

  if (editMode) {
    const tmpPath = `/tmp/vote-${plenoId}-${paddedItem}.json`
    writeFileSync(tmpPath, JSON.stringify(candidate, null, 2) + '\n')
    process.stdout.write(
      `[promote-vote] wrote ${tmpPath} (not applied). Review then run:\n` +
        `  npm run pleno-vote -- --file ${tmpPath}\n`,
    )
    return
  }

  const tmpPath = `/tmp/vote-${plenoId}-${paddedItem}.json`
  writeFileSync(tmpPath, JSON.stringify(candidate, null, 2) + '\n')
  const result = spawnSync('npx', ['tsx', 'scripts/apply-pleno-vote.ts', '--file', tmpPath], {
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
  process.stdout.write(
    `[promote-vote] promoted ${plenoId}-${paddedItem}` +
      (suggestion.dueBy ? ` (incl. dueBy=${suggestion.dueBy})` : '') +
      '\n',
  )
}

main()
