/**
 * Press claim extraction schema.
 *
 * A "press claim" is a verifiable assertion made inside a news article
 * about Riba-roja de Túria — distinct from a pleno claim (which is a
 * verbatim speaker line). The press extractor mines headlines and
 * (when triage flags) article bodies for the same four claim families
 * the pleno verifier already handles, plus one press-specific type:
 *
 *   · promesa            — outlet quotes a political commitment
 *   · afirmacion_numerica — outlet cites a number ("Riba-roja invierte 185k€")
 *   · cita_obra          — outlet references a work/project status
 *   · cita_convenio      — outlet references a grant/subsidy
 *   · acusacion_publica  — outlet quotes / paraphrases an accusation
 *   · dato_municipal     — outlet republishes a municipal statistic
 *                          (padrón, paro, IPC, etc.) — press-only family
 *
 * **Libel discipline.** Press content belongs to the OUTLET, not to us.
 * The schema does NOT carry `speakerGroup` / `speakerSlug` (those are
 * for pleno transcripts where the politician's own words are the
 * audit target). Instead `attributedSource` records who the article
 * attributes the claim TO: the outlet itself, the municipal government,
 * an opposition voice, or unspecified. Our verdict reads "municipal
 * data agrees / disagrees / has no record" — never "the journalist
 * was wrong."
 *
 * Suggestions land in public/data/press-claims-suggestions.json with
 * requiresHumanApproval:true. The verifier (src/scraper/press-verifier.ts)
 * then cross-references each claim against tenders/BDNS/budget/
 * promises/pleno-votes/padron/paro to emit:
 *
 *   verificado · parcial · contradicho · sin-datos · promesa-repetida
 *
 * Findings land in public/data/press-findings.json via `npm run
 * auto-curate-press`, severity locked to `informational`. Bundles
 * carrying a `contradicho` verdict are held in the (gitignored)
 * editorial/press-auto-curation-queue.md and go no further: there is
 * no promotion CLI on the press side. See src/scraper/press-finding.ts
 * for what a curator can and cannot do to a published press finding.
 *
 * Right-of-reply is curator-only. Once a finding is published the
 * affected outlets receive a GitHub-Issue invitation to respond.
 */

export type PressClaimType =
  | 'promesa'
  | 'afirmacion_numerica'
  | 'cita_obra'
  | 'cita_convenio'
  | 'acusacion_publica'
  | 'dato_municipal'

export const ALLOWED_PRESS_CLAIM_TYPES: readonly PressClaimType[] = [
  'promesa',
  'afirmacion_numerica',
  'cita_obra',
  'cita_convenio',
  'acusacion_publica',
  'dato_municipal',
]

/**
 * Press accusation subtype — mirrors the pleno verifier's policy.
 *
 *   · factual      — cites verifiable entities. Safe to auto-verify.
 *   · opinativa    — opinion / framing. NEVER auto-verified, always
 *                    sin-datos regardless of municipal data.
 *   · contra-datos — directly contradicts our published data. Verifier
 *                    is allowed to emit contradicho if cross-reference
 *                    confirms — but always quarantined for curator review.
 */
export type AccusationSubtype = 'factual' | 'opinativa' | 'contra-datos'

export const ALLOWED_ACCUSATION_SUBTYPES: readonly AccusationSubtype[] = [
  'factual',
  'opinativa',
  'contra-datos',
]

/**
 * Who the article attributes the claim TO. This is editorial signal
 * for the verifier (e.g., a claim attributed to `municipal` is being
 * REPUBLISHED, so a contradiction means municipal communications
 * disagree with municipal data — a different story than a journalist
 * misquoting).
 *
 *   · outlet      — the outlet asserts the claim in its own voice
 *   · municipal   — quoted from an Ayuntamiento communication / official
 *   · opposition  — quoted from an opposition group / spokesperson
 *   · unspecified — attribution unclear (default, conservative)
 */
export type AttributedSource = 'outlet' | 'municipal' | 'opposition' | 'unspecified'

export const ALLOWED_ATTRIBUTED_SOURCES: readonly AttributedSource[] = [
  'outlet',
  'municipal',
  'opposition',
  'unspecified',
]

export type ClaimTopic =
  | 'fiscal'
  | 'vivienda'
  | 'movilidad'
  | 'medio-ambiente'
  | 'social'
  | 'cultura'
  | 'seguridad'
  | 'empleo'
  | 'urbanismo'
  | 'salud'
  | 'transparencia'
  | 'educacion'
  | 'demografia'
  | 'other'

export const ALLOWED_CLAIM_TOPICS: readonly ClaimTopic[] = [
  'fiscal',
  'vivienda',
  'movilidad',
  'medio-ambiente',
  'social',
  'cultura',
  'seguridad',
  'empleo',
  'urbanismo',
  'salud',
  'transparencia',
  'educacion',
  'demografia',
  'other',
]

