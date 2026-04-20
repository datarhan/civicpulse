import { useEffect } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../hooks/useGeo'

const METRO_COLOR = '#F5B544'
const BOUNDARY_COLOR = '#C85A3A'

// Real geometry — Riba-roja L9 Metro Valencia track (OSM-approximated)
const METRO_L9_TRACK = [
  [39.5355, -0.5595],
  [39.5368, -0.5628],
  [39.5383, -0.5655],
  [39.5395, -0.5680],
  [39.5402, -0.5695],
]
const METRO_STATION = [39.5402, -0.5695]

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
      OSM · CARTO Voyager · L9 MetroValencia
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
      </MapContainer>

      <MapAttribution />
    </div>
  )
}
