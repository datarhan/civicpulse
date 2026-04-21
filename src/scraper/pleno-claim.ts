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

import type { VoteBloc } from './pleno-votes'

export type ClaimType =
  | 'promesa'
  | 'afirmacion_numerica'
  | 'cita_obra'
  | 'cita_convenio'
  | 'acusacion_publica'

export const ALLOWED_CLAIM_TYPES: readonly ClaimType[] = [
  'promesa',
  'afirmacion_numerica',
  'cita_obra',
  'cita_convenio',
  'acusacion_publica',
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
   */
  speakerGroup: VoteBloc | null
  /** Verbatim quote from the transcript (≥20 chars). */
  verbatim: string
  /** 400-char excerpt with surrounding context for the curator. */
  context: string
  /** Topic classification (matches promise topics for downstream correlation). */
  topic: ClaimTopic
  /** Structured entities the LLM extracted from the claim. */
  entities: ClaimEntities
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
  }
  items: PlenoClaim[]
}
