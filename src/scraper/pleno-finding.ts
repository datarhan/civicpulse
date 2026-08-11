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
import { stripSimilarityAnnotation } from '../llm/candidate-annotation'
import { sha256Short } from './hash'
import { SPEAKER_GROUPS, type SpeakerGroup } from './pleno-votes'
// Cyclic with `finding-retraction.ts`, and safe: that module reads this one's
// exports only inside function bodies, never at module scope.
import { validateFindingRetraction, type FindingRetraction } from './finding-retraction'

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
    /** Retraction paths — the whole row goes. See REMOVAL below. */
    | `quote.${number}`
    | `crossChecked.${number}`
  original: string
  corrected: string
  /** Curator's plain-language explanation (≥20 chars). */
  reason: string
  editor: string
  /** ISO date of the correction. */
  correctedAt: string
}

/** Correction field paths addressing a quote row: quote.<i>.text / quote.<i>.sourceClaimId */
/**
 * `speakerGroup` is correctable because attribution turned out to be the field
 * most likely to be wrong. It was inferred by a model from a ~1200-character
 * window that, measured, contains the evidence of who is speaking 1% of the
 * time — so published quotes ended up filed under the bloc they criticise.
 * Until this was added the CLI could correct a quote's text but not the name
 * attached to it, which left no sanctioned way to retract an attribution at all.
 *
 * An empty `--new` sets it to `null`: "we no longer say who". Setting it to a
 * DIFFERENT bloc is allowed here because a curator reading the acta is exactly
 * who should be able to, but no automated path may — see
 * `scripts/reconcile-attribution.ts`, which can only ever empty it.
 */
export const CORRECTION_QUOTE_FIELD_RE = /^quote\.(\d+)\.(text|sourceClaimId|speakerGroup)$/

/**
 * ── REMOVAL ─────────────────────────────────────────────────────────────────
 *
 * Retracting a whole row: a quote that should never have been published, or a
 * cross-checked reference whose presence beside the finding does harm the
 * audit trail does not justify.
 *
 * A removal is a correction — it goes in the same public log as every other —
 * but it is the one kind the log's own shape fights, and that is the whole
 * design problem here. `corrections[]` is `string → string`, and BOTH sides
 * are published: `/hallazgos` renders `{c.original}` in full, struck through,
 * and `AgenteReporte`'s `CorrectionLog` renders the first 200 characters of
 * it. So the obvious encoding — `original` = the text that was taken out —
 * republishes, on the very same page, the material the removal existed to
 * remove. Line-through is a style, not a redaction; a crawler, a screen
 * reader and a copy-paste all still get the words.
 *
 * So the ledger records the removal WITHOUT the removed text:
 *
 *     field:     "quote.0"
 *     original:  "cita · sha256:5f3a1c2e9b01"
 *     corrected: "retirada del hallazgo"
 *
 * The digest is `sha256Short` of the row's canonical serialisation as this
 * validator rebuilds it (fixed key order, so it is reproducible). It reveals
 * nothing on its own and it confirms everything to anyone holding an earlier
 * snapshot: this repository's history is public, so an auditor can take the
 * row from the parent commit, re-run the same hash, and prove exactly which
 * row left and that nothing else did. That is the property worth having —
 * the record must be *checkable*, not *readable*. What removal buys is that
 * the material stops being served to every reader of the page, stops being
 * indexed, and stops appearing in the syndicated ClaimReview payload. A
 * strikethrough in the log would have undone all three.
 *
 * `field` carries the index, and only the index, for the same reason the
 * `portrait.portfolios[<i>]` branch of `correct-journalist-report` does: the
 * address is the small precise part, and the alternative — serialising the
 * whole array — would republish every sibling to record one departure.
 *
 * Two consequences a curator has to plan around, both deliberate:
 *
 *   · Indices shift. Removing `crossChecked.0` renumbers everything after it,
 *     so a run of removals on one finding is issued HIGHEST INDEX FIRST, and
 *     replaying the log in order reproduces the result.
 *   · Only these two collections. `contradiction[]` gates `severity:
 *     critical`, and `sourceClaimIds` already has an edit path; neither is
 *     reachable here, so a retraction cannot quietly drop the evidence a
 *     strong verdict rests on.
 */
export const CORRECTION_REMOVAL_FIELD_RE = /^(quote|crossChecked)\.(\d+)$/

