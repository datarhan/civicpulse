import { stripDiacritics } from './normalize'

export interface ContractInput {
  id: string
  title: string
  status?: string
  finalAmount?: number
  initialAmount?: number
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
}
export interface TenderGeoZone {
  slug: string
  name: string
  centroid: [number, number]
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
    danaContracts: number
    danaAmount: number
    danaAwardedContracts: number
    danaAwardedAmount: number
    dateMin: string | null
    dateMax: string | null
  }
  zones: TenderGeoZone[]
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
  // Awarded-only universe: matches the page's "€16.3M adjudicado" headline.
  // Non-awarded contracts (open/in-tender/in-progress) are excluded entirely.
  if (c.status === 'awarded' && typeof c.finalAmount === 'number' && c.finalAmount > 0)
    return { amount: c.finalAmount, kind: 'final' }
  return null
}

function dateOf(c: ContractInput): string | null {
  return c.awardDate || c.startDate || c.formalizedDate || null
}

export function matchContractsToZones(
  contracts: ContractInput[],
  zones: ZoneInput[],
  opts: { generatedAt: string; tendersGeneratedAt?: string | null; geoGeneratedAt?: string | null },
): TenderGeoSnapshot {
  const zoneBySlug = new Map(zones.map((z) => [z.slug, z]))
  const agg = new Map<string, TenderGeoZone>()
  const assignments: TenderGeoAssignment[] = []
  let totalContracts = 0
  let totalAmount = 0
  let locatedAmount = 0
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

    const folded = foldText(c.title || '')
    const dana = DANA_RE.test(folded)
    if (dana) {
      danaAwardedContracts++
      danaAwardedAmount += amt.amount
    }
    const matched: Record<string, string> = {}
    for (const [slug, aliases] of Object.entries(ZONE_ALIASES)) {
      if (!zoneBySlug.has(slug) || aliases.length === 0) continue
      let best = ''
      for (const a of aliases) if (folded.includes(a) && a.length > best.length) best = a
      if (best) matched[slug] = best
    }
    const zoneSlugs = Object.keys(matched)
    if (zoneSlugs.length === 0) continue

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
    })
    locatedAmount += amt.amount
    if (dana) {
      danaContracts++
      danaAmount += amt.amount
    }
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date
      if (!dateMax || date > dateMax) dateMax = date
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

  return {
    generatedAt: opts.generatedAt,
    source: { tenders: opts.tendersGeneratedAt ?? null, geo: opts.geoGeneratedAt ?? null },
    universe: {
      totalContracts,
      totalAmount,
      locatedContracts: assignments.length,
      locatedAmount,
      danaContracts,
      danaAmount,
      danaAwardedContracts,
      danaAwardedAmount,
      dateMin,
      dateMax,
    },
    zones: [...agg.values()].sort((a, b) => b.amount - a.amount),
    assignments,
  }
}
