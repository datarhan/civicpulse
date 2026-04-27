/**
 * Auto-curation core — pure module shared between the CLI and the tests.
 *
 * Two responsibilities:
 *   1. selectBundles(): apply safety gates to the verifier snapshot and
 *      emit the ranked list of bundles that are eligible for auto-
 *      publication. Contradicho-bearing bundles are returned in a
 *      separate `quarantine` array so the CLI can route them to the
 *      curator-review queue file instead.
 *   2. composeFinding(): given a bundle + LLM-written {title, summary}
 *      + the verifier's evidence index, build the PlenoFinding payload
 *      that promote-claim's validator will accept.
 *
 * Severity is hard-coded to `informational` here. The plan deliberately
 * keeps notable/critical out of the auto-curation path; those stay
 * curator-only forever. See plan: floating-drifting-river.md.
 */
import type { PlenoClaim } from './pleno-claim'
import type { ClaimVerification } from './claim-verifier'
import type {
  PlenoFinding,
  FindingQuote,
  FindingRef,
  FindingSeverity,
} from './pleno-finding'

export interface VerifiedItem {
  claim: PlenoClaim
  verification: ClaimVerification
}

export interface VerifiedSnapshot {
  items: VerifiedItem[]
}

export interface FindingsSnapshot {
  items: PlenoFinding[]
}

export interface BundleCandidate {
  plenoId: string
  plenoDate: string
  topic: string
  blocs: string[]
  items: VerifiedItem[]
  /** Sum of (verdict-weight × confidence) + bloc-diversity bonus. Same
   *  scoring as the curation-shortlist generator. */
  score: number
}

export interface SelectionOpts {
  /** Min bundle score required for auto-publish eligibility. Default 6.0. */
  minScore?: number
  /** Max bundles returned in `eligible[]`. Default Infinity (caller caps). */
  max?: number
}

const VERDICT_WEIGHT: Record<string, number> = {
  verificado: 3,
  contradicho: 4,
  parcial: 2,
}

const BOILERPLATE = /^(Punto|Acta|Acta núm|Comienza el|En base a|Asunto)/i

/**
 * Gate filter, applied per-claim. A bundle is dropped (not just the
 * single claim) if any of its claims fails these checks. The whole
 * bundle is the editorial unit so partial bundles aren't useful.
 */
function isClaimEligibleForBundle(it: VerifiedItem): boolean {
  if (!it.claim.speakerGroup) return false // party-attribution required
  if (it.claim.confidence < 0.65) return false
  if (it.claim.verbatim.length < 25) return false
  if (BOILERPLATE.test(it.claim.verbatim)) return false
  return true
}

/**
 * Group + score + filter the verified snapshot into auto-publishable
 * bundles. Returns the eligible list (sorted by score desc) AND a
 * `quarantine` list of bundles that contained at least one contradicho
 * claim — those go to the curator-review queue, never published.
 *
 * `previouslyCitedClaimIds` is the union of every sourceClaimId already
 * appearing in pleno-findings.json. Bundles with any cited claim are
 * dropped to avoid double-publishing the same material.
 */
export function selectBundles(
  verified: VerifiedSnapshot | null | undefined,
  previouslyCitedClaimIds: Set<string>,
  opts: SelectionOpts = {},
): { eligible: BundleCandidate[]; quarantine: BundleCandidate[] } {
  const minScore = opts.minScore ?? 6.0
  const max = opts.max ?? Infinity

  const groups = new Map<string, VerifiedItem[]>()
  for (const it of verified?.items ?? []) {
    if (previouslyCitedClaimIds.has(it.claim.id)) continue
    if (!['verificado', 'parcial', 'contradicho'].includes(it.verification.verdict)) continue
    if (!isClaimEligibleForBundle(it)) continue
    const key = it.claim.plenoId + '||' + it.claim.topic
    const arr = groups.get(key)
    if (arr) arr.push(it)
    else groups.set(key, [it])
  }

  const all: BundleCandidate[] = []
  for (const [key, items] of groups) {
    const [plenoId, topic] = key.split('||')
    const blocs = [...new Set(items.map((i) => i.claim.speakerGroup as string))]
    let score = 0
    for (const it of items) {
      score += (VERDICT_WEIGHT[it.verification.verdict] ?? 1) * it.claim.confidence
    }
    score += blocs.length * 0.5
    all.push({ plenoId, plenoDate: items[0].claim.plenoDate, topic, blocs, items, score })
  }
  all.sort((a, b) => b.score - a.score)

  const quarantine: BundleCandidate[] = []
  const eligible: BundleCandidate[] = []

  for (const b of all) {
    if (b.score < minScore) continue
    const hasContradicho = b.items.some((i) => i.verification.verdict === 'contradicho')
    if (hasContradicho) {
      quarantine.push(b)
      continue
    }
    // Dialectic gate: 2+ blocs OR 3+ verificado from same bloc.
    const verificadoCount = b.items.filter((i) => i.verification.verdict === 'verificado').length
    const dialectic = b.blocs.length >= 2 || verificadoCount >= 3
    if (!dialectic) continue
    eligible.push(b)
    if (eligible.length >= max) break
  }

  return { eligible, quarantine }
}

