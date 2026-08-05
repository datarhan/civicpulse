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
 *  · crossChecked  tenders/BDNS/budget refs the claims were cross-referenced
 *                  against — whether or not they agree. The field was called
 *                  `corroboration` until 2026-08-05; nothing upstream ever
 *                  established corroboration, so the name asserted a verdict
 *                  the contents did not carry and the LLM synthesiser wrote
 *                  prose from the name. See EvidenceStance in claim-verifier.
 *  · contradiction refs the verifier found INCOMPATIBLE with the claim
 *                  (stance='contradicts'). Gates severity=critical.
 *  · relatedPromiseIds references to promises.json when this finding
 *                     is a promise-repetition note
 *  · curatorName  who edited this
 *  · publishedAt  ISO
 *  · response     optional right-of-reply field (same pattern as promises)
 */
import { SPEAKER_GROUPS, type SpeakerGroup } from './pleno-votes'

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
   * curator can't be certain from the transcript — `null` is the ONLY way
   * to express that. There is no "unknown group" code: a placeholder in an
   * attribution field identifies the single councillor outside the four
   * large groups by elimination.
   */
  speakerGroup: SpeakerGroup | null
  /** The claim id this quote came from (for audit trail). */
  sourceClaimId: string
}

export interface FindingRef {
  /**
   * Six original kinds come from the deterministic + LLM verifiers
   * (tender / bdns / budget / promise / pleno-video / pleno-acta).
   * Three additional kinds are populated only by the curator path
   * via the dashboard's `extraCorroboration` flow (a curator deliberately
   * attaching a document; it still lands in `crossChecked[]`, because the
   * CLI does not check that it supports anything either):
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
  /**
   * Every document the cited claims were cross-referenced against, plus the
   * pleno recording as provenance. Renders as «Documentos cotejados». It is
   * NOT a filtered list of documents that agree — see the header.
   */
  crossChecked: FindingRef[]
  /**
   * Only refs the verifier found incompatible with a cited claim
   * (`stance: 'contradicts'`), or a curator's own. Empty is the normal state:
   * `selectBundles` quarantines every contradicho-bearing bundle, so no
   * automated path can fill this.
   */
  contradiction: FindingRef[]
  relatedPromiseIds: string[]
  curatorName: string
  publishedAt: string
  /**
   * Optional individual attribution. Set ONLY when every claim in
   * sourceClaimIds shares the same speakerSlug AND a curator
   * explicitly confirmed via promote-claim. The slug must resolve
   * against officials.json; the party must agree with every quote's
   * speakerGroup. Validated by validateFindingsSnapshot.
   *
   * When present, /hallazgos renders the councillor's name as a
   * chip alongside the bloc tag — that's the libel boundary
   * crossing where individual attribution becomes visible to the
   * public. The bloc tag remains the primary attribution.
   */
  individualSpeaker?: {
    slug: string
    name: string
    party: SpeakerGroup
  } | null
  response?: {
    from: SpeakerGroup
    quote: string
    sourceUrl?: string
    respondedAt: string
  } | null
  /**
   * Public corrections log. Each entry records a post-publication
   * curator edit with original text, corrected text, reason (≥20
   * chars), editor and ISO date. IFCN signatory baseline; mirrors
   * the field added to PressFinding in Package 4b.
   */
  corrections?: PlenoFindingCorrection[]
}

/**
 * Per-correction record for pleno findings. The curator-editable
 * surface is title/summary/severity. Citation fields —
 * `sourceClaimIds`, `quote.<i>.text`, `quote.<i>.sourceClaimId` —
 * are correctable ONLY for record-supersession repairs: when a
 * re-transcription of the pleno replaces the transcript of record,
 * re-keying claim ids and revising the verbatim (2026-07-29, first
 * case: f-2026-03-09-afi-a9546e after the 2026-07-06 purge of
 * hallucinated transcripts). Every such repair leaves a public row
 * here. Ordinary quote edits remain forbidden: retract + republish.
 */
