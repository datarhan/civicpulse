/**
 * Press claim extractor (LLM-driven).
 *
 * Two-mode pipeline per press item:
 *
 *   1. Headline triage (cheap): the LLM judges whether the headline alone
 *      contains a contrastable claim. Returns `{hasCheckableClaim,
 *      expectedClaimTypes, needsBody, reasoning}`.
 *   2. Body extraction (only when triage flags `hasCheckableClaim`): the
 *      press-fetcher pulls the article body, and a second LLM call
 *      extracts atomic claims as `PressClaim[]`.
 *
 * The triage step typically reduces LLM cost by ~60% — most headlines
 * are narrative or opinion. Both calls flow through the existing
 * `callLLM()` client so we inherit the cache + budget + circuit
 * breaker + retry chain for free.
 *
 * Libel discipline:
 *   - `attributedSource` is institutional (outlet | municipal |
 *     opposition | unspecified) — never names an individual.
 *   - verbatim ≥20 chars enforced at schema + projector layers.
 *   - opinativa accusations are tagged but never auto-promoted past
 *     the verifier's hard-skip.
 *   - confidence > 0.7 + verbatim > 200 chars is treated as "likely
 *     paraphrased" by the auto-curate step downstream.
 */

import { callLLM, type ClientConfig } from '../llm/client'
import {
  PRESS_TRIAGE_PROMPT_VERSION,
  PRESS_CLAIM_PROMPT_VERSION,
  buildPressTriageSystemPrompt,
  buildPressTriageUserPrompt,
  buildPressClaimSystemPrompt,
  buildPressClaimUserPrompt,
} from '../llm/prompts'
import {
  PressTriageResponseSchema,
  PressClaimResponseSchema,
  type PressTriageResponse,
  type PressClaimExtraction,
} from '../llm/schemas'
import {
  type PressClaim,
  type PressClaimType,
  type AttributedSource,
  type ClaimTopic,
  ALLOWED_PRESS_CLAIM_TYPES,
  ALLOWED_ATTRIBUTED_SOURCES,
  ALLOWED_CLAIM_TOPICS,
  ALLOWED_ACCUSATION_SUBTYPES,
} from './press-claim'

export interface PressNewsItem {
  id: string
  title: string
  source: string
  sourceHost: string | null
  link: string
  date: string
  fingerprint: string
}

export interface ExtractPressClaimsOptions {
  config?: ClientConfig
  /** Inject the LLM caller (tests). */
  caller?: typeof callLLM
  /** Inject the body-fetcher (tests). Receives a URL, returns body or null. */
  bodyFetcher?: (url: string) => Promise<string | null>
  /** Skip body fetch entirely (headline-only mode). */
  forceHeadlineOnly?: boolean
}

export interface PressClaimExtractionResult {
  /** Press claims emitted for this article. */
  claims: PressClaim[]
  /** Triage response (audit trail). */
  triage: PressTriageResponse
  /** Whether the body was fetched + used. */
  bodyUsed: boolean
}

const claimTypeAbbr: Record<PressClaimType, string> = {
  promesa: 'pro',
  afirmacion_numerica: 'num',
  cita_obra: 'obr',
  cita_convenio: 'con',
  acusacion_publica: 'acu',
  dato_municipal: 'dat',
}

/**
 * Project a single LLM PressClaimExtraction row into a validated
 * PressClaim, or return null if the row violates an invariant the
 * schema couldn't enforce automatically.
 */
function projectClaim(
  item: PressNewsItem,
  extraction: PressClaimExtraction,
  segmentIndex: number,
  segmentKind: 'title' | 'body',
): PressClaim | null {
  if (!ALLOWED_PRESS_CLAIM_TYPES.includes(extraction.type as PressClaimType)) return null
  if (!ALLOWED_ATTRIBUTED_SOURCES.includes(extraction.attributedSource as AttributedSource))
    return null
  if (!ALLOWED_CLAIM_TOPICS.includes(extraction.topic as ClaimTopic)) return null
  if (typeof extraction.verbatim !== 'string' || extraction.verbatim.length < 20) return null
  if (extraction.confidence < 0 || extraction.confidence > 1) return null

  const subtype = extraction.accusationSubtype
  if (
    extraction.type === 'acusacion_publica' &&
    subtype &&
    !ALLOWED_ACCUSATION_SUBTYPES.includes(subtype as (typeof ALLOWED_ACCUSATION_SUBTYPES)[number])
  )
    return null

  const id = `${item.id}-${segmentIndex}-${claimTypeAbbr[extraction.type as PressClaimType]}`

  const claim: PressClaim = {
    id,
    articleId: item.id,
    articleFingerprint: item.fingerprint,
    articleSource: item.source,
    articleSourceHost: item.sourceHost,
    articleUrl: item.link,
    articleDate: item.date,
    segmentIndex,
    segmentKind,
    type: extraction.type as PressClaimType,
    attributedSource: extraction.attributedSource as AttributedSource,
    verbatim: extraction.verbatim,
    context: extraction.context || '',
    topic: extraction.topic as ClaimTopic,
    entities: {
      ...(extraction.entities.amountEuros != null
        ? { amountEuros: extraction.entities.amountEuros }
        : {}),
      ...(extraction.entities.count != null ? { count: extraction.entities.count } : {}),
      ...(extraction.entities.countUnit ? { countUnit: extraction.entities.countUnit } : {}),
      ...(extraction.entities.date ? { date: extraction.entities.date } : {}),
      ...(extraction.entities.referencedEntity
        ? { referencedEntity: extraction.entities.referencedEntity }
        : {}),
    },
    ...(extraction.accusationSubtype
      ? { accusationSubtype: extraction.accusationSubtype as never }
      : {}),
    confidence: extraction.confidence,
    reasoning: extraction.reasoning || '',
    requiresHumanApproval: true,
  }
  return claim
}

