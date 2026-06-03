/**
 * Curator CLI: record an official pleno vote into public/data/pleno-votes.json.
 *
 * Usage (positional, for quick terminal use):
 *   npm run pleno-vote -- <pleno-id> <item#> <outcome> \
 *                         "<verbatim acuerdo title>" \
 *                         <source-url> \
 *                         "PSOE:a_favor,PP:en_contra,VOX:abstencion,Compromís:a_favor"
 *
 * Or (preferred, for GH Issue ingestion):
 *   npm run pleno-vote -- --file vote.json
 *
 * The file form is one JSON object matching the PlenoVote schema (the same one
 * that ships in pleno-votes.json). Both forms re-validate the ENTIRE snapshot
 * after the insert — a single broken record refuses the write.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateSnapshot,
  validateVote,
  ALLOWED_BLOCS,
  ALLOWED_DIRECTIONS,
  ALLOWED_OUTCOMES,
  type PlenoVote,
  type PlenoVotesSnapshot,
  type VoteDirection,
  type VoteBloc,
} from '../src/scraper/pleno-votes'

const DATA_PATH = resolve('public/data/pleno-votes.json')
const PLENOS_PATH = resolve('public/data/plenos.json')

function loadSnapshot(): PlenoVotesSnapshot {
  if (!existsSync(DATA_PATH)) {
    return {
      generatedAt: new Date().toISOString(),
      source: {
        description:
          'Curated voting records transcribed from published pleno actas (Ayuntamiento de Riba-roja de Túria).',
        contract: 'Human-edited, schema-validated. Mutations only via npm run pleno-vote CLI.',
      },
      stats: {
        total: 0,
        byOutcome: { aprobado: 0, rechazado: 0, retirado: 0, aplazado: 0 },
        byPleno: {},
      },
      items: [],
    }
  }
  return validateSnapshot(JSON.parse(readFileSync(DATA_PATH, 'utf8')))
}

function parseVoteTuples(spec: string) {
  return spec.split(',').map((pair) => {
    const [bloc, direction] = pair.split(':').map((s) => s.trim())
    if (!bloc || !direction) {
      throw new Error(`malformed vote tuple "${pair}" (expected "<bloc>:<direction>")`)
    }
    if (!(ALLOWED_BLOCS as readonly string[]).includes(bloc)) {
      throw new Error(`unknown bloc "${bloc}" (allowed: ${ALLOWED_BLOCS.join(', ')})`)
    }
    if (!(ALLOWED_DIRECTIONS as readonly string[]).includes(direction)) {
      throw new Error(
        `unknown direction "${direction}" (allowed: ${ALLOWED_DIRECTIONS.join(', ')})`,
      )
    }
    return { bloc: bloc as VoteBloc, direction: direction as VoteDirection }
  })
}

function lookupPleno(plenoId: string): { date: string } {
  if (!existsSync(PLENOS_PATH))
    throw new Error('plenos.json not found — run `npm run scrape:plenos` first')
  const plenos = JSON.parse(readFileSync(PLENOS_PATH, 'utf8')) as {
    items: { id: string; date: string }[]
  }
  const match = plenos.items.find((p) => p.id === plenoId)
  if (!match) throw new Error(`pleno id "${plenoId}" not found in plenos.json`)
  return { date: match.date }
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run pleno-vote -- <pleno-id> <item#> <outcome> "<title>" <source-url> "<votes>"\n' +
      '  npm run pleno-vote -- --file path/to/vote.json\n\n' +
      `Outcomes:   ${ALLOWED_OUTCOMES.join(', ')}\n` +
      `Blocs:      ${ALLOWED_BLOCS.join(', ')}\n` +
      `Directions: ${ALLOWED_DIRECTIONS.join(', ')}\n`,
  )
  process.exit(1)
}

function main() {
  const args = process.argv.slice(2)
  let incoming: PlenoVote

  if (args[0] === '--file') {
    if (!args[1]) usage()
    const raw = JSON.parse(readFileSync(resolve(args[1]), 'utf8'))
    incoming = validateVote(raw)
  } else if (args.length === 6) {
    const [plenoId, itemStr, outcome, title, sourceUrl, voteSpec] = args
    const item = Number(itemStr)
    if (!Number.isInteger(item) || item <= 0) usage()
    const { date } = lookupPleno(plenoId)
    incoming = validateVote({
      id: `${plenoId}-${String(item).padStart(2, '0')}`,
      plenoId,
      plenoDate: date,
      itemNumber: item,
      title,
      outcome,
      votes: parseVoteTuples(voteSpec),
      sourceUrl,
      sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: new Date().toISOString().slice(0, 10),
    })
  } else {
    usage()
  }

  const snap = loadSnapshot()
  const existingIdx = snap.items.findIndex((v) => v.id === incoming.id)
  if (existingIdx >= 0) {
    process.stdout.write(`[pleno-vote] replacing existing ${incoming.id}\n`)
    snap.items[existingIdx] = incoming
  } else {
    snap.items.push(incoming)
  }

  // sort newest session first, then item ascending
  snap.items.sort((a, b) =>
    a.plenoDate === b.plenoDate
      ? a.itemNumber - b.itemNumber
      : b.plenoDate.localeCompare(a.plenoDate),
  )

  snap.generatedAt = new Date().toISOString()
  const validated = validateSnapshot(snap)
  writeFileSync(DATA_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8')
  process.stdout.write(`[pleno-vote] wrote ${validated.items.length} record(s) → ${DATA_PATH}\n`)
}

main()
