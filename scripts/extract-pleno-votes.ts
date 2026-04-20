/**
 * Read a pleno transcript, run the inference engine, and write suggestions to
 * public/data/pleno-votes-suggestions.json. This file parallels
 * promise-suggestions.json — it NEVER mutates pleno-votes.json. A curator
 * reviews each suggestion and, if correct, runs `npm run pleno-vote` to
 * publish the verified record.
 *
 * Usage:
 *   npx tsx scripts/extract-pleno-votes.ts <plenoId>
 *   npx tsx scripts/extract-pleno-votes.ts --all    # every transcript on disk
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import {
  inferVotesFromTranscript,
  type InferredVote,
} from '../src/scraper/pleno-vote-inference'

const OUT_PATH = resolve('public/data/pleno-votes-suggestions.json')
const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const PLENOS_PATH = resolve('public/data/plenos.json')

interface PlenoMeta {
  id: string
  date: string
  title?: string
}

function loadPlenos(): PlenoMeta[] {
  if (!existsSync(PLENOS_PATH)) throw new Error('plenos.json not found — run scrape:plenos first')
  return JSON.parse(readFileSync(PLENOS_PATH, 'utf8')).items as PlenoMeta[]
}

function processOne(plenoId: string, plenos: PlenoMeta[]): InferredVote[] {
  const path = resolve(TRANSCRIPT_DIR, `${plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[extract] transcript not found: ${path}\n`)
    return []
  }
  const pleno = plenos.find((p) => p.id === plenoId)
  if (!pleno) {
    process.stderr.write(`[extract] plenoId "${plenoId}" not found in plenos.json\n`)
    return []
  }
  const transcript = readFileSync(path, 'utf8')
  const res = inferVotesFromTranscript(transcript, {
    plenoId: pleno.id,
    plenoDate: pleno.date,
    minConfidence: 0.6,
  })
  process.stdout.write(
    `[extract] ${plenoId}: ${res.stats.segmentsScanned} segments, ` +
      `${res.stats.suggestionsEmitted} suggestion(s) kept (${res.stats.droppedLowConfidence} dropped)\n`,
  )
  return res.suggestions
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    process.stderr.write('usage: extract-pleno-votes.ts <plenoId | --all>\n')
    process.exit(2)
  }

  const plenos = loadPlenos()
  let targets: string[]
  if (args[0] === '--all') {
    if (!existsSync(TRANSCRIPT_DIR)) {
      process.stderr.write('[extract] no transcripts on disk yet\n')
      process.exit(0)
    }
    targets = readdirSync(TRANSCRIPT_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => basename(f, '.txt'))
  } else {
    targets = [args[0]]
  }

  // Load existing suggestions so we merge rather than overwrite.
  const previous: InferredVote[] = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf8')).items || []
    : []

  const keep = previous.filter((s) => !targets.includes(s.plenoId))
  const fresh = targets.flatMap((id) => processOne(id, plenos))
  const items = [...keep, ...fresh].sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Vote suggestions inferred automatically from YouTube-derived pleno transcripts. ' +
        'Every record carries requiresHumanApproval:true and MUST be reviewed by a curator ' +
        'before promotion to pleno-votes.json via `npm run pleno-vote`.',
      contract: 'Machine-written; never substitutes for the published human-verified record.',
    },
    stats: {
      total: items.length,
      byPleno: items.reduce<Record<string, number>>((acc, s) => {
        acc[s.plenoId] = (acc[s.plenoId] ?? 0) + 1
        return acc
      }, {}),
    },
    items,
  }
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8')
  process.stdout.write(`[extract] wrote ${items.length} suggestion(s) → ${OUT_PATH}\n`)
}

main()
