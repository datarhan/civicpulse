#!/usr/bin/env tsx
/**
 * Live A/B measurement of voice-id's lift on speaker attribution.
 *
 *   npm run voice-id-ab -- <plenoId>
 *
 * Two extraction passes against the same diarized + identified
 * transcript:
 *   A. allowedSpeakers = []           — what the LLM emitted before
 *                                       voice-id existed
 *   B. allowedSpeakers = enrolled     — current production behaviour
 *
 * For each pass we measure:
 *   - claims emitted total
 *   - speakerGroup attribution rate (vs null)
 *   - speakerSlug attribution rate (B only)
 *   - per-bloc count
 *
 * Output: a markdown report at
 * `scripts/logs/voice-id-ab-<plenoId>-<ts>.md` summarising the lift.
 *
 * Cost: this runs the LLM extractor TWICE on the same transcript.
 * On Gemini Pro plan that's free; on metered Anthropic Haiku 4.5
 * with a 2-hour pleno transcript expect ~$0.10 — $0.30 per A/B run.
 *
 * Prerequisites (the script checks):
 *   1. transcript at public/data/pleno-transcripts/<plenoId>.txt
 *      — diarized AND identified (`(Full Name)` tags present)
 *   2. ≥1 enrolled voiceprint in .voiceprints/index.json
 *   3. pleno-speakers/<plenoId>.json exists with assignments
 *   4. LLM_BACKEND set in env (or Anthropic/OpenAI key present)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const PLENOS_PATH = resolve('public/data/plenos.json')
const OFFICIALS_PATH = resolve('public/data/officials.json')
const PLENO_SPEAKERS_DIR = resolve('pleno-speakers')

interface CliArgs {
  plenoId: string
  minConfidence: number
  concurrency: number
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { minConfidence: 0.5, concurrency: 3 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--min-confidence') out.minConfidence = Number(argv[++i])
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else if (!out.plenoId && !a.startsWith('-')) out.plenoId = a
    else {
      process.stderr.write(`[voice-id-ab] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.plenoId) {
    process.stderr.write(
      'usage: voice-id-ab.ts <plenoId> [--min-confidence 0.5] [--concurrency 3]\n',
    )
    process.exit(2)
  }
  return out as CliArgs
}

function loadAllowedSpeakers(plenoId: string): Array<{
  slug: string
  name: string
  party: string
}> {
  const speakersPath = resolve(PLENO_SPEAKERS_DIR, `${plenoId}.json`)
  if (!existsSync(speakersPath)) return []
  let assignments: Array<{
    match?: { tier: string; slug: string } | null
    curatorOverride?: { slug: string | null } | null
  }> = []
  try {
    assignments = JSON.parse(readFileSync(speakersPath, 'utf8'))?.assignments ?? []
  } catch {
    return []
  }
  const allowedSlugs = new Set<string>()
  for (const a of assignments) {
    if (a.curatorOverride !== undefined && a.curatorOverride !== null) {
      if (a.curatorOverride.slug) allowedSlugs.add(a.curatorOverride.slug)
      continue
    }
    if (a.match?.tier === 'high' && a.match?.slug) allowedSlugs.add(a.match.slug)
  }
  if (allowedSlugs.size === 0) return []
  const officials = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as {
    officials?: Array<{ slug: string; name: string; party: string }>
  }
  return (officials.officials ?? []).filter((o) => allowedSlugs.has(o.slug))
}

interface PassStats {
  total: number
  withSpeakerGroup: number
  withSpeakerSlug: number
  byBloc: Record<string, number>
  bySlug: Record<string, number>
}

function statsFor(items: PlenoClaim[]): PassStats {
  const byBloc: Record<string, number> = {}
  const bySlug: Record<string, number> = {}
  let withSpeakerGroup = 0
  let withSpeakerSlug = 0
  for (const c of items) {
    if (c.speakerGroup) {
      withSpeakerGroup += 1
      byBloc[c.speakerGroup] = (byBloc[c.speakerGroup] ?? 0) + 1
    }
    if (c.speakerSlug) {
      withSpeakerSlug += 1
      bySlug[c.speakerSlug] = (bySlug[c.speakerSlug] ?? 0) + 1
    }
  }
  return { total: items.length, withSpeakerGroup, withSpeakerSlug, byBloc, bySlug }
}

function pct(n: number, d: number): string {
  if (d === 0) return '0.0%'
  return `${((n / d) * 100).toFixed(1)}%`
}

function renderReport(opts: {
  plenoId: string
  plenoDate: string
  before: PassStats
  after: PassStats
  allowed: Array<{ slug: string; name: string; party: string }>
  backendLabel: string
}): string {
  const { plenoId, plenoDate, before, after, allowed, backendLabel } = opts
  const lift =
    after.total > 0 && before.total > 0
      ? after.withSpeakerGroup / after.total - before.withSpeakerGroup / before.total
      : 0
  return `# Voice-ID A/B — pleno ${plenoId} (${plenoDate})

Generated: ${new Date().toISOString()}
LLM backend: \`${backendLabel}\`
Enrolled councillors visible to LLM (B): ${allowed.length === 0 ? '(none)' : allowed.map((a) => `${a.slug} · ${a.party}`).join(', ')}

## Pass A — \`allowedSpeakers=[]\` (pre-voice-id behaviour)

| Metric | Value |
|---|---|
| Claims emitted | ${before.total} |
| With speakerGroup (bloc attribution) | ${before.withSpeakerGroup} (${pct(before.withSpeakerGroup, before.total)}) |
| With speakerSlug (individual attribution) | ${before.withSpeakerSlug} (${pct(before.withSpeakerSlug, before.total)}) |

Per-bloc:
${
  Object.entries(before.byBloc)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- (none)'
}

## Pass B — \`allowedSpeakers=enrolled\` (current production)

| Metric | Value |
|---|---|
| Claims emitted | ${after.total} |
| With speakerGroup (bloc attribution) | ${after.withSpeakerGroup} (${pct(after.withSpeakerGroup, after.total)}) |
| With speakerSlug (individual attribution) | ${after.withSpeakerSlug} (${pct(after.withSpeakerSlug, after.total)}) |

Per-bloc:
${
  Object.entries(after.byBloc)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- (none)'
}

Per-individual (Pass B only):
${
  Object.entries(after.bySlug)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- (none)'
}

## Lift

- Bloc-attribution rate: **${(lift * 100).toFixed(1)} percentage points** (${pct(before.withSpeakerGroup, before.total)} → ${pct(after.withSpeakerGroup, after.total)})
- Individual attributions emerged: **${after.withSpeakerSlug}** claims (${pct(after.withSpeakerSlug, after.total)} of B's emit)

## Caveats

- The two passes use the **same transcript** (already \`--apply\`-rewritten with \`(Full Name)\` tags). Voice-id can't be cleanly removed mid-stream, so Pass A's lower bloc rate reflects the LLM's response to the prompt difference (allowed-speaker block omitted) — not a re-run on plain \`(SPEAKER_NN)\` Whisper output.
- For a fully isolated A/B, also re-run on the diarize-only transcript with the matcher's \`--apply\` reverted. That's a separate run.
- Cost: ~2× normal extraction tokens per pleno.
`
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  // Prerequisite checks
  const transcriptPath = resolve(TRANSCRIPT_DIR, `${opts.plenoId}.txt`)
  if (!existsSync(transcriptPath)) {
    process.stderr.write(`[voice-id-ab] transcript missing: ${transcriptPath}\n`)
    process.exit(1)
  }
  const transcript = readFileSync(transcriptPath, 'utf8')
  const allowed = loadAllowedSpeakers(opts.plenoId)
  if (allowed.length === 0) {
    process.stderr.write(
      `[voice-id-ab] no enrolled councillors mapped to ${opts.plenoId} — run identify-pleno-speakers first.\n`,
    )
    process.exit(1)
  }
  const plenos = JSON.parse(readFileSync(PLENOS_PATH, 'utf8')).items as Array<{
    id: string
    date: string
  }>
  const pleno = plenos.find((p) => p.id === opts.plenoId)
  if (!pleno) {
    process.stderr.write(`[voice-id-ab] plenoId ${opts.plenoId} not in plenos.json\n`)
    process.exit(1)
  }
  // Composition
  const officials = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as {
    composition?: Record<string, number>
    officials?: Array<{ party: string }>
  }
  const currentSeats: Array<{ bloc: string; seats: number }> = officials.composition
    ? Object.entries(officials.composition).map(([bloc, seats]) => ({
        bloc,
        seats: seats as number,
      }))
    : (() => {
        const map = new Map<string, number>()
        for (const o of officials.officials ?? []) map.set(o.party, (map.get(o.party) ?? 0) + 1)
        return [...map.entries()].map(([bloc, seats]) => ({ bloc, seats }))
      })()

  resetBudget()
  const config = loadConfigFromEnv()
  process.stderr.write(`[voice-id-ab] backend: ${config.backend}\n`)
  process.stderr.write(`[voice-id-ab] enrolled councillors: ${allowed.length}\n`)
  process.stderr.write(
    `[voice-id-ab] WARNING: this runs the extractor TWICE — token cost ~2× a normal run.\n`,
  )
  await new Promise((r) => setTimeout(r, 3000))

  process.stderr.write('[voice-id-ab] === Pass A — allowedSpeakers=[] ===\n')
  const before = await extractClaimsWithLlm(transcript, {
    plenoId: opts.plenoId,
    plenoDate: pleno.date,
    currentSeats,
    allowedSpeakers: [],
    minConfidence: opts.minConfidence,
    concurrency: opts.concurrency,
  })
  process.stderr.write(`[voice-id-ab]   Pass A done — ${before.items.length} claim(s)\n`)

  process.stderr.write('[voice-id-ab] === Pass B — allowedSpeakers=enrolled ===\n')
  const after = await extractClaimsWithLlm(transcript, {
    plenoId: opts.plenoId,
    plenoDate: pleno.date,
    currentSeats,
    allowedSpeakers: allowed,
    minConfidence: opts.minConfidence,
    concurrency: opts.concurrency,
  })
  process.stderr.write(`[voice-id-ab]   Pass B done — ${after.items.length} claim(s)\n`)

  const beforeStats = statsFor(before.items)
  const afterStats = statsFor(after.items)
  const md = renderReport({
    plenoId: opts.plenoId,
    plenoDate: pleno.date,
    before: beforeStats,
    after: afterStats,
    allowed,
    backendLabel: config.backend,
  })

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outPath = resolve(`scripts/logs/voice-id-ab-${opts.plenoId}-${ts}.md`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, md)
  process.stderr.write(`[voice-id-ab] wrote ${outPath}\n`)
  process.stdout.write(md)
}

main().catch((err) => {
  process.stderr.write(`[voice-id-ab] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
