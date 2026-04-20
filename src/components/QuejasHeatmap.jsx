import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useGeo } from '../hooks/useGeo'
import { useQuejas, prettyNeighborhood } from '../hooks/useQuejas'

const RIBA_CENTER = [39.5439, -0.5711]

function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

function Boundary() {
  const { data: geo } = useGeo()
  if (!geo?.boundary?.polygon) return null
  return (
    <Polyline
      positions={geo.boundary.polygon}
      pathOptions={{
        color: '#C85A3A',
        weight: 2,
        opacity: 0.55,
        dashArray: '6 4',
        fill: false,
      }}
    />
  )
}

// Radius scales by sqrt(count) so 1 queja ≠ tiny invisible dot and 100
// doesn't swamp the map. Opacity encodes "health": high silencio rate → red.
function bubbleStyle(count, resolvedPct, silencioPct) {
  const radius = 100 + Math.sqrt(count) * 90 // meters
  let color = '#60A5FA' // civic-blue default
  if (silencioPct >= 30) color = '#DC2626'
  else if (silencioPct >= 10) color = '#D97706'
  else if (resolvedPct >= 50) color = '#16A34A'
  return { radius, color }
}

function computePerNeighborhood(items, neighborhoods) {
  const bySlug = new Map()
  for (const n of neighborhoods ?? []) {
    bySlug.set(n.slug, {
      slug: n.slug,
      name: n.name,
      centroid: n.centroid,
      total: 0,
      resueltas: 0,
      silencios: 0,
      pendientes: 0,
    })
  }
  // Also pick up any barrio slugs in quejas that don't have a geo entry
  // (could happen for ad-hoc labels). They won't render on the map but
  // we avoid crashes.
  for (const q of items ?? []) {
    const slug = q.address_string
    if (!slug) continue
    if (!bySlug.has(slug)) continue
    const agg = bySlug.get(slug)
    agg.total += 1
    if (q.status === 'resuelta') agg.resueltas += 1
    else if (q.status === 'silencio_negativo' || q.status === 'escalada_sindic') agg.silencios += 1
    else agg.pendientes += 1
  }
  return [...bySlug.values()].filter((v) => v.total > 0)
}

export default function QuejasHeatmap() {
  const { data: geo } = useGeo()
  const { data: quejas } = useQuejas()
  const items = quejas?.items ?? []
  const hasData = items.some((q) => q.address_string)
  const perNeighborhood = useMemo(
    () => computePerNeighborhood(items, geo?.neighborhoods),
    [items, geo?.neighborhoods]
  )

  if (!hasData || perNeighborhood.length === 0) return null

  return (
    <div
      style={{
        height: 360,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border2)',
        marginBottom: 14,
      }}
    >
      <MapContainer
        center={RIBA_CENTER}
        zoom={13}
        minZoom={12}
        maxZoom={16}
        scrollWheelZoom={false}
        zoomControl
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <ResizeOnMount />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
        />
        <Boundary />
        {perNeighborhood.map((n) => {
          const resolvedPct = n.total > 0 ? (n.resueltas / n.total) * 100 : 0
          const silencioPct = n.total > 0 ? (n.silencios / n.total) * 100 : 0
          const { radius, color } = bubbleStyle(n.total, resolvedPct, silencioPct)
          return (
            <Circle
              key={n.slug}
              center={n.centroid}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.35,
                weight: 1.5,
                opacity: 0.8,
              }}
            >
              <Tooltip direction="top" sticky>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                  <strong>{prettyNeighborhood(n.name || n.slug)}</strong>
                  <br />
                  {n.total} queja{n.total === 1 ? '' : 's'} ·{' '}
                  <span style={{ color: '#16A34A' }}>✓ {n.resueltas}</span> ·{' '}
                  <span style={{ color: '#2463EB' }}>⏳ {n.pendientes}</span>
                  {n.silencios > 0 && (
                    <>
                      {' '}·{' '}
                      <span style={{ color: '#DC2626' }}>⚠ {n.silencios}</span>
                    </>
                  )}
                </div>
              </Tooltip>
            </Circle>
          )
        })}
      </MapContainer>
    </div>
  )
}
