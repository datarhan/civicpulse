/**
 * Parse a Wikidata entity JSON (Special:EntityData/<QID>.json) into a flat
 * municipal facts record — INE / OSM / GeoNames / INSPIRE identifiers,
 * elevation, area, coordinates, images.
 */

export interface WikidataFacts {
  qid: string
  label: string
  description: string | null
  coordinates: { lat: number; lng: number } | null
  elevation: number | null
  areaKm2: number | null
  population: { value: number; year: number | null } | null
  identifiers: {
    ine: string | null
    inspire: string | null
    osmRelation: string | null
    geonames: string | null
    commonsCat: string | null
  }
  images: {
    image: string | null
    flag: string | null
    coatOfArms: string | null
  }
}

interface WDEntity {
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<
    string,
    Array<{
      mainsnak?: {
        datavalue?: {
          value: unknown
          type?: string
        }
      }
      qualifiers?: Record<
        string,
        Array<{ datavalue?: { value: unknown; type?: string } }>
      >
    }>
  >
}

function valueOf<T = any>(
  entity: WDEntity,
  prop: string,
  pick: (v: any) => T | null
): T | null {
  const claims = entity.claims?.[prop]
  if (!claims) return null
  for (const c of claims) {
    const v = c.mainsnak?.datavalue?.value
    if (v === undefined || v === null) continue
    const out = pick(v)
    if (out !== null && out !== undefined) return out
  }
  return null
}

function commonsFileUrl(name: string): string {
  const safe = name.replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(safe)}`
}

export function parseWikidataEntity(json: string): WikidataFacts | null {
  const data = JSON.parse(json)
  const entity = Object.values((data.entities ?? {}) as Record<string, WDEntity>)[0] as
    | WDEntity
    | undefined
  if (!entity) return null
  const qid = Object.keys(data.entities)[0]

  const label = entity.labels?.es?.value ?? entity.labels?.ca?.value ?? entity.labels?.en?.value ?? qid
  const description =
    entity.descriptions?.es?.value ?? entity.descriptions?.en?.value ?? null

  const coord = valueOf(entity, 'P625', (v: any) => {
    if (typeof v?.latitude === 'number' && typeof v?.longitude === 'number') {
      return { lat: v.latitude, lng: v.longitude }
    }
    return null
  })

  const elevation = valueOf(entity, 'P2044', (v: any) => {
    const n = parseFloat(String(v?.amount ?? '').replace(/^\+/, ''))
    return Number.isFinite(n) ? n : null
  })

  const areaKm2 = valueOf(entity, 'P2046', (v: any) => {
    const n = parseFloat(String(v?.amount ?? '').replace(/^\+/, ''))
    if (!Number.isFinite(n)) return null
    // Wikidata area unit varies; for municipalities it's usually km². Guard
    // against m² by rescaling if implausibly large.
    return n > 10_000 ? n / 1_000_000 : n
  })

  // Population (P1082) with year qualifier P585.
  let population: WikidataFacts['population'] = null
  const popClaims = entity.claims?.['P1082'] ?? []
  for (const c of popClaims) {
    const v: any = c.mainsnak?.datavalue?.value
    const amt = parseFloat(String(v?.amount ?? '').replace(/^\+/, ''))
    if (!Number.isFinite(amt)) continue
    const q = c.qualifiers?.['P585']?.[0]?.datavalue?.value as any
    const timeStr = q?.time as string | undefined
    const year = timeStr ? parseInt(timeStr.match(/\d{4}/)?.[0] ?? '', 10) : null
    if (!population || (year && year > (population.year ?? -Infinity))) {
      population = { value: amt, year: year || null }
    }
  }

  const ine = valueOf(entity, 'P772', (v: any) => (typeof v === 'string' ? v : null))
  const inspire = valueOf(entity, 'P4547', (v: any) => (typeof v === 'string' ? v : null))
  const osmRelation = valueOf(entity, 'P402', (v: any) =>
    typeof v === 'string' ? v : null
  )
  const geonames = valueOf(entity, 'P1566', (v: any) =>
    typeof v === 'string' ? v : null
  )
  const commonsCat = valueOf(entity, 'P373', (v: any) =>
    typeof v === 'string' ? v : null
  )

  // Images
  const image = valueOf(entity, 'P18', (v: any) => (typeof v === 'string' ? commonsFileUrl(v) : null))
  const flag = valueOf(entity, 'P41', (v: any) => (typeof v === 'string' ? commonsFileUrl(v) : null))
  const coat = valueOf(entity, 'P94', (v: any) => (typeof v === 'string' ? commonsFileUrl(v) : null))

  return {
    qid,
    label,
    description,
    coordinates: coord,
    elevation,
    areaKm2,
    population,
    identifiers: {
      ine,
      inspire,
      osmRelation,
      geonames,
      commonsCat,
    },
    images: {
      image,
      flag,
      coatOfArms: coat,
    },
  }
}
