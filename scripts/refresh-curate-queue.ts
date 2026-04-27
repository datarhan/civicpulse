#!/usr/bin/env tsx
/**
 * Refresh the curator dashboard's queue files without calling any LLM
 * or writing to pleno-findings.json. Cheap (<1 s), safe to run any time.
 *
 *   npm run refresh:curate-queue
 *
 * Writes:
 *   · public/data/auto-curation-queue.json     — quarantined bundles (contradicho)
 *   · public/data/auto-curation-bundles.json   — eligible-but-not-yet-published
 *
 * The dashboard reads these to render the curator queue. Re-running
 * `npm run auto-curate` (the full pipeline) updates the same files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  selectBundles,
  citedClaimIds,
  topQuotes,
  type VerifiedSnapshot,
  type FindingsSnapshot,
  type VerifiedItem,
  type BundleCandidate,
} from '../src/scraper/auto-curate'
import {
  archiveKeySet,
  validateArchiveSnapshot,
  type ArchiveEntry,
  type CuratorArchiveSnapshot,
} from '../src/scraper/curator-archive'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FINDINGS = resolve('public/data/pleno-findings.json')
const PLENOS = resolve('public/data/plenos.json')
const ARCHIVE = resolve('public/data/curator-archive.json')
const QUEUE_JSON = resolve('public/data/auto-curation-queue.json')
const BUNDLES_JSON = resolve('public/data/auto-curation-bundles.json')

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    process.stderr.write(`[refresh-queue] ${path} unreadable: ${(err as Error).message}\n`)
    return null
  }
}

interface SerializedBundle {
  plenoId: string
  plenoDate: string
  plenoTitle: string
  topic: string
  blocs: string[]
  score: number
  /** Top quotes (≤4) for UI rendering. */
  quotes: Array<{
    claimId: string
    speakerGroup: string | null
    verdict: string
    confidence: number
    verbatim: string
    evidence: Array<{ kind: string; ref: string; snippet: string }>
  }>
  itemCount: number
}

function serializeBundle(b: BundleCandidate, plenoTitleMap: Map<string, string>): SerializedBundle {
  return {
    plenoId: b.plenoId,
    plenoDate: b.plenoDate,
    plenoTitle: plenoTitleMap.get(b.plenoId) ?? b.plenoId,
    topic: b.topic,
    blocs: b.blocs,
    score: Number(b.score.toFixed(2)),
    quotes: topQuotes(b.items, 4).map((it: VerifiedItem) => ({
      claimId: it.claim.id,
      speakerGroup: it.claim.speakerGroup,
      verdict: it.verification.verdict,
      confidence: it.claim.confidence,
      verbatim: it.claim.verbatim,
      evidence: (it.verification.evidence ?? []).slice(0, 3).map((e) => ({
        kind: e.kind,
        ref: e.ref,
        snippet: e.snippet.slice(0, 230),
      })),
    })),
    itemCount: b.items.length,
  }
}

function main() {
  const verified = loadJson<VerifiedSnapshot>(VERIFIED)
  if (!verified) {
    process.stderr.write(`[refresh-queue] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const findings = loadJson<FindingsSnapshot>(FINDINGS)
  const plenos = loadJson<{ items?: Array<{ id: string; title: string; date?: string }> }>(PLENOS)

  // Archive: bundles the curator has marked "reviewed, no finding to
  // publish". These are excluded from the live queues but echoed back
  // in a separate field so the dashboard can offer un-archive.
  let archive: CuratorArchiveSnapshot | null = null
  if (existsSync(ARCHIVE)) {
    try {
      archive = validateArchiveSnapshot(readFileSync(ARCHIVE, 'utf8'))
    } catch (err) {
      process.stderr.write(`[refresh-queue] ${ARCHIVE} invalid: ${(err as Error).message}\n`)
    }
  }
  const archived = archiveKeySet(archive)
  const isArchived = (b: BundleCandidate): boolean => archived.has(`${b.plenoId}/${b.topic}`)

  const plenoTitleMap = new Map<string, string>()
  for (const p of plenos?.items ?? []) plenoTitleMap.set(p.id, p.title)

  const cited = citedClaimIds(findings)
  const { eligible, quarantine } = selectBundles(verified, cited, {
    minScore: 6.0,
    max: Infinity,
  })

  // Split each list into live + archived. Dashboard shows live by
  // default and reveals archived behind a toggle.
  const liveQuarantine = quarantine.filter((b) => !isArchived(b))
  const archivedQuarantine = quarantine.filter(isArchived)
  const liveEligible = eligible.filter((b) => !isArchived(b))
  const archivedEligible = eligible.filter(isArchived)

  // Build a lookup for archive metadata.
  const archiveMeta = new Map<string, ArchiveEntry>()
  for (const e of archive?.items ?? []) archiveMeta.set(`${e.plenoId}/${e.topic}`, e)
  const decorate = (b: BundleCandidate) => {
    const out = serializeBundle(b, plenoTitleMap) as ReturnType<typeof serializeBundle> & {
      archive?: { archivedAt: string; reason: string | null; archivedBy: string }
    }
    const meta = archiveMeta.get(`${b.plenoId}/${b.topic}`)
    if (meta) {
      out.archive = {
        archivedAt: meta.archivedAt,
        reason: meta.reason,
        archivedBy: meta.archivedBy,
      }
    }
    return out
  }

  mkdirSync(resolve('public/data'), { recursive: true })

  const generatedAt = new Date().toISOString()
  const queueDoc = {
    generatedAt,
    bundleCount: liveQuarantine.length,
    archivedCount: archivedQuarantine.length,
    contract:
      "Bundles routed here because they contain at least one `contradicho` claim. Auto-curation never publishes contradicho material — these need a human curator to review the LLM's claim-vs-evidence match before promotion. Archived bundles have already been reviewed and dismissed; they live in `archived[]` for transparency and can be un-archived from the dashboard.",
    bundles: liveQuarantine.map(decorate),
    archived: archivedQuarantine.map(decorate),
  }
  const bundlesDoc = {
    generatedAt,
    bundleCount: liveEligible.length,
    archivedCount: archivedEligible.length,
    contract:
      'Eligible bundles (no contradicho, all gates passed) that have not yet been promoted. The weekly auto-curate cron promotes the top 5 by score; the rest are listed here for the curator dashboard.',
    bundles: liveEligible.map(decorate),
    archived: archivedEligible.map(decorate),
  }

  writeFileSync(QUEUE_JSON, JSON.stringify(queueDoc, null, 2) + '\n', 'utf8')
  writeFileSync(BUNDLES_JSON, JSON.stringify(bundlesDoc, null, 2) + '\n', 'utf8')

  process.stdout.write(
    `[refresh-queue] live: eligible=${liveEligible.length} · quarantine=${liveQuarantine.length} · archived=${archived.size}\n` +
      `[refresh-queue]   ${BUNDLES_JSON}\n` +
      `[refresh-queue]   ${QUEUE_JSON}\n`,
  )
}

main()
