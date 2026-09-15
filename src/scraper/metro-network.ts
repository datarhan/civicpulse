/**
 * La red completa del mapa de la portada: Metrovalencia, y sólo Metrovalencia.
 *
 * El parseo vivía dentro de `scripts/scrape-metro-network.ts`. La consulta a Overpass
 * pide las relaciones con `network~Metrovalencia` o con `operator~FGV`, y FGV opera
 * también el TRAM d'Alacant. Con las refs chocando (L1–L5 y L9), la leyenda titulaba
 * líneas de València con nombres del TRAM y el snapshot publicaba las estaciones de
 * Alicante como parte de la red. Medido el 15-09-2026: ninguna relación de una de las
 * dos redes cruza la latitud 39,0, que queda entre Dénia y Castelló.
 *
 * La consulta conserva las dos cláusulas —una relación de València sin `network`
 * todavía puede entrar por su geografía—, y lo que se descarta queda contado en
 * `ambito`: una ejecución tiene que poder decir qué dejó fuera y por qué.
 *
 * Puro: sin red y sin disco.
 */

/** Entre Dénia (TRAM d'Alacant, 38,84) y Castelló (Metrovalencia, 39,08). */
export const LIMITE_SUR_METROVALENCIA = 39.0
export const RED_METROVALENCIA = 'Metrovalencia'

// Official Metrovalencia brand palette sourced from the public icon SVGs
// at metrovalencia.es/wp-content/themes/metrovalencia/images/lineas.
// Verified 2026-04. If a line is rebranded, re-fetch the SVG and update.
export const LINE_COLORS: Record<string, string> = {
  L1: '#E4BE36',
  L2: '#B4397F',
  L3: '#B11D2F',
  L4: '#2B498B',
  L5: '#4E886D',
  L6: '#817FB3',
  L7: '#CE7D28',
  L8: '#96C4DA',
  L9: '#A47E52',
  L10: '#B6DD79',
}

export interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}
export interface OsmWay {
  type: 'way'
  id: number
  nodes?: number[]
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}
export interface OsmRelation {
  type: 'relation'
  id: number
  members: Array<{ type: 'node' | 'way'; ref: number; role: string }>
  tags?: Record<string, string>
}
export type OsmElement = OsmNode | OsmWay | OsmRelation

export function normaliseRef(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/\b(L|Línea\s*)?(\d+)\b/i)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isFinite(n) || n < 1 || n > 15) return null
  return `L${n}`
}

export type MotivoAmbito = 'network' | 'geografia' | 'otra-red' | 'al-sur' | 'sin-geometria'

export interface Ambito {
  dentro: boolean
  por: MotivoAmbito
  network: string | null
}

const esMetrovalencia = (network: string) => /^metro\s?valencia$/i.test(network.trim())

/** Si una relación de ruta entra en la red del mapa, y por qué. */
export function ambitoDeLaRelacion(
  rel: OsmRelation,
  ways: Map<number, OsmWay>,
  nodes: Map<number, OsmNode>,
): Ambito {
  const network = rel.tags?.network?.trim() || null
  if (network && !esMetrovalencia(network)) return { dentro: false, por: 'otra-red', network }
  const lats: number[] = []
  for (const m of rel.members) {
    if (m.type === 'way') for (const p of ways.get(m.ref)?.geometry ?? []) lats.push(p.lat)
    else {
      const n = nodes.get(m.ref)
      if (n) lats.push(n.lat)
    }
  }
  if (lats.length === 0) return { dentro: false, por: 'sin-geometria', network }
  // Una etiqueta bien puesta no mete Alicante en el mapa si la geometría dice otra cosa.
  if (lats.some((lat) => lat < LIMITE_SUR_METROVALENCIA)) {
    return { dentro: false, por: 'al-sur', network }
  }
  return { dentro: true, por: network ? 'network' : 'geografia', network }
}

