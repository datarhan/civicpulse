#!/usr/bin/env tsx
/**
 * Apply a curator override to a single SPEAKER_NN cluster in
 * `pleno-speakers/<plenoId>.json`.
 *
 *   npm run override-speaker-assignment -- --pleno-id <id> \
 *       --speaker SPEAKER_00 --slug robert-raga-gadea [--reason "..."]
 *   npm run override-speaker-assignment -- --pleno-id <id> \
 *       --speaker SPEAKER_00 --clear           # explicit "unassigned"
 *   npm run override-speaker-assignment -- --pleno-id <id> \
 *       --speaker SPEAKER_00 --remove-override # drop override; restore auto-match
 *
 * The override is editorial annotation: the underlying `match`
 * (auto cosine score + tier) is NEVER touched, only a sibling
 * `curatorOverride` field is added/cleared/removed. Downstream
 * consumers (LLM extractor, dashboard) read the override when
 * present, fall back to `match` when absent. See
 * `effectiveSlug()` in src/scraper/voice-id.ts.
 *
 * Validations:
 *   1. plenoId must have a `pleno-speakers/<id>.json` file (no
 *      bootstrap from this CLI — run identify-pleno-speakers first).
 *   2. speaker label must exist in that file's `assignments[]`.
 *   3. slug (when assigning) must exist in officials.json — same
 *      contract as enroll-voice. Unknown slug → fail loudly.
 *   4. Atomic write through *.tmp + rename so a crashed process
 *      never produces a half-written JSON.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OFFICIALS_PATH = resolve('public/data/officials.json')
const PLENO_SPEAKERS_DIR = resolve('pleno-speakers')

interface CliArgs {
  plenoId: string
  speaker: string
  slug?: string
  clear: boolean
  removeOverride: boolean
  reason?: string
  by?: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { clear: false, removeOverride: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pleno-id') out.plenoId = argv[++i]
    else if (a === '--speaker') out.speaker = argv[++i]
    else if (a === '--slug') out.slug = argv[++i]
    else if (a === '--clear') out.clear = true
    else if (a === '--remove-override') out.removeOverride = true
    else if (a === '--reason') out.reason = argv[++i]
    else if (a === '--by') out.by = argv[++i]
    else {
      process.stderr.write(`[override] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.plenoId || !out.speaker) {
    process.stderr.write(
      'usage: override-speaker-assignment.ts --pleno-id <id> --speaker <SPEAKER_NN> ' +
        '(--slug <slug> | --clear | --remove-override) [--reason <text>] [--by <name>]\n',
    )
    process.exit(2)
  }
  const modes = [out.slug ? 1 : 0, out.clear ? 1 : 0, out.removeOverride ? 1 : 0].reduce(
    (a, b) => a + b,
    0,
  )
  if (modes !== 1) {
    process.stderr.write(
      '[override] choose exactly one of --slug <slug>, --clear, --remove-override\n',
    )
    process.exit(2)
  }
  if (!/^SPEAKER_\d+$/.test(out.speaker)) {
    process.stderr.write(
      `[override] invalid speaker label: "${out.speaker}" (expected SPEAKER_NN)\n`,
    )
    process.exit(2)
  }
  return out as CliArgs
}

interface OfficialEntry {
  slug: string
  name: string
  party?: string | null
}

function loadOfficial(slug: string): OfficialEntry {
  if (!existsSync(OFFICIALS_PATH)) {
    process.stderr.write('[override] officials.json missing — run scrape:officials first\n')
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')) as {
    officials?: OfficialEntry[]
    items?: OfficialEntry[]
  }
  const list = raw.officials ?? raw.items ?? []
  const o = list.find((x) => x.slug === slug)
  if (!o) {
    process.stderr.write(`[override] slug "${slug}" not in officials.json\n`)
    process.exit(1)
  }
  return o
}

interface PlenoSpeakersDoc {
  generatedAt: string
  plenoId: string
  totalSpeakers: number
  highConfidenceCount: number
  mediumConfidenceCount: number
  unmatchedCount: number
  assignments: Array<{
    speaker: string
    durationSec: number
    segmentCount: number
    match: unknown
    topCandidates: unknown
    curatorOverride?: {
      slug: string | null
      name: string | null
      party: string | null
      setAt: string
      by?: string | null
      reason?: string | null
    } | null
  }>
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const path = resolve(PLENO_SPEAKERS_DIR, `${opts.plenoId}.json`)
  if (!existsSync(path)) {
    process.stderr.write(
      `[override] no assignment file for ${opts.plenoId} at ${path}.\n` +
        `[override]   run identify-pleno-speakers first: npm run identify-pleno-speakers -- ${opts.plenoId}\n`,
    )
    process.exit(1)
  }
  const doc = JSON.parse(readFileSync(path, 'utf8')) as PlenoSpeakersDoc
  const idx = doc.assignments.findIndex((a) => a.speaker === opts.speaker)
  if (idx < 0) {
    process.stderr.write(
      `[override] speaker "${opts.speaker}" not in ${opts.plenoId}.json. Known:\n`,
    )
    for (const a of doc.assignments) {
      process.stderr.write(`[override]   · ${a.speaker} (${a.durationSec}s)\n`)
    }
    process.exit(1)
  }
  const a = doc.assignments[idx]

  if (opts.removeOverride) {
    if (!a.curatorOverride) {
      process.stderr.write(`[override] ${opts.speaker} has no override — nothing to remove\n`)
      process.exit(0)
    }
    delete a.curatorOverride
    process.stderr.write(`[override] ${opts.speaker} override removed (auto-match restored)\n`)
  } else if (opts.clear) {
    a.curatorOverride = {
      slug: null,
      name: null,
      party: null,
      setAt: new Date().toISOString(),
      ...(opts.by ? { by: opts.by } : {}),
      ...(opts.reason ? { reason: opts.reason } : {}),
    }
    process.stderr.write(`[override] ${opts.speaker} explicitly UNASSIGNED by curator\n`)
  } else if (opts.slug) {
    const official = loadOfficial(opts.slug)
    a.curatorOverride = {
      slug: official.slug,
      name: official.name,
      party: official.party ?? null,
      setAt: new Date().toISOString(),
      ...(opts.by ? { by: opts.by } : {}),
      ...(opts.reason ? { reason: opts.reason } : {}),
    }
    process.stderr.write(
      `[override] ${opts.speaker} → ${official.name} (${official.party ?? '?'})\n`,
    )
  }

  doc.generatedAt = new Date().toISOString()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
  process.stderr.write(`[override] wrote ${path}\n`)

  // stdout: parseable summary so the dashboard can render the new state
  // without a second GET roundtrip.
  process.stdout.write(
    JSON.stringify({
      plenoId: opts.plenoId,
      speaker: opts.speaker,
      override: a.curatorOverride ?? null,
    }) + '\n',
  )
}

try {
  main()
} catch (err) {
  process.stderr.write(`[override] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
