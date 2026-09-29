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
 *         curatorName='auto-curation-v1', refs bucketed by recorded stance
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
 *   · Only claims the public claim-ledger gate marks `shown` are bundled.
 *     Promotion into a finding is the sanctioned route past that gate and it
 *     is a human one — see src/scraper/claim-public-gate.ts.
 *   · A record whose earliest known date falls after the session is never
 *     cross-checked against it, in the candidate list or in the published
 *     refs — see src/scraper/record-dates.ts.
 *   · LOREG freeze (frozenUntil > today) → CLI exits without writing.
 *   · A group holding one seat names its councillor by elimination. The
 *     synthesiser never sees one (`groupForSynthesis`), and a draft that still
 *     attributes to or names one goes to the human queue however well the class
 *     is measured (`publicationDecision`). An unreadable officials.json fails
 *     closed: which groups those are is unknowable, so nothing publishes.
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
  blocsForSynthesis,
  groupForSynthesis,
  publicationDecision,
  FINDING_MEASUREMENT_KEY,
  type VerifiedSnapshot,
  type FindingsSnapshot,
  type BundleCandidate,
} from '../src/scraper/auto-curate'
import { oneSeatBlocsOf, type OfficialsDoc } from '../src/scraper/corporation-seats'
import { generateTitleAndSummary } from '../src/llm/auto-curate-llm'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'
import {
  decideAutomation,
  explainMissingMeasurement,
  loadMeasurements,
  type Decision,
} from '../src/scraper/automation-policy'
import {
  buildCurationQueue,
  isCleanForReview,
  type QueueInputs,
} from '../src/scraper/curation-queue'
import {
  buildRecordDateIndex,
  emptyRecordDateGateReport,
  recordKnowableAt,
  summariseRecordDateGate,
  type RecordDateIndex,
} from '../src/scraper/record-dates'

/** Set when the automation policy refuses publication; drafts still get written. */
let policyBlocked: string | null = null

/**
 * Datasets the curation checks need: the name haystack, the current verdict of
 * every claim, and the company names a human already accepted.
 */