export interface PlenoFindingCorrection {
  field:
    | 'title'
    | 'summary'
    | 'severity'
    | 'sourceClaimIds'
    | `quote.${number}.text`
    | `quote.${number}.sourceClaimId`
  original: string
  corrected: string
  /** Curator's plain-language explanation (≥20 chars). */
  reason: string
  editor: string
  /** ISO date of the correction. */
  correctedAt: string
}

/** Correction field paths addressing a quote row: quote.<i>.text / quote.<i>.sourceClaimId */
export const CORRECTION_QUOTE_FIELD_RE = /^quote\.(\d+)\.(text|sourceClaimId)$/

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
/**
 * The groups a finding may attribute anything to — a quote, a named
 * individual's party, a right-of-reply. Imported, never restated: a
 * hand-copied allow-list is how six tests in this repo stayed green while
 * matching nothing in production (docs/DATA_INTEGRITY.md, rule 1).
 *
 * Narrower than ALLOWED_BLOCS by exactly `Otro`, which is a vote-file value
 * only. Every attribution field here is a claim about who spoke, so the only
 * honest way to say "we don't know" is `null`.
 */
const ALLOWED_BLOCS = SPEAKER_GROUPS

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
  // `corroboration` was renamed to `crossChecked` on 2026-08-05. Rejecting the
  // old key outright is the second layer: a row that still carries it was
  // written by something that never learned the field means "cotejado", not
  // "corrobora", and would publish the old assertion under the new heading.
  must(
    o.corroboration === undefined,
    `items[${idx}]: \`corroboration\` was renamed to \`crossChecked\` — the list is what was ` +
      `cross-checked, not what agrees. Nothing upstream establishes corroboration.`,
  )
  const crossChecked = (Array.isArray(o.crossChecked) ? (o.crossChecked as unknown[]) : []).map(
    (r, ri) => validateRef(r, idx, 'crossChecked', ri),
  )
  const contradiction = (Array.isArray(o.contradiction) ? (o.contradiction as unknown[]) : []).map(
    (r, ri) => validateRef(r, idx, 'contradiction', ri),
  )
  // `critical` is the strongest verdict this site publishes about a named
  // bloc, and /metodologia has always promised it requires "al menos una
  // referencia de contradicción". The gate used to accept a corroboration ref
  // instead, so the published contract had never once been met — the
  // disjunction let "we looked at some documents" stand in for "a document
  // refutes this". Now it says what the page says.
  if (o.severity === 'critical') {
    must(
      contradiction.length >= 1,
      `items[${idx}] severity=critical requires ≥1 contradiction ref (a cross-checked document ` +
        `is not a refutation) — see /metodologia#disciplina-antilibellos`,
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
  const individualSpeaker = (o.individualSpeaker ?? null) as PlenoFinding['individualSpeaker']
  if (individualSpeaker) {
    must(
      typeof individualSpeaker.slug === 'string' &&
        /^[a-z0-9][a-z0-9-]*$/.test(individualSpeaker.slug),
      `items[${idx}].individualSpeaker.slug must be kebab-case`,
    )
    must(
      typeof individualSpeaker.name === 'string' && individualSpeaker.name.trim().length >= 3,
      `items[${idx}].individualSpeaker.name must be non-empty string`,
    )
    must(
      typeof individualSpeaker.party === 'string' &&
        (ALLOWED_BLOCS as readonly string[]).includes(individualSpeaker.party),
      `items[${idx}].individualSpeaker.party must be one of ${ALLOWED_BLOCS.join(',')}`,
    )
  }
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

  const CORRECTION_FIELDS: string[] = ['title', 'summary', 'severity', 'sourceClaimIds']
  const rawCorrections = Array.isArray(o.corrections) ? (o.corrections as unknown[]) : []
  const corrections: PlenoFindingCorrection[] = rawCorrections.map((c, ci) => {
    must(typeof c === 'object' && c !== null, `items[${idx}].corrections[${ci}] must be object`)
    const co = c as Record<string, unknown>
    must(
      typeof co.field === 'string' &&
        (CORRECTION_FIELDS.includes(co.field) || CORRECTION_QUOTE_FIELD_RE.test(co.field)),
      `items[${idx}].corrections[${ci}].field must be one of ${CORRECTION_FIELDS.join(',')} ` +
        'or quote.<i>.text / quote.<i>.sourceClaimId',
    )
    must(
      typeof co.original === 'string' && co.original.length > 0,
      `items[${idx}].corrections[${ci}].original required`,
    )
    must(
      typeof co.corrected === 'string' && co.corrected.length > 0,
      `items[${idx}].corrections[${ci}].corrected required`,
    )
    must(
      typeof co.reason === 'string' && co.reason.trim().length >= 20,
      `items[${idx}].corrections[${ci}].reason must be ≥20 chars`,
    )
    must(
      typeof co.editor === 'string' && co.editor.length > 0,
      `items[${idx}].corrections[${ci}].editor required`,
    )
    must(
      typeof co.correctedAt === 'string' && ISO_DATE.test(co.correctedAt),
      `items[${idx}].corrections[${ci}].correctedAt must be ISO date`,
    )
    return {
      field: co.field as PlenoFindingCorrection['field'],
      original: co.original as string,
      corrected: co.corrected as string,
      reason: (co.reason as string).trim(),
      editor: co.editor as string,
      correctedAt: co.correctedAt as string,
    }
  })

  return {
    id: o.id as string,
    plenoId: o.plenoId as string,
    plenoDate: o.plenoDate as string,
    title: (o.title as string).trim(),
    summary: (o.summary as string).trim(),
    severity: o.severity as FindingSeverity,
    sourceClaimIds: (o.sourceClaimIds as unknown[]).map((x) => String(x)),
    quotes,
    crossChecked,
    contradiction,
    relatedPromiseIds,
    curatorName: o.curatorName as string,
    publishedAt: o.publishedAt as string,
    ...(individualSpeaker ? { individualSpeaker } : {}),
    response: response ?? null,
    corrections,
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

/**
 * Apply a correction value to a finding and return the ORIGINAL value
 * as a string (for the corrections log row). Mutates the finding in
 * place; the caller MUST re-validate the whole snapshot before
 * persisting (the CLI does — invalid severity enums, short quotes,
 * etc. are caught there, keeping this helper simple).
 *
 * `sourceClaimIds` takes the corrected value as a comma-separated id
 * list; `quote.<i>.*` paths address one quote row (see
 * CORRECTION_QUOTE_FIELD_RE). Citation fields exist for
 * record-supersession repairs only — see PlenoFindingCorrection.
 */
export function applyFindingCorrection(
  finding: PlenoFinding,
  field: string,
  corrected: string,
): string {
  if (field === 'title' || field === 'summary' || field === 'severity') {
    const original = String(finding[field] ?? '')
    ;(finding as unknown as Record<string, unknown>)[field] = corrected
    return original
  }
  if (field === 'sourceClaimIds') {
    const ids = corrected
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length < 1) throw new Error('sourceClaimIds correction needs ≥1 id')
    const original = finding.sourceClaimIds.join(',')
    finding.sourceClaimIds = ids
    return original
  }
  const m = CORRECTION_QUOTE_FIELD_RE.exec(field)
  if (m) {
    const qi = Number(m[1])
    const quote = finding.quotes[qi]
    if (!quote) {
      throw new Error(`quote index ${qi} out of range (finding has ${finding.quotes.length})`)
    }
    const prop = m[2] as 'text' | 'sourceClaimId'
    const original = String(quote[prop] ?? '')
    quote[prop] = corrected
    return original
  }
  throw new Error(`unknown correction field "${field}"`)
}
