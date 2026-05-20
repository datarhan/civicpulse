/**
 * Press auto-curation — composes informational PressFinding rows from
 * the verified-press-claims snapshot when safety gates pass.
 *
 * Bundle key: per-fingerprint (the FNV title hash) so the same story
 * picked up by multiple outlets collapses into one editorial finding.
 * Reuses the pleno auto-curate's safety discipline:
 *
 *   - confidence ≥ 0.65 floor per claim.
 *   - verbatim ≥ 25 chars (libel-safe quoting, stronger than the
 *     schema's 20-char minimum).
 *   - opinativa accusations dropped entirely.
 *   - contradicho bundles → quarantine, never auto-published. The
 *     curator must promote via `promote-press-claim` before the
 *     outlet receives a right-of-reply GitHub Issue.
 *   - LOREG freeze: when promises.json.frozenUntil > today, the
 *     selector returns empty buckets and the CLI exits without writing.
 *
 * Severity is hard-locked to `informational`. The curator path
 * (`promote-press-claim`) is the only way to land `notable` / `critical`.
 */

import type { ClaimVerdict } from './claim-verifier'
import type { PressClaim } from './press-claim'
import type { PressClaimVerification } from './press-verifier'
import type { PressFinding, PressFindingRef } from './press-finding'

export interface VerifiedPressItem {
  claim: PressClaim
  verification: PressClaimVerification
}

export interface AutoCurateOptions {
  minConfidence?: number
  minVerbatimChars?: number
  maxFindings?: number
  ignoreFreeze?: boolean
  frozenUntil?: string | null
  now?: Date
}

export interface BundleCandidate {
  fingerprint: string
  articleIds: string[]
  attributedOutlets: string[]
  topic: string
  items: VerifiedPressItem[]
  verdictMix: Record<ClaimVerdict, number>
  score: number
  earliestDate: string
  latestDate: string
}

const VERDICT_WEIGHT: Record<ClaimVerdict, number> = {
  verificado: 3,
  parcial: 2,
  contradicho: 4,
  'sin-datos': 0,
  'promesa-repetida': 1,
}

function isEligible(it: VerifiedPressItem, opts: Required<AutoCurateOptions>): boolean {
  if (it.claim.confidence < opts.minConfidence) return false
  if (it.claim.verbatim.length < opts.minVerbatimChars) return false
  if (it.claim.type === 'acusacion_publica' && it.claim.accusationSubtype === 'opinativa')
    return false
  return true
}

export interface AutoCurateResult {
  eligible: BundleCandidate[]
  quarantine: BundleCandidate[]
  skipped: BundleCandidate[]
  frozen: boolean
}

export function selectBundles(
  items: VerifiedPressItem[],
  options: AutoCurateOptions = {},
): AutoCurateResult {
  const opts: Required<AutoCurateOptions> = {
    minConfidence: options.minConfidence ?? 0.65,
    minVerbatimChars: options.minVerbatimChars ?? 25,
    maxFindings: options.maxFindings ?? 10,
    ignoreFreeze: options.ignoreFreeze ?? false,
    frozenUntil: options.frozenUntil ?? null,
    now: options.now ?? new Date(),
  }

  if (!opts.ignoreFreeze && opts.frozenUntil) {
    const today = opts.now.toISOString().slice(0, 10)
    if (opts.frozenUntil > today) {
      return { eligible: [], quarantine: [], skipped: [], frozen: true }
    }
  }

  const filtered = items.filter((it) => isEligible(it, opts))

  const byFp = new Map<string, VerifiedPressItem[]>()
  for (const it of filtered) {
    const fp = it.claim.articleFingerprint
    const arr = byFp.get(fp)
    if (arr) arr.push(it)
    else byFp.set(fp, [it])
  }

  const eligible: BundleCandidate[] = []
  const quarantine: BundleCandidate[] = []
  const skipped: BundleCandidate[] = []

  for (const [fp, group] of byFp) {
    const attributedOutlets = Array.from(new Set(group.map((g) => g.claim.articleSource))).sort()
    const articleIds = Array.from(new Set(group.map((g) => g.claim.articleId)))
    const verdictMix: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    let score = 0
    for (const it of group) {
      verdictMix[it.verification.verdict] += 1
      score += (VERDICT_WEIGHT[it.verification.verdict] ?? 0) * it.claim.confidence
    }
    score += attributedOutlets.length >= 2 ? 1.5 : 0

    const dates = group.map((g) => g.claim.articleDate).sort()
    const topic = group[0].claim.topic

    const bundle: BundleCandidate = {
      fingerprint: fp,
      articleIds,
      attributedOutlets,
      topic,
      items: group,
      verdictMix,
      score: Math.round(score * 100) / 100,
      earliestDate: dates[0].slice(0, 10),
      latestDate: dates[dates.length - 1].slice(0, 10),
    }

    if (verdictMix.contradicho > 0) {
      quarantine.push(bundle)
      continue
    }
    const corroborated = verdictMix.verificado >= 1 || attributedOutlets.length >= 2
    if (!corroborated || score < 1.5) {
      skipped.push(bundle)
      continue
    }
    eligible.push(bundle)
  }

  eligible.sort((a, b) => b.score - a.score)

  return {
    eligible: eligible.slice(0, opts.maxFindings),
    quarantine,
    skipped,
    frozen: false,
  }
}

