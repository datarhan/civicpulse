/**
 * Pleno findings — the curator-edited editorial layer on top of the
 * machine-extracted claims + verifier verdicts.
 *
 * A "finding" is a human-written note that contextualises one or more
 * machine-extracted claims. It is to claim-suggestions what promises.json
 * is to promise-suggestions: the legally-material, human-curated surface.
 * Schema enforces verbatim source quote, explicit sourceClaimIds, and a
 * dated curator note.
 *
 * Curators promote via `npm run promote-claim -- <claimId>` which
 * pre-fills a template. The CLI re-validates the whole snapshot before
 * writing.
 *
 *  · id           stable slug (e.g. "f-2026-03-09-242k-extrajudicial")
 *  · plenoId      source pleno
 *  · plenoDate    ISO date
 *  · title        one-line editorial title (what the finding IS)
 *  · summary      curator's one-paragraph explanation
 *  · severity     informational | notable | critical
 *  · sourceClaimIds   every claim id this finding cites
 *  · quotes       verbatim quotes used as evidence
 *  · corroboration tenders/BDNS/budget refs that confirm
 *  · contradiction tenders/BDNS/budget refs that contradict (when applicable)
 *  · relatedPromiseIds references to promises.json when this finding
 *                     is a promise-repetition note
 *  · curatorName  who edited this
 *  · publishedAt  ISO
 *  · response     optional right-of-reply field (same pattern as promises)
 */

export type FindingSeverity = 'informational' | 'notable' | 'critical'

export const ALLOWED_FINDING_SEVERITIES: readonly FindingSeverity[] = [
  'informational',
  'notable',
  'critical',
]

export interface FindingQuote {
  /** Verbatim text from the transcript, ≥20 chars. */
  text: string
  /**
   * Speaker group (bloc-level only, never personal). Null when the
   * curator can't be certain from the transcript.
   */
  speakerGroup: 'PSOE' | 'PP' | 'VOX' | 'Compromís' | 'Ciudadanos' | 'Otro' | null
  /** The claim id this quote came from (for audit trail). */
  sourceClaimId: string
}

export interface FindingRef {
  /**
   * Six original kinds come from the deterministic + LLM verifiers
   * (tender / bdns / budget / promise / pleno-video / pleno-acta).
   * Three additional kinds are populated only by the curator path
   * via the dashboard's `extraCorroboration` flow:
   *   · press      – external news article (HTML URL)
   *   · document   – non-acta external PDF (auditor report, contract,
   *                  press release, etc.)
   *   · transcript – whisper transcript of curator-supplied audio/video
   *                  evidence (press conferences, citizen recordings).
   * The curator-only kinds are gated server-side: only the
   * `--extra-corroboration` flag (and the matching middleware action)
   * accept them; no automated path can land them.
   */
  kind:
    | 'tender'
    | 'bdns'
    | 'budget'
    | 'promise'
    | 'pleno-video'
    | 'pleno-acta'
    | 'press'
    | 'document'
    | 'transcript'
  /** Absolute URL when possible; synthetic ref ("budget:2025:cap3") otherwise. */
  ref: string
  /** Short citation the reader sees, ≤240 chars. */
  snippet: string
}

export interface PlenoFinding {
  id: string
  plenoId: string
  plenoDate: string
  title: string
  summary: string
  severity: FindingSeverity
  sourceClaimIds: string[]
  quotes: FindingQuote[]
  corroboration: FindingRef[]
  contradiction: FindingRef[]
  relatedPromiseIds: string[]
  curatorName: string
  publishedAt: string
  response?: {
    from: 'PSOE' | 'PP' | 'VOX' | 'Compromís' | 'Ciudadanos' | 'Otro'
    quote: string
    sourceUrl?: string
    respondedAt: string
  } | null
}

export interface PlenoFindingsSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: PlenoFinding[]
}

// ─── Validator ──────────────────────────────────────────────────────────────

