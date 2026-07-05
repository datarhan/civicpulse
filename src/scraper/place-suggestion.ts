/**
 * Schemas + validators for the LLM place-geocode subsystem — the 3-layer
 * suggestion→override contract that mirrors promises → promise-suggestions and
 * pleno-claims → pleno-findings:
 *
 *  1. Deterministic resolver (place-resolver.ts) — authoritative, auto-published.
 *  2. place-suggestions.json — MACHINE-WRITTEN. Every row `requiresHumanApproval:
 *     true`. NEVER rendered on the public map. The LLM only ever extracts a place
 *     NAME; the coordinate is looked up in our gazetteer (matchNameToGazetteer),
 *     so no fabricated points reach even the suggestion file.
 *  3. place-overrides.json — CURATOR-PROMOTED. What compute-tender-geo applies to
 *     the map. The shape FORBIDS `requiresHumanApproval` (defense in depth).
 *
 * No network, no fs — the CLIs own IO. These validators re-check the whole
 * snapshot before any write, so an invariant can never silently slip.
 */

export const ALLOWED_PLACE_KINDS = ['poi', 'street', 'urbanizacion', 'barrio'] as const
export type PlaceKind = (typeof ALLOWED_PLACE_KINDS)[number]

// Riba-roja de Túria bounding box — every point must sit inside the municipality.
const BBOX = { minLat: 39.4, maxLat: 39.7, minLng: -0.7, maxLng: -0.4 }

export interface PlaceMatchRef {
  sourceId: string
  name: string
  kind: PlaceKind
  point: [number, number]
}

export interface PlaceSuggestion {
  contractId: string
  title: string
  amount: number
  date: string | null
  /** The place name the LLM read out of the title (fuzzy / cross-language). */
  llmPlaceName: string
  confidence: number
  reasoning: string
  /** The gazetteer entry the name resolved to — the point is ALWAYS from here. */
  match: PlaceMatchRef
  requiresHumanApproval: true
}

export interface PlaceSuggestionsSnapshot {
  generatedAt: string
  promptVersion: string
  backend: string | null
  stats: {
    candidatesScanned: number
    suggested: number
    unmatched: number
    lowConfidence: number
  }
  suggestions: PlaceSuggestion[]
}

export interface PlaceOverride {
  contractId: string
  sourceId: string
  name: string
  kind: PlaceKind
  point: [number, number]
  matchedText: string
  curator: string
  approvedAt: string
  note?: string
}

export interface PlaceOverridesSnapshot {
  generatedAt: string
  overrides: PlaceOverride[]
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[place-suggestion] ${msg}`)
}

function validPoint(p: unknown, where: string): asserts p is [number, number] {
  must(Array.isArray(p) && p.length === 2, `${where}: point must be [lat, lng]`)
  const [lat, lng] = p as [unknown, unknown]
  must(typeof lat === 'number' && typeof lng === 'number', `${where}: point must be numbers`)
  must(
    (lat as number) >= BBOX.minLat &&
      (lat as number) <= BBOX.maxLat &&
      (lng as number) >= BBOX.minLng &&
      (lng as number) <= BBOX.maxLng,
    `${where}: point ${JSON.stringify(p)} outside the Riba-roja bbox`,
  )
}

function validKind(k: unknown, where: string): asserts k is PlaceKind {
  must(
    typeof k === 'string' && (ALLOWED_PLACE_KINDS as readonly string[]).includes(k),
    `${where}: kind "${String(k)}" not in ${ALLOWED_PLACE_KINDS.join('|')}`,
  )
}

/** Throws on any invariant violation; returns the snapshot on success. */
export function validatePlaceSuggestions(snap: PlaceSuggestionsSnapshot): PlaceSuggestionsSnapshot {
  must(snap && Array.isArray(snap.suggestions), 'suggestions[] required')
  must(typeof snap.generatedAt === 'string' && snap.generatedAt.length > 0, 'generatedAt required')
  must(
    typeof snap.promptVersion === 'string' && snap.promptVersion.length > 0,
    'promptVersion required',
  )
  const seen = new Set<string>()
  for (const s of snap.suggestions) {
    const w = `suggestion ${s.contractId}`
    must(typeof s.contractId === 'string' && s.contractId.length > 0, `${w}: contractId required`)
    must(!seen.has(s.contractId), `${w}: duplicate contractId`)
    seen.add(s.contractId)
    must(typeof s.title === 'string' && s.title.length >= 3, `${w}: title too short`)
    must(
      typeof s.llmPlaceName === 'string' && s.llmPlaceName.trim().length >= 2,
      `${w}: llmPlaceName too short`,
    )
    must(typeof s.reasoning === 'string' && s.reasoning.length >= 5, `${w}: reasoning too short`)
    must(
      typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1,
      `${w}: confidence out of range`,
    )
    must(
      s.match && typeof s.match.sourceId === 'string' && s.match.sourceId.length > 0,
      `${w}: match.sourceId required`,
    )
    must(typeof s.match.name === 'string' && s.match.name.length > 0, `${w}: match.name required`)
    validKind(s.match.kind, `${w}.match`)
    validPoint(s.match.point, `${w}.match`)
    // Machine-written: the human-approval flag is mandatory and literally true.
    must(s.requiresHumanApproval === true, `${w}: requiresHumanApproval must be true`)
  }
  return snap
}

/** Throws on any invariant violation; returns the snapshot on success. */
export function validatePlaceOverrides(snap: PlaceOverridesSnapshot): PlaceOverridesSnapshot {
  must(snap && Array.isArray(snap.overrides), 'overrides[] required')
  const seen = new Set<string>()
  for (const o of snap.overrides) {
    const w = `override ${o.contractId}`
    must(typeof o.contractId === 'string' && o.contractId.length > 0, `${w}: contractId required`)
    must(!seen.has(o.contractId), `${w}: duplicate contractId`)
    seen.add(o.contractId)
    must(typeof o.sourceId === 'string' && o.sourceId.length > 0, `${w}: sourceId required`)
    must(typeof o.name === 'string' && o.name.length > 0, `${w}: name required`)
    validKind(o.kind, w)
    validPoint(o.point, w)
    must(
      typeof o.matchedText === 'string' && o.matchedText.length > 0,
      `${w}: matchedText required`,
    )
    must(typeof o.curator === 'string' && o.curator.trim().length > 0, `${w}: curator required`)
    must(
      typeof o.approvedAt === 'string' && !Number.isNaN(Date.parse(o.approvedAt)),
      `${w}: approvedAt must be ISO`,
    )
    // Defense in depth: the curated shape must never carry the machine flag.
    must(
      !('requiresHumanApproval' in (o as object)),
      `${w}: overrides must not carry requiresHumanApproval`,
    )
  }
  return snap
}

/** Build a curator override from an approved suggestion (never carries the machine flag). */
export function overrideFromSuggestion(
  s: PlaceSuggestion,
  curator: string,
  approvedAt: string,
  note?: string,
): PlaceOverride {
  const ov: PlaceOverride = {
    contractId: s.contractId,
    sourceId: s.match.sourceId,
    name: s.match.name,
    kind: s.match.kind,
    point: s.match.point,
    matchedText: s.match.name,
    curator,
    approvedAt,
  }
  if (note) ov.note = note
  return ov
}
