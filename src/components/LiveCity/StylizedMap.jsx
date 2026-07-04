// @ts-check
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../hooks/useGeo'
import { DEFAULT_CENTER, escapeHtml, ResizeOnMount } from './shared'
import { MunicipalBoundary } from './network/MunicipalBoundary'
import { Railways } from './network/Railways'
import { FullNetwork } from './network/FullNetwork'
import { NetworkLegend } from './network/NetworkLegend'

function OsmNeighborhoods() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.neighborhoods) return null
  return (
    <>
      {data.neighborhoods.map((n) => {
        const icon = L.divIcon({
          className: 'cp-osm-neigh',
          html: `<div class="cp-osm-neigh-dot"></div>
                 <div class="cp-osm-neigh-label">${escapeHtml(n.name)}</div>`,
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
      OSM · CARTO Voyager · Metrovalencia (L1–L10) + Adif
    </div>
  )
}

export default function StylizedMap({ center = DEFAULT_CENTER }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EFE9D9' }}>
      <MapContainer
        center={center}
        zoom={13}
        minZoom={10}
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

        <FullNetwork />
        <MunicipalBoundary />
        <OsmNeighborhoods />
        <Railways />
      </MapContainer>

      <NetworkLegend />
      <MapAttribution />
    </div>
  )
}
