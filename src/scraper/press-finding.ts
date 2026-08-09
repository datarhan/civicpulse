/**
 * Press finding — curator-only editorial wrapper around one or more
 * verified press claims.
 *
 * Mirrors the pleno-finding schema (src/scraper/pleno-finding.ts) but
 * with the libel boundary moved one level outward: pleno findings name
 * a politician's bloc (sometimes the individual after curator
 * promotion), press findings name the OUTLET that published the claim
 * and never a single journalist by byline. The verdict reads "municipal
 * data agrees / disagrees / has no record" — never "the journalist was
 * wrong."
 *
 * The evidence list is `crossChecked[]`. It was called `corroboration[]`
 * until 2026-08-05, and the name asserted a verdict its contents never
 * carried: `press-auto-curate.composeFinding` dumped EVERY verifier
 * evidence ref for the bundled claims into it, agreeing or not, and left
 * `contradiction[]` empty by construction. Same defect, same fix, and the
 * same reason it matters — the LLM synthesiser reads the schema, not the
 * page. See `EvidenceStance` in `claim-verifier.ts`; this file uses that
 * type rather than declaring a second copy of it.
 *
 * ## How a row gets here, and how far a curator can move it
 *
 * `npm run auto-curate-press` is the ONLY writer. It routes bundles here
 * when the dialectic + score gates pass, with severity hard-locked to
 * `informational`. Bundles carrying a `contradicho` verdict are held in
 * editorial/press-auto-curation-queue.md instead — `parcial` alone does
 * not quarantine, only `contradicho` does (`selectBundles`).
 *
 * There is no promotion CLI on the press side. Until 2026-08-09 the
 * docstrings across this subsystem pointed at one called
 * "promote-press-claim", in eight places including a PUBLISHED finding
 * summary. It was never a script and never a file — `git log -S` finds it
 * only in prose, first written in 0ea02da alongside these schemas. This is
 * what a curator actually has:
 *
 *   · published rows        — `npm run correct-press-finding`, which
 *     amends title / summary / severity and leaves a dated corrections
 *     trail. Raising a row to `notable` goes through it.
 *   · `critical`            — unreachable today. The validator requires
 *     ≥1 `contradiction[]` ref, and no path (auto or CLI) can add refs
 *     to a published finding. That gate is deliberate; the missing
 *     ability to satisfy it is simply not built.
 *   · quarantined bundles   — no path. They stay in the queue file.
 *
 * Build the promotion CLI when there is something to promote. As of this
 * writing press-findings.json holds 0 rows and the queue is empty, and a
 * new write path onto a surface that names media outlets is not worth
 * opening to satisfy a docstring.
 *
 * Once a finding is published the affected outlets receive a GitHub-Issue
 * invitation (`.github/ISSUE_TEMPLATE/press-finding-response.yml`) to
 * file a verbatim response (≥20 chars), ingested by the
 * `ingest-press-finding-responses.yml` workflow.
 */

export type PressFindingSeverity = 'informational' | 'notable' | 'critical'

export const ALLOWED_PRESS_FINDING_SEVERITIES: readonly PressFindingSeverity[] = [
  'informational',
  'notable',
  'critical',
]

export interface PressFindingQuote {
  /** Verbatim text from the article, ≥20 chars. */
  text: string
  /** Outlet that published the quote (publisher name from press.json). */
  outlet: string
  /** Article URL the quote was lifted from. */
  articleUrl: string
  /** Press-claim id audit trail. */
  sourceClaimId: string
}

export interface PressFindingRef {
  /**
   * Verifier-populated kinds (tender/bdns/budget/promise/pleno-vote/
   * padron/paro) come from `press-verifier.ts`. The curator-only kinds
   * (press, document, transcript) are admitted by the schema but no
   * press path emits them — the pleno twin takes them through
   * `promote-claim --extra-corroboration`, and press has no equivalent
   * CLI (see the header). They are kept in the enum so the two finding
   * schemas stay one shape, not because anything can write them here.
   * Were one ever landed it would sit in `crossChecked[]` like the rest:
   * a curator attaching a document is not the CLI checking that the
   * document supports anything.
   */
  kind:
    | 'tender'
    | 'bdns'
    | 'budget'
    | 'promise'
    | 'pleno-vote'
    | 'padron'
    | 'paro'
    | 'press'
    | 'document'
    | 'transcript'
    | 'factcheck'
    | 'boe'
  /** Absolute URL when possible; synthetic ref ("budget:2025:cap3") otherwise. */
  ref: string
  /** Short citation, ≤240 chars. */
  snippet: string
}

