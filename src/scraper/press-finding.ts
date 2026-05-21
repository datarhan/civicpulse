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
 * Auto-curation routes `informational` bundles directly here when
 * dialectic + score gates pass. `contradicho` / `parcial` bundles
 * route to editorial/press-auto-curation-queue.md until a curator
 * promotes them via `npm run promote-press-claim`. After promotion the
 * affected outlets receive a GitHub-Issue invitation
 * (`.github/ISSUE_TEMPLATE/press-finding-response.yml`) to file a
 * verbatim response (≥20 chars), ingested by the
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
   * (press, document, transcript) are accepted only via the
   * `--extra-corroboration` flag on `promote-press-claim`; no auto path
   * can land them.
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
  corroboration: PressFindingRef[]
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

  must(Array.isArray(o.corroboration), `items[${idx}].corroboration must be array`)
  must(Array.isArray(o.contradiction), `items[${idx}].contradiction must be array`)
  const corroboration = (o.corroboration as unknown[]).map((r, ri) =>
    validateRef(r, idx, 'corroboration', ri),
  )
  const contradiction = (o.contradiction as unknown[]).map((r, ri) =>
    validateRef(r, idx, 'contradiction', ri),
  )

  if (o.severity === 'critical') {
    must(
      corroboration.length + contradiction.length > 0,
      `items[${idx}]: severity=critical requires ≥1 corroboration or contradiction ref`,
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
    corroboration,
    contradiction,
    relatedPromiseIds: o.relatedPromiseIds as string[],
    relatedPlenoItems: o.relatedPlenoItems as string[],
    curatorName: o.curatorName as string,
    publishedAt: o.publishedAt as string,
    response,
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