/** Reader-facing wording per removable collection. Kept beside the regex. */
const REMOVAL_LABELS = {
  quote: { noun: 'cita', corrected: 'retirada del hallazgo' },
  crossChecked: { noun: 'documento cotejado', corrected: 'retirado del hallazgo' },
} as const

/**
 * ── REDACTION ───────────────────────────────────────────────────────────────
 *
 * An ordinary `--field summary` correction publishes its `original` in full,
 * struck through, and that is right nearly always: the reader is owed the
 * sentence that was withdrawn, or the log records nothing anyone can check.
 *
 * The exception is when the prior text IS the harm. A summary that reproduced
 * the name of a private individual beside an unverifiable criminal allegation
 * cannot be repaired by a correction whose ledger row reprints the sentence on
 * the same page — line-through is a style, not a redaction, and the crawler,
 * the screen reader and the copy-paste all still get the words. That is the
 * same trap REMOVAL above was built for, one field further out.
 *
 * So `--redact` writes the digest in place of the prior prose:
 *
 *     field:     "summary"
 *     original:  "sumario · sha256:5f3a1c2e9b01"
 *     corrected: "<the rewritten summary, published as usual>"
 *
 * Two things make it different from a removal, and both are deliberate:
 *
 *   · `corrected` is real text, not a marker. A redaction replaces; it does
 *     not empty. The finding keeps a summary, and the reader reads it.
 *   · It SWEEPS the finding's own correction log. `corrections[].original` and
 *     `.corrected` are copies of that field's published prose, so an earlier
 *     row on the same field is an archive of exactly what is being redacted —
 *     the loophole that would defeat every redaction issued through this CLI.
 *     Each such row keeps its `field`, `reason`, `editor` and `correctedAt`,
 *     and its two prose sides become digests of themselves.
 *
 * The sweep is over-inclusive on purpose: it digests every prior row on that
 * field, including one whose text predates the offending phrase. Deciding
 * which prior versions are safe would need the CLI to be told the offending
 * string — putting it in the shell history, the reason guard's blind spot and
 * eventually a commit message — and getting that judgement wrong leaks. An
 * over-broad digest costs a reader some detail in one finding's log; the
 * narrow version costs the redaction.
 *
 * Reachable only for `title` and `summary`. Quotes are verbatim and go through
 * REMOVAL; the citation fields have their own repair path.
 */
/**
 * What the corrections log shows when an attribution is withdrawn.
 *
 * The stored value is `null` — `applyFindingCorrection` writes that — but the
 * log's `corrected` side is a REQUIRED non-empty string, so `""` fails
 * validation outright. And even if it did not: `/hallazgos` renders the
 * corrections trail, and an empty cell beside a struck-through «PSOE» reads as
 * a rendering fault rather than a deliberate withdrawal.
 *
 * So the log carries the words the UI already uses for a null group
 * (`src/lib/party-label.js`), and reader and record agree.
 */
export const ATTRIBUTION_RETRACTED_LABEL = 'sin identificar'

/** Does this correction field hold a quote's group attribution? */
export const isSpeakerGroupField = (field: string): boolean =>
  /^quote\.\d+\.speakerGroup$/.test(field)

export const REDACTION_LABELS = {
  title: 'titular',
  summary: 'sumario',
} as const

export type RedactableField = keyof typeof REDACTION_LABELS

/** What a redacted ledger side looks like, for tests and for the sweep's idempotence. */
export const REDACTION_DIGEST_RE = /^(?:titular|sumario) · sha256:[0-9a-f]{12}$/

const redactionDigest = (field: RedactableField, value: string): string =>
  `${REDACTION_LABELS[field]} · sha256:${sha256Short(JSON.stringify(value))}`

export interface PlenoFindingsSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: PlenoFinding[]
  /**
   * Findings withdrawn from publication, as digests. Absent until the first
   * retraction. See `finding-retraction.ts` for why this holds no prose —
   * unlike the vote ledger, which tombstones its originals verbatim.
   */
  retractions?: FindingRetraction[]
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