export interface PressFinding {
  id: string
  /** Press claim ids this finding bundles. */
  sourceClaimIds: string[]
  /** press.json item ids covered by the finding. */
  articleIds: string[]
  /**
   * FNV fingerprints of the headlines bundled into this finding.
   * Same wire-copy across outlets collapses to a single fingerprint,
   * so this array is usually shorter than `attributedOutlets`.
   */
  articleFingerprints: string[]
  /**
   * Outlets that published one or more of the bundled claims.
   * Right-of-reply routes to all of them.
   */
  attributedOutlets: string[]
  /** ISO date of the earliest article in the bundle. */
  earliestArticleDate: string
  /** ISO date of the latest article in the bundle. */
  latestArticleDate: string
  /**
   * Curator's editorial title (10-200 chars). Must summarise the
   * audit finding, not the original headline — readers should be able
   * to tell at a glance whether municipal data agreed, partially
   * agreed, or had no record.
   */
  title: string
  /**
   * Curator's editorial summary (40-2000 chars). Must include the
   * data-point that drove the verdict — never "the outlet lied."
   */
  summary: string
  severity: PressFindingSeverity
  quotes: PressFindingQuote[]
  /**
   * Every municipal document the bundled claims were cross-referenced
   * against. Renders as «documentos cotejados». It is NOT a filtered list
   * of documents that agree — no step of the press verifier establishes
   * that a record supports a sentence, and the one evidence row in the
   * live snapshot is a Plan de Movilidad Urbana Sostenible contract
   * attached to a claim about «61.000 euros en artes escénicas».
   */
  crossChecked: PressFindingRef[]
  /**
   * Only refs the verifier found INCOMPATIBLE with a bundled claim
   * (`stance: 'contradicts'`), or a curator's own. Empty is the normal
   * state: `selectBundles` quarantines every contradicho-bearing bundle,
   * so no automated path can fill this. It gates `severity: 'critical'`.
   */
  contradiction: PressFindingRef[]
  /** Related promise ids (when the article touches a tracked promise). */
  relatedPromiseIds: string[]
  /** Related pleno item: `${plenoId}:${itemNumber}` (when applicable). */
  relatedPlenoItems: string[]
  curatorName: string
  publishedAt: string
  /**
   * Outlet response, when one of the attributed outlets has filed a
   * verbatim right-of-reply via the GitHub-Issue template.
   */
  response?: {
    /** Outlet name (must match one in attributedOutlets). */
    from: string
    /** Verbatim outlet quote (≥20 chars). */
    quote: string
    sourceUrl?: string
    respondedAt: string
  } | null
  /**
   * Corrections log. Each entry records a curator-initiated change to
   * an already-published finding, with the original text, the corrected
   * text, a reason ≥20 chars, the editor's name, and an ISO date.
   * IFCN signatory requirement: public corrections trail.
   */
  corrections?: PressFindingCorrection[]
}

/**
 * Per-correction record. Fields are deliberately narrow — corrections
 * apply only to title/summary/severity (the curator-editable ones).
 * To rewrite quotes or evidence refs, retract the finding + republish.
 */
export interface PressFindingCorrection {
  field: 'title' | 'summary' | 'severity'
  original: string
  corrected: string
  /** Curator's plain-language explanation (≥20 chars). */
  reason: string
  /** Editor's name as recorded on the publishing repo. */
  editor: string
  /** ISO date of the correction. */
  correctedAt: string
}

export interface PressFindingsSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: PressFinding[]
}

// ─── Validator ──────────────────────────────────────────────────────────────