export interface ClaimEntities {
  /** Euros, normalised. "185.000 €" → 185000. "9,5 millones" → 9500000. */
  amountEuros?: number
  /** Count, if the claim cites a quantity. */
  count?: number
  /** Unit that pairs with count: "viviendas", "plazas", "km", "%", etc. */
  countUnit?: string
  /** ISO date if the claim fixes a future or past date. */
  date?: string
  /**
   * Named entity the claim references — obra, contract, convenio,
   * programa, etc. Normalised (lowercase, accent-stripped); this is
   * what the verifier searches for in tenders.json / bdns.json.
   */
  referencedEntity?: string
}

export interface PressClaim {
  /** Stable id: `${articleId}-${segmentIndex}-${typeAbbr}` */
  id: string
  /** Which press.json item this claim came from. */
  articleId: string
  /** Article fingerprint (FNV of canonical title). Enables triangulation. */
  articleFingerprint: string
  /** Publisher name as it appears in press.json (e.g. "Levante-EMV"). */
  articleSource: string
  /** Publisher host ("levante-emv.com"). */
  articleSourceHost: string | null
  /** Article URL. */
  articleUrl: string
  /** Article publish date (ISO). */
  articleDate: string
  /** Index of the source segment (title | body chunk). */
  segmentIndex: number
  /** Which segment did the claim come from? */
  segmentKind: 'title' | 'body'
  type: PressClaimType
  /**
   * Who the article attributes the claim to. Never an individual name
   * — this is institutional attribution only. The schema deliberately
   * has no `speakerGroup` / `speakerSlug` field (those belong to pleno
   * transcripts where the politician's voice is the audit target).
   */
  attributedSource: AttributedSource
  /** Verbatim quote from the article (≥20 chars). */
  verbatim: string
  /** 400-char excerpt for curator context. */
  context: string
  topic: ClaimTopic
  entities: ClaimEntities
  /**
   * Present only when type === 'acusacion_publica'. opinativa values
   * are hard-skipped to sin-datos by the verifier.
   */
  accusationSubtype?: AccusationSubtype
  /** 0..1 LLM confidence. */
  confidence: number
  /** One-sentence reasoning (audit trail). */
  reasoning: string
  /** Always true — lives in suggestions, never auto-promoted. */
  requiresHumanApproval: true
}

export interface PressClaimsSnapshot {
  generatedAt: string
  source: {
    description: string
    contract: string
  }
  stats: {
    total: number
    byType: Record<PressClaimType, number>
    bySource: Record<string, number>
    byTopic: Record<ClaimTopic, number>
    byAttributedSource?: Record<AttributedSource, number>
    byAccusationSubtype?: Record<AccusationSubtype, number>
    /**
     * Provenance of the RUN, not of the claims. Without these, "10 claims"
     * from a healthy pass over 25 articles and "10 stale claims from a pass
     * where every LLM call failed" are the same file. The pipeline's own log
     * knew the difference; the snapshot did not, and the snapshot is what
     * /laboratorio and /lab-health read.
     */
    articlesProcessed?: number
    articlesAvailable?: number
    llmUnavailable?: number
    windowFrom?: string | null
    windowTo?: string | null
  }
  items: PressClaim[]
}

/**
 * Strict validator — throws on any schema violation. Mirrors the
 * validate-pleno-claims discipline used in pleno-claim.ts.
 */
export function validatePressClaimsSnapshot(text: string): PressClaimsSnapshot {
  let snap: unknown
  try {
    snap = JSON.parse(text)
  } catch (err) {
    throw new Error(`press-claims-suggestions.json is not valid JSON: ${(err as Error).message}`)
  }
  if (!snap || typeof snap !== 'object') {
    throw new Error('press-claims-suggestions.json must be an object')
  }
  const s = snap as Record<string, unknown>
  if (typeof s.generatedAt !== 'string') throw new Error('generatedAt must be ISO string')
  if (!s.source || typeof s.source !== 'object') throw new Error('source must be an object')
  if (!s.stats || typeof s.stats !== 'object') throw new Error('stats must be an object')
  if (!Array.isArray(s.items)) throw new Error('items must be an array')

  const items = s.items as PressClaim[]
  for (const [i, c] of items.entries()) {
    validatePressClaim(c, i)
  }
  return snap as PressClaimsSnapshot
}