export interface LineaMetro {
  ref: string
  name: string
  color: string
  /** Las `network` de las relaciones que forman la línea, tal como vienen etiquetadas. */
  networks: string[]
}
export interface ViaMetro {
  id: string
  kind: string
  lineRefs: string[]
  line: [number, number][]
}
export interface EstacionMetro {
  id: string
  name: string
  lineRefs: string[]
  centroid: [number, number]
}
export interface ExclusionAmbito {
  por: MotivoAmbito
  network: string | null
  relaciones: number
  refs: string[]
}
export interface RedMetro {
  lines: LineaMetro[]
  tracks: ViaMetro[]
  stations: EstacionMetro[]
  ambito: {
    red: string
    limiteSur: number
    relaciones: {
      consultadas: number
      incluidas: number
      sinRef: number
      excluidas: ExclusionAmbito[]
    }
  }
}

// OSM route relations routinely include platform ways (railway=platform, closed
// polygons representing station footprints) and occasionally access nodes; we only
// want actual running track.
const TRACK_KINDS = new Set(['subway', 'light_rail', 'tram', 'rail', 'monorail', 'narrow_gauge'])
const ROLES_DE_PARADA = new Set(['stop', 'station', 'platform'])
const porNumeroDeLinea = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1))

export function parseMetroNetwork(raw: { elements: OsmElement[] }): RedMetro {
  const elements = raw?.elements
  if (!Array.isArray(elements)) throw new Error('respuesta de Overpass sin «elements»')

  const relations = elements.filter((e): e is OsmRelation => e.type === 'relation')
  const wayById = new Map<number, OsmWay>()
  const nodeById = new Map<number, OsmNode>()
  for (const e of elements) {
    if (e.type === 'way') wayById.set(e.id, e)
    else if (e.type === 'node') nodeById.set(e.id, e)
  }

  // Accumulate line memberships per way + per station, over the relations in scope.
  const wayLines = new Map<number, Set<string>>()
  const stationLines = new Map<number, Set<string>>()
  const lineMeta = new Map<
    string,
    { ref: string; names: string[]; networks: Set<string>; color: string }
  >()
  const excluidas = new Map<string, ExclusionAmbito>()
  let incluidas = 0
  let sinRef = 0

  for (const rel of relations) {
    const tags = rel.tags || {}
    const ref = normaliseRef(tags.ref) || normaliseRef(tags['network:ref'])
    const ambito = ambitoDeLaRelacion(rel, wayById, nodeById)
    if (!ambito.dentro) {
      const clave = `${ambito.por}|${ambito.network ?? ''}`
      const e = excluidas.get(clave) ?? {
        por: ambito.por,
        network: ambito.network,
        relaciones: 0,
        refs: [],
      }
      e.relaciones += 1
      if (ref && !e.refs.includes(ref)) e.refs.push(ref)
      excluidas.set(clave, e)
      continue
    }
    if (!ref) {
      sinRef += 1
      continue
    }
    incluidas += 1

    const name = tags.name || tags['name:es'] || ''
    const meta = lineMeta.get(ref) || {
      ref,
      names: [],
      networks: new Set<string>(),
      color: LINE_COLORS[ref] ?? '#64748B',
    }
    if (name && !meta.names.includes(name)) meta.names.push(name)
    // Sólo la etiqueta que trae: una relación que entró por geografía no se inventa red.
    if (ambito.network) meta.networks.add(ambito.network)
    lineMeta.set(ref, meta)

    for (const m of rel.members) {
      if (m.type === 'way') {
        const set = wayLines.get(m.ref) || new Set<string>()
        set.add(ref)
        wayLines.set(m.ref, set)
      } else if (m.type === 'node' && ROLES_DE_PARADA.has(m.role)) {
        const set = stationLines.get(m.ref) || new Set<string>()
        set.add(ref)
        stationLines.set(m.ref, set)
      }
    }
  }

  // Tracks: one entry per track-carrying way that has geometry and is part of ≥1 line.
  const tracks: ViaMetro[] = []
  for (const [wayId, refs] of wayLines) {
    const w = wayById.get(wayId)
    if (!w || !w.geometry || w.geometry.length < 2) continue
    const kind = w.tags?.railway
    if (!kind || !TRACK_KINDS.has(kind)) continue
    tracks.push({
      id: `way-${wayId}`,
      kind,
      lineRefs: [...refs].sort(),
      line: w.geometry.map((p) => [p.lat, p.lon] as [number, number]),
    })
  }

  // Stations by name — OSM often stores separate nodes for each platform at a single
  // station (inbound/outbound), so line refs merge across same-name nodes, with the
  // first node seen as the centroid. Only nodes of relations in scope reach this.
  const stationsByName = new Map<
    string,
    { id: string; name: string; lineRefs: Set<string>; centroid: [number, number] }
  >()
  for (const [nodeId, refs] of stationLines) {
    const n = nodeById.get(nodeId)
    if (!n) continue
    const name = n.tags?.name || n.tags?.['name:es']
    if (!name) continue
    const existing = stationsByName.get(name)
    if (existing) {
      for (const r of refs) existing.lineRefs.add(r)
    } else {
      stationsByName.set(name, {
        id: `node-${nodeId}`,
        name,
        lineRefs: new Set(refs),
        centroid: [n.lat, n.lon],
      })
    }
  }
  const stations = [...stationsByName.values()].map((s) => ({
    id: s.id,
    name: s.name,
    lineRefs: [...s.lineRefs].sort(),
    centroid: s.centroid,
  }))

  const lines = [...lineMeta.values()]
    .map((m) => ({
      ref: m.ref,
      name: m.names[0] || m.ref,
      color: m.color,
      networks: [...m.networks].sort(),
    }))
    .sort((a, b) => porNumeroDeLinea(a.ref, b.ref))

  return {
    lines,
    tracks,
    stations,
    ambito: {
      red: RED_METROVALENCIA,
      limiteSur: LIMITE_SUR_METROVALENCIA,
      relaciones: {
        consultadas: relations.length,
        incluidas,
        sinRef,
        excluidas: [...excluidas.values()]
          .map((e) => ({ ...e, refs: [...e.refs].sort(porNumeroDeLinea) }))
          .sort((a, b) => b.relaciones - a.relaciones),
      },
    },
  }
}

