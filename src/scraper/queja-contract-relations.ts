/**
 * Queja ↔ contract relations engine (deterministic core).
 *
 * Scores a relation between a citizen complaint (queja) and a municipal
 * contract from four transparent signals — geographic co-location, department /
 * CPV theme, a temporal modifier, and a shared expediente — and assigns a tier:
 *
 *   - Tier A: a verifiable co-occurrence fact (shared expediente, OR same place
 *     AND same department). Publishable directly with NEUTRAL phrasing.
 *   - Tier B: a weaker / fuzzy candidate. `requiresHumanApproval: true` — never
 *     rendered until a curator promotes it.
 *
 * The framing is strictly non-causal: `relationLabel` is a fixed enum and never
 * implies the contract "resolves" the complaint. No LLM, no network in this
 * module — every link is explainable and reproducible.
 */

import { slugify } from './normalize'
import { tenderMatchesQuejaCpv } from '../llm/queja-to-cpv'
import type { QuejaCategory } from './queja-router'

export type RelationLabel =
  | 'mismo expediente'
  | 'misma zona y materia'
  | 'misma zona'
  | 'misma materia'

export interface RelQueja {
  id: string
  serviceCode: string
  department: string | null
  placeSlug: string | null
  description: string
  createdAt: string
}

export interface RelContract {
  id: string
  permalink: string
  title: string
  department: string | null
  cpvs: string[]
  places: string[]
  zones: string[]
  awardDate: string | null
  amount: number | null
  assignee: string | null
  expediente: string | null
}

export interface PlaceSignal {
  granularity: 'exact' | 'barrio'
  slug: string
}

/**
 * Geographic co-location. Exact place (street / POI / urbanización) beats a
 * barrio (zone) match. Both sides are folded through the repo's canonical
 * `slugify` so `valencia-la-vella` ↔ `València la Vella` unify.
 */
export function placeSignal(q: RelQueja, c: RelContract): PlaceSignal | null {
  const qs = slugify(q.placeSlug ?? '')
  if (!qs) return null
  if (c.places.some((p) => slugify(p) === qs)) return { granularity: 'exact', slug: qs }
  if (c.zones.some((z) => slugify(z) === qs)) return { granularity: 'barrio', slug: qs }
  return null
}

// Re-exported so the CLI shares the exact category enum used by the CPV theme
// check without a second import path.
export type { QuejaCategory }
export { tenderMatchesQuejaCpv }
