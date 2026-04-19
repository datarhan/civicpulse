import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import {
  RIBA_ROJA,
  RR_BUDGET_FLOW,
  RR_LANDMARKS,
  RR_NEIGHBORHOODS,
  RR_INCIDENTS_SEED,
} from '../../data/mockData'

// ============================================================================
// Palette
// ============================================================================
const SEV_COLOR = {
  crit: '#F87171',
  warn: '#FBBF24',
  info: '#60A5FA',
  ok: '#4ADE80',
}
const METRO_COLOR = '#F5B544'

function mhsColor(mhs) {
  if (mhs >= 85) return '#16A34A'
  if (mhs >= 80) return '#65A30D'
  if (mhs >= 75) return '#CA8A04'
  if (mhs >= 70) return '#EA580C'
  return '#DC2626'
}

// ============================================================================
// Real geography — Riba-roja features
// ============================================================================
const METRO_L9_TRACK = [
  [39.5355, -0.5595],
  [39.5368, -0.5628],
  [39.5383, -0.5655],
  [39.5395, -0.5680],
  [39.5402, -0.5695],
]
const METRO_STATION = [39.5402, -0.5695]

const CV35_POLYLINE = [
  [39.5580, -0.5870],
  [39.5570, -0.5780],
  [39.5558, -0.5700],
  [39.5548, -0.5620],
  [39.5538, -0.5560],
]
const CV370_POLYLINE = [
  [39.5440, -0.5560],
  [39.5438, -0.5595],
  [39.5432, -0.5630],
  [39.5422, -0.5668],
]

// ============================================================================
// Geometry helpers
// ============================================================================
function haversine(a, b) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const la1 = toRad(a[0])
  const la2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function buildPathSegments(coords) {
  const segs = []
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const len = haversine(coords[i], coords[i + 1])
    segs.push({ from: coords[i], to: coords[i + 1], len, start: total })
    total += len
  }
  return { segs, total }
}

function posAlongPath(pathInfo, t) {
  const target = t * pathInfo.total
  for (const s of pathInfo.segs) {
    if (target >= s.start && target <= s.start + s.len) {
      const k = (target - s.start) / s.len
      return [
        s.from[0] + (s.to[0] - s.from[0]) * k,
        s.from[1] + (s.to[1] - s.from[1]) * k,
      ]
    }
  }
  return pathInfo.segs[pathInfo.segs.length - 1].to
}

// ============================================================================
// Sub-components
// ============================================================================
function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

// --- Neighborhood card: name + MHS score + health ring (breathing pulse)
function NeighborhoodCard({ n }) {
  const color = mhsColor(n.mhs)
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'cp-hood-card',
        html: `
          <div class="cp-hood-wrap">
            <div class="cp-hood-ring" style="border-color:${color};box-shadow:0 0 0 6px ${color}22, 0 4px 14px rgba(0,0,0,.18)">
              <div class="cp-hood-mhs" style="color:${color}">${Math.round(n.mhs)}</div>
            </div>
            <div class="cp-hood-name">${n.name}</div>
          </div>
        `,
        iconSize: [110, 80],
        iconAnchor: [55, 40],
      }),
    [n, color]
  )
  return <Marker position={n.center} icon={icon} interactive={false} />
}

// --- Metro train animated along L9 track
function MetroTrain() {
  const pathInfo = useMemo(() => buildPathSegments(METRO_L9_TRACK), [])
  const [t, setT] = useState(0)

  useEffect(() => {
    const dur = 24000
    const start = performance.now()
    let raf
    const tick = (now) => {
      setT(((now - start) % dur) / dur)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pos = posAlongPath(pathInfo, t)
  return (
    <>
      <CircleMarker
        center={pos}
        radius={14}
        pathOptions={{ color: METRO_COLOR, weight: 0, fillColor: METRO_COLOR, fillOpacity: 0.22 }}
      />
      <CircleMarker
        center={pos}
        radius={7}
        pathOptions={{ color: '#0B0F19', weight: 1.5, fillColor: METRO_COLOR, fillOpacity: 1 }}
      />
    </>
  )
}

// --- Incident pins (pulsing)
function IncidentPin({ incident }) {
  const color = SEV_COLOR[incident.sev] || SEV_COLOR.info
  const big = incident.sev === 'crit'
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'cp-incident',
        html: `
          <div class="cp-incident-wrap">
            <div class="cp-incident-halo" style="background:${color};width:${big ? 32 : 24}px;height:${big ? 32 : 24}px"></div>
            <div class="cp-incident-dot" style="background:${color};width:${big ? 10 : 7}px;height:${big ? 10 : 7}px"></div>
          </div>
        `,
        iconSize: [big ? 32 : 24, big ? 32 : 24],
        iconAnchor: [big ? 16 : 12, big ? 16 : 12],
      }),
    [color, big]
  )
  return <Marker position={incident.pos} icon={icon} interactive={false} />
}

// --- Budget flow particles (animated flow from Ayuntamiento → neighborhoods)
function BudgetParticles({ active, tick }) {
  const map = useMap()
  const groupRef = useRef(null)

  useEffect(() => {
    if (!active) return undefined
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map)
    const group = groupRef.current
    return () => {
      if (group) {
        group.clearLayers()
        map.removeLayer(group)
        groupRef.current = null
      }
    }
  }, [active, map])

  useEffect(() => {
    if (!active || !groupRef.current) return
    const group = groupRef.current
    group.clearLayers()
    const ayto = RR_LANDMARKS.find((l) => l.id === 'ayto').pos
    RR_BUDGET_FLOW.forEach((flow, idx) => {
      const target = RR_NEIGHBORHOODS.find((n) => n.id === flow.to)
      if (!target) return
      const steps = 14
      for (let i = 0; i < steps; i++) {
        const t = ((tick + idx * 2 + i * 1.2) % steps) / steps
        const lat = ayto[0] + (target.center[0] - ayto[0]) * t
        const lng = ayto[1] + (target.center[1] - ayto[1]) * t
        const alpha = Math.sin(t * Math.PI)
        const dot = L.circleMarker([lat, lng], {
          radius: 3 + alpha * 2,
          color: flow.color,
          fillColor: flow.color,
          fillOpacity: 0.85 * alpha,
          weight: 0,
          interactive: false,
        })
        group.addLayer(dot)
      }
    })
  }, [active, tick])

  return null
}

