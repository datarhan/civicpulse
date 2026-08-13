import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'

// Comarca centre — a sensible initial view before FitBounds runs.
const CENTER = [39.5, -0.54]

/** Fit the map to the plotted points on mount / when they change. */
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) {
      map.fitBounds(
        points.map((p) => p.coord),
        { padding: [26, 26], maxZoom: 11 },
      )
    }
  }, [map, points])
  return null
}

/**
 * Small Leaflet bubble map of open vacancies per comarca municipality. Radius
 * scales with the offer count. Lazy-loaded by EmpleoStats so Leaflet stays out
 * of the base /empleo chunk. Leaflet CSS is loaded globally in index.html.
 */
export default function EmpleoMap({ points, t }) {
  if (!points || points.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--ink50)', padding: '8px 0' }}>
        {t('empleo.mapEmpty')}
      </div>
    )
  }
  const max = Math.max(...points.map((p) => p.count)) || 1
  return (
    <div
      style={{
        height: 280,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border2)',
      }}
    >
      <MapContainer
        center={CENTER}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <FitBounds points={points} />
        {points.map((p) => (
          <CircleMarker
            key={p.name}
            center={p.coord}
            radius={7 + (p.count / max) * 16}
            // Petróleo, no el hex del PP. Atributo SVG: var(--civic) no resuelve.
            pathOptions={{ color: '#0E5B62', fillColor: '#0E5B62', fillOpacity: 0.45, weight: 1.5 }}
          >
            <Tooltip direction="top">
              <strong>{p.name}</strong>: {p.count} {p.count === 1 ? 'oferta' : 'ofertas'}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
