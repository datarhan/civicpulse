/**
 * Read pleno transcripts, run the selected inference engine(s), and write
 * suggestions to public/data/pleno-votes-suggestions.json.
 *
 * Usage:
 *   npx tsx scripts/extract-pleno-votes.ts <plenoId>                   # defaults to --engine regex
 *   npx tsx scripts/extract-pleno-votes.ts --all                       # every transcript on disk
 *   npx tsx scripts/extract-pleno-votes.ts 1pe3qs8 --engine llm        # LLM engine only
 *   npx tsx scripts/extract-pleno-votes.ts 1pe3qs8 --engine both       # side-by-side comparison
 *
 * This script NEVER mutates pleno-votes.json. A curator reviews each
 * suggestion and, if correct, runs `npm run pleno-vote` to publish.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { inferVotesFromTranscript, type InferredVote } from '../src/scraper/pleno-vote-inference'
import { inferVotesWithLlm } from '../src/scraper/pleno-vote-llm'
import { resetBudget } from '../src/llm/client'
import { partyColor } from '../src/hooks/useOfficials.js' // JS module; imported for PARTY_COLORS keys
// We only need bloc names here — read the officials JSON directly to derive
// current seat counts, rather than depending on the React hooks.

const OUT_PATH = resolve('public/data/pleno-votes-suggestions.json')
const COMPARISON_PATH = resolve('public/data/pleno-votes-engine-comparison.json')
const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const PLENOS_PATH = resolve('public/data/plenos.json')
const OFFICIALS_PATH = resolve('public/data/officials.json')

type Engine = 'regex' | 'llm' | 'both'

interface PlenoMeta {
  id: string
  date: string
  title?: string
}
interface Officials {
  officials?: Array<{ party: string }>
  composition?: Record<string, number>
}

function loadPlenos(): PlenoMeta[] {
  if (!existsSync(PLENOS_PATH)) throw new Error('plenos.json not found — run scrape:plenos first')
  return JSON.parse(readFileSync(PLENOS_PATH, 'utf8')).items as PlenoMeta[]
}

function loadCurrentSeats(): { bloc: string; seats: number }[] {
  if (!existsSync(OFFICIALS_PATH))
    throw new Error('officials.json not found — run scrape:officials first')
  const officials = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as Officials
  // Prefer the pre-aggregated composition map (single source of truth inside the file).
  if (officials.composition) {
    return Object.entries(officials.composition).map(([bloc, seats]) => ({ bloc, seats }))
  }
  // Fallback: aggregate from the officials list.
  const counts = new Map<string, number>()
  for (const o of officials.officials ?? []) {
    counts.set(o.party, (counts.get(o.party) ?? 0) + 1)
  }
  return [...counts.entries()].map(([bloc, seats]) => ({ bloc, seats }))
}

async function runRegex(
  plenoId: string,
  plenos: PlenoMeta[],
  minConfidence: number,
): Promise<InferredVote[]> {
  const path = resolve(TRANSCRIPT_DIR, `${plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[extract·regex] transcript missing: ${path}\n`)
    return []
  }
  const pleno = plenos.find((p) => p.id === plenoId)
  if (!pleno) {
    process.stderr.write(`[extract·regex] plenoId "${plenoId}" not in plenos.json\n`)
    return []
  }
  const transcript = readFileSync(path, 'utf8')
  const res = inferVotesFromTranscript(transcript, {
    plenoId,
    plenoDate: pleno.date,
    minConfidence,
  })
  process.stdout.write(
    `[extract·regex] ${plenoId}: ${res.stats.segmentsScanned} seg · ${res.stats.suggestionsEmitted} kept · ${res.stats.droppedLowConfidence} dropped\n`,
  )
  return res.suggestions.map((s) => ({ ...s, engine: 'regex' as const }))
}

async function runLlm(
  plenoId: string,
  plenos: PlenoMeta[],
  currentSeats: { bloc: string; seats: number }[],
  minConfidence: number,
): Promise<InferredVote[]> {
  const path = resolve(TRANSCRIPT_DIR, `${plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[extract·llm] transcript missing: ${path}\n`)
    return []
  }
  const pleno = plenos.find((p) => p.id === plenoId)
  if (!pleno) {
    process.stderr.write(`[extract·llm] plenoId "${plenoId}" not in plenos.json\n`)
    return []
  }
  const transcript = readFileSync(path, 'utf8')
  const res = await inferVotesWithLlm(transcript, {
    plenoId,
    plenoDate: pleno.date,
    currentSeats,
    minConfidence,
  })
  process.stdout.write(
    `[extract·llm] ${plenoId}: ${res.stats.segmentsScanned} seg · ${res.stats.suggestionsEmitted} kept · ${res.stats.droppedLowConfidence} dropped\n`,
  )
  return res.suggestions.map((s) => ({ ...s, engine: 'llm' as const }))
}

async function main() {
  const args = process.argv.slice(2)
  let engine: Engine = 'regex'
  let minConfidence = 0.6
  const targets: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--engine') {
      engine = args[++i] as Engine
      continue
    }
    if (a === '--min-confidence') {
      minConfidence = Number(args[++i])
      continue
    }
    if (a === '--all') {
      targets.push('--all')
      continue
    }
    targets.push(a)
  }
  if (targets.length !== 1 || !['regex', 'llm', 'both'].includes(engine)) {
    process.stderr.write(
      'usage: extract-pleno-votes.ts <plenoId|--all> [--engine regex|llm|both] [--min-confidence 0.4]\n',
    )
    process.exit(2)
  }
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    process.stderr.write('--min-confidence must be between 0 and 1\n')
    process.exit(2)
  }

  const plenos = loadPlenos()
  let ids: string[]
  if (targets[0] === '--all') {
    if (!existsSync(TRANSCRIPT_DIR)) {
      process.stderr.write('[extract] no transcripts on disk yet\n')
      process.exit(0)
    }
    ids = readdirSync(TRANSCRIPT_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => basename(f, '.txt'))
  } else {
    ids = [targets[0]]
  }

  const currentSeats = loadCurrentSeats()

  if (engine === 'llm' || engine === 'both') {
    resetBudget()
    process.stdout.write(
      `[extract] LLM engine active · seats=${currentSeats.map((s) => `${s.bloc}:${s.seats}`).join(',')}\n`,
    )
  }

  const fresh: InferredVote[] = []
  for (const id of ids) {
    if (engine === 'regex' || engine === 'both')
      fresh.push(...(await runRegex(id, plenos, minConfidence)))
    if (engine === 'llm' || engine === 'both')
      fresh.push(...(await runLlm(id, plenos, currentSeats, minConfidence)))
  }

  // Merge with existing suggestions, filtering out anything from the same
  // (plenoId, engine) we just re-ran.
  const previous: InferredVote[] = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf8')).items || []
    : []
  const keep = previous.filter((s) => {
    if (!ids.includes(s.plenoId)) return true
    // We ran engine X; drop previous suggestions from X for these ids.
    if (engine === 'both') return false
    return s.engine !== engine
  })
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
      byEngine: items.reduce<Record<string, number>>((acc, s) => {
        acc[s.engine ?? 'unknown'] = (acc[s.engine ?? 'unknown'] ?? 0) + 1
        return acc
      }, {}),
      byPleno: items.reduce<Record<string, number>>((acc, s) => {
        acc[s.plenoId] = (acc[s.plenoId] ?? 0) + 1
        return acc
      }, {}),
    },
    items,
  }
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8')
  process.stdout.write(`[extract] wrote ${items.length} suggestion(s) → ${OUT_PATH}\n`)

  if (engine === 'both') {
    // Side-by-side comparison for curator review.
    const comparison = ids.map((id) => ({
      plenoId: id,
      regex: fresh.filter((s) => s.plenoId === id && s.engine === 'regex'),
      llm: fresh.filter((s) => s.plenoId === id && s.engine === 'llm'),
    }))
    writeFileSync(
      COMPARISON_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), comparison }, null, 2) + '\n',
      'utf8',
    )
    process.stdout.write(`[extract] wrote A/B comparison → ${COMPARISON_PATH}\n`)
  }
}

// Suppress "partyColor imported but unused" — referenced implicitly to ensure hooks resolve.
void partyColor

main().catch((err) => {
  process.stderr.write(`[extract] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
