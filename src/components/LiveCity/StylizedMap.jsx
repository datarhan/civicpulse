// @ts-check
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../hooks/useGeo'

// Metrovalencia L9 light-rail colour (close to their brand palette); Adif
// heavy-rail uses a muted grey so it reads as secondary. Stations share the
// metro colour with a dark stroke for contrast against cream tiles.
const METRO_COLOR = '#F5B544'
const HEAVY_RAIL_COLOR = '#6B7280'
const BOUNDARY_COLOR = '#C85A3A'

const DEFAULT_CENTER = [39.5439, -0.5711]

function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

function MunicipalBoundary() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.boundary) return null
  return (
    <Polyline
      positions={data.boundary.polygon}
      pathOptions={{
        color: BOUNDARY_COLOR,
        weight: 2,
        opacity: 0.55,
        dashArray: '6 4',
        fill: false,
      }}
    />
  )
}

function OsmNeighborhoods() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.neighborhoods) return null
  return (
    <>
      {data.neighborhoods.map((n) => {
        const icon = L.divIcon({
          className: 'cp-osm-neigh',
          html: `<div class="cp-osm-neigh-dot"></div>
                 <div class="cp-osm-neigh-label">${n.name}</div>`,
          iconSize: [140, 20],
          iconAnchor: [6, 6],
        })
        return <Marker key={n.id} position={n.centroid} icon={icon} interactive={false} />
      })}
    </>
  )
}

/**
 * Render railway tracks + stations from the real OSM geometry stored in
 * public/data/geo.json. Each way is a separate polyline so branch points
 * render correctly (we don't try to stitch disjoint segments into one ring).
 * Subway/light_rail gets the Metrovalencia yellow; heavy rail gets a muted
 * grey to distinguish Adif's Aranjuez–Valencia line from the passenger metro.
 */
function Railways() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.railways) return null
  const ways = data.railways.ways || []
  const stations = data.railways.stations || []
  return (
    <>
      {ways.map((w) => {
        const isMetro = w.kind === 'subway' || w.kind === 'light_rail' || w.kind === 'tram'
        const color = isMetro ? METRO_COLOR : HEAVY_RAIL_COLOR
        return (
          <div key={w.id} style={{ display: 'contents' }}>
            {/* halo for the metro only — keeps heavy rail discreet */}
            {isMetro && (
              <Polyline
                positions={w.line}
                pathOptions={{ color, weight: 9, opacity: 0.18, lineCap: 'round' }}
              />
            )}
            <Polyline
              positions={w.line}
              pathOptions={{
                color,
                weight: isMetro ? 2.5 : 1.5,
                opacity: isMetro ? 0.9 : 0.55,
                lineCap: 'round',
                dashArray: isMetro ? undefined : '4 3',
              }}
            />
          </div>
        )
      })}
      {stations.map((s) => (
        <CircleMarker
          key={s.id}
          center={s.centroid}
          radius={7}
          pathOptions={{
            color: '#0B0F19',
            weight: 2,
            fillColor: METRO_COLOR,
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  )
}

function MapAttribution() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 16,
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        color: 'rgba(11,15,25,.45)',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        zIndex: 400,
        pointerEvents: 'none',
      }}
    >
      OSM · CARTO Voyager · L9 MetroValencia + Adif
    </div>
  )
}

export default function StylizedMap({ center = DEFAULT_CENTER }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EFE9D9' }}>
      <MapContainer
        center={center}
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

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          attribution=""
        />

        <MunicipalBoundary />
        <OsmNeighborhoods />
        <Railways />
      </MapContainer>

      <MapAttribution />
    </div>
  )
}
