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
import { evidenceStance, toPublishedSnippet, type ClaimVerification } from './claim-verifier'
import { classifyClaimVisibility } from './claim-public-gate'
import { recordKnowableAt, type RecordDateGateReport, type RecordDateIndex } from './record-dates'
import type { PlenoFinding, FindingQuote, FindingRef, FindingSeverity } from './pleno-finding'

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
 * Gate filter, applied per-claim: a claim that fails is left out of its
 * bundle, and the survivors then have to clear the dialectic gate on
 * their own.
 */
function isClaimEligibleForBundle(it: VerifiedItem): boolean {
  if (!it.claim.speakerGroup) return false // party-attribution required
  if (it.claim.confidence < 0.65) return false
  if (it.claim.verbatim.length < 25) return false
  if (BOILERPLATE.test(it.claim.verbatim)) return false
  // The public-ledger gate decides what machine-extracted claims may surface
  // publicly, and until 2026-08-09 nothing on this path asked it. `/hallazgos`
  // republishes the verbatim of every claim it quotes, so a claim the gate
  // withholds from `/plenos` was reaching the public through a page with no
  // gate at all — 77 of the 180 claims cited by the published findings are
  // `hidden` under today's verdicts, every one an accusation.
  //
  // The gate's design does allow a gated claim to be published: a curator
  // promotes it into a finding. That door is human by construction (see
  // claim-public-gate.ts), so the machine may not use it. `shown` only —
  // stricter than `!== 'hidden'` on purpose, so a visibility value added later
  // has to be opted in rather than inherited.
  //
  // `contradicho` is the one verdict exempted here, and not because it is
  // trusted: the gate calls it `hidden`, and selectBundles below is HARSHER
  // still — one contradicho claim sends its entire bundle to the curator queue
  // and publishes none of it. Dropping the claim here would empty that queue
  // instead of filling it, and a libel guard with nothing left to catch reads
  // exactly like a libel guard that works. The two rules agree on the outcome;
  // the stricter one has to be the one that sees the claim.
  if (it.verification.verdict === 'contradicho') return true
  if (classifyClaimVisibility(it) !== 'shown') return false
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
    const dw =
      (VERDICT_WEIGHT[b.verification.verdict] ?? 1) - (VERDICT_WEIGHT[a.verification.verdict] ?? 1)
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
  /** Optional pleno video / acta URL. Provenance — where the quote came
   *  from — not evidence for it, so it lands in crossChecked[]. */
  plenoSourceUrl?: string | null
  plenoSourceKind?: 'pleno-video' | 'pleno-acta'
  curatorName?: string
  /** ref → first-known date, from buildRecordDateIndex(). Omitting it
   *  disables the date gate entirely — the CLI always passes one. */
  recordDates?: RecordDateIndex
  /** Caller-owned accumulator the date gate writes to, so the run can
   *  report dropped and never-evaluated refs separately. */
  dateGate?: RecordDateGateReport
}

/**
 * Build a PlenoFinding payload ready for the validator. The returned
 * object passes validateFindingsSnapshot when the LLM output respects
 * the {title:10..120, summary:40..600} schema.
 *
 *   · severity is hard-coded informational.
 *   · curatorName defaults to "auto-curation-v1" so these are auditable.
 *   · refs are bucketed by the stance the verifier RECORDED on each one:
 *     `contradicts` → contradiction[], everything else → crossChecked[],
 *     which also takes the pleno source URL (provenance, not evidence).
 *     An unset stance is `checked` — a ref nobody classified may never be
 *     promoted into a verdict bucket.
 *     Until 2026-08-05 this aggregated every ref into a field called
 *     `corroboration[]`, and the LLM synthesiser, reading the name, wrote
 *     «corroborado por…» over contracts that corroborated nothing.
 *     contradiction[] still stays empty in practice: selectBundles
 *     quarantines every contradicho-bearing bundle before we get here.
 *   · a ref whose record post-dates the session is dropped before either
 *     bucket — pass `recordDates` (and `dateGate` to hear about it).
 *   · finding id mirrors promote-claim's scheme:
 *     f-<plenoDate>-<lastTwoSegmentsOfFirstClaimId>.
 */
export function composeFinding(opts: ComposeOpts): PlenoFinding {
  const { bundle, selectedQuotes, llmTitle, llmSummary } = opts
  const severity: FindingSeverity = 'informational'
  const curatorName = opts.curatorName ?? 'auto-curation-v1'

  // Refs are deduped below and quotes were not, which is how the extractor's
  // habit of cutting one intervention twice — once whole, once from a later
  // word — reached the page as two rows. The synthesiser counts rows to write
  // the summary, so a single voice shipped as «los grupos PSOE y un grupo no
  // identificado manifiestan». Containment, not equality: none of the three
  // published cases was an exact repeat. The rule is the validator's
  // `findRepeatedQuotes`, applied where the rows are chosen rather than left
  // for the gate to reject the whole run over.
  const normQuote = (s: string) => s.replace(/\s+/g, ' ').trim()
  const kept: VerifiedItem[] = []
  for (const it of selectedQuotes) {
    const text = normQuote(it.claim.verbatim)
    const swallowed = kept.findIndex((k) => normQuote(k.claim.verbatim).includes(text))
    if (swallowed >= 0) continue
    // The incoming row may instead CONTAIN one already kept; the fuller
    // verbatim wins, and `sourceClaimIds` keeps both ids either way.
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (text.includes(normQuote(kept[i].claim.verbatim))) kept.splice(i, 1)
    }
    kept.push(it)
  }
  const quotes: FindingQuote[] = kept.map((it) => ({
    text: it.claim.verbatim,
    speakerGroup: it.claim.speakerGroup,
    sourceClaimId: it.claim.id,
  }))

  // Bucket every verifier evidence ref from each cited claim by the stance
  // recorded ON THAT REF. Dedup by ref string — the same tender often shows
  // up under multiple claims when the bundle topic repeats.
  const seenRefs = new Set<string>()
  const crossChecked: FindingRef[] = []
  const contradiction: FindingRef[] = []
  for (const it of selectedQuotes) {
    for (const ev of it.verification.evidence ?? []) {
      // FindingRef.kind enum is narrower than ClaimEvidence.kind; map
      // 'prior-claim' to 'promise' (the verifier uses prior-claim only
      // for promise-repetition signals which are essentially promises).
      const kindMapped = ev.kind === 'prior-claim' ? 'promise' : ev.kind
      if (!['tender', 'bdns', 'budget', 'promise'].includes(kindMapped)) continue
      if (seenRefs.has(ev.ref)) continue
      seenRefs.add(ev.ref)
      // A record that did not exist when the council met cannot be what the
      // council was discussing, in either direction — so this runs before the
      // stance split and governs contradiction[] too. See record-dates.ts for
      // why it is the earliest known date and not the award date.
      if (!recordKnowableAt(ev.ref, bundle.plenoDate, opts.recordDates, opts.dateGate)) continue
      const ref: FindingRef = {
        kind: kindMapped as FindingRef['kind'],
        ref: ev.ref,
        snippet: toPublishedSnippet(ev.snippet),
      }
      // evidenceStance() whitelists the enum, so an absent or unrecognised
      // value lands here as 'checked' rather than being trusted.
      if (evidenceStance(ev) === 'contradicts') contradiction.push(ref)
      else crossChecked.push(ref)
    }
  }
  if (opts.plenoSourceUrl) {
    crossChecked.push({
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
    crossChecked,
    contradiction,
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
