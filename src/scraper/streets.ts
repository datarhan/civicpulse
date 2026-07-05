/**
 * Pure parser: OSM Overpass JSON → a street/camino gazetteer for Riba-roja.
 * No network, no fs — the CLI (scripts/scrape-streets.ts) owns fetch + write.
 * Mirrors the geo.ts / civic-poi.ts parser contract.
 *
 * This feeds the tender place-resolver: contract titles that name a street
 * ("Reforma en C/ Mayor 37", "asfalto en Camino els Pagos") get placed at the
 * street's representative point. We keep only NAMED ways, merge the many OSM
 * segments of one street into a single entry (deduped by accent/case-folded
 * name), and expose a point that lies ON the street (the middle vertex of its
 * longest segment) rather than a bounding-box centroid that could fall off-road.
 */
import { slugify, stripDiacritics } from './normalize'

export type StreetKind = 'calle' | 'camino' | 'carretera' | 'avenida' | 'plaza'

export interface Street {
  id: string
  name: string
  slug: string
  kind: StreetKind
  point: [number, number]
}

interface OverpassGeom {
  lat: number
  lon: number
}
interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  geometry?: OverpassGeom[]
}
interface OverpassResponse {
  elements?: OverpassElement[]
}

const HIGHWAY_KINDS = new Set([
  'residential',
  'living_street',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'service',
  'track',
  'pedestrian',
])

/** Accent/case/punctuation-folded form used for grouping + prefix detection. */
function fold(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Street kind from the name prefix (Spanish/Valencian), else the highway tag. */
export function classifyStreet(name: string, highway: string): StreetKind {
  const f = fold(name)
  if (/^(avinguda|avenida|avda|av) /.test(f)) return 'avenida'
  if (/^(placa|plaza|pl) /.test(f)) return 'plaza'
  if (/^(cami|camino) /.test(f) || /^(cami|camino)$/.test(f)) return 'camino'
  if (/^(carretera|ctra|cv) /.test(f)) return 'carretera'
  if (highway === 'track') return 'camino'
  if (highway === 'primary' || highway === 'secondary' || highway === 'trunk') return 'carretera'
  return 'calle'
}

/** Middle vertex of a way's polyline — a point guaranteed to lie on the street. */
function midpoint(geom: OverpassGeom[]): [number, number] {
  const p = geom[Math.floor(geom.length / 2)]
  return [p.lat, p.lon]
}

interface Group {
  name: string
  highway: string
  wayId: number
  len: number
  geom: OverpassGeom[]
}

export function parseOsmStreets(json: string): Street[] {
  const data = JSON.parse(json) as OverpassResponse
  const groups = new Map<string, Group>()

  for (const el of data.elements || []) {
    if (el.type !== 'way') continue
    const tags = el.tags || {}
    const highway = tags.highway
    const name = tags.name
    if (!highway || !HIGHWAY_KINDS.has(highway) || !name) continue
    if (!el.geometry || el.geometry.length < 2) continue

    const key = fold(name)
    if (!key) continue
    const len = el.geometry.length
    const existing = groups.get(key)
    // Keep the longest segment per name — its midpoint is the most central
    // on-street point, and its raw name spelling becomes the display name.
    if (!existing || len > existing.len) {
      groups.set(key, { name, highway, wayId: el.id, len, geom: el.geometry })
    }
  }

  const out: Street[] = []
  const slugSeen = new Set<string>()
  for (const g of groups.values()) {
    const base = slugify(g.name)
    let slug = base || `street-${g.wayId}`
    let n = 1
    while (slugSeen.has(slug)) slug = `${base}-${n++}`
    slugSeen.add(slug)
    out.push({
      id: `way-${g.wayId}`,
      name: g.name,
      slug,
      kind: classifyStreet(g.name, g.highway),
      point: midpoint(g.geom),
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return out
}
