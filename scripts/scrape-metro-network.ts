#!/usr/bin/env tsx
/**
 * Pull the full Metrovalencia + FGV network (all 10 passenger lines,
 * tracks + stations) from OSM Overpass. We query by route-relation so
 * each way + station gets its L-number attached (relations expose
 * `ref=L1..L10`). Stations on multiple lines (interchanges in central
 * València) accumulate a `lineRefs` array.
 *
 * Output: public/data/metro-network.json — loaded by the landing-page
 * map so the user sees the whole network, not just the 3 L9 + 1 L2
 * stops inside Riba-roja municipality.
 *
 * Usage: npm run scrape:metro-network
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/metro-network.json')

const OVERPASS = 'https://overpass-api.de/api/interpreter'

// Route relations (one per line × direction) + their members. `>` recurses
// to pull way geometry; we then re-hit station nodes explicitly because
// Overpass relation-member expansion only gives us the `stop` role nodes.
const NETWORK_QL = `[out:json][timeout:60];
(
  relation["route"~"subway|tram|light_rail"]["network"~"Metrovalencia"];
  relation["route"~"subway|tram|light_rail"]["operator"~"Ferrocarrils de la Generalitat Valenciana"];
);
out body;
>;
out geom tags;`

// Official Metrovalencia brand palette sourced from the public icon SVGs
// at metrovalencia.es/wp-content/themes/metrovalencia/images/lineas.
// Verified 2026-04. If a line is rebranded, re-fetch the SVG and update.
const LINE_COLORS: Record<string, string> = {
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

interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}
interface OsmWay {
  type: 'way'
  id: number
  nodes?: number[]
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}
interface OsmRelation {
  type: 'relation'
  id: number
  members: Array<{ type: 'node' | 'way'; ref: number; role: string }>
  tags?: Record<string, string>
}
type OsmElement = OsmNode | OsmWay | OsmRelation

async function runQuery(ql: string): Promise<string> {
  const body = new URLSearchParams({ data: ql }).toString()
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  if (!res.ok) throw new Error(`Overpass -> HTTP ${res.status}`)
  return res.text()
}

function normaliseRef(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/\b(L|Línea\s*)?(\d+)\b/i)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isFinite(n) || n < 1 || n > 15) return null
  return `L${n}`
}

async function main() {
  console.log('[metro-network] fetching full Metrovalencia network…')
  const raw = await runQuery(NETWORK_QL)
  const data = JSON.parse(raw) as { elements: OsmElement[] }

  const relations = data.elements.filter((e): e is OsmRelation => e.type === 'relation')
  const ways = data.elements.filter((e): e is OsmWay => e.type === 'way')
  const nodes = data.elements.filter((e): e is OsmNode => e.type === 'node')

  const wayById = new Map<number, OsmWay>()
  for (const w of ways) wayById.set(w.id, w)
  const nodeById = new Map<number, OsmNode>()
  for (const n of nodes) nodeById.set(n.id, n)

  // Accumulate line memberships per way + per station.
  const wayLines = new Map<number, Set<string>>()
  const stationLines = new Map<number, Set<string>>()
  const lineMeta = new Map<string, { ref: string; names: Set<string>; color: string }>()

  for (const rel of relations) {
    const tags = rel.tags || {}
    const ref = normaliseRef(tags.ref) || normaliseRef(tags['network:ref'])
    if (!ref) continue
    const name = tags.name || tags['name:es'] || ''
    const meta = lineMeta.get(ref) || {
      ref,
      names: new Set<string>(),
      color: LINE_COLORS[ref] ?? '#64748B',
    }
    if (name) meta.names.add(name)
    lineMeta.set(ref, meta)

    for (const m of rel.members) {
      if (m.type === 'way') {
        const set = wayLines.get(m.ref) || new Set<string>()
        set.add(ref)
        wayLines.set(m.ref, set)
      } else if (
        m.type === 'node' &&
        (m.role === 'stop' || m.role === 'station' || m.role === 'platform')
      ) {
        const set = stationLines.get(m.ref) || new Set<string>()
        set.add(ref)
        stationLines.set(m.ref, set)
      }
    }
  }

  // Emit tracks — one entry per way that has geometry + is part of ≥1 line.
  const tracks: Array<{
    id: string
    kind: string
    lineRefs: string[]
    line: [number, number][]
  }> = []
  for (const [wayId, refs] of wayLines) {
    const w = wayById.get(wayId)
    if (!w || !w.geometry || w.geometry.length < 2) continue
    tracks.push({
      id: `way-${wayId}`,
      kind: w.tags?.railway || 'rail',
      lineRefs: [...refs].sort(),
      line: w.geometry.map((p) => [p.lat, p.lon] as [number, number]),
    })
  }

  // Collect stations by name — OSM often stores separate nodes for each
  // platform at a single station (inbound/outbound), so we merge line refs
  // across same-name nodes and pick a representative centroid (first seen).
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

  // Lines summary, sorted numerically (L1..L10).
  const lines = [...lineMeta.values()]
    .map((m) => ({
      ref: m.ref,
      name: [...m.names][0] || m.ref,
      color: m.color,
    }))
    .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { platform: 'OSM Overpass API', endpoint: OVERPASS },
    lines,
    tracks,
    stations,
    stats: {
      lines: lines.length,
      tracks: tracks.length,
      stations: stations.length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[metro-network] wrote ${OUT}\n` +
      `[metro-network] ${lines.length} lines · ${tracks.length} tracks · ${stations.length} stations`,
  )
}

main().catch((err) => {
  console.error('[metro-network] failed:', err)
  process.exit(1)
})
