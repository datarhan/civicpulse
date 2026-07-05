/**
 * Pure parser: OSM Overpass JSON → civic points of interest (schools, health,
 * parks, sport, culture, civic buildings) inside Riba-roja. No network, no fs —
 * the CLI (scripts/scrape-civic-poi.ts) owns fetching + writing. Mirrors the
 * geo.ts parser contract. Only NAMED features survive (private backyard pools /
 * unnamed pitches carry no name, so they never reach the map).
 */
import { slugify } from './normalize'

export type PoiCategory = 'educacion' | 'salud' | 'verde' | 'deporte' | 'cultura' | 'civico'

export interface CivicPoi {
  id: string
  name: string
  category: PoiCategory
  kind: string
  lat: number
  lng: number
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}
interface OverpassResponse {
  elements?: OverpassElement[]
}

const AMENITY_CATEGORY: Record<string, PoiCategory> = {
  school: 'educacion',
  kindergarten: 'educacion',
  college: 'educacion',
  university: 'educacion',
  pharmacy: 'salud',
  clinic: 'salud',
  hospital: 'salud',
  doctors: 'salud',
  dentist: 'salud',
  library: 'cultura',
  theatre: 'cultura',
  arts_centre: 'cultura',
  community_centre: 'cultura',
  townhall: 'civico',
  police: 'civico',
  fire_station: 'civico',
  post_office: 'civico',
  courthouse: 'civico',
}

const LEISURE_CATEGORY: Record<string, PoiCategory> = {
  park: 'verde',
  garden: 'verde',
  sports_centre: 'deporte',
  pitch: 'deporte',
  stadium: 'deporte',
  swimming_pool: 'deporte',
  track: 'deporte',
  fitness_centre: 'deporte',
}

/** Map an OSM element's tags onto a civic category, or null if not civic. */
export function categorizePoi(tags: Record<string, string>): PoiCategory | null {
  if (tags.amenity && AMENITY_CATEGORY[tags.amenity]) return AMENITY_CATEGORY[tags.amenity]
  if (tags.leisure && LEISURE_CATEGORY[tags.leisure]) return LEISURE_CATEGORY[tags.leisure]
  if (tags.healthcare) return 'salud'
  if (tags.tourism === 'museum') return 'cultura'
  return null
}

export function parseOsmPoi(json: string): CivicPoi[] {
  const data = JSON.parse(json) as OverpassResponse
  const out: CivicPoi[] = []
  const seen = new Set<string>()
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {}
    const category = categorizePoi(tags)
    if (!category) continue
    const name = tags.name || tags['name:es'] || tags['name:ca']
    if (!name) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    // Dedup a facility mapped as both a node and an area (same name+category).
    const dedupKey = `${category}:${slugify(name)}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    const kind =
      tags.amenity ||
      tags.leisure ||
      tags.healthcare ||
      (tags.tourism === 'museum' ? 'museum' : 'poi')
    out.push({ id: `${el.type}-${el.id}`, name, category, kind, lat, lng })
  }
  // Deterministic order for stable snapshots.
  out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return out
}