/**
 * A published `snippet` is the label under «Documentos cotejados». It may not
 * carry the matcher's own score.
 *
 * The strip lives HERE, in the validator, and not only in the three builders
 * that compose a `FindingRef` — because this file is written by exactly one
 * kind of process. `.claude/hooks/curated-paths.mjs` denies every direct write
 * to `pleno-findings.json` and names the CLI instead, and every one of those
 * CLIs re-serialises the whole snapshot through `validateFindingsSnapshot`
 * before writing. So this is the single door, and putting the strip on the
 * door is what makes "the file cannot hold one" true rather than "no current
 * writer emits one" — which was already true of two of the three builders on
 * the day a row shipped carrying `· sim=0.50`.
 *
 * This is a normalisation, in the same class as the `.trim()` this validator
 * already performs on titles, summaries and quote text — not an edit to
 * anything a source document said. The annotation was never in the record; it
 * is a number this pipeline computed, rendered into a prompt, and copied back
 * by a model. No `corrections[]` row is written for removing it, and none
 * should be: the correction log is for what a curator changed about a claim,
 * and no claim changes here.
 *
 * The scope is narrow on purpose. It removes only what
 * `formatSimilarityAnnotation` can produce, anchored to the end of the string.
 * A snippet that merely mentions similarity keeps its words.
 */