// --- Heat overlay (for 'calor' / 'aire' layers) — simple radial circles
function HeatOverlay({ kind }) {
  if (kind !== 'calor' && kind !== 'aire') return null
  return (
    <>
      {RR_NEIGHBORHOODS.map((n) => {
        let color = n.color
        let opacity = 0.16
        let radius = 260
        if (kind === 'calor') {
          color = mhsColor(n.mhs)
          opacity = 0.22
        } else if (kind === 'aire') {
          color = n.id === 'poligono' ? '#EF4444' : n.id === 'estacio' ? '#FBBF24' : '#16A34A'
          opacity = 0.18
          radius = 300
        }
        return (
          <Circle
            key={n.id + kind}
            center={n.center}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: opacity,
              weight: 0,
              opacity: 0.5,
            }}
          />
        )
      })}
    </>
  )
}

// --- Metro badge (top-right)
function MetroBadge({ now }) {
  const arrival = useMemo(() => {
    const total = now.getMinutes() * 60 + now.getSeconds()
    const cycle = total % 900
    const remaining = 900 - cycle
    return { min: Math.floor(remaining / 60), sec: remaining % 60 }
  }, [now])

  return (
    <div style={{
      position: 'absolute', top: 14, right: 14, padding: '10px 14px',
      background: 'rgba(14,20,34,.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid rgba(245,181,68,.35)', borderRadius: 10, color: 'white',
      fontFamily: "'Outfit', system-ui, sans-serif", display: 'flex', gap: 12, alignItems: 'center', zIndex: 500,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 6, background: METRO_COLOR,
        display: 'grid', placeItems: 'center', fontFamily: "'DM Mono', monospace",
        fontWeight: 800, color: '#0B0F19', fontSize: 14,
      }}>L9</div>
      <div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
          Próximo metro · Riba-roja
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 800, color: METRO_COLOR, lineHeight: 1, minWidth: 46 }}>
            {arrival.min}:{String(arrival.sec).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.55)' }}>desde València Nord</span>
        </div>
      </div>
    </div>
  )
}

// --- Corner attribution
function MapAttribution() {
  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 16,
      fontFamily: "'DM Mono', monospace", fontSize: 9,
      color: 'rgba(11,15,25,.45)', letterSpacing: '.08em',
      textTransform: 'uppercase', zIndex: 400, pointerEvents: 'none',
    }}>
      OSM · CARTO Voyager · L9 MetroValencia
    </div>
  )
}

// ============================================================================
// Main
// ============================================================================
export default function StylizedMap({ incidents = RR_INCIDENTS_SEED, layer = 'incidencias', now }) {
  const [budgetTick, setBudgetTick] = useState(0)

  useEffect(() => {
    if (layer !== 'flujo') return undefined
    const id = setInterval(() => setBudgetTick((x) => (x + 1) % 1000), 100)
    return () => clearInterval(id)
  }, [layer])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EFE9D9' }}>
      <MapContainer
        center={RIBA_ROJA.center}
        zoom={14}
        minZoom={13}
        maxZoom={17}
        className="cp-stylized-map"
        zoomControl
        scrollWheelZoom
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        worldCopyJump={false}
      >
        <ResizeOnMount />

        {/* Clean warm daytime base */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          attribution=''
        />

        {/* Heat overlay (only when selected layer) */}
        <HeatOverlay kind={layer} />

        {/* Highway accents */}
        <Polyline
          positions={CV35_POLYLINE}
          pathOptions={{ color: '#F5B544', weight: 4, opacity: 0.55, dashArray: '8 5', lineCap: 'round' }}
        />
        <Polyline
          positions={CV370_POLYLINE}
          pathOptions={{ color: '#F5B544', weight: 3, opacity: 0.5, dashArray: '8 5', lineCap: 'round' }}
        />

        {/* Metro L9 track */}
        <Polyline
          positions={METRO_L9_TRACK}
          pathOptions={{ color: METRO_COLOR, weight: 9, opacity: 0.2, lineCap: 'round' }}
        />
        <Polyline
          positions={METRO_L9_TRACK}
          pathOptions={{ color: METRO_COLOR, weight: 2.5, opacity: 0.9, lineCap: 'round' }}
        />
        <CircleMarker
          center={METRO_STATION}
          radius={8}
          pathOptions={{ color: '#0B0F19', weight: 2, fillColor: METRO_COLOR, fillOpacity: 1 }}
        />

        {/* Animated metro train */}
        <MetroTrain />

        {/* Budget flow particles (when layer = flujo) */}
        <BudgetParticles active={layer === 'flujo'} tick={budgetTick} />

        {/* Neighborhood cards with MHS scores */}
        {RR_NEIGHBORHOODS.map((n) => (
          <NeighborhoodCard key={n.id} n={n} />
        ))}

        {/* Incident pins */}
        {(layer === 'incidencias' || layer === 'calor') &&
          incidents.map((inc) => <IncidentPin key={inc.id} incident={inc} />)}
      </MapContainer>

      <MetroBadge now={now} />
      <MapAttribution />
    </div>
  )
}
