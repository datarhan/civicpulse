/**
 * Curated gazetteer supplement — hand-maintained places the OSM-derived
 * gazetteer (streets.json + civic-poi.json + geo.json barrios) lacks, so the
 * deterministic place-resolver can situate contracts that name them. Mirrors
 * the promises.json discipline: human-edited only, schema-validated on every
 * load, and every point must cite provenance (an OSM object id or an official
 * URL) — a coordinate nobody can verify never reaches the map.
 *
 * Feeding path: supplementToGazetteerInput() maps entries onto the SAME
 * GazetteerInput buckets buildGazetteer() already consumes (pois / streets /
 * zones+zoneAliases), so the resolver's honesty gates apply unchanged. Alias
 * rows share the entry's slug as sourceId — a match via any alias aggregates
 * onto one pin.
 *
 * No network, no fs — callers own IO (compute-tender-geo.ts, scrape-obras.ts).
 */

export const SUPPLEMENT_KINDS = ['poi', 'street', 'urbanizacion'] as const
export type SupplementKind = (typeof SUPPLEMENT_KINDS)[number]

// Riba-roja de Túria bounding box — same fabricated-coordinate guard as
// place-suggestion.ts.
const BBOX = { minLat: 39.4, maxLat: 39.7, minLng: -0.7, maxLng: -0.4 }

export interface SupplementSource {
  osmType?: 'node' | 'way' | 'relation'
  osmId?: number
  url?: string
}

export interface GazetteerSupplementEntry {
  slug: string
  name: string
  kind: SupplementKind
  point: [number, number]
  aliases?: string[]
  source: SupplementSource
  note?: string
}

export interface GazetteerSupplementSnapshot {
  updatedAt: string
  entries: GazetteerSupplementEntry[]
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`gazetteer-supplement: ${msg}`)
}

function mustPoint(p: unknown, where: string): asserts p is [number, number] {
  must(Array.isArray(p) && p.length === 2, `${where}: point must be [lat, lng]`)
  const [lat, lng] = p as [unknown, unknown]
  must(typeof lat === 'number' && typeof lng === 'number', `${where}: point must be numbers`)
  must(
    (lat as number) >= BBOX.minLat &&
      (lat as number) <= BBOX.maxLat &&
      (lng as number) >= BBOX.minLng &&
      (lng as number) <= BBOX.maxLng,
    `${where}: point outside the Riba-roja municipality bbox`,
  )
}

export function validateGazetteerSupplement(
  snap: unknown,
): asserts snap is GazetteerSupplementSnapshot {
  const s = snap as GazetteerSupplementSnapshot
  must(s && typeof s === 'object', 'snapshot must be an object')
  must(typeof s.updatedAt === 'string' && s.updatedAt.length > 0, 'updatedAt required')
  must(Array.isArray(s.entries), 'entries[] required')
  const seen = new Set<string>()
  for (const e of s.entries) {
    const where = `entry "${e?.slug ?? '?'}"`
    must(
      typeof e.slug === 'string' && /^[a-z0-9][a-z0-9-]+$/.test(e.slug),
      `${where}: kebab slug required`,
    )
    must(!seen.has(e.slug), `${where}: duplicate slug`)
    seen.add(e.slug)
    must(
      typeof e.name === 'string' && e.name.trim().length >= 3,
      `${where}: name ≥3 chars required`,
    )
    must(
      (SUPPLEMENT_KINDS as readonly string[]).includes(e.kind as string),
      `${where}: kind must be one of ${SUPPLEMENT_KINDS.join('/')}`,
    )
    mustPoint(e.point, where)
    const src = e.source
    const hasOsm =
      src &&
      typeof src === 'object' &&
      ['node', 'way', 'relation'].includes(src.osmType as string) &&
      typeof src.osmId === 'number' &&
      src.osmId > 0
    const hasUrl =
      src && typeof src === 'object' && typeof src.url === 'string' && /^https?:\/\//.test(src.url)
    must(hasOsm || hasUrl, `${where}: source provenance required (osmType+osmId or url)`)
    if (e.aliases !== undefined) {
      must(Array.isArray(e.aliases), `${where}: aliases must be an array`)
      for (const a of e.aliases) {
        must(typeof a === 'string' && a.trim().length >= 3, `${where}: alias ≥3 chars required`)
      }
    }
    if (e.note !== undefined) must(typeof e.note === 'string', `${where}: note must be a string`)
  }
}

export interface SupplementGazetteerInput {
  streets: Array<{ slug: string; name: string; point: [number, number] }>
  pois: Array<{ id: string; name: string; lat: number; lng: number }>
  zones: Array<{ slug: string; name: string; centroid: [number, number] }>
  zoneAliases: Record<string, string[]>
}

/**
 * Project the supplement onto buildGazetteer's input buckets. Aliases fan out
 * into sibling rows sharing the entry slug (poi/street), or into the zone's
 * alias list (urbanizacion) — same sourceId, one pin.
 */
export function supplementToGazetteerInput(
  snap: GazetteerSupplementSnapshot,
): SupplementGazetteerInput {
  const out: SupplementGazetteerInput = { streets: [], pois: [], zones: [], zoneAliases: {} }
  for (const e of snap.entries) {
    const names = [e.name, ...(e.aliases ?? [])]
    if (e.kind === 'poi') {
      for (const name of names)
        out.pois.push({ id: e.slug, name, lat: e.point[0], lng: e.point[1] })
    } else if (e.kind === 'street') {
      for (const name of names) out.streets.push({ slug: e.slug, name, point: e.point })
    } else {
      out.zones.push({ slug: e.slug, name: e.name, centroid: e.point })
      out.zoneAliases[e.slug] = names
    }
  }
  return out
}