/**
 * Pick the top-K claims from a bundle to surface as quotes — same
 * heuristic as the shortlist generator: verdict-weight first, then
 * confidence within ties.
 */
export function topQuotes(items: VerifiedItem[], k = 4): VerifiedItem[] {
  const sorted = [...items].sort((a, b) => {
    const dw = (VERDICT_WEIGHT[b.verification.verdict] ?? 1) - (VERDICT_WEIGHT[a.verification.verdict] ?? 1)
    if (dw !== 0) return dw
    return b.claim.confidence - a.claim.confidence
  })
  return sorted.slice(0, k)
}

export interface ComposeOpts {
  bundle: BundleCandidate
  selectedQuotes: VerifiedItem[]
  llmTitle: string
  llmSummary: string
  /** Optional pleno video / acta URL aggregated as a corroborating ref. */
  plenoSourceUrl?: string | null
  plenoSourceKind?: 'pleno-video' | 'pleno-acta'
  curatorName?: string
}

/**
 * Build a PlenoFinding payload ready for the validator. The returned
 * object passes validateFindingsSnapshot when the LLM output respects
 * the {title:10..120, summary:40..600} schema.
 *
 *   · severity is hard-coded informational.
 *   · curatorName defaults to "auto-curation-v1" so these are auditable.
 *   · corroboration[] aggregates EVERY verifier evidence ref from the
 *     selected quotes (deduped by ref) + the pleno source URL when
 *     supplied. contradiction[] stays empty (we filter those bundles
 *     out at selectBundles).
 *   · finding id mirrors promote-claim's scheme:
 *     f-<plenoDate>-<lastTwoSegmentsOfFirstClaimId>.
 */
export function composeFinding(opts: ComposeOpts): PlenoFinding {
  const { bundle, selectedQuotes, llmTitle, llmSummary } = opts
  const severity: FindingSeverity = 'informational'
  const curatorName = opts.curatorName ?? 'auto-curation-v1'

  const quotes: FindingQuote[] = selectedQuotes.map((it) => ({
    text: it.claim.verbatim,
    speakerGroup: it.claim.speakerGroup,
    sourceClaimId: it.claim.id,
  }))

  // Aggregate every verifier evidence ref from each cited claim. Dedup
  // by ref string — the same tender often shows up under multiple
  // claims when the bundle topic repeats.
  const seenRefs = new Set<string>()
  const corroboration: FindingRef[] = []
  for (const it of selectedQuotes) {
    for (const ev of it.verification.evidence ?? []) {
      // FindingRef.kind enum is narrower than ClaimEvidence.kind; map
      // 'prior-claim' to 'promise' (the verifier uses prior-claim only
      // for promise-repetition signals which are essentially promises).
      const kindMapped = ev.kind === 'prior-claim' ? 'promise' : ev.kind
      if (!['tender', 'bdns', 'budget', 'promise'].includes(kindMapped)) continue
      if (seenRefs.has(ev.ref)) continue
      seenRefs.add(ev.ref)
      const snippet = ev.snippet.length > 237 ? ev.snippet.slice(0, 237).trimEnd() + '…' : ev.snippet
      corroboration.push({ kind: kindMapped as FindingRef['kind'], ref: ev.ref, snippet })
    }
  }
  if (opts.plenoSourceUrl) {
    corroboration.push({
      kind: opts.plenoSourceKind ?? 'pleno-video',
      ref: opts.plenoSourceUrl,
      snippet:
        opts.plenoSourceKind === 'pleno-acta'
          ? `Acta del pleno ${bundle.plenoDate}`
          : `Vídeo del pleno ${bundle.plenoDate} · YouTube`,
    })
  }

  const anchor = selectedQuotes[0].claim
  const shortAnchor = anchor.id.split('-').slice(-2).join('-')
  const id = `f-${bundle.plenoDate}-${shortAnchor}`

  return {
    id,
    plenoId: bundle.plenoId,
    plenoDate: bundle.plenoDate,
    title: llmTitle,
    summary: llmSummary,
    severity,
    sourceClaimIds: selectedQuotes.map((q) => q.claim.id),
    quotes,
    corroboration,
    contradiction: [],
    relatedPromiseIds: [],
    curatorName,
    publishedAt: new Date().toISOString().slice(0, 10),
    response: null,
  }
}

/** Extract the union of all sourceClaimIds already cited in
 *  pleno-findings.json. Tiny helper used by the CLI. */
export function citedClaimIds(findings: FindingsSnapshot | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const f of findings?.items ?? []) {
    for (const id of f.sourceClaimIds ?? []) out.add(id)
  }
  return out
}