function publishedSnippet(raw: string): string {
  return stripSimilarityAnnotation(raw)
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
  must(typeof o.snippet === 'string', `items[${idx}].${label}[${ri}].snippet must be 1-240 chars`)
  const snippet = publishedSnippet(o.snippet as string)
  must(
    snippet.length > 0 && snippet.length <= 240,
    `items[${idx}].${label}[${ri}].snippet must be 1-240 chars`,
  )
  return {
    kind: o.kind as FindingRef['kind'],
    ref: o.ref as string,
    snippet,
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
        (CORRECTION_FIELDS.includes(co.field) ||
          CORRECTION_QUOTE_FIELD_RE.test(co.field) ||
          CORRECTION_REMOVAL_FIELD_RE.test(co.field)),
      `items[${idx}].corrections[${ci}].field must be one of ${CORRECTION_FIELDS.join(',')} ` +
        'or quote.<i>.text / quote.<i>.sourceClaimId / quote.<i> / crossChecked.<i>',
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

/**
 * ── ONE UTTERANCE, ONE ROW ──────────────────────────────────────────────────
 *
 * The extractor emits a claim per candidate sentence, and it repeatedly cut
 * the same intervention twice — once whole, once from a later word — so the
 * bundle selector handed the curator two claim ids for one thing a councillor
 * said. Published side by side they are not a duplicate the reader skims past:
 * the synthesiser counts rows to write the summary, so `f-2025-12-01-acu-51aaa3`
 * shipped «los grupos PSOE y un grupo no identificado manifiestan» over a
 * single voice, and `f-2026-05-11-acu-a870a4` published one bench's sentence as
 * two. It also multiplies whatever the sentence alleges.
 *
 * The rule is containment, not equality: the second copy is normally a prefix
 * or a suffix of the first, and an equality test caught none of the three real
 * cases. Comparison is on the published text — that is what the page shows —
 * with whitespace collapsed so re-wrapping cannot hide a repeat.
 *
 * Scoped inside one finding. Two findings citing overlapping material is
 * ordinary: each stands on the part it needs, and neither claims a headcount
 * over the other's rows.
 */
export function findRepeatedQuotes(finding: PlenoFinding): string[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const out: string[] = []
  for (let i = 0; i < finding.quotes.length; i += 1) {
    for (let j = 0; j < finding.quotes.length; j += 1) {
      if (i === j) continue
      const a = norm(finding.quotes[i].text)
      const b = norm(finding.quotes[j].text)
      // On an exact duplicate both directions hold; report the pair once.
      if (a === b && i > j) continue
      if (b.includes(a)) {
        out.push(
          `quotes[${i}] is republished inside quotes[${j}] — one intervention, one row. ` +
            'Retract the redundant copy with `correct-pleno-finding --remove quote.<i>`',
        )
      }
    }
  }
  return out
}

/**
 * ── ONE VERBATIM, ONE BLOC ──────────────────────────────────────────────────
 *
 * `f-2026-05-11-acu-da7902` published «el Partido Popular el otro día trajo una
 * noticia…» as PP and `f-2026-05-11-cit-a0a379` published the same sentence, in
 * the same session, as PSOE. Both cannot be true, and no gate here compared
 * them: each finding validated alone, and the attribution axis was never
 * checked for correctness at all.
 *
 * The honest rule is narrower than "the same string always means the same
 * speaker":
 *
 *   · Keyed on `plenoId` + the text. Two speakers in two different sessions
 *     may utter the same sentence, and calling that a contradiction would be a
 *     gate wrong for a reason nobody could act on.
 *   · `null` never conflicts. It is the absence of an attribution, not a rival
 *     one — the one honest way to say the curator cannot tell (see
 *     FindingQuote.speakerGroup) — so `null` beside `PSOE` is incomplete, not
 *     false. Only two DIFFERENT blocs are a contradiction.
 *   · Not keyed on `sourceClaimId`. The two rows above carry different ids
 *     (…-293 and …-294): the extractor had already split one utterance into two
 *     claims, so an id-scoped check would have seen nothing.
 *
 * There is no repair path in this module: `speakerGroup` has no correction
 * field, deliberately, because crossing to or between blocs is a curator's
 * judgement per finding. The remedy is to retract the row whose attribution the
 * transcript refutes.
 */
export function findAttributionConflicts(items: PlenoFinding[]): string[] {
  const byUtterance = new Map<string, Map<string, string[]>>()
  for (const f of items) {
    for (const q of f.quotes) {
      if (q.speakerGroup === null) continue
      const key = `${f.plenoId}\u0000${q.text.replace(/\s+/g, ' ').trim()}`
      const blocs = byUtterance.get(key) ?? new Map<string, string[]>()
      blocs.set(q.speakerGroup, [...(blocs.get(q.speakerGroup) ?? []), f.id])
      byUtterance.set(key, blocs)
    }
  }
  const out: string[] = []
  for (const [key, blocs] of byUtterance) {
    if (blocs.size < 2) continue
    const where = [...blocs]
      .map(([bloc, ids]) => `${bloc} (${ids.join(', ')})`)
      .sort()
      .join(' vs ')
    out.push(
      `one verbatim from pleno ${key.split('\u0000')[0]} is published under two blocs: ${where}. ` +
        'At most one is right; retract the row the transcript refutes',
    )
  }
  return out
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
  for (const it of items) {
    const dup = findRepeatedQuotes(it)
    must(dup.length === 0, `${it.id}: ${dup.join('; ')}`)
  }
  const conflicts = findAttributionConflicts(items)
  must(conflicts.length === 0, conflicts.join('; '))

  // Absent until the first withdrawal, so an empty file stays valid.
  let retractions: FindingRetraction[] | undefined
  if (raw.retractions !== undefined) {
    must(Array.isArray(raw.retractions), 'retractions must be array')
    retractions = (raw.retractions as unknown[]).map((r, i) => validateFindingRetraction(r, i))
    const withdrawn = new Set<string>()
    for (const r of retractions) {
      must(!withdrawn.has(r.findingId), `duplicate retraction for ${r.findingId}`)
      withdrawn.add(r.findingId)
      // Published AND withdrawn is not a state. It would render the finding
      // while the ledger said it was gone, and `isRetracted` would be right
      // about a page a reader can still read.
      must(!seen.has(r.findingId), `${r.findingId} is both published and retracted`)
    }
  }

  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
    ...(retractions ? { retractions } : {}),
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
    const prop = m[2] as 'text' | 'sourceClaimId' | 'speakerGroup'
    if (prop === 'speakerGroup') {
      // Empty means "we no longer say who said this". There is deliberately no
      // placeholder code: in a 21-seat council an "unknown group" value names
      // the councillor outside the large groups by elimination.
      const original = String(quote.speakerGroup ?? '')
      const next = corrected.trim()
      if (next && !(SPEAKER_GROUPS as readonly string[]).includes(next)) {
        throw new Error(
          `"${next}" is not a publishable bloc (${SPEAKER_GROUPS.join(', ')}). ` +
            'Pass an empty --new to retract the attribution instead.',
        )
      }
      quote.speakerGroup = (next || null) as SpeakerGroup | null
      return original
    }
    const original = String(quote[prop] ?? '')
    quote[prop] = corrected
    return original
  }
  if (CORRECTION_REMOVAL_FIELD_RE.test(field)) {
    throw new Error(
      `"${field}" is a removal path — use applyFindingRemoval, not applyFindingCorrection. ` +
        'A removal has no replacement value, and blanking a field is not a removal.',
    )
  }
  throw new Error(`unknown correction field "${field}"`)
}

/**
 * Retract one `quotes[i]` or one `crossChecked[i]` from a published finding,
 * returning the pair of strings the corrections log will show. Mutates the
 * finding in place; the caller MUST re-validate the whole snapshot before
 * persisting, exactly as with `applyFindingCorrection`.
 *
 * Read the REMOVAL block above for why `original` is a digest and not the
 * text. The fences, in the order they fire:
 *
 *   1. The path must address `quote` or `crossChecked`. `contradiction[]` and
 *      `sourceClaimIds` are deliberately unreachable — see above.
 *   2. The index must be in range NOW. Indices shift as removals land, so a
 *      stale index from an earlier reading of the file must not silently
 *      retract whatever slid into that slot.
 *   3. A finding must keep at least one quote. The schema already refuses an
 *      empty `quotes[]` — «a finding without a verbatim anchor is not
 *      publishable» — but it would refuse it from inside the re-validation
 *      pass, after the mutation, with a message about the snapshot rather
 *      than about what the curator just asked for. If a finding's last quote
 *      has to go, the finding does: that is a retraction, not a correction.
 */
export function applyFindingRemoval(
  finding: PlenoFinding,
  field: string,
): { original: string; corrected: string } {
  const m = CORRECTION_REMOVAL_FIELD_RE.exec(field)
  if (!m) {
    throw new Error(
      `"${field}" is not a removal path — expected quote.<i> or crossChecked.<i>. ` +
        'contradiction[] is not removable here: it is what gates severity=critical.',
    )
  }
  const collection = m[1] as keyof typeof REMOVAL_LABELS
  const index = Number(m[2])
  const rows: unknown[] = collection === 'quote' ? finding.quotes : finding.crossChecked
  if (index >= rows.length) {
    throw new Error(
      `${collection} index ${index} out of range (finding has ${rows.length}). ` +
        'Indices shift as removals land — re-read the finding and issue removals highest-first.',
    )
  }
  if (collection === 'quote' && finding.quotes.length === 1) {
    throw new Error(
      'refusing to remove the last quote: a finding without a verbatim anchor is not ' +
        'publishable. Retract the finding instead of emptying it.',
    )
  }
  const [removed] = rows.splice(index, 1)
  const label = REMOVAL_LABELS[collection]
  return {
    original: `${label.noun} · sha256:${sha256Short(JSON.stringify(removed))}`,
    corrected: label.corrected,
  }
}

/**
 * Every token that appears capitalised in `text`. Proper nouns, and the
 * sentence-initial words that look like them.
 */
function capitalisedTokens(text: string): string[] {
  return text.match(/\p{Lu}[\p{L}\p{M}’'-]*/gu) ?? []
}

/**
 * Does this `--reason` name something the removal just took out?
 *
 * `corrections[].reason` is published — `/hallazgos` prints it under
 * «Motivo:» beside every entry. On 2026-07-31 three biographies had to be
 * corrected a second time because their curator notes explained *what had
 * been excluded and why*, and in doing so named the person, the case and the
 * homonymy that the exclusion existed to protect. A removal reason has the
 * same shape and the same failure: the row is gone from the page, and the
 * sentence explaining its departure puts it back.
 *
 * The rule (`revisar-borrador`, Paso 2) is that a note describes the
 * CRITERION, never the material. What this function can enforce of that rule
 * is the half that is mechanical: a reason may not repeat a proper noun from
 * the row it removed, or its URL.
 *
 *   ✅ «Se retira una cita sin atribución de grupo que el resumen no utiliza
 *      y que imputa un hecho grave a una persona identificable.»
 *   ❌ «Se retira la cita que decía que el señor <Nombre> …»
 *
 * Be clear about what it does NOT catch, because a guard trusted past its
 * range is worse than none: it reads capitalisation, so it sees names and
 * misses paraphrase. A reason that avoids every name and still describes the
 * allegation in lowercase passes this and fails Paso 2. Judgement stays with
 * the curator; this only makes the commonest slip impossible.
 *
 * Scope is removals only. For an ordinary correction `original` is published
 * verbatim beside the reason anyway, so there is nothing for the reason to
 * protect and the same check would be a pointless denial.
 *
 * Returns the offending fragment, or null when the reason is clean.
 */
export function reasonEchoesRemoved(
  reason: string,
  removed: { text: string; ref: string | null },
): string | null {
  if (removed.ref && reason.includes(removed.ref)) return removed.ref
  const names = new Set(capitalisedTokens(removed.text))
  if (names.size === 0) return null
  // A capital that opens a sentence is grammar, not a name — «Se retira…»
  // must not trip on a removed snippet that happens to start with «Se».
  const re = /\p{Lu}[\p{L}\p{M}’'-]*/gu
  for (const m of reason.matchAll(re)) {
    const before = reason.slice(0, m.index).trimEnd()
    const sentenceInitial = before.length === 0 || /[.!?:;]$/.test(before)
    if (sentenceInitial) continue
    if (names.has(m[0])) return m[0]
  }
  return null
}

/**
 * The removed row, as `applyFindingRemoval` will digest it.
 *
 * Exported so the CLI can read a row BEFORE removing it — it needs the text
 * to check that the curator's `--reason` does not echo it, which is the whole
 * point of the removal, and it needs the digest to be computed over the same
 * bytes either way.
 */
export function findingRemovalTarget(
  finding: PlenoFinding,
  field: string,
): { text: string; ref: string | null } | null {
  const m = CORRECTION_REMOVAL_FIELD_RE.exec(field)
  if (!m) return null
  const index = Number(m[2])
  if (m[1] === 'quote') {
    const q = finding.quotes[index]
    return q ? { text: q.text, ref: null } : null
  }
  const r = finding.crossChecked[index]
  return r ? { text: r.snippet, ref: r.ref } : null
}

/**
 * Everything a redaction of `field` will take off the page: the value it
 * replaces, plus both prose sides of every prior correction row on that same
 * field. Exported for the same reason as `findingRemovalTarget` — the CLI
 * checks the curator's `--reason` against it BEFORE the digests land, and
 * afterwards there is nothing left to check it against.
 */
export function findingRedactionTarget(
  finding: PlenoFinding,
  field: string,
): { text: string; ref: string | null } | null {
  if (!(field in REDACTION_LABELS)) return null
  const current = String(finding[field as RedactableField] ?? '')
  const priors = (finding.corrections ?? [])
    .filter((c) => c.field === field)
    .flatMap((c) => [c.original, c.corrected])
    .filter((s) => !REDACTION_DIGEST_RE.test(s))
  return { text: [current, ...priors].join('\n'), ref: null }
}

/**
 * Rewrite `title` or `summary` and record the prior prose as a digest rather
 * than as text, sweeping the finding's own log of earlier copies of it.
 * Mutates in place; the caller MUST re-validate the whole snapshot before
 * persisting, exactly as with the other two appliers.
 *
 * Read the REDACTION block above for why this exists and why the sweep is
 * deliberately over-broad. The fences, in the order they fire:
 *
 *   1. The field must be redactable. `severity` is an enum, `sourceClaimIds`
 *      an id list, quotes are verbatim — none of them can carry the kind of
 *      prose this path exists for, and all three have their own edit routes.
 *   2. The replacement must differ from what is there, or the row would record
 *      a redaction that redacted nothing while still digesting the log.
 *   3. The replacement must be substantive. `--redact summary --new ""` is the
 *      same lie `--field quote.0 --new ""` was: a deletion wearing an edit's
 *      clothes, and the schema's own floor for a summary is 40 characters.
 *
 * Returns the ledger pair plus the number of prior rows swept, so the CLI can
 * tell the curator what else changed shape — a silent rewrite of somebody
 * else's log entry is exactly the surprise this repo keeps paying for.
 */
export function applyFindingRedaction(
  finding: PlenoFinding,
  field: string,
  corrected: string,
): { original: string; corrected: string; swept: number } {
  if (!(field in REDACTION_LABELS)) {
    throw new Error(
      `"${field}" is not redactable — expected ${Object.keys(REDACTION_LABELS).join(' or ')}. ` +
        'A quote goes through applyFindingRemoval; severity and the citation fields ' +
        'publish no prose for a digest to protect.',
    )
  }
  const key = field as RedactableField
  const previous = String(finding[key] ?? '')
  if (previous === corrected) {
    throw new Error(`${field} is already that text — a redaction that changes nothing is a no-op`)
  }
  if (corrected.trim().length < 40) {
    throw new Error(
      'refusing to redact to a stub: a redaction replaces prose, it does not empty a ' +
        'field. If the finding cannot be stated without the redacted material, retract it.',
    )
  }
  finding[key] = corrected
  let swept = 0
  for (const row of finding.corrections ?? []) {
    if (row.field !== field) continue
    if (!REDACTION_DIGEST_RE.test(row.original)) {
      row.original = redactionDigest(key, row.original)
      swept += 1
    }
    if (!REDACTION_DIGEST_RE.test(row.corrected)) {
      row.corrected = redactionDigest(key, row.corrected)
    }
  }
  return { original: redactionDigest(key, previous), corrected, swept }
}