/** La forma mínima que se comprueba, para poder leer también un snapshot anterior. */
export interface RedParaComprobar {
  lines: Array<{ ref: string; name: string; networks?: string[] }>
  tracks: Array<{ id: string; line: [number, number][] }>
  stations: Array<{ name: string; centroid: [number, number] }>
}

/** Lo que no puede estar en la red publicada. Vacío cuando está limpia. */
export function violacionesDeAmbito(red: RedParaComprobar): string[] {
  const v: string[] = []
  for (const s of red.stations ?? []) {
    if (s.centroid[0] < LIMITE_SUR_METROVALENCIA) {
      v.push(`estación al sur del límite: ${s.name} (${s.centroid[0]})`)
    }
  }
  for (const t of red.tracks ?? []) {
    if (t.line.some(([lat]) => lat < LIMITE_SUR_METROVALENCIA)) {
      v.push(`vía con puntos al sur del límite: ${t.id}`)
    }
  }
  for (const l of red.lines ?? []) {
    if (!Array.isArray(l.networks) || l.networks.length === 0) v.push(`línea sin red: ${l.ref}`)
    else
      for (const n of l.networks)
        if (!esMetrovalencia(n)) v.push(`línea ${l.ref} de otra red: ${n}`)
    if (/\bTRAM\b/.test(l.name)) v.push(`línea ${l.ref} con nombre del TRAM: ${l.name}`)
  }
  return v
}
