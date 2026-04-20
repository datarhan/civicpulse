import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

interface GeoNeighborhood {
  id: string
  slug: string
  name: string
  centroid: [number, number]
}

interface GeoSnapshot {
  boundary?: { polygon: [number, number][] }
  neighborhoods?: GeoNeighborhood[]
}

let cached: GeoSnapshot | null = null

function loadGeo(): GeoSnapshot {
  if (cached) return cached
  const path = resolve(HERE, '..', '..', '..', 'public', 'data', 'geo.json')
  try {
    cached = JSON.parse(readFileSync(path, 'utf8')) as GeoSnapshot
  } catch {
    cached = {}
  }
  return cached
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const la1 = toRad(a[0])
  const la2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Match a lat/lng to the closest OSM neighborhood centroid within 2km.
 * Returns null if geo.json is missing or no match is close enough.
 */
export function matchNeighborhood(lat: number, lng: number): string | null {
  const geo = loadGeo()
  if (!geo.neighborhoods || geo.neighborhoods.length === 0) return null
  let best: { slug: string; dist: number } | null = null
  for (const n of geo.neighborhoods) {
    const d = haversine([lat, lng], n.centroid)
    if (!best || d < best.dist) best = { slug: n.slug, dist: d }
  }
  if (!best || best.dist > 2000) return null
  return best.slug
}
