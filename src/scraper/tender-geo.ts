import { stripDiacritics } from './normalize'
import { resolvePlace, foldTitle, type Candidate, type PlaceKind } from './place-resolver'

export interface ContractInput {
  id: string
  title: string
  status?: string
  finalAmount?: number
  finalAmountNoTaxes?: number
  initialAmount?: number
  initialAmountNoTaxes?: number
  awardDate?: string | null
  startDate?: string | null
  formalizedDate?: string | null
  contractType?: string | null
  categoryTitle?: string | null
}
export interface ZoneInput {
  slug: string
  name: string
  centroid: [number, number]
}
/** Precise place a contract was situated at (via the multi-source resolver). */
export interface PlaceRef {
  kind: PlaceKind
  name: string
  matchedText: string
  /** Stable id of the matched place — the grouping key for the map pins. */
  sourceId: string
}
export interface TenderGeoAssignment {
  id: string
  zones: string[]
  matchedAlias: Record<string, string>
  dana: boolean
  amount: number
  amountKind: 'final' | 'initial'
  date: string | null
  contractType: string | null
  categoryTitle: string | null
  /** Precise point where the contract was situated (street/POI/urb/barrio), or null. */
  point: [number, number] | null
  /** Provenance of the point — the named place the title matched, or null. */
  place: PlaceRef | null
}
export interface TenderGeoZone {
  slug: string
  name: string
  centroid: [number, number]
  contractCount: number
  amount: number
  danaAmount: number
}
/** One precise place with money situated at it — the pin source for the map. */
export interface TenderGeoPlace {
  slug: string
  name: string
  kind: PlaceKind
  point: [number, number]
  contractCount: number
  amount: number
  danaAmount: number
}
export interface TenderGeoSnapshot {
  generatedAt: string
  source: { tenders: string | null; geo: string | null }
  universe: {
    totalContracts: number
    totalAmount: number
    locatedContracts: number
    locatedAmount: number
    /** Contracts situated at a precise point (street/POI/urb/barrio). */
    situatedContracts: number
    situatedAmount: number
    danaContracts: number
    danaAmount: number
    danaAwardedContracts: number
    danaAwardedAmount: number
    dateMin: string | null
    dateMax: string | null
  }
  zones: TenderGeoZone[]
  places: TenderGeoPlace[]
  assignments: TenderGeoAssignment[]
}

const DANA_RE = /\bdana\b|temporal de lluvias|29 de octubre/

// Curator-maintained. Aliases are folded (lowercase, accent-free,
// apostrophes→spaces) substrings UNIQUE to one zone. Conservative by design:
// we under-match rather than over-match. Bare ambiguous tokens are avoided
// ("reva", "el terreno"); the P.I. l'Oliveral and Parque/urbanización
// duplicates fold into one canonical slug so money isn't double-rendered.
export const ZONE_ALIASES: Record<string, string[]> = {
  'urbanitzacio-els-pous': ['els pous'],
  'urbanitzacio-mas-de-traver': ['mas de traver'],
  'el-pou-d-escoto': ['escoto'],
  'urbanitzacio-valencia-la-vella': ['valencia la vella'],
  'santa-rosa': ['santa rosa'],
  'monte-alcedo': ['monte alcedo'],
  'urbanitzacio-entretarongers': ['entretarongers'],
  carasoles: ['carasoles'],
  'urbanitzacio-santa-monica': ['santa monica'],
  'el-molinet': ['molinet'],
  'l-oliveral': ['oliveral'],
  'urbanitzacio-la-reva': ['la reva', 'residencial la reva', 'urbanizacion reva', 'reva con cv'],
  'urbanitzacio-el-terreno': ['urbanizacion el terreno', 'urbanitzacio el terreno'],
  'vallesa-de-mandor': ['vallesa'],
  'poligono-industrial-entrevias': ['entrevias'],
  'poligon-industrial-poio-de-reva': ['poio de reva'],
  'urbanitzacio-la-llobatera': ['llobatera'],
  'clot-de-navarrete': ['navarrete'],
}