/**
 * Deduplicate claims emitted for the same article. Same type + same
 * normalised verbatim prefix + same rounded amount collapses; the
 * highest-confidence representative wins.
 */
function dedupeClaims(claims: PressClaim[]): PressClaim[] {
  const byKey = new Map<string, PressClaim>()
  for (const c of claims) {
    const key = [
      c.articleId,
      c.type,
      c.entities.amountEuros != null ? Math.round(c.entities.amountEuros / 100) * 100 : '',
      c.verbatim.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim(),
    ].join('|')
    const prev = byKey.get(key)
    if (!prev || c.confidence > prev.confidence) byKey.set(key, c)
  }
  return Array.from(byKey.values())
}

export async function extractPressClaimsForItem(
  item: PressNewsItem,
  options: ExtractPressClaimsOptions = {},
): Promise<PressClaimExtractionResult> {
  const caller = options.caller ?? callLLM

  // Stage 1 — headline triage.
  const triage = await caller({
    systemPrompt: buildPressTriageSystemPrompt(),
    userPrompt: buildPressTriageUserPrompt({
      source: item.source,
      title: item.title,
      date: item.date,
    }),
    schema: PressTriageResponseSchema,
    promptVersion: PRESS_TRIAGE_PROMPT_VERSION,
    input: { kind: 'press-triage', fingerprint: item.fingerprint, title: item.title },
    config: options.config,
  })

  if (!triage) {
    return {
      claims: [],
      triage: {
        hasCheckableClaim: false,
        reasoning: 'llm-unavailable',
        expectedClaimTypes: [],
        needsBody: false,
      },
      bodyUsed: false,
    }
  }

  if (!triage.hasCheckableClaim) {
    return { claims: [], triage, bodyUsed: false }
  }

  // Stage 2 — body fetch (only when triage requests it AND we have a fetcher).
  let body: string | undefined
  if (triage.needsBody && options.bodyFetcher && !options.forceHeadlineOnly) {
    const fetched = await options.bodyFetcher(item.link)
    if (fetched && fetched.length > 0) body = fetched
  }

  // Stage 3 — claim extraction (single call, headline or headline+body).
  const segmentKind: 'title' | 'body' = body ? 'body' : 'title'
  const extracted = await caller({
    systemPrompt: buildPressClaimSystemPrompt(),
    userPrompt: buildPressClaimUserPrompt({
      source: item.source,
      title: item.title,
      date: item.date,
      body,
    }),
    schema: PressClaimResponseSchema,
    promptVersion: PRESS_CLAIM_PROMPT_VERSION,
    input: {
      kind: 'press-claim',
      fingerprint: item.fingerprint,
      segmentKind,
      bodyHash: body ? body.length : 0,
    },
    config: options.config,
  })

  if (!extracted) {
    return { claims: [], triage, bodyUsed: !!body }
  }

  const claims: PressClaim[] = []
  for (const [i, e] of extracted.claims.entries()) {
    const projected = projectClaim(item, e, i, segmentKind)
    if (projected) claims.push(projected)
  }

  return {
    claims: dedupeClaims(claims),
    triage,
    bodyUsed: !!body,
  }
}

export async function extractPressClaimsBatch(
  items: PressNewsItem[],
  options: ExtractPressClaimsOptions = {},
): Promise<{
  claims: PressClaim[]
  triages: Array<{ articleId: string; triage: PressTriageResponse; bodyUsed: boolean }>
  stats: {
    total: number
    triageHits: number
    bodyFetches: number
    claimsEmitted: number
    // Items whose triage failed because the LLM backend was unreachable
    // (circuit tripped). Lets the CLI tell "no checkable claims" (legit empty)
    // apart from "no working LLM" (a run that must NOT masquerade as green).
    llmUnavailable: number
  }
}> {
  const all: PressClaim[] = []
  const triages: Array<{ articleId: string; triage: PressTriageResponse; bodyUsed: boolean }> = []
  let triageHits = 0
  let bodyFetches = 0
  let llmUnavailable = 0

  for (const item of items) {
    const result = await extractPressClaimsForItem(item, options)
    triages.push({ articleId: item.id, triage: result.triage, bodyUsed: result.bodyUsed })
    if (result.triage.hasCheckableClaim) triageHits += 1
    if (result.triage.reasoning === 'llm-unavailable') llmUnavailable += 1
    if (result.bodyUsed) bodyFetches += 1
    all.push(...result.claims)
  }

  return {
    claims: all,
    triages,
    stats: {
      total: items.length,
      triageHits,
      bodyFetches,
      claimsEmitted: all.length,
      llmUnavailable,
    },
  }
}

export { dedupeClaims as _dedupeClaims, projectClaim as _projectClaim }
