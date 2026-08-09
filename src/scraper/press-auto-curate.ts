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
 *   - contradicho bundles → quarantine, never auto-published, and there
 *     they stop: press has no promotion CLI, so a quarantined bundle
 *     reaches no outlet and triggers no right-of-reply. See the header
 *     of press-finding.ts for what a curator can actually do.
 *   - LOREG freeze: when promises.json.frozenUntil > today, the
 *     selector returns empty buckets and the CLI exits without writing.
 *
 * Severity is hard-locked to `informational`. `notable` is reachable
 * only as a correction to an already-published row
 * (`npm run correct-press-finding --field severity`); `critical` is not
 * reachable at all, since it needs a `contradiction[]` ref no path adds.
 *
 * Evidence refs are bucketed by the stance the verifier RECORDED on each
 * one (`EvidenceStance` in claim-verifier.ts — the same type the pleno path
 * uses, not a copy): `contradicts` → contradiction[], everything else →
 * crossChecked[]. An unset stance reads as `checked`; a ref nobody
 * classified may never be promoted into a verdict-bearing bucket. In
 * practice contradiction[] stays empty here because selectBundles
 * quarantines every contradicho-bearing bundle before composeFinding runs.
 */

import { evidenceStance, toPublishedSnippet, type ClaimVerdict } from './claim-verifier'
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
  /**
   * articleId → a key shared by every article telling the same story.
   *
   * Without it, bundles are keyed on `articleFingerprint`, and two outlets can
   * NEVER share one: press.ts fingerprints the first six significant words of
   * the title and drops the second outlet on a collision. So the
   * `attributedOutlets.length >= 2` path below — one of only two ways a bundle
   * can qualify — was unreachable, and with the other one (`verificado >= 1`)
   * unreachable too while the verifier could not read tender amounts,
   * press-findings.json held 0 items in all 34 commits since 2026-05-21. The
   * whole findings card, and with it the corrections log that IFCN pillar #5
   * rests on, had never rendered.
   *
   * The CLI builds this from the same title-similarity clustering
   * /laboratorio already uses for triangulation.
   */
  storyKeyByArticleId?: Map<string, string>,
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
    const fp = storyKeyByArticleId?.get(it.claim.articleId) ?? it.claim.articleFingerprint
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

  // Bucket every verifier evidence ref by the stance recorded ON THAT REF,
  // deduped by ref string. Until 2026-08-05 all of them went into one field
  // called `corroboration[]` — including, on the live snapshot, a Plan de
  // Movilidad Urbana Sostenible contract cross-matched at 0.68 to «una
  // inversión de 61.000 euros en artes escénicas». Nothing here checks that
  // a document supports a sentence, so nothing here may say it does.
  const seenRefs = new Set<string>()
  const crossChecked: PressFindingRef[] = []
  const contradiction: PressFindingRef[] = []
  for (const it of sorted) {
    for (const ev of it.verification.evidence) {
      if (seenRefs.has(ev.ref)) continue
      seenRefs.add(ev.ref)
      // Every member of ClaimEvidence['kind'] is mapped, so the fallback is
      // unreachable: `document` is a CURATOR-ONLY kind, and the auto path
      // emitting one would present verifier output as a curator's own
      // attachment. Factcheck and BOE rows used to land there.
      const kindMap: Record<string, PressFindingRef['kind']> = {
        tender: 'tender',
        bdns: 'bdns',
        budget: 'budget',
        promise: 'promise',
        'prior-claim': 'press',
        factcheck: 'factcheck',
        boe: 'boe',
      }
      const mapped = kindMap[ev.kind] ?? 'document'
      const ref: PressFindingRef = {
        kind: mapped,
        ref: ev.ref,
        // Was a bare slice(0, 240) — it cut mid-word with no marker, and it
        // let the prompt's `· sim=0.50` tail through onto a published label.
        // press-findings.json carries none today; the path that would have
        // written one is the same one that did on the pleno side.
        snippet: toPublishedSnippet(ev.snippet),
      }
      // evidenceStance() whitelists the enum, so an absent or unrecognised
      // value lands as 'checked' rather than being trusted upward.
      if (evidenceStance(ev) === 'contradicts') contradiction.push(ref)
      else crossChecked.push(ref)
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
    // This string is PUBLISHED: it is the finding's summary, rendered on
    // /laboratorio. It used to close by telling the reader to execute a
    // command named "promote-press-claim" — an instruction neither a reader
    // nor a curator could follow, because no such script has ever existed in
    // this repo. What the row is, and what it is not, is the honest thing to
    // say in its place. Guarded by tests/press-cli-references.test.ts.
    `Lote auto-curado por el laboratorio: el contraste es determinista y no lo ha revisado una persona.`

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
    crossChecked,
    contradiction,
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
    'auto-published.',
    '',
    'There is no CLI that publishes them. This file is a reading queue, not a',
    'staging area: press has no `promote` command, and landing one of these',
    'would mean writing `public/data/press-findings.json` by hand, past the',
    'curated-write guard. Nothing here is on the site.',
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