export function foldText(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/['´`']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function amountOf(c: ContractInput): { amount: number; kind: 'final' | 'initial' } | null {
  // Awarded-only universe, SIN IVA — matches the authoritative PLACSP "Importe
  // de adjudicación" headline (contrataciondelestado.es) and the Spanish
  // valor-estimado convention. Non-awarded contracts (open/in-tender/
  // in-progress) are excluded entirely. Prefers the tax-excluded figure; falls
  // back to the tax-included finalAmount only when a row lacks the sin-IVA
  // value (none do today — defensive).
  if (c.status !== 'awarded') return null
  if (typeof c.finalAmountNoTaxes === 'number' && c.finalAmountNoTaxes > 0)
    return { amount: c.finalAmountNoTaxes, kind: 'final' }
  if (typeof c.finalAmount === 'number' && c.finalAmount > 0)
    return { amount: c.finalAmount, kind: 'final' }
  return null
}

function dateOf(c: ContractInput): string | null {
  return c.awardDate || c.startDate || c.formalizedDate || null
}

export function matchContractsToZones(
  contracts: ContractInput[],
  zones: ZoneInput[],
  opts: {
    generatedAt: string
    tendersGeneratedAt?: string | null
    geoGeneratedAt?: string | null
    /** Curator-approved placements (place-overrides.json) keyed by contract id —
     *  win over the deterministic resolver for that contract. */
    overrides?: Record<
      string,
      {
        sourceId: string
        name: string
        kind: PlaceKind
        point: [number, number]
        matchedText: string
      }
    >
  },
  candidates: Candidate[] = [],
): TenderGeoSnapshot {
  const zoneBySlug = new Map(zones.map((z) => [z.slug, z]))
  const agg = new Map<string, TenderGeoZone>()
  const placeAgg = new Map<string, TenderGeoPlace>()
  const assignments: TenderGeoAssignment[] = []
  let totalContracts = 0
  let totalAmount = 0
  let locatedContracts = 0
  let locatedAmount = 0
  let situatedContracts = 0
  let situatedAmount = 0
  let danaContracts = 0
  let danaAmount = 0
  let danaAwardedContracts = 0
  let danaAwardedAmount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  for (const c of contracts) {
    const amt = amountOf(c)
    if (!amt) continue
    totalContracts++
    totalAmount += amt.amount

    const title = c.title || ''
    const folded = foldText(title)
    const dana = DANA_RE.test(folded)
    if (dana) {
      danaAwardedContracts++
      danaAwardedAmount += amt.amount
    }
    // Barrio-alias membership (backward-compatible aggregate for /departamentos
    // + the NeighborhoodsLayer). Kept title-named-only, on the foldText forms.
    const matched: Record<string, string> = {}
    for (const [slug, aliases] of Object.entries(ZONE_ALIASES)) {
      if (!zoneBySlug.has(slug) || aliases.length === 0) continue
      let best = ''
      for (const a of aliases) if (folded.includes(a) && a.length > best.length) best = a
      if (best) matched[slug] = best
    }
    const zoneSlugs = Object.keys(matched)

    // Precise point via a curator override (LLM-suggested, human-approved) if
    // present, else the deterministic resolver (POIs only for works contracts).
    const isWorks = (c.contractType ?? '') === 'construction'
    const override = opts.overrides?.[c.id]
    const place = override
      ? {
          point: override.point,
          kind: override.kind,
          name: override.name,
          matchedText: override.matchedText,
          sourceId: override.sourceId,
        }
      : resolvePlace(foldTitle(title), candidates, { allowPoi: isWorks })

    // A contract reaches the map if it named a barrio (aggregate) OR resolved to
    // a precise point. Contracts that are genuinely non-spatial fall through.
    if (zoneSlugs.length === 0 && !place) continue

    const date = dateOf(c)
    assignments.push({
      id: c.id,
      zones: zoneSlugs,
      matchedAlias: matched,
      dana,
      amount: amt.amount,
      amountKind: amt.kind,
      date,
      contractType: c.contractType ?? null,
      categoryTitle: c.categoryTitle ?? null,
      point: place ? place.point : null,
      place: place
        ? {
            kind: place.kind,
            name: place.name,
            matchedText: place.matchedText,
            sourceId: place.sourceId,
          }
        : null,
    })
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date
      if (!dateMax || date > dateMax) dateMax = date
    }

    // Zone-based located universe (unchanged semantics — CoverageMeter story).
    if (zoneSlugs.length > 0) {
      locatedContracts++
      locatedAmount += amt.amount
      if (dana) {
        danaContracts++
        danaAmount += amt.amount
      }
      for (const slug of zoneSlugs) {
        const z = zoneBySlug.get(slug)!
        const cur = agg.get(slug) ?? {
          slug,
          name: z.name,
          centroid: z.centroid,
          contractCount: 0,
          amount: 0,
          danaAmount: 0,
        }
        cur.contractCount++
        cur.amount += amt.amount
        if (dana) cur.danaAmount += amt.amount
        agg.set(slug, cur)
      }
    }

    // Point-based situated universe (the pin source for the landing map).
    if (place) {
      situatedContracts++
      situatedAmount += amt.amount
      const cur = placeAgg.get(place.sourceId) ?? {
        slug: place.sourceId,
        name: place.name,
        kind: place.kind,
        point: place.point,
        contractCount: 0,
        amount: 0,
        danaAmount: 0,
      }
      cur.contractCount++
      cur.amount += amt.amount
      if (dana) cur.danaAmount += amt.amount
      placeAgg.set(place.sourceId, cur)
    }
  }

  return {
    generatedAt: opts.generatedAt,
    source: { tenders: opts.tendersGeneratedAt ?? null, geo: opts.geoGeneratedAt ?? null },
    universe: {
      totalContracts,
      totalAmount,
      locatedContracts,
      locatedAmount,
      situatedContracts,
      situatedAmount,
      danaContracts,
      danaAmount,
      danaAwardedContracts,
      danaAwardedAmount,
      dateMin,
      dateMax,
    },
    zones: [...agg.values()].sort((a, b) => b.amount - a.amount),
    places: [...placeAgg.values()].sort((a, b) => b.amount - a.amount),
    assignments,
  }
}
