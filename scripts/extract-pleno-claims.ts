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
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const OUT_PATH = resolve('public/data/pleno-claims-suggestions.json')
const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const PLENOS_PATH = resolve('public/data/plenos.json')
const OFFICIALS_PATH = resolve('public/data/officials.json')
const AGENDAS_PATH = resolve('public/data/plenos-agendas.json')
const PLENO_SPEAKERS_DIR = resolve('pleno-speakers')

interface PlenoMeta {
  id: string
  date: string
  title?: string
}

interface Officials {
  officials?: Array<{ slug: string; name: string; party: string }>
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

/**
 * Build the allowed-speaker list for a pleno: the intersection of
 *   · councillors enrolled in `.voiceprints/`
 *   · councillors whom `pleno-speakers/<plenoId>.json` matched in this
 *     particular pleno at high tier
 *   · councillors present in `officials.json` (party lookup)
 *
 * Returns []  when:
 *   - the pleno has no voice-id JSON yet (matcher never ran)
 *   - the JSON has no high-tier matches
 *   - officials.json doesn't carry the slug (stale enrollment)
 *
 * In all those cases the LLM emits speakerSlug:null on every claim and
 * the existing bloc-level attribution remains the only signal.
 */
function loadAllowedSpeakersFor(
  plenoId: string,
): Array<{ slug: string; name: string; party: string }> {
  const speakersPath = resolve(PLENO_SPEAKERS_DIR, `${plenoId}.json`)
  if (!existsSync(speakersPath)) return []
  let assignments: Array<{
    match?: { tier: string; slug: string } | null
    curatorOverride?: { slug: string | null } | null
  }> = []
  try {
    const doc = JSON.parse(readFileSync(speakersPath, 'utf8'))
    assignments = doc?.assignments ?? []
  } catch {
    return []
  }
  // Curator override wins. Otherwise only high-tier auto-matches qualify.
  // Medium/low auto-matches are deliberately excluded — they're intended
  // for review on the dashboard, not as LLM input.
  const allowedSlugs = new Set<string>()
  for (const a of assignments) {
    if (a.curatorOverride !== undefined && a.curatorOverride !== null) {
      if (a.curatorOverride.slug) allowedSlugs.add(a.curatorOverride.slug)
      // null slug = explicitly unassigned → not added
      continue
    }
    if (a.match?.tier === 'high' && a.match?.slug) allowedSlugs.add(a.match.slug)
  }
  if (allowedSlugs.size === 0) return []

  const officials = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as Officials
  const out: Array<{ slug: string; name: string; party: string }> = []
  for (const o of officials.officials ?? []) {
    if (allowedSlugs.has(o.slug)) {
      out.push({ slug: o.slug, name: o.name, party: o.party })
    }
  }
  return out
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
  concurrency: number,
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
  const allowedSpeakers = loadAllowedSpeakersFor(plenoId)
  if (allowedSpeakers.length > 0) {
    process.stdout.write(
      `[extract·claims] ${plenoId}: voice-id allowed speakers (high-tier): ${allowedSpeakers
        .map((s) => `${s.slug}(${s.party})`)
        .join(', ')}\n`,
    )
  }
  // Log every ~5% of windows processed so long runs aren't silent.
  let lastReport = -1
  const res = await extractClaimsWithLlm(transcript, {
    plenoId,
    plenoDate: pleno.date,
    currentSeats,
    agendaItems,
    allowedSpeakers,
    minConfidence,
    concurrency,
    onWindow: ({ index, total, claimsKept }) => {
      const pct = Math.floor(((index + 1) / total) * 20) // 5% buckets
      if (pct > lastReport) {
        lastReport = pct
        process.stdout.write(
          `[extract·claims]   ${plenoId} · ${index + 1}/${total} windows · ${pct * 5}%${claimsKept > 0 ? ` · +${claimsKept} claim(s)` : ''}\n`,
        )
      }
    },
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
  let concurrency = Number(process.env.LLM_CONCURRENCY || 3)
  let forceOrphanFindings = false
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--min-confidence') {
      minConfidence = Number(args[++i])
      continue
    }
    if (a === '--concurrency') {
      concurrency = Number(args[++i])
      continue
    }
    if (a === '--force-orphan-findings') {
      // Override the preservation guard: allow re-extract to overwrite
      // a pleno even if doing so leaves published findings citing
      // claim IDs that no longer exist. Use only when migrating a
      // finding to a curator-approved replacement set of claim IDs.
      forceOrphanFindings = true
      continue
    }
    positional.push(a)
  }
  if (positional.length !== 1) {
    process.stderr.write(
      'usage: extract-pleno-claims.ts <plenoId|--all> [--min-confidence 0.5] [--concurrency 3] [--force-orphan-findings]\n',
    )
    process.exit(2)
  }
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    process.stderr.write('--min-confidence must be between 0 and 1\n')
    process.exit(2)
  }
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 10) {
    process.stderr.write('--concurrency must be between 1 and 10\n')
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
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[extract·claims] backend=${config.backend} · seats=${currentSeats.map((s) => `${s.bloc}:${s.seats}`).join(',')} · concurrency=${concurrency}\n`,
  )
  if (config.backend === 'claude-code') {
    process.stderr.write(
      '[extract·claims] WARNING: LLM_BACKEND=claude-code uses your Anthropic Max subscription quota.\n' +
        '[extract·claims]   A full-pleno extract can exhaust a 5-hour window (~200 calls).\n' +
        '[extract·claims]   Prefer LLM_BACKEND=openai (metered) or LLM_BACKEND=ollama (local)\n' +
        '[extract·claims]   for batch runs. Press Ctrl-C in the next 5s to abort.\n',
    )
    await new Promise((r) => setTimeout(r, 5000))
  }

  // Load previous snapshot once — we rebuild it progressively, pleno-by-pleno,
  // so a mid-batch crash (rate limit, network) keeps the completed plenos on
  // disk. The LLM cache on .llm-cache/* also handles per-window resumption,
  // but that only saves the API roundtrip — this checkpoint preserves the
  // editorial snapshot itself.
  const previous: PlenoClaim[] = existsSync(OUT_PATH)
    ? (JSON.parse(readFileSync(OUT_PATH, 'utf8')).items ?? [])
    : []
  // Index previous claims by pleno so we can roll back individual plenos
  // when the preservation guard refuses to overwrite them.
  const previousByPleno = new Map<string, PlenoClaim[]>()
  for (const c of previous) {
    const list = previousByPleno.get(c.plenoId) ?? []
    list.push(c)
    previousByPleno.set(c.plenoId, list)
  }
  // Start with everything NOT in `ids` (the set we're about to re-run).
  const accumulated = previous.filter((c) => !ids.includes(c.plenoId))

  // ─── Preservation guard ──────────────────────────────────────────────────
  // Claim IDs are deterministic on (plenoId, segmentIndex, type, verbatim
  // hash). Different extraction models pick slightly different segment
  // boundaries / quote text, so re-extracting a pleno typically renames
  // most claim IDs. Findings in pleno-findings.json cite specific
  // sourceClaimIds — if a citation no longer resolves after re-extract,
  // that finding's quote→claim audit chain is broken.
  //
  // Per pleno being re-extracted, snapshot the cited IDs *before* the run.
  // After the run, if any cited ID is missing from the new claim set, we
  // refuse to overwrite that pleno (keep the OLD claims) unless
  // --force-orphan-findings was passed.
  const FINDINGS_PATH = resolve('public/data/pleno-findings.json')
  const findingsCitations = new Map<string, Set<string>>()
  if (existsSync(FINDINGS_PATH)) {
    const fSnap = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8'))
    for (const f of (fSnap.items ?? []) as Array<{
      plenoId: string
      sourceClaimIds: string[]
    }>) {
      if (!ids.includes(f.plenoId)) continue
      const set = findingsCitations.get(f.plenoId) ?? new Set<string>()
      for (const cid of f.sourceClaimIds ?? []) set.add(cid)
      findingsCitations.set(f.plenoId, set)
    }
  }
  const totalCitedAcrossRun = [...findingsCitations.values()].reduce((sum, s) => sum + s.size, 0)
  if (totalCitedAcrossRun > 0) {
    process.stdout.write(
      `[extract·claims] preservation guard: ${totalCitedAcrossRun} claim id(s) cited by published findings across ${findingsCitations.size} pleno(s)\n`,
    )
    if (forceOrphanFindings) {
      process.stderr.write(
        '[extract·claims] WARNING: --force-orphan-findings is set — published findings WILL be left orphaned where claim IDs change. Pass only when migrating to curator-approved replacements.\n',
      )
    }
  }
  const guardSkipped: Array<{ plenoId: string; orphans: string[] }> = []

  function writeSnapshot() {
    const items = [...accumulated].sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))
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
    return items.length
  }

  // Graceful interrupt: Ctrl-C / SIGTERM writes the current snapshot before
  // exiting so partial runs aren't lost even outside the pleno-loop boundary.
  let interrupted = false
  const onSignal = (signal: string) => {
    if (interrupted) return
    interrupted = true
    process.stderr.write(`\n[extract·claims] ${signal} — flushing snapshot…\n`)
    try {
      const n = writeSnapshot()
      process.stderr.write(`[extract·claims] flushed ${n} claim(s) → ${OUT_PATH}\n`)
    } catch (err) {
      process.stderr.write(
        `[extract·claims] flush failed: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
    process.exit(130)
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))

  let completed = 0
  for (const id of ids) {
    try {
      const fresh = await runOne(id, plenos, currentSeats, minConfidence, concurrency)
      // Preservation check: would this overwrite leave any published
      // finding with an orphan sourceClaimId for this pleno?
      const cited = findingsCitations.get(id)
      if (cited && cited.size > 0) {
        const freshIds = new Set(fresh.map((c) => c.id))
        const orphans = [...cited].filter((cid) => !freshIds.has(cid))
        if (orphans.length > 0 && !forceOrphanFindings) {
          process.stderr.write(
            `[extract·claims] ${id} SKIPPED — ${orphans.length}/${cited.size} cited claim(s) would be orphaned by overwrite:\n`,
          )
          for (const o of orphans.slice(0, 5)) process.stderr.write(`[extract·claims]     · ${o}\n`)
          if (orphans.length > 5) {
            process.stderr.write(`[extract·claims]     · …and ${orphans.length - 5} more\n`)
          }
          process.stderr.write(
            `[extract·claims]   Pass --force-orphan-findings to override (will leave findings orphaned).\n`,
          )
          // Roll back: keep the OLD claims for this pleno on disk so the
          // findings remain auditable.
          const old = previousByPleno.get(id) ?? []
          accumulated.push(...old)
          guardSkipped.push({ plenoId: id, orphans })
          completed += 1
          const total = writeSnapshot()
          process.stdout.write(
            `[extract·claims] checkpoint ${completed}/${ids.length}: ${id} · PRESERVED (${old.length} old claim(s)) · snapshot=${total} total\n`,
          )
          continue
        }
        if (orphans.length > 0) {
          process.stderr.write(
            `[extract·claims] ${id} OVERWRITING despite ${orphans.length} orphan(s) (--force-orphan-findings)\n`,
          )
        }
      }
      accumulated.push(...fresh)
      completed += 1
      const total = writeSnapshot()
      process.stdout.write(
        `[extract·claims] checkpoint ${completed}/${ids.length}: ${id} · ${fresh.length} claim(s) · snapshot=${total} total\n`,
      )
    } catch (err) {
      process.stderr.write(
        `[extract·claims] ${id} FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      // Persist what we have so far, then rethrow so the caller (shell /
      // Actions) sees a non-zero exit and the user knows to re-run.
      writeSnapshot()
      throw err
    }
  }

  const total = writeSnapshot()
  process.stdout.write(`[extract·claims] done — ${total} claim(s) total → ${OUT_PATH}\n`)
  if (guardSkipped.length > 0) {
    process.stdout.write(
      `[extract·claims] preservation guard preserved ${guardSkipped.length} pleno(s):\n`,
    )
    for (const g of guardSkipped) {
      process.stdout.write(
        `[extract·claims]   · ${g.plenoId} — ${g.orphans.length} orphan(s) (re-run with --force-orphan-findings to migrate)\n`,
      )
    }
  }
}

main().catch((err) => {
  process.stderr.write(
    `[extract·claims] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