function buildQueueInputs(oneSeatBlocs: readonly string[]): QueueInputs {
  const read = (p: string): any => {
    const abs = resolve(p)
    return existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : null
  }
  const tenders = read('public/data/tenders.json') ?? {}
  const bdns = read('public/data/bdns.json') ?? {}
  const entities = read('public/data/entities.json') ?? {}
  const verified = read('public/data/pleno-claims-verified.json') ?? { items: [] }
  const baseline = read('.finding-entity-baseline.json') ?? {}

  const haystack = [
    ...[...(tenders.contracts ?? []), ...(tenders.tenders ?? [])].map(
      (c: any) => `${c.title ?? ''} ${c.assignee ?? ''} ${c.contractor ?? ''}`,
    ),
    ...(bdns.items ?? bdns.convocatorias ?? []).map(
      (b: any) => `${b.title ?? b.descripcion ?? ''} ${b.organo ?? ''}`,
    ),
    ...(entities.items ?? entities.entities ?? []).map(
      (e: any) => `${e.name ?? e.canonical ?? ''} ${(e.aliases ?? []).join(' ')}`,
    ),
  ].join(' ')

  const verdictByClaimId = new Map<string, string>()
  for (const it of verified.items ?? []) {
    verdictByClaimId.set(it.claim.id, it.verification.verdict)
  }
  return { haystack, verdictByClaimId, reviewedNames: baseline.reviewed ?? [], oneSeatBlocs }
}

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FINDINGS = resolve('public/data/pleno-findings.json')
const PLENOS = resolve('public/data/plenos.json')
const VIDEOS = resolve('public/data/pleno-videos.json')
const PROMISES = resolve('public/data/promises.json')
const OFFICIALS = resolve('public/data/officials.json')
const TENDERS = resolve('public/data/tenders.json')
const TENDERS_TED = resolve('public/data/tenders-ted.json')
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

  // Fail CLOSED on the legal gate: an absent/unreadable promises.json means
  // the LOREG freeze state is unknowable — refusing to publish is reversible,
  // publishing during a freeze is not (LOREG art. 50).
  if (!promises) {
    process.stderr.write(
      `[auto-curate] ${PROMISES} missing or unreadable — cannot determine LOREG freeze state, refusing to publish\n`,
    )
    process.exit(1)
  }

  if (isFrozen(promises)) {
    process.stderr.write(
      `[auto-curate] LOREG electoral freeze active until ${promises?.frozenUntil} — exiting without publishing\n`,
    )
    process.exit(0)
  }

  // Fail CLOSED on the other legal gate too. Which groups hold a single seat
  // decides which drafts name a councillor by elimination; with no roster that
  // is unknowable, and reading «unknown» as «none» would publish all of them.
  const oneSeat = oneSeatBlocsOf(loadJson<OfficialsDoc>(OFFICIALS))
  if (oneSeat === null) {
    process.stderr.write(
      `[auto-curate] ${OFFICIALS} missing or empty — cannot tell which groups hold one seat, refusing to publish\n`,
    )
    process.exit(1)
  }
  process.stdout.write(
    `[auto-curate] one-seat groups (never shown to the synthesiser, never published unattended): ${oneSeat.join(', ') || 'none'}\n`,
  )

  // Automation policy: this class publishes unattended only on recorded
  // evidence that it is accurate enough to.
  //
  // Auto-publish was switched on by operator decision without that evidence
  // ever existing, which is the same shape as the deterministic verifier that
  // just had 744 unreviewed verdicts retracted — confident, automated, and
  // never measured. The remedy is to MEASURE the class, not to trust it or to
  // abandon it: `npm run check:automation` prints exactly what is missing, and
  // `npm run record-measurement` is the only thing that lifts this gate.
  //
  // Severity is hard-coded `informational` here, so this reads the
  // informational bar, the most permissive one.
  const measurements = loadMeasurements()
  const decision = decideAutomation(
    {
      kind: 'publish-finding',
      reversible: true,
      severity: 'informational',
      measurementKey: FINDING_MEASUREMENT_KEY,
      frozen: false,
    },
    measurements,
  )
  if (!decision.allow) {
    process.stderr.write(
      `[auto-curate] automation policy: ${decision.reason}\n` +
        `[auto-curate] ${explainMissingMeasurement(decision) ?? 'record a qualifying measurement to enable unattended publication'}\n`,
    )
    policyBlocked = decision.reason
  } else {
    process.stdout.write(`[auto-curate] automation policy: ${decision.reason}\n`)
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
  // Each draft's own answer. The run-level decision above says whether the
  // class may publish at all; this one says whether THIS draft may, and a draft
  // that attributes to or names a one-seat group never may.
  const decisions = new Map<string, Decision>()

  // Which records could the council have been discussing? Built once from the
  // procurement snapshots, consulted twice per bundle: here, so a post-dated
  // expediente is never even shown to the synthesiser, and inside
  // composeFinding, so it never reaches `crossChecked[]`. Both, because
  // stripping only the published refs would leave the model writing prose about
  // a contract the finding no longer cites.
  const recordDates: RecordDateIndex = buildRecordDateIndex([
    loadJson<unknown>(TENDERS),
    loadJson<unknown>(TENDERS_TED),
  ])
  const runDateGate = emptyRecordDateGateReport()
  process.stdout.write(`[auto-curate] record-date index: ${recordDates.size} ref(s)\n`)
  if (recordDates.size === 0) {
    // An empty index gates nothing, and every ref would be reported as "not in
    // any procurement snapshot" — which reads like a clean pass. Say out loud
    // that the check did not run.
    process.stderr.write(
      `[auto-curate] WARN: record-date index is EMPTY (${TENDERS}, ${TENDERS_TED}) — ` +
        `the post-dated-record gate cannot evaluate anything this run\n`,
    )
  }

  for (const bundle of eligible.slice(0, opts.max)) {
    const quotes = topQuotes(bundle.items, 4)
    const evidenceSnippets: string[] = []
    const seen = new Set<string>()
    for (const q of quotes) {
      for (const ev of q.verification.evidence ?? []) {
        const k = `${ev.kind}:${ev.snippet}`
        if (seen.has(k)) continue
        seen.add(k)
        // Not counted into runDateGate: composeFinding walks the same refs and
        // reports them there, and double-counting would overstate the work.
        if (!recordKnowableAt(ev.ref, bundle.plenoDate, recordDates)) continue
        evidenceSnippets.push(`[${ev.kind}] ${ev.snippet.slice(0, 180)}`)
      }
    }

    const llm = await generateTitleAndSummary({
      plenoId: bundle.plenoId,
      plenoDate: bundle.plenoDate,
      plenoTitle: plenoTitle(plenos, bundle.plenoId),
      topic: bundle.topic,
      blocs: blocsForSynthesis(bundle.blocs, oneSeat),
      quotes: quotes.map((q) => ({
        speakerGroup: groupForSynthesis(q.claim.speakerGroup, oneSeat),
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
      recordDates,
      dateGate: runDateGate,
    })

    accepted.push(finding)
    const own = publicationDecision(finding, oneSeat, measurements)
    decisions.set(finding.id, own)
    process.stdout.write(
      `[auto-curate]   ✓ ${bundle.plenoId}/${bundle.topic} · score=${bundle.score.toFixed(2)} · ${finding.id}\n` +
        `[auto-curate]     title: ${finding.title}\n` +
        `[auto-curate]     ${own.allow ? 'may publish' : `→ human queue: ${own.reason}`}\n`,
    )
  }

  // Report what the date gate actually evaluated, not just what it dropped: a
  // run whose refs were all unindexed did no gating at all and must not read
  // like a clean pass.
  process.stdout.write(`[auto-curate] record dates · ${summariseRecordDateGate(runDateGate)}\n`)
  for (const p of runDateGate.postDated) {
    process.stdout.write(
      `[auto-curate]   ✗ dropped ref (record dated ${p.firstKnown}, session ${p.plenoDate}): ${p.ref}\n`,
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
  const snapshotWith = (drafts: PlenoFinding[]): string => {
    const merged: PlenoFinding[] = [...baseSnap.items]
    for (const f of drafts) {
      if (merged.some((x) => x.id === f.id)) continue
      merged.push(f)
    }
    merged.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))
    const next: PlenoFindingsSnapshot = {
      ...baseSnap,
      generatedAt: new Date().toISOString(),
      items: merged,
    }
    const serialized = JSON.stringify(next, null, 2) + '\n'
    validateFindingsSnapshot(serialized) // throws on schema mismatch
    return serialized
  }
  // Every draft is validated, the ones bound for the queue too: a malformed
  // draft is a defect of this run, not something to hand a curator.
  try {
    snapshotWith(accepted)
  } catch (err) {
    process.stderr.write(
      `[auto-curate] FATAL: composed snapshot fails the schema validator: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  }

  // Who publishes: the class has to be allowed (no policy block) AND the draft
  // has to be allowed on its own — a missing answer is a refusal. The rest goes
  // to the same human queue a policy block fills, with the reason in its checks.
  const toPublish = policyBlocked ? [] : accepted.filter((f) => decisions.get(f.id)?.allow === true)
  const toQueue = accepted.filter((f) => !toPublish.includes(f))
  const queueInputs = buildQueueInputs(oneSeat)

  // A policy block does everything a run normally does EXCEPT publish: the
  // drafts are composed, validated and written where a curator can act on them.
  // Gating must not also destroy the work — that is what turned the old
  // blanket approval gate into a queue nobody could drain.
  if (opts.dryRun || policyBlocked) {
    const previewPath = policyBlocked
      ? resolve('editorial/auto-curation-queue-pending-measurement.json')
      : `/tmp/auto-curate-preview-${Date.now()}.json`
    mkdirSync(resolve('editorial'), { recursive: true })
    // Ship the deterministic checks WITH the drafts. A curator reviewing on a
    // phone can judge prose but cannot check a company name against 1,231
    // contract rows — and that was two of the four real defects found in the
    // published corpus. See src/scraper/curation-queue.ts.
    const queue = buildCurationQueue(accepted, queueInputs, {
      reason: policyBlocked ?? 'dry-run',
      now: new Date().toISOString(),
    })
    writeFileSync(previewPath, JSON.stringify(queue, null, 2) + '\n')
    const blockers = queue.items.filter((i) => !isCleanForReview(i)).length
    process.stdout.write(
      policyBlocked
        ? `[auto-curate] NOT PUBLISHED (${policyBlocked}) — ${queue.items.length} draft(s) → ${previewPath}\n` +
            `[auto-curate]   ${blockers} carry a blocker for the curator's attention · review with /curar on the bot\n`
        : `[auto-curate] DRY RUN — wrote ${queue.items.length} accepted finding(s) to ${previewPath} (no persistence) · ` +
            `${toQueue.length} would go to the human queue\n`,
    )
    return
  }

  if (toQueue.length > 0) {
    const queuePath = resolve('editorial/auto-curation-queue-pending-measurement.json')
    mkdirSync(resolve('editorial'), { recursive: true })
    const queue = buildCurationQueue(toQueue, queueInputs, {
      reason:
        'names an individual — a draft that attributes to or names a group with one seat ' +
        'names its councillor by elimination, and a curator signs that',
      now: new Date().toISOString(),
    })
    writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n')
    process.stdout.write(
      `[auto-curate] ${toQueue.length} draft(s) NOT PUBLISHED, to the human queue → ${queuePath} · review with /curar on the bot\n`,
    )
  }

  if (toPublish.length > 0) writeFileSync(FINDINGS, snapshotWith(toPublish), 'utf8')
  process.stdout.write(
    `[auto-curate] ✅ wrote ${toPublish.length} new finding(s) to ${FINDINGS} ` +
      `(${rejected.length} rejected · ${toQueue.length} to the human queue · ` +
      `${quarantine.length} contradicho-bearing queued for curator review)\n`,
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
