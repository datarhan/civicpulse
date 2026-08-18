/**
 * Pleno claim extraction schema.
 *
 * A "claim" is an assertion made in the floor of a pleno — distinct from
 * a vote tuple. Politicians make four kinds of verifiable statements:
 *
 *   · promesa            — future commitment ("we will build 500 social homes")
 *   · afirmacion_numerica — cited number ("we allocated 46 million to the budget")
 *   · cita_obra          — referenced work/project ("the DANA reconstruction is done")
 *   · cita_convenio      — referenced grant/subsidy ("we received 9.5M in EU funds")
 *
 * Each claim carries its verbatim text, the speaker's GROUP (never the
 * individual — same libel rule as the promise-evidence pipeline), the
 * timestamp in the recording, and any numeric/temporal entities the LLM
 * could extract. The verifier (src/scraper/claim-verifier.ts) then
 * cross-references each claim against tenders.json / bdns.json /
 * budget.json / promises.json / prior plenos to emit a verdict:
 *
 *   verificado · parcial · contradicho · sin-datos · promesa-repetida
 *
 * Suggestions land in public/data/pleno-claims-suggestions.json with
 * requiresHumanApproval:true. A curator reviews before any finding is
 * surfaced as editorial content — same conservative discipline as every
 * other libel-adjacent surface in the project.
 */

import type { SpeakerGroup } from './pleno-votes'

export type ClaimType =
  | 'promesa'
  | 'afirmacion_numerica'
  | 'cita_obra'
  | 'cita_convenio'
  | 'acusacion_publica'
  | 'valoracion_politica'

/**
 * `valoracion_politica` — posicionamiento político o jurídico (defensa de una
 * norma, juicio de constitucionalidad, elogio o crítica ideológica) que no
 * promete, no cifra, no cita obra/convenio y no acusa a nadie. El prompt del
 * extractor NO lo emite — re-extraer perdería la atribución de bloc — así que
 * el valor sólo nace de una reclasificación curada (`npm run reclassify-claim`,
 * sidecar `pleno-claim-reclassifications.json`), y sólo ALEJÁNDOSE de
 * `acusacion_publica`: el espejo de «downgrade-only» del overlay de veredictos.
 * Para la puerta editorial es una no-acusación normal: sin fundar se pliega
 * (`toggle`), fundada se muestra. El caso que lo estrenó: una defensa de la
 * constitucionalidad de la ley estatal de vivienda publicada como «acusación
 * no contrastada» (10yl550-220-acu-0101aa; la abreviatura del id es clave
 * estable y no cambia con el tipo).
 */
export const ALLOWED_CLAIM_TYPES: readonly ClaimType[] = [
  'promesa',
  'afirmacion_numerica',
  'cita_obra',
  'cita_convenio',
  'acusacion_publica',
  'valoracion_politica',
]

/**
 * Los tipos que la FRONTERA DE EXTRACCIÓN acepta: los cinco del prompt.
 *
 * Derivado, no restatado. `valoracion_politica` se excluye a propósito: los
 * backends de salida estructurada le ENSEÑAN el enum al modelo aunque el
 * prompt no lo defina, así que con el enum completo el extractor podía emitir
 * el sexto tipo y dejar falso el invariante de arriba — documentado pero no
 * codificado, el patrón exacto contra el que escribe DATA_INTEGRITY. El
 * esquema de extracción (src/llm/schemas.ts) valida contra ESTA lista; el
 * corpus entero, contra ALLOWED_CLAIM_TYPES.
 */
export const EXTRACTOR_CLAIM_TYPES: readonly ClaimType[] = ALLOWED_CLAIM_TYPES.filter(
  (t) => t !== 'valoracion_politica',
)

/**
 * Narrow subtype for accusations. Split at extraction time so the verifier
 * knows which ones are safely verifiable against the paper trail.
 *
 *   · factual      — accusation cites specific verifiable entities: a vote
 *                    count, an amount, a contract, a BDNS grant. SAFE to
 *                    auto-verify against tenders/BDNS/budget/pleno-votes.
 *   · opinativa    — accusation about character, intent, style of governance,
 *                    or general behaviour ("nunca escuchan a los vecinos").
 *                    NEVER auto-verified — flagged for editorial review only.
 *   · contra-datos — accusation that directly contradicts our own published
 *                    data ("X partido votó en contra de Y" when pleno-votes
 *                    shows the opposite). Verifier will test this and can
 *                    emit a contradicho verdict.
 */
