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
  voteSourceKindForUrl,
  ALLOWED_BLOCS,
  ALLOWED_DIRECTIONS,
  ALLOWED_OUTCOMES,
  BREAKDOWN_SOURCE_KINDS,
  type PlenoVote,
  type PlenoVotesSnapshot,
  type VoteDirection,
  type VoteBloc,
  type VoteProvenance,
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
        retracted: { record: 0, breakdown: 0 },
      },
      items: [],
      retractions: [],
    }
  }
  return validateSnapshot(JSON.parse(readFileSync(DATA_PATH, 'utf8')))
}

/**
 * Spelling for "the acta records this vote but does not name the group". The
 * positional form is a shell string, so `null` needs a literal token; both the
 * JSON spelling and the Castilian one are accepted because a curator typing at
 * a terminal will reach for either.
 */
const UNNAMED_BLOC = new Set(['null', 'sin-identificar'])

function parseVoteTuples(spec: string) {
  return spec.split(',').map((pair) => {
    const [bloc, direction] = pair.split(':').map((s) => s.trim())
    if (!bloc || !direction) {
      throw new Error(`malformed vote tuple "${pair}" (expected "<bloc>:<direction>")`)
    }
    if (UNNAMED_BLOC.has(bloc)) {
      if (!(ALLOWED_DIRECTIONS as readonly string[]).includes(direction)) {
        throw new Error(
          `unknown direction "${direction}" (allowed: ${ALLOWED_DIRECTIONS.join(', ')})`,
        )
      }
      return { bloc: null, direction: direction as VoteDirection }
    }
    if (!(ALLOWED_BLOCS as readonly string[]).includes(bloc)) {
      throw new Error(
        `unknown bloc "${bloc}" (allowed: ${ALLOWED_BLOCS.join(', ')}, or ` +
          `${[...UNNAMED_BLOC].join('/')} when the acta does not name the group)`,
      )
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
      `            ${[...UNNAMED_BLOC].join(' / ')} — the acta records the vote but names no group\n` +
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
    const votes = parseVoteTuples(voteSpec)
    // The positional form is «I am reading one document and typing it in», so
    // that one document is cited for both halves — and the validator then
    // refuses the combination that caused the 2026-08-05 migration: a per-bloc
    // tally attributed to a source that publishes no tally. To enter a vote
    // whose outcome and breakdown come from DIFFERENT documents (a regmeet
    // outcome with a transcript breakdown, the ordinary case), use --file.
    const kind = voteSourceKindForUrl(sourceUrl)
    if (kind == null) {
      process.stderr.write(
        `[pleno-vote] unrecognised source url "${sourceUrl}" — cannot tell what kind of ` +
          `document it is, and guessing is how a breakdown ends up cited to something ` +
          `that does not publish one. Use --file and state provenance explicitly.\n`,
      )
      process.exit(1)
    }
    if (votes.length > 0 && !(BREAKDOWN_SOURCE_KINDS as readonly string[]).includes(kind)) {
      process.stderr.write(
        `[pleno-vote] ${sourceUrl} publishes no per-bloc breakdown, so it cannot be the ` +
          `source of one. Record the outcome from it and the tally from the document that ` +
          `does carry it (the session transcript, or the acta) via:\n` +
          `  npm run pleno-vote -- --file <vote.json>\n`,
      )
      process.exit(1)
    }
    const today = new Date().toISOString().slice(0, 10)
    const ref = {
      kind,
      url: sourceUrl,
      publisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: today,
      verification: 'sin-verificar' as const,
    }
    const provenance: VoteProvenance = {
      outcome: ref,
      breakdown: votes.length > 0 ? ref : null,
    }
    incoming = validateVote({
      id: `${plenoId}-${String(item).padStart(2, '0')}`,
      plenoId,
      plenoDate: date,
      itemNumber: item,
      title,
      outcome,
      votes,
      provenance,
      sourceUrl,
      sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: today,
    })
  } else {
    usage()
  }

  // Named before the snapshot-level failure, which would otherwise point a
  // curator at the one-shot migration script rather than at their own input.
  if (!incoming.provenance) {
    process.stderr.write(
      `[pleno-vote] ${incoming.id} has no provenance. A published vote states where each ` +
        `half comes from:\n` +
        `  "provenance": {\n` +
        `    "outcome":   { "kind": "regmeet", "url": "…", "publisher": "…", ` +
        `"retrievedAt": "YYYY-MM-DD", "verification": "sin-verificar" },\n` +
        `    "breakdown": { "kind": "transcripcion", "url": "/data/pleno-transcripts/<plenoId>.txt", ` +
        `… }   // or null when no tally is published\n` +
        `  }\n` +
        `Allowed breakdown kinds: ${BREAKDOWN_SOURCE_KINDS.join(', ')}.\n`,
    )
    process.exit(1)
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
