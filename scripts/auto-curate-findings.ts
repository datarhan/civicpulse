/**
 * Auto-curation CLI — promotes high-confidence informational findings
 * from the verifier's output without curator typing.
 *
 *   npm run auto-curate                     # default: max 5
 *   npm run auto-curate -- --max 10
 *   npm run auto-curate -- --dry-run        # preview to /tmp, no commit
 *   npm run auto-curate -- --min-score 8.0  # raise the bundle threshold
 *
 * Pipeline:
 *   1. Load pleno-claims-verified.json + pleno-findings.json + plenos.json
 *      + pleno-videos.json + promises.json (for the LOREG freeze flag).
 *   2. Run selectBundles(): groups, scores, filters out contradicho
 *      bundles into a quarantine list and dropping anything that fails
 *      the dialectic / attribution / score gates.
 *   3. For each top-N bundle:
 *      a. Pick top-4 quotes via topQuotes().
 *      b. Generate {title, summary} via gemini (or whichever backend
 *         the auto-fallback chain picks).
 *      c. Compose the PlenoFinding payload (severity=informational,
 *         curatorName='auto-curation-v1', corroboration aggregated
 *         from verifier evidence + pleno video URL).
 *      d. Validate via validateFindingsSnapshot — if it rejects
 *         (e.g. LLM produced too-short summary on retry-exhausted
 *         output), skip with a log.
 *   4. Append accepted findings to pleno-findings.json (sorted by
 *      plenoDate desc) and write quarantine bundles to
 *      editorial/auto-curation-queue.md for curator review.
 *
 * Libel guards (mirrors plan/floating-drifting-river.md):
 *   · Severity always 'informational'. Notable + critical stay manual.
 *   · Contradicho bundles never auto-publish — they go to the queue file.
 *   · LOREG freeze (frozenUntil > today) → CLI exits without writing.
 *   · Right-of-reply continues to be handled by the existing
 *     finding-response flow; auto-curation is one-way.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateFindingsSnapshot,
  type PlenoFinding,
  type PlenoFindingsSnapshot,
} from '../src/scraper/pleno-finding'
import {
  selectBundles,
  topQuotes,
  composeFinding,
  citedClaimIds,
  type VerifiedSnapshot,
  type FindingsSnapshot,
  type BundleCandidate,
} from '../src/scraper/auto-curate'
import { generateTitleAndSummary } from '../src/llm/auto-curate-llm'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FINDINGS = resolve('public/data/pleno-findings.json')
const PLENOS = resolve('public/data/plenos.json')
const VIDEOS = resolve('public/data/pleno-videos.json')
const PROMISES = resolve('public/data/promises.json')
const QUEUE = resolve('editorial/auto-curation-queue.md')

interface PromisesSnap {
  frozenUntil?: string | null
}

interface PlenoVideoEntry {
  plenoDate: string
  url?: string
}

interface CliArgs {
  max: number
  minScore: number
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { max: 5, minScore: 6.0, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--min-score') out.minScore = Number(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
    else {
      process.stderr.write(`[auto-curate] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(out.max) || out.max < 1 || out.max > 20) {
    process.stderr.write('--max must be 1..20\n')
    process.exit(2)
  }
  if (!Number.isFinite(out.minScore) || out.minScore < 0) {
    process.stderr.write('--min-score must be ≥ 0\n')
    process.exit(2)
  }
  return out
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function isFrozen(promises: PromisesSnap | null): boolean {
  if (!promises?.frozenUntil) return false
  return promises.frozenUntil > new Date().toISOString().slice(0, 10)
}

function plenoVideoUrl(
  videos: { items?: PlenoVideoEntry[] } | null,
  plenoDate: string,
): string | null {
  for (const v of videos?.items ?? []) {
    if (v.plenoDate === plenoDate && v.url) return v.url
  }
  return null
}

function plenoTitle(
  plenos: { items?: Array<{ id: string; title: string }> } | null,
  id: string,
): string {
  for (const p of plenos?.items ?? []) if (p.id === id) return p.title
  return id
}

function writeQueueFile(bundles: BundleCandidate[]): void {
  mkdirSync(resolve('editorial'), { recursive: true })
  const lines = ['# Auto-curation queue · ' + new Date().toISOString().slice(0, 10), '']
  lines.push(
    "Bundles routed here because they contain at least one `contradicho` claim. The auto-curation CLI never publishes contradicho material — these need a curator to review the LLM's claim-vs-tender match before promotion.",
  )
  lines.push('')
  for (const b of bundles) {
    lines.push(`## ${b.plenoId} · ${b.topic} · ${b.blocs.join('+')} · score=${b.score.toFixed(2)}`)
    lines.push('')
    for (const it of topQuotes(b.items, 4)) {
      lines.push(
        `- **[${it.verification.verdict}]** ${it.claim.speakerGroup} · conf=${it.claim.confidence.toFixed(2)} · ${it.claim.id}`,
      )
      lines.push(`  > «${it.claim.verbatim.slice(0, 220)}»`)
      if (it.verification.evidence[0]) {
        lines.push(`  · evidencia: ${it.verification.evidence[0].snippet.slice(0, 160)}`)
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  writeFileSync(QUEUE, lines.join('\n'))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  resetBudget()
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[auto-curate] backend=${config.backend} · max=${opts.max} · min-score=${opts.minScore} · dry-run=${opts.dryRun}\n`,
  )

  const verified = loadJson<VerifiedSnapshot>(VERIFIED)
  if (!verified) {
    process.stderr.write(`[auto-curate] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const findings = loadJson<FindingsSnapshot & PlenoFindingsSnapshot>(FINDINGS)
  const plenos = loadJson<{ items: Array<{ id: string; title: string }> }>(PLENOS)
  const videos = loadJson<{ items: PlenoVideoEntry[] }>(VIDEOS)
  const promises = loadJson<PromisesSnap>(PROMISES)

  if (isFrozen(promises)) {
    process.stderr.write(
      `[auto-curate] LOREG electoral freeze active until ${promises?.frozenUntil} — exiting without publishing\n`,
    )
    process.exit(0)
  }

  const cited = citedClaimIds(findings)
  const { eligible, quarantine } = selectBundles(verified, cited, {
    minScore: opts.minScore,
    max: opts.max,
  })

  process.stdout.write(
    `[auto-curate] ${eligible.length} eligible bundle(s) · ${quarantine.length} contradicho-bearing routed to queue\n`,
  )

  if (quarantine.length > 0) {
    writeQueueFile(quarantine)
    process.stdout.write(`[auto-curate]   queue file → ${QUEUE}\n`)
  }
  // Always refresh the dashboard JSONs (even if zero quarantine, so the
  // dashboard sees an honest empty state instead of a stale snapshot).
  try {
    const { execFile } = await import('node:child_process')
    await new Promise<void>((resolveP, rejectP) => {
      execFile(
        'npx',
        ['tsx', 'scripts/refresh-curate-queue.ts'],
        { cwd: resolve('.'), timeout: 30_000 },
        (err) => (err ? rejectP(err) : resolveP()),
      )
    })
    process.stdout.write(`[auto-curate]   refreshed dashboard queue JSON\n`)
  } catch (err) {
    process.stderr.write(
      `[auto-curate]   WARN: dashboard queue refresh failed: ${(err as Error).message}\n`,
    )
  }

  if (eligible.length === 0) {
    process.stdout.write('[auto-curate] no eligible bundles — exiting\n')
    return
  }

  const accepted: PlenoFinding[] = []
  const rejected: Array<{ bundle: BundleCandidate; reason: string }> = []

  for (const bundle of eligible.slice(0, opts.max)) {
    const quotes = topQuotes(bundle.items, 4)
    const evidenceSnippets: string[] = []
    const seen = new Set<string>()
    for (const q of quotes) {
      for (const ev of q.verification.evidence ?? []) {
        const k = `${ev.kind}:${ev.snippet}`
        if (seen.has(k)) continue
        seen.add(k)
        evidenceSnippets.push(`[${ev.kind}] ${ev.snippet.slice(0, 180)}`)
      }
    }

    const llm = await generateTitleAndSummary({
      plenoId: bundle.plenoId,
      plenoDate: bundle.plenoDate,
      plenoTitle: plenoTitle(plenos, bundle.plenoId),
      topic: bundle.topic,
      blocs: bundle.blocs,
      quotes: quotes.map((q) => ({
        speakerGroup: q.claim.speakerGroup ?? '',
        verdict: q.verification.verdict,
        confidence: q.claim.confidence,
        verbatim: q.claim.verbatim,
      })),
      evidenceSnippets,
    })

    if (!llm) {
      rejected.push({ bundle, reason: 'LLM returned null (retries exhausted)' })
      continue
    }

    const finding = composeFinding({
      bundle,
      selectedQuotes: quotes,
      llmTitle: llm.title.trim(),
      llmSummary: llm.summary.trim(),
      plenoSourceUrl: plenoVideoUrl(videos, bundle.plenoDate),
      plenoSourceKind: 'pleno-video',
    })

    accepted.push(finding)
    process.stdout.write(
      `[auto-curate]   ✓ ${bundle.plenoId}/${bundle.topic} · score=${bundle.score.toFixed(2)} · ${finding.id}\n` +
        `[auto-curate]     title: ${finding.title}\n`,
    )
  }

  // Compose the new snapshot. Validate before writing — if the LLM
  // produced any payload that fails validateFindingsSnapshot, drop it
  // out cleanly rather than corrupting the file.
  const baseSnap: PlenoFindingsSnapshot = findings ?? {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    legalNotice:
      'Este registro recoge hallazgos editoriales verificados manualmente sobre las intervenciones de los plenos. Cada hallazgo cita una o más afirmaciones literales (verbatim) del pleno y los documentos municipales que confirman o contradicen cada afirmación. Las réplicas de los grupos políticos se publican literalmente a través del campo `response`.',
    contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
    methodologyUrl: '/metodologia',
    items: [],
  }
  const merged: PlenoFinding[] = [...baseSnap.items]
  for (const f of accepted) {
    if (merged.some((x) => x.id === f.id)) continue
    merged.push(f)
  }
  merged.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const next: PlenoFindingsSnapshot = {
    ...baseSnap,
    generatedAt: new Date().toISOString(),
    items: merged,
  }
  let serialized: string
  try {
    serialized = JSON.stringify(next, null, 2) + '\n'
    validateFindingsSnapshot(serialized) // throws on schema mismatch
  } catch (err) {
    process.stderr.write(
      `[auto-curate] FATAL: composed snapshot fails the schema validator: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  }

  if (opts.dryRun) {
    const previewPath = `/tmp/auto-curate-preview-${Date.now()}.json`
    writeFileSync(previewPath, JSON.stringify({ accepted, rejected }, null, 2) + '\n')
    process.stdout.write(
      `[auto-curate] DRY RUN — wrote ${accepted.length} accepted finding(s) to ${previewPath} (no persistence).\n`,
    )
    return
  }

  writeFileSync(FINDINGS, serialized, 'utf8')
  process.stdout.write(
    `[auto-curate] ✅ wrote ${accepted.length} new finding(s) to ${FINDINGS} ` +
      `(${rejected.length} rejected · ${quarantine.length} queued for curator review)\n`,
  )
  if (rejected.length > 0) {
    for (const r of rejected) {
      process.stderr.write(
        `[auto-curate]   ✗ ${r.bundle.plenoId}/${r.bundle.topic} · ${r.reason}\n`,
      )
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[auto-curate] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