export interface ComposeOpts {
  bundle: BundleCandidate
  curatorName?: string
  publishedAt?: string
}

export function composeFinding(opts: ComposeOpts): PressFinding {
  const { bundle } = opts
  const publishedAt = (opts.publishedAt ?? new Date().toISOString()).slice(0, 10)
  const curatorName = opts.curatorName ?? 'auto-curation-v1'

  const sorted = [...bundle.items].sort(
    (a, b) =>
      (VERDICT_WEIGHT[b.verification.verdict] ?? 0) * b.claim.confidence -
      (VERDICT_WEIGHT[a.verification.verdict] ?? 0) * a.claim.confidence,
  )
  const quotes = sorted.slice(0, 4).map((it) => ({
    text: it.claim.verbatim,
    outlet: it.claim.articleSource,
    articleUrl: it.claim.articleUrl,
    sourceClaimId: it.claim.id,
  }))

  const corroborationByRef = new Map<string, PressFindingRef>()
  for (const it of sorted) {
    for (const ev of it.verification.evidence) {
      if (corroborationByRef.has(ev.ref)) continue
      const kindMap: Record<string, PressFindingRef['kind']> = {
        tender: 'tender',
        bdns: 'bdns',
        budget: 'budget',
        promise: 'promise',
        'prior-claim': 'press',
      }
      const mapped = kindMap[ev.kind] ?? 'document'
      corroborationByRef.set(ev.ref, {
        kind: mapped,
        ref: ev.ref,
        snippet: ev.snippet.slice(0, 240),
      })
    }
  }

  const lead = sorted[0]
  const verdictSummary = Object.entries(bundle.verdictMix)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${n} ${v}`)
    .join(' · ')

  const title =
    `Auditoría · ${lead.claim.articleSource}: ${lead.claim.verbatim.slice(0, 80)}`.slice(0, 200)
  const summary =
    `Los datos municipales contrastan con la cobertura citada. ` +
    `Veredictos del lote: ${verdictSummary}. ` +
    `Cobertura: ${bundle.attributedOutlets.length} medio(s) — ${bundle.attributedOutlets.join(', ')}. ` +
    `Lote auto-curado por el laboratorio. Para una verificación editorial completa, ejecute promote-press-claim.`

  return {
    id: `pf-${publishedAt}-${bundle.fingerprint.slice(0, 8)}`,
    sourceClaimIds: bundle.items.map((it) => it.claim.id),
    articleIds: bundle.articleIds,
    articleFingerprints: [bundle.fingerprint],
    attributedOutlets: bundle.attributedOutlets,
    earliestArticleDate: bundle.earliestDate,
    latestArticleDate: bundle.latestDate,
    title,
    summary: summary.slice(0, 2000),
    severity: 'informational',
    quotes,
    corroboration: Array.from(corroborationByRef.values()),
    contradiction: [],
    relatedPromiseIds: [],
    relatedPlenoItems: [],
    curatorName,
    publishedAt,
    response: null,
  }
}

export function renderQuarantineMarkdown(quarantine: BundleCandidate[]): string {
  if (quarantine.length === 0) {
    return '# Press auto-curation queue\n\nNo bundles in quarantine.\n'
  }
  const lines: string[] = [
    '# Press auto-curation queue',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'These bundles contain at least one `contradicho` claim and were NOT',
    'auto-published. Review each one and run `npm run promote-press-claim`',
    'to publish (or leave here as a no-op).',
    '',
  ]
  for (const b of quarantine) {
    lines.push(`## Fingerprint \`${b.fingerprint}\` · ${b.attributedOutlets.length} outlet(s)`)
    lines.push('')
    lines.push(`- **Outlets:** ${b.attributedOutlets.join(', ')}`)
    lines.push(`- **Date range:** ${b.earliestDate} → ${b.latestDate}`)
    lines.push(
      `- **Verdict mix:** ` +
        Object.entries(b.verdictMix)
          .filter(([, n]) => n > 0)
          .map(([v, n]) => `${n} ${v}`)
          .join(' · '),
    )
    lines.push(`- **Score:** ${b.score}`)
    lines.push('')
    lines.push('**Claims:**')
    for (const it of b.items.slice(0, 6)) {
      lines.push(
        `- [${it.verification.verdict}] «${it.claim.verbatim.slice(0, 140)}» — ${it.claim.articleSource}`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