export type AccusationSubtype = 'factual' | 'opinativa' | 'contra-datos'

export const ALLOWED_ACCUSATION_SUBTYPES: readonly AccusationSubtype[] = [
  'factual',
  'opinativa',
  'contra-datos',
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
  'other',
]

export interface PlenoClaim {
  /** Stable id: `${plenoId}-${segmentIndex}-${typeAbbr}` */
  id: string
  plenoId: string
  plenoDate: string
  /** Index of the transcript segment this claim was extracted from. */
  segmentIndex: number
  type: ClaimType
  /**
   * Group attribution only — no personal names. Whisper WER on proper
   * nouns is ~5-10%; misattributing a claim to a specific councillor
   * would be a libel risk. Null when the speaker's group is unclear.
   *
   * This is the primary, libel-safe attribution. Even when speakerSlug
   * is set, no published surface (`/declaraciones`, `/hallazgos`) names
   * the individual until a curator promotes it via `promote-claim`.
   */
  speakerGroup: SpeakerGroup | null
  /**
   * Optional individual attribution — only populated when the
   * transcript line was rewritten with a high-tier voice-id named tag
   * by `identify-pleno-speakers --apply` AND the slug resolves against
   * `public/data/officials.json` AND the official's party agrees with
   * `speakerGroup`. Validated in src/scraper/pleno-claim-llm.ts;
   * inconsistent values are stripped to null at write time.
   *
   * Editorial signal only. The dashboard / curator can use it; the LLM
   * extractor will NOT promote it to a published `/declaraciones` row
   * without an explicit curator step. The libel boundary documented in
   * CLAUDE.md still applies — an individual is named in published
   * editorial only after `promote-claim` review.
   */
  speakerSlug?: string | null
  /** Verbatim quote from the transcript (≥20 chars). */
  verbatim: string
  /** 400-char excerpt with surrounding context for the curator. */
  context: string
  /** Topic classification (matches promise topics for downstream correlation). */
  topic: ClaimTopic
  /** Structured entities the LLM extracted from the claim. */
  entities: ClaimEntities
  /**
   * Present only when type === 'acusacion_publica'. Classifies whether the
   * accusation is safely auto-verifiable (factual / contra-datos) or
   * opinion-only (opinativa, stays sin-datos by policy).
   */
  accusationSubtype?: AccusationSubtype
  /** 0..1 LLM confidence. */
  confidence: number
  /** One-sentence reasoning (kept for audit). */
  reasoning: string
  /** Always true — this lives in suggestions, not a curated snapshot. */
  requiresHumanApproval: true
}

export interface ClaimEntities {
  /** Euros, if the claim cites an amount. Normalised: "46 millones" → 46000000. */
  amountEuros?: number
  /** Count, if the claim cites a quantity: "500 viviendas" → 500. */
  count?: number
  /** Unit that pairs with count: "viviendas", "plazas", "km", etc. */
  countUnit?: string
  /** ISO date if the claim fixes a future or past date ("antes de 2027-12-31"). */
  date?: string
  /**
   * Named entity the claim references — an obra, contract, convenio, programa.
   * Normalised (lowercase, accent-stripped, spaces preserved): this is what
   * the verifier searches for in tenders.json / bdns.json.
   */
  referencedEntity?: string
}

export interface PlenoClaimSuggestion {
  claim: PlenoClaim | null
}

export interface PlenoClaimsSnapshot {
  generatedAt: string
  source: {
    description: string
    contract: string
  }
  stats: {
    total: number
    byType: Record<ClaimType, number>
    byPleno: Record<string, number>
    byTopic: Record<ClaimTopic, number>
    /**
     * Distribution of accusation subtypes across the snapshot. Useful
     * for operators — a pleno with 40 opinativa accusations and 0
     * factual is likely a heated debate, not a scandal.
     */
    byAccusationSubtype?: Record<AccusationSubtype, number>
  }
  items: PlenoClaim[]
}
