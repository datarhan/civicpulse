import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useGeo } from '../../hooks/useGeo'
import { moneyRadiusMeters, zoneAmountsAt } from '../../lib/tender-geo'

const RIBA_CENTER = [39.52, -0.55]
const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

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
      pathOptions={{ color: '#C85A3A', weight: 2, opacity: 0.5, dashArray: '6 4', fill: false }}
    />
  )
}

export default function GastoMap({ snapshot, sliderTime, danaOnly, selectedZone, onSelectZone }) {
  const amounts = useMemo(
    () => zoneAmountsAt(snapshot?.assignments, { at: sliderTime, danaOnly }),
    [snapshot, sliderTime, danaOnly],
  )
  const zones = (snapshot?.zones || [])
    .map((z) => ({ ...z, live: amounts.get(z.slug) || { amount: 0, count: 0 } }))
    .filter((z) => z.live.amount > 0)

  if (zones.length === 0) {
    return (
      <div
        role="region"
        aria-label="Mapa del gasto municipal por zona"
        style={{
          height: 360,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--ink50)',
          fontSize: 13,
          border: '1px solid var(--border2)',
          borderRadius: 10,
        }}
      >
        {/* «Contratos», not «obras»: the layer paints every award whose title
            names a zone — services and supplies among them — so an empty state
            that says «obras» tells the reader the map is narrower than it is,
            the same overreach the section heading above used to make. */}
        Aún no hay contratos situables en el periodo seleccionado.
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Mapa interactivo del gasto municipal por zona"
      style={{
        height: 360,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border2)',
      }}
    >
      <MapContainer
        center={RIBA_CENTER}
        zoom={12}
        minZoom={11}
        maxZoom={16}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <ResizeOnMount />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
        />
        <Boundary />
        {zones.map((z) => {
          const danaHeavy = danaOnly || (z.danaAmount > 0 && z.danaAmount >= z.amount * 0.5)
          const color = danaHeavy ? '#E08600' : '#2463EB'
          const radius = moneyRadiusMeters(z.live.amount)
          const sel = selectedZone === z.slug
          return (
            <Circle
              key={z.slug}
              center={z.centroid}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: sel ? 0.55 : 0.32,
                weight: sel ? 3 : 1.5,
                opacity: 0.85,
              }}
              eventHandlers={{ click: () => onSelectZone(z.slug) }}
            >
              <Tooltip direction="top">
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                  <strong>{z.name}</strong>
                  <br />
                  {fmtEur(z.live.amount)} · {z.live.count} obra{z.live.count === 1 ? '' : 's'}
                </div>
              </Tooltip>
            </Circle>
          )
        })}
      </MapContainer>
    </div>
  )
}
