/**
 * Run LLM claim extraction on pleno transcripts and write suggestions to
 * public/data/pleno-claims-suggestions.json. Mirrors the curation contract
 * of the vote-suggestion pipeline — requiresHumanApproval:true on every
 * record; verification is added by the separate verifier pass.
 *
 *   npx tsx scripts/extract-pleno-claims.ts <plenoId>
 *   npx tsx scripts/extract-pleno-claims.ts --all
 *   npx tsx scripts/extract-pleno-claims.ts 1sqj7is --min-confidence 0.4
 *
 * Always uses the LLM engine (there is no regex fallback for claims — they
 * are natural-language by nature).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import type {
  PlenoClaim,
  PlenoClaimsSnapshot,
  ClaimType,
  ClaimTopic,
} from '../src/scraper/pleno-claim'
import { ALLOWED_CLAIM_TYPES, ALLOWED_CLAIM_TOPICS } from '../src/scraper/pleno-claim'
import { resetBudget } from '../src/llm/client'

const OUT_PATH = resolve('public/data/pleno-claims-suggestions.json')
const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const PLENOS_PATH = resolve('public/data/plenos.json')
const OFFICIALS_PATH = resolve('public/data/officials.json')
const AGENDAS_PATH = resolve('public/data/plenos-agendas.json')

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
  if (!existsSync(OFFICIALS_PATH)) {
    throw new Error('officials.json not found — run scrape:officials first')
  }
  const officials = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as Officials
  if (officials.composition) {
    return Object.entries(officials.composition).map(([bloc, seats]) => ({ bloc, seats }))
  }
  const counts = new Map<string, number>()
  for (const o of officials.officials ?? []) {
    counts.set(o.party, (counts.get(o.party) ?? 0) + 1)
  }
  return [...counts.entries()].map(([bloc, seats]) => ({ bloc, seats }))
}

function loadAgendaFor(plenoId: string) {
  if (!existsSync(AGENDAS_PATH)) return []
  const doc = JSON.parse(readFileSync(AGENDAS_PATH, 'utf8')) as {
    plenos?: Array<{
      id: string
      agenda?: Array<{
        number: number
        title: string
        department?: string | null
        expediente?: string | null
      }>
    }>
  }
  const p = doc.plenos?.find((x) => x.id === plenoId)
  return p?.agenda ?? []
}

async function runOne(
  plenoId: string,
  plenos: PlenoMeta[],
  currentSeats: { bloc: string; seats: number }[],
  minConfidence: number,
): Promise<PlenoClaim[]> {
  const path = resolve(TRANSCRIPT_DIR, `${plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[extract·claims] transcript missing: ${path}\n`)
    return []
  }
  const pleno = plenos.find((p) => p.id === plenoId)
  if (!pleno) {
    process.stderr.write(`[extract·claims] plenoId "${plenoId}" not in plenos.json\n`)
    return []
  }
  const transcript = readFileSync(path, 'utf8')
  const agendaItems = loadAgendaFor(plenoId)
  const res = await extractClaimsWithLlm(transcript, {
    plenoId,
    plenoDate: pleno.date,
    currentSeats,
    agendaItems,
    minConfidence,
  })
  process.stdout.write(
    `[extract·claims] ${plenoId}: ${res.stats.segmentsScanned} windows · ${res.stats.claimsEmitted} kept · ${res.stats.droppedLowConfidence} dropped\n`,
  )
  return res.items
}

function emptyByType(): Record<ClaimType, number> {
  const out = {} as Record<ClaimType, number>
  for (const t of ALLOWED_CLAIM_TYPES) out[t] = 0
  return out
}

function emptyByTopic(): Record<ClaimTopic, number> {
  const out = {} as Record<ClaimTopic, number>
  for (const t of ALLOWED_CLAIM_TOPICS) out[t] = 0
  return out
}

async function main() {
  const args = process.argv.slice(2)
  let minConfidence = 0.5
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--min-confidence') {
      minConfidence = Number(args[++i])
      continue
    }
    positional.push(a)
  }
  if (positional.length !== 1) {
    process.stderr.write('usage: extract-pleno-claims.ts <plenoId|--all> [--min-confidence 0.5]\n')
    process.exit(2)
  }
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    process.stderr.write('--min-confidence must be between 0 and 1\n')
    process.exit(2)
  }

  const plenos = loadPlenos()
  let ids: string[]
  if (positional[0] === '--all') {
    if (!existsSync(TRANSCRIPT_DIR)) {
      process.stderr.write('[extract·claims] no transcripts on disk yet\n')
      process.exit(0)
    }
    ids = readdirSync(TRANSCRIPT_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => basename(f, '.txt'))
  } else {
    ids = [positional[0]]
  }

  const currentSeats = loadCurrentSeats()
  resetBudget()
  process.stdout.write(
    `[extract·claims] seats=${currentSeats.map((s) => `${s.bloc}:${s.seats}`).join(',')}\n`,
  )

  const fresh: PlenoClaim[] = []
  for (const id of ids) fresh.push(...(await runOne(id, plenos, currentSeats, minConfidence)))

  // Merge with existing suggestions, filtering out anything from the same
  // plenoId we just re-ran.
  const previous: PlenoClaim[] = existsSync(OUT_PATH)
    ? (JSON.parse(readFileSync(OUT_PATH, 'utf8')).items ?? [])
    : []
  const keep = previous.filter((c) => !ids.includes(c.plenoId))
  const items = [...keep, ...fresh].sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const byType = emptyByType()
  const byTopic = emptyByTopic()
  const byPleno: Record<string, number> = {}
  for (const c of items) {
    byType[c.type] = (byType[c.type] ?? 0) + 1
    byTopic[c.topic] = (byTopic[c.topic] ?? 0) + 1
    byPleno[c.plenoId] = (byPleno[c.plenoId] ?? 0) + 1
  }

  const out: PlenoClaimsSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Claims extracted automatically from YouTube-derived pleno transcripts. Each record carries requiresHumanApproval:true and is cross-referenced against tenders / BDNS / budget / promises by the verifier pass before any editorial surface.',
      contract:
        'Machine-written; never substitutes for the published human-verified record. Speaker attribution at bloc level only — no individual naming.',
    },
    stats: { total: items.length, byType, byPleno, byTopic },
    items,
  }
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8')
  process.stdout.write(`[extract·claims] wrote ${items.length} claim(s) → ${OUT_PATH}\n`)
}

main().catch((err) => {
  process.stderr.write(
    `[extract·claims] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
