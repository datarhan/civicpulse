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
import { canonicalizeDepartment } from './departments'
import { tenderMatchesQuejaCpv } from '../llm/queja-to-cpv'
import type { QuejaCategory } from './queja-router'

// NOTE: a 'mismo expediente' tier is deferred to the deliverable that adds the
// pleno-agenda bridge (queja dept ↔ agenda item expediente ↔ contract). A queja
// carries no expediente of its own, so a direct field match is not possible in
// D1 — Tier A here is strictly place + department.
export type RelationLabel = 'misma zona y materia' | 'misma zona' | 'misma materia'

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

/**
 * Department / theme alignment. Strong when both canonical department slugs are
 * equal; otherwise a lighter CPV-division theme match. The returned slug prefers
 * the queja's own department, then the canonical fold of its service code, then
 * the contract's — so the label always names a real department.
 */
export function departmentSignal(q: RelQueja, c: RelContract): { slug: string } | null {
  if (q.department && c.department && q.department === c.department) return { slug: q.department }
  if (tenderMatchesQuejaCpv(q.serviceCode as QuejaCategory, c.cpvs)) {
    const slug =
      q.department ?? canonicalizeDepartment(q.serviceCode) ?? c.department ?? q.serviceCode
    return { slug }
  }
  return null
}

/**
 * Temporal modifier — award within [queja − 3mo, queja + 18mo]. NEVER a link on
 * its own (see scoreRelation): it only boosts/annotates an existing signal.
 */
export function temporalModifier(q: RelQueja, c: RelContract): { monthsAfter: number } | null {
  if (!c.awardDate) return null
  const t0 = new Date(q.createdAt).getTime()
  const t1 = new Date(c.awardDate).getTime()
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null
  const months = (t1 - t0) / (1000 * 60 * 60 * 24 * 30)
  return months >= -3 && months <= 18 ? { monthsAfter: months } : null
}

export interface RelationLink {
  quejaId: string
  tenderPermalink: string
  tenderId: string
  tier: 'A' | 'B'
  score: number
  via: 'deterministic'
  relationLabel: RelationLabel
  signals: {
    place?: PlaceSignal
    department?: { slug: string }
    temporal?: { monthsAfter: number }
  }
  requiresHumanApproval: boolean
}

/**
 * Combine the four signals into a tiered, neutral-labelled link — or null.
 *
 * Tier A (publishable fact, requiresHumanApproval:false): same place AND same
 * department. Tier B (curator-gated): a lone place or a lone department/theme.
 * Honesty gates: department/theme alone is never Tier A, and a temporal-only
 * coincidence never links at all.
 */
export function scoreRelation(q: RelQueja, c: RelContract): RelationLink | null {
  const place = placeSignal(q, c)
  const dept = departmentSignal(q, c)
  const temporal = temporalModifier(q, c) ?? undefined
  const base = {
    quejaId: q.id,
    tenderPermalink: c.permalink,
    tenderId: c.id,
    via: 'deterministic' as const,
    signals: {
      ...(place ? { place } : {}),
      ...(dept ? { department: dept } : {}),
      ...(temporal ? { temporal } : {}),
    },
  }
  if (place && dept)
    return {
      ...base,
      tier: 'A',
      score: 0.85,
      relationLabel: 'misma zona y materia',
      requiresHumanApproval: false,
    }
  if (place)
    return {
      ...base,
      tier: 'B',
      score: 0.6,
      relationLabel: 'misma zona',
      requiresHumanApproval: true,
    }
  if (dept)
    return {
      ...base,
      tier: 'B',
      score: 0.55,
      relationLabel: 'misma materia',
      requiresHumanApproval: true,
    }
  return null // temporal alone (or nothing) never links
}

export interface RelContext {
  now?: Date
  frozen?: boolean
}

export interface RelationsResult {
  links: RelationLink[]
  stats: {
    frozen: boolean
    quejasScanned: number
    contractsScanned: number
    tierA: number
    tierB: number
    reason: string | null
  }
}

/**
 * Score every queja × contract pair, keeping only the pairs that link. Under a
 * LOREG electoral freeze the engine emits nothing (same gate as the promise and
 * journalist subsystems).
 */
export function buildRelations(
  quejas: RelQueja[],
  contracts: RelContract[],
  ctx: RelContext = {},
): RelationsResult {
  const stats = {
    frozen: false,
    quejasScanned: 0,
    contractsScanned: contracts.length,
    tierA: 0,
    tierB: 0,
    reason: null as string | null,
  }
  if (ctx.frozen) return { links: [], stats: { ...stats, frozen: true, reason: 'frozen' } }
  const links: RelationLink[] = []
  for (const q of quejas) {
    stats.quejasScanned += 1
    for (const c of contracts) {
      const link = scoreRelation(q, c)
      if (!link) continue
      links.push(link)
      if (link.tier === 'A') stats.tierA += 1
      else stats.tierB += 1
    }
  }
  return { links, stats }
}

// Re-exported so the CLI shares the exact category enum used by the CPV theme
// check without a second import path.
export type { QuejaCategory }
export { tenderMatchesQuejaCpv }
