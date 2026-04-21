/**
 * Parse Overpass-API JSON payloads into normalized geo types:
 *   - `parseOsmBoundary(json)` → municipal boundary polygon + bbox
 *   - `parseOsmNeighborhoods(json)` → list of neighborhoods/suburbs/hamlets
 */

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export interface Boundary {
  id: number
  ineCode: string
  name: string
  polygon: [number, number][] // [lat, lng] in outer-ring order
  bbox: BBox
  centroid: [number, number]
  population?: number
}

export type NeighKind = 'neighbourhood' | 'suburb' | 'quarter' | 'hamlet' | 'village'

export interface Neighborhood {
  id: string
  slug: string
  name: string
  kind: NeighKind
  centroid: [number, number]
  population?: number
}

interface OverpassNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}
interface OverpassWay {
  type: 'way'
  id: number
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}
interface OverpassRelation {
  type: 'relation'
  id: number
  members: Array<
    | { type: 'way'; ref: number; role: string; geometry?: { lat: number; lon: number }[] }
    | { type: 'node'; ref: number; role: string }
  >
  tags?: Record<string, string>
}
interface OverpassResponse {
  elements: Array<OverpassNode | OverpassWay | OverpassRelation>
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function bboxOf(points: [number, number][]): BBox {
  let south = +Infinity,
    north = -Infinity,
    west = +Infinity,
    east = -Infinity
  for (const [lat, lng] of points) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lng < west) west = lng
    if (lng > east) east = lng
  }
  return { south, west, north, east }
}

function centroidOf(points: [number, number][]): [number, number] {
  // Simple average works well enough for irregular municipal boundaries.
  const n = points.length || 1
  let sLat = 0,
    sLng = 0
  for (const [lat, lng] of points) {
    sLat += lat
    sLng += lng
  }
  return [sLat / n, sLng / n]
}

// Stitch outer `way` member geometries into a single ordered loop by
// matching coincident endpoints. Overpass returns member ways in the order
// defined by the relation but the direction may flip way-to-way, so we
// concatenate carefully.
function stitchRelation(rel: OverpassRelation): [number, number][] {
  type Seg = [number, number][]
  const segs: Seg[] = []
  for (const m of rel.members) {
    if (m.type !== 'way' || !('geometry' in m) || !m.geometry) continue
    if (m.role && m.role !== 'outer' && m.role !== '') continue
    segs.push(m.geometry.map((p) => [p.lat, p.lon] as [number, number]))
  }
  if (segs.length === 0) return []
  // Greedy stitching — match endpoints, flip segments as needed.
  const ring: [number, number][] = [...segs[0]]
  const used = new Set<number>([0])
  while (used.size < segs.length) {
    const tail = ring[ring.length - 1]
    let best = -1
    let flipped = false
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue
      const s = segs[i]
      if (s[0][0] === tail[0] && s[0][1] === tail[1]) {
        best = i
        flipped = false
        break
      }
      if (s[s.length - 1][0] === tail[0] && s[s.length - 1][1] === tail[1]) {
        best = i
        flipped = true
        break
      }
    }
    if (best === -1) break
    const s = flipped ? [...segs[best]].reverse() : segs[best]
    ring.push(...s.slice(1)) // drop the shared endpoint
    used.add(best)
  }
  return ring
}

export function parseOsmBoundary(json: string): Boundary | null {
  const data = JSON.parse(json) as OverpassResponse
  const rel = data.elements.find(
    (e): e is OverpassRelation =>
      e.type === 'relation' && e.tags?.['boundary'] === 'administrative'
  )
  if (!rel) return null
  const polygon = stitchRelation(rel)
  if (polygon.length < 4) return null
  const bbox = bboxOf(polygon)
  const centroid = centroidOf(polygon)
  const ine = (rel.tags?.['ine:municipio'] ?? '').trim()
  const pop = rel.tags?.['population']
  return {
    id: rel.id,
    ineCode: ine,
    name: rel.tags?.['name'] || '',
    polygon,
    bbox,
    centroid,
    population: pop ? Number(pop) : undefined,
  }
}

const NEIGH_KINDS = new Set<NeighKind>([
  'neighbourhood',
  'suburb',
  'quarter',
  'hamlet',
  'village',
])

// ─── Railways ───────────────────────────────────────────────────────────────

export type RailwayKind = 'subway' | 'light_rail' | 'tram' | 'rail'

export interface RailwayWay {
  id: string
  kind: RailwayKind
  ref?: string
  name?: string
  operator?: string
  network?: string
  line: [number, number][]  // ordered [lat, lng] path
}

export interface RailwayStation {
  id: string
  name: string
  kind: 'station' | 'halt'
  network?: string
  operator?: string
  centroid: [number, number]
}

export interface RailwayData {
  ways: RailwayWay[]
  stations: RailwayStation[]
}

const RAILWAY_KINDS = new Set<RailwayKind>(['subway', 'light_rail', 'tram', 'rail'])
const ABANDONED_RAIL_TAGS = new Set(['abandoned', 'disused', 'construction', 'razed'])

export function parseOsmRailways(json: string): RailwayData {
  const data = JSON.parse(json) as OverpassResponse
  const ways: RailwayWay[] = []
  const stations: RailwayStation[] = []
  for (const el of data.elements) {
    const tags = el.tags || {}
    if (el.type === 'way') {
      const kind = tags['railway'] as RailwayKind | undefined
      if (!kind || !RAILWAY_KINDS.has(kind)) continue
      if (ABANDONED_RAIL_TAGS.has(tags['railway:abandoned'] ?? '')) continue
      if (!el.geometry || el.geometry.length < 2) continue
      ways.push({
        id: `way-${el.id}`,
        kind,
        ref: tags['ref'],
        name: tags['name'],
        operator: tags['operator'],
        network: tags['network'],
        line: el.geometry.map((p) => [p.lat, p.lon] as [number, number]),
      })
    } else if (el.type === 'node') {
      const rail = tags['railway']
      if (rail !== 'station' && rail !== 'halt') continue
      if (!tags['name']) continue
      stations.push({
        id: `node-${el.id}`,
        name: tags['name'],
        kind: rail,
        network: tags['network'],
        operator: tags['operator'],
        centroid: [el.lat, el.lon],
      })
    }
  }
  return { ways, stations }
}

export function parseOsmNeighborhoods(json: string): Neighborhood[] {
  const data = JSON.parse(json) as OverpassResponse
  const out: Neighborhood[] = []
  const slugSeen = new Set<string>()
  for (const el of data.elements) {
    const tags = el.tags || {}
    const place = tags.place as NeighKind | undefined
    if (!place || !NEIGH_KINDS.has(place)) continue
    const name = tags.name
    if (!name) continue
    let centroid: [number, number] | null = null
    if (el.type === 'node') {
      centroid = [el.lat, el.lon]
    } else if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
      const pts = el.geometry.map((p) => [p.lat, p.lon] as [number, number])
      centroid = centroidOf(pts)
    }
    if (!centroid) continue
    const base = slugify(name)
    let slug = base
    let n = 1
    while (slugSeen.has(slug)) slug = `${base}-${n++}`
    slugSeen.add(slug)
    const pop = tags.population ? Number(tags.population) : undefined
    out.push({
      id: `${el.type}-${el.id}`,
      slug,
      name,
      kind: place,
      centroid,
      population: Number.isFinite(pop as number) ? pop : undefined,
    })
  }
  return out
}