export class FindingValidationError extends Error {
  constructor(msg: string) {
    super(`pleno-findings.json: ${msg}`)
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const URL_RE = /^https?:\/\/\S+$/
const ALLOWED_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro'] as const

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new FindingValidationError(msg)
}

function validateQuote(q: unknown, idx: number, qi: number): FindingQuote {
  must(typeof q === 'object' && q !== null, `items[${idx}].quotes[${qi}] must be object`)
  const o = q as Record<string, unknown>
  must(
    typeof o.text === 'string' && o.text.trim().length >= 20,
    `items[${idx}].quotes[${qi}].text must be verbatim ≥20 chars`,
  )
  if (o.speakerGroup !== null) {
    must(
      typeof o.speakerGroup === 'string' &&
        (ALLOWED_BLOCS as readonly string[]).includes(o.speakerGroup),
      `items[${idx}].quotes[${qi}].speakerGroup must be null or one of ${ALLOWED_BLOCS.join(',')}`,
    )
  }
  must(
    typeof o.sourceClaimId === 'string' && o.sourceClaimId.length > 3,
    `items[${idx}].quotes[${qi}].sourceClaimId required`,
  )
  return {
    text: (o.text as string).trim(),
    speakerGroup: (o.speakerGroup as FindingQuote['speakerGroup']) ?? null,
    sourceClaimId: o.sourceClaimId as string,
  }
}

function validateRef(r: unknown, idx: number, label: string, ri: number): FindingRef {
  must(typeof r === 'object' && r !== null, `items[${idx}].${label}[${ri}] must be object`)
  const o = r as Record<string, unknown>
  must(
    typeof o.kind === 'string' &&
      [
        'tender',
        'bdns',
        'budget',
        'promise',
        'pleno-video',
        'pleno-acta',
        'press',
        'document',
        'transcript',
      ].includes(o.kind),
    `items[${idx}].${label}[${ri}].kind invalid`,
  )
  must(typeof o.ref === 'string' && o.ref.length > 0, `items[${idx}].${label}[${ri}].ref required`)
  must(
    typeof o.snippet === 'string' && o.snippet.length > 0 && o.snippet.length <= 240,
    `items[${idx}].${label}[${ri}].snippet must be 1-240 chars`,
  )
  return {
    kind: o.kind as FindingRef['kind'],
    ref: o.ref as string,
    snippet: o.snippet as string,
  }
}

function validateFinding(f: unknown, idx: number): PlenoFinding {
  must(typeof f === 'object' && f !== null, `items[${idx}] must be object`)
  const o = f as Record<string, unknown>
  must(typeof o.id === 'string' && o.id.length >= 3, `items[${idx}].id required`)
  must(typeof o.plenoId === 'string' && o.plenoId.length > 0, `items[${idx}].plenoId required`)
  must(
    typeof o.plenoDate === 'string' && ISO_DATE.test(o.plenoDate),
    `items[${idx}].plenoDate must be ISO`,
  )
  must(
    typeof o.title === 'string' && o.title.trim().length >= 10 && o.title.length <= 200,
    `items[${idx}].title must be 10-200 chars`,
  )
  must(
    typeof o.summary === 'string' && o.summary.trim().length >= 40 && o.summary.length <= 2000,
    `items[${idx}].summary must be 40-2000 chars (the editorial explanation, not just a reprint of the quote)`,
  )
  must(
    typeof o.severity === 'string' &&
      (ALLOWED_FINDING_SEVERITIES as readonly string[]).includes(o.severity),
    `items[${idx}].severity must be informational|notable|critical`,
  )
  must(
    Array.isArray(o.sourceClaimIds) && (o.sourceClaimIds as unknown[]).length >= 1,
    `items[${idx}].sourceClaimIds must be non-empty array`,
  )
  must(
    Array.isArray(o.quotes) && (o.quotes as unknown[]).length >= 1,
    `items[${idx}].quotes must be non-empty — a finding without a verbatim anchor is not publishable`,
  )
  const quotes = (o.quotes as unknown[]).map((q, qi) => validateQuote(q, idx, qi))
  const corroboration = (Array.isArray(o.corroboration) ? (o.corroboration as unknown[]) : []).map(
    (r, ri) => validateRef(r, idx, 'corroboration', ri),
  )
  const contradiction = (Array.isArray(o.contradiction) ? (o.contradiction as unknown[]) : []).map(
    (r, ri) => validateRef(r, idx, 'contradiction', ri),
  )
  // Severity=critical requires at least one contradiction OR one
  // corroboration row — a "critical" finding with zero evidence rows would
  // be pure editorial assertion, which fails the project's standard.
  if (o.severity === 'critical') {
    must(
      contradiction.length >= 1 || corroboration.length >= 1,
      `items[${idx}] severity=critical requires ≥1 contradiction or corroboration ref`,
    )
  }
  must(
    typeof o.curatorName === 'string' && o.curatorName.length > 1,
    `items[${idx}].curatorName required`,
  )
  must(
    typeof o.publishedAt === 'string' && ISO_DATE.test(o.publishedAt),
    `items[${idx}].publishedAt must be ISO`,
  )
  const relatedPromiseIds = Array.isArray(o.relatedPromiseIds)
    ? (o.relatedPromiseIds as string[])
    : []
  const response = (o.response ?? null) as PlenoFinding['response']
  if (response) {
    must(
      typeof response.from === 'string' &&
        (ALLOWED_BLOCS as readonly string[]).includes(response.from),
      `items[${idx}].response.from must be one of ${ALLOWED_BLOCS.join(',')}`,
    )
    must(
      typeof response.quote === 'string' && response.quote.length >= 20,
      `items[${idx}].response.quote must be verbatim ≥20 chars`,
    )
    must(
      typeof response.respondedAt === 'string' && ISO_DATE.test(response.respondedAt),
      `items[${idx}].response.respondedAt must be ISO`,
    )
    if (response.sourceUrl !== undefined) {
      must(
        typeof response.sourceUrl === 'string' && URL_RE.test(response.sourceUrl),
        `items[${idx}].response.sourceUrl must be http(s) URL`,
      )
    }
  }
  return {
    id: o.id as string,
    plenoId: o.plenoId as string,
    plenoDate: o.plenoDate as string,
    title: (o.title as string).trim(),
    summary: (o.summary as string).trim(),
    severity: o.severity as FindingSeverity,
    sourceClaimIds: (o.sourceClaimIds as unknown[]).map((x) => String(x)),
    quotes,
    corroboration,
    contradiction,
    relatedPromiseIds,
    curatorName: o.curatorName as string,
    publishedAt: o.publishedAt as string,
    response: response ?? null,
  }
}

export function validateFindingsSnapshot(json: string): PlenoFindingsSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  must(typeof raw.version === 'string', 'version required')
  must(typeof raw.generatedAt === 'string', 'generatedAt required')
  must(
    typeof raw.legalNotice === 'string' && raw.legalNotice.length >= 40,
    'legalNotice must be ≥40 chars',
  )
  must(typeof raw.contactUrl === 'string' && URL_RE.test(raw.contactUrl), 'contactUrl must be URL')
  must(typeof raw.methodologyUrl === 'string', 'methodologyUrl required')
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validateFinding(it, i))
  const seen = new Set<string>()
  for (const it of items) {
    must(!seen.has(it.id), `duplicate finding id ${it.id}`)
    seen.add(it.id)
  }
  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
  }
}