export function validatePressClaim(c: PressClaim, idx = 0): PressClaim {
  const where = `item ${idx} (${c?.id || 'no-id'})`
  if (!c || typeof c !== 'object') throw new Error(`${where}: not an object`)
  if (typeof c.id !== 'string' || !c.id) throw new Error(`${where}: id missing`)
  if (typeof c.articleId !== 'string' || !c.articleId)
    throw new Error(`${where}: articleId missing`)
  if (typeof c.articleFingerprint !== 'string' || !c.articleFingerprint)
    throw new Error(`${where}: articleFingerprint missing`)
  if (typeof c.articleSource !== 'string') throw new Error(`${where}: articleSource missing`)
  if (typeof c.articleUrl !== 'string' || !/^https?:\/\//.test(c.articleUrl))
    throw new Error(`${where}: articleUrl must be http(s)`)
  if (typeof c.articleDate !== 'string') throw new Error(`${where}: articleDate must be ISO string`)
  if (!ALLOWED_PRESS_CLAIM_TYPES.includes(c.type))
    throw new Error(`${where}: type must be one of ${ALLOWED_PRESS_CLAIM_TYPES.join('|')}`)
  if (!ALLOWED_ATTRIBUTED_SOURCES.includes(c.attributedSource))
    throw new Error(
      `${where}: attributedSource must be one of ${ALLOWED_ATTRIBUTED_SOURCES.join('|')}`,
    )
  if (typeof c.verbatim !== 'string' || c.verbatim.length < 20)
    throw new Error(`${where}: verbatim must be ≥20 chars (libel-safe quoting)`)
  if (!ALLOWED_CLAIM_TOPICS.includes(c.topic))
    throw new Error(`${where}: topic must be one of ${ALLOWED_CLAIM_TOPICS.join('|')}`)
  if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1)
    throw new Error(`${where}: confidence must be in [0,1]`)
  if (c.requiresHumanApproval !== true)
    throw new Error(`${where}: requiresHumanApproval must be literal true`)
  if (c.segmentKind !== 'title' && c.segmentKind !== 'body')
    throw new Error(`${where}: segmentKind must be 'title' or 'body'`)
  if (c.type === 'acusacion_publica') {
    if (c.accusationSubtype && !ALLOWED_ACCUSATION_SUBTYPES.includes(c.accusationSubtype))
      throw new Error(
        `${where}: accusationSubtype must be one of ${ALLOWED_ACCUSATION_SUBTYPES.join('|')}`,
      )
  }
  return c
}

/**
 * Outcome of the "may this run overwrite the published snapshot?" decision.
 * `write` is the verdict; `reason` is logged verbatim so the pipeline log says
 * which branch was taken and why, rather than leaving the operator to infer it
 * from a row count that changed.
 */
export interface PressClaimsWriteDecision {
  write: boolean
  reason: string
  /** Claims already published on disk (0 when the file is absent or corrupt). */
  existingCount: number
  /** Claims this run produced. */
  incomingCount: number
  /** Whether the run was complete (`llmUnavailable === 0`). */
  complete: boolean
}

/** Tolerant claim count for an on-disk snapshot: anything unreadable is 0. */
export function countPressClaims(raw: string | null | undefined): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { items?: unknown }
    return Array.isArray(parsed.items) ? parsed.items.length : 0
  } catch {
    return 0
  }
}

/**
 * Gate on overwriting `press-claims-suggestions.json`.
 *
 * An incomplete run — one where the LLM backend was unreachable for any item —
 * may ADD claims but may never REMOVE them. The distinction the original code
 * missed: a run that reached the model for 7 of 25 articles kept real partial
 * progress, but a run that reached it for NONE produced `items: []`, and
 * writing that over a published corpus is not progress, it is erasure. On
 * 2026-08-09 that erasure deleted a live claim from the site and the pipeline
 * reported the deletion as its result (`0 verified claim(s) pushed`).
 *
 * So: a complete run always writes (it is authoritative, including when it
 * legitimately found fewer claims). An incomplete run writes only if it did not
 * shrink the corpus.
 *
 * Pure by design — `existingRaw` is passed in rather than read here, so the
 * missing-file, corrupt-file and shrink cases are all unit-testable without
 * touching the filesystem or the CLI.
 */
export function decidePressClaimsWrite(args: {
  incomingCount: number
  llmUnavailable: number
  existingRaw: string | null
}): PressClaimsWriteDecision {
  const { incomingCount, llmUnavailable, existingRaw } = args
  const existingCount = countPressClaims(existingRaw)
  const complete = !(llmUnavailable > 0)

  if (complete) {
    return {
      write: true,
      reason: `complete run (llmUnavailable=0) — writing ${incomingCount} claim(s), authoritative`,
      existingCount,
      incomingCount,
      complete,
    }
  }
  if (incomingCount < existingCount) {
    return {
      write: false,
      reason:
        `refusing to overwrite ${existingCount} claim(s) with ${incomingCount} ` +
        `from an incomplete run (llmUnavailable=${llmUnavailable}) — an incomplete ` +
        `run may add claims, never remove them`,
      existingCount,
      incomingCount,
      complete,
    }
  }
  return {
    write: true,
    reason:
      `incomplete run (llmUnavailable=${llmUnavailable}) but it did not shrink the ` +
      `corpus (${existingCount} → ${incomingCount}) — keeping the partial progress`,
    existingCount,
    incomingCount,
    complete,
  }
}