export class PressFindingValidationError extends Error {
  constructor(msg: string) {
    super(`press-findings.json: ${msg}`)
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const URL_RE = /^https?:\/\/\S+$/

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new PressFindingValidationError(msg)
}

function validateQuote(q: unknown, idx: number, qi: number): PressFindingQuote {
  must(typeof q === 'object' && q !== null, `items[${idx}].quotes[${qi}] must be object`)
  const o = q as Record<string, unknown>
  must(
    typeof o.text === 'string' && o.text.trim().length >= 20,
    `items[${idx}].quotes[${qi}].text must be verbatim ≥20 chars`,
  )
  must(
    typeof o.outlet === 'string' && o.outlet.length > 0,
    `items[${idx}].quotes[${qi}].outlet required`,
  )
  must(
    typeof o.articleUrl === 'string' && URL_RE.test(o.articleUrl),
    `items[${idx}].quotes[${qi}].articleUrl must be http(s)`,
  )
  must(
    typeof o.sourceClaimId === 'string' && o.sourceClaimId.length > 3,
    `items[${idx}].quotes[${qi}].sourceClaimId required`,
  )
  return {
    text: (o.text as string).trim(),
    outlet: o.outlet as string,
    articleUrl: o.articleUrl as string,
    sourceClaimId: o.sourceClaimId as string,
  }
}

const ALLOWED_REF_KINDS: PressFindingRef['kind'][] = [
  'tender',
  'bdns',
  'budget',
  'promise',
  'pleno-vote',
  'padron',
  'paro',
  'press',
  'document',
  'transcript',
  'factcheck',
  'boe',
]

function validateRef(r: unknown, idx: number, label: string, ri: number): PressFindingRef {
  must(typeof r === 'object' && r !== null, `items[${idx}].${label}[${ri}] must be object`)
  const o = r as Record<string, unknown>
  must(
    typeof o.kind === 'string' && (ALLOWED_REF_KINDS as readonly string[]).includes(o.kind),
    `items[${idx}].${label}[${ri}].kind must be one of ${ALLOWED_REF_KINDS.join(',')}`,
  )
  must(typeof o.ref === 'string' && o.ref.length > 0, `items[${idx}].${label}[${ri}].ref required`)
  must(
    typeof o.snippet === 'string' && o.snippet.length > 0 && o.snippet.length <= 240,
    `items[${idx}].${label}[${ri}].snippet must be 1-240 chars`,
  )
  return {
    kind: o.kind as PressFindingRef['kind'],
    ref: o.ref as string,
    snippet: o.snippet as string,
  }
}

const CORRECTION_FIELDS: PressFindingCorrection['field'][] = ['title', 'summary', 'severity']

function validateCorrection(c: unknown, idx: number, ci: number): PressFindingCorrection {
  must(typeof c === 'object' && c !== null, `items[${idx}].corrections[${ci}] must be object`)
  const o = c as Record<string, unknown>
  must(
    typeof o.field === 'string' && (CORRECTION_FIELDS as string[]).includes(o.field),
    `items[${idx}].corrections[${ci}].field must be one of ${CORRECTION_FIELDS.join(',')}`,
  )
  must(
    typeof o.original === 'string' && o.original.length > 0,
    `items[${idx}].corrections[${ci}].original required`,
  )
  must(
    typeof o.corrected === 'string' && o.corrected.length > 0,
    `items[${idx}].corrections[${ci}].corrected required`,
  )
  must(
    typeof o.reason === 'string' && o.reason.trim().length >= 20,
    `items[${idx}].corrections[${ci}].reason must be ≥20 chars`,
  )
  must(
    typeof o.editor === 'string' && o.editor.length > 0,
    `items[${idx}].corrections[${ci}].editor required`,
  )
  must(
    typeof o.correctedAt === 'string' && ISO_DATE.test(o.correctedAt),
    `items[${idx}].corrections[${ci}].correctedAt must be ISO date`,
  )
  return {
    field: o.field as PressFindingCorrection['field'],
    original: o.original as string,
    corrected: o.corrected as string,
    reason: (o.reason as string).trim(),
    editor: o.editor as string,
    correctedAt: o.correctedAt as string,
  }
}

function validateFinding(f: unknown, idx: number): PressFinding {
  must(typeof f === 'object' && f !== null, `items[${idx}] must be object`)
  const o = f as Record<string, unknown>

  must(
    typeof o.id === 'string' && /^pf-/.test(o.id),
    `items[${idx}].id must be string starting with "pf-"`,
  )
  must(Array.isArray(o.sourceClaimIds), `items[${idx}].sourceClaimIds must be array`)
  must(
    (o.sourceClaimIds as unknown[]).length > 0,
    `items[${idx}].sourceClaimIds must contain ≥1 claim id`,
  )
  must(Array.isArray(o.articleIds), `items[${idx}].articleIds must be array`)
  must(
    (o.articleIds as unknown[]).length > 0,
    `items[${idx}].articleIds must contain ≥1 article id`,
  )
  must(Array.isArray(o.articleFingerprints), `items[${idx}].articleFingerprints must be array`)
  must(Array.isArray(o.attributedOutlets), `items[${idx}].attributedOutlets must be array`)
  must(
    (o.attributedOutlets as unknown[]).length > 0,
    `items[${idx}].attributedOutlets must contain ≥1 outlet`,
  )
  must(
    typeof o.earliestArticleDate === 'string' && ISO_DATE.test(o.earliestArticleDate),
    `items[${idx}].earliestArticleDate must be ISO date`,
  )
  must(
    typeof o.latestArticleDate === 'string' && ISO_DATE.test(o.latestArticleDate),
    `items[${idx}].latestArticleDate must be ISO date`,
  )
  must(
    typeof o.title === 'string' && o.title.trim().length >= 10 && o.title.trim().length <= 200,
    `items[${idx}].title must be 10-200 chars (curator-authored summary, not original headline)`,
  )
  must(
    typeof o.summary === 'string' &&
      o.summary.trim().length >= 40 &&
      o.summary.trim().length <= 2000,
    `items[${idx}].summary must be 40-2000 chars (must include the municipal-data point that drove the verdict)`,
  )
  must(
    typeof o.severity === 'string' &&
      (ALLOWED_PRESS_FINDING_SEVERITIES as readonly string[]).includes(o.severity),
    `items[${idx}].severity must be one of ${ALLOWED_PRESS_FINDING_SEVERITIES.join(',')}`,
  )

  const quotes = (o.quotes as unknown[]) || []
  must(Array.isArray(o.quotes) && quotes.length > 0, `items[${idx}].quotes must contain ≥1 quote`)
  const validatedQuotes = quotes.map((q, qi) => validateQuote(q, idx, qi))

  // `corroboration` was renamed to `crossChecked` on 2026-08-05. Rejecting
  // the old key outright is the second layer: a row that still carries it was
  // written by something that never learned the field means "cotejado", not
  // "corrobora", and would publish the old assertion under the new heading.
  must(
    o.corroboration === undefined,
    `items[${idx}]: \`corroboration\` was renamed to \`crossChecked\` — the list is what was ` +
      `cross-checked, not what agrees. Nothing in the press verifier establishes corroboration.`,
  )
  must(Array.isArray(o.crossChecked), `items[${idx}].crossChecked must be array`)
  must(Array.isArray(o.contradiction), `items[${idx}].contradiction must be array`)
  const crossChecked = (o.crossChecked as unknown[]).map((r, ri) =>
    validateRef(r, idx, 'crossChecked', ri),
  )
  const contradiction = (o.contradiction as unknown[]).map((r, ri) =>
    validateRef(r, idx, 'contradiction', ri),
  )

  // /metodologia#laboratorio-prensa has always promised a `critical` finding
  // needs "al menos una referencia de contradicción". The gate accepted a
  // cross-checked document instead, so "hemos cotejado estos expedientes"
  // stood in for "un expediente lo desmiente" — and since 2026-08-05 that
  // page also says the code matches it. This is the code matching it. A
  // `critical` press finding names an OUTLET; it is the strongest verdict
  // this subsystem publishes about one.
  if (o.severity === 'critical') {
    must(
      contradiction.length >= 1,
      `items[${idx}]: severity=critical requires ≥1 contradiction ref (a cross-checked document ` +
        `is not a refutation) — see /metodologia#laboratorio-prensa`,
    )
  }

  must(Array.isArray(o.relatedPromiseIds), `items[${idx}].relatedPromiseIds must be array`)
  must(Array.isArray(o.relatedPlenoItems), `items[${idx}].relatedPlenoItems must be array`)
  must(
    typeof o.curatorName === 'string' && o.curatorName.length > 0,
    `items[${idx}].curatorName required`,
  )
  must(
    typeof o.publishedAt === 'string' && ISO_DATE.test(o.publishedAt),
    `items[${idx}].publishedAt must be ISO date`,
  )

  let response: PressFinding['response'] = null
  if (o.response && typeof o.response === 'object') {
    const r = o.response as Record<string, unknown>
    must(
      typeof r.from === 'string' && (o.attributedOutlets as unknown[]).includes(r.from),
      `items[${idx}].response.from must be one of the attributed outlets`,
    )
    must(
      typeof r.quote === 'string' && r.quote.trim().length >= 20,
      `items[${idx}].response.quote must be verbatim ≥20 chars`,
    )
    must(
      typeof r.respondedAt === 'string' && ISO_DATE.test(r.respondedAt),
      `items[${idx}].response.respondedAt must be ISO date`,
    )
    if (r.sourceUrl !== undefined) {
      must(
        typeof r.sourceUrl === 'string' && URL_RE.test(r.sourceUrl),
        `items[${idx}].response.sourceUrl must be http(s)`,
      )
    }
    response = {
      from: r.from as string,
      quote: (r.quote as string).trim(),
      respondedAt: r.respondedAt as string,
      ...(r.sourceUrl ? { sourceUrl: r.sourceUrl as string } : {}),
    }
  }

  const rawCorrections = Array.isArray(o.corrections) ? (o.corrections as unknown[]) : []
  const corrections = rawCorrections.map((c, ci) => validateCorrection(c, idx, ci))

  return {
    id: o.id as string,
    sourceClaimIds: o.sourceClaimIds as string[],
    articleIds: o.articleIds as string[],
    articleFingerprints: o.articleFingerprints as string[],
    attributedOutlets: o.attributedOutlets as string[],
    earliestArticleDate: o.earliestArticleDate as string,
    latestArticleDate: o.latestArticleDate as string,
    title: (o.title as string).trim(),
    summary: (o.summary as string).trim(),
    severity: o.severity as PressFindingSeverity,
    quotes: validatedQuotes,
    crossChecked,
    contradiction,
    relatedPromiseIds: o.relatedPromiseIds as string[],
    relatedPlenoItems: o.relatedPlenoItems as string[],
    curatorName: o.curatorName as string,
    publishedAt: o.publishedAt as string,
    response,
    corrections,
  }
}

export function validatePressFindingsSnapshot(json: string): PressFindingsSnapshot {
  let snap: unknown
  try {
    snap = JSON.parse(json)
  } catch (err) {
    throw new PressFindingValidationError(`not valid JSON: ${(err as Error).message}`)
  }
  must(snap && typeof snap === 'object', 'top-level must be object')
  const s = snap as Record<string, unknown>
  must(typeof s.version === 'string' && s.version.length > 0, 'version required')
  must(
    typeof s.generatedAt === 'string' && ISO_DATE.test(s.generatedAt),
    'generatedAt must be ISO date',
  )
  must(
    typeof s.legalNotice === 'string' && s.legalNotice.length >= 40,
    'legalNotice must be ≥40 chars',
  )
  must(typeof s.contactUrl === 'string' && URL_RE.test(s.contactUrl), 'contactUrl must be URL')
  must(
    typeof s.methodologyUrl === 'string' && s.methodologyUrl.length > 0,
    'methodologyUrl required',
  )
  must(Array.isArray(s.items), 'items must be array')

  const items = (s.items as unknown[]).map((f, i) => validateFinding(f, i))
  return {
    version: s.version as string,
    generatedAt: s.generatedAt as string,
    legalNotice: s.legalNotice as string,
    contactUrl: s.contactUrl as string,
    methodologyUrl: s.methodologyUrl as string,
    items,
  }
}
