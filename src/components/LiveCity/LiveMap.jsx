import { useEffect, useMemo, useRef } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  RIBA_ROJA,
  RR_BUDGET_FLOW,
  RR_LANDMARKS,
  RR_NEIGHBORHOODS,
} from '../../data/mockData'

const SEV_COLOR = {
  crit: '#F87171',
  warn: '#FBBF24',
  info: '#60A5FA',
  ok:   '#4ADE80',
}

function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

function LandmarkMarker({ landmark }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'cp-landmark-icon',
        html: `<div style="
          background: rgba(14,20,34,.85);
          border: 1px solid rgba(96,165,250,.45);
          color: white;
          font-size: 14px;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          box-shadow: 0 4px 10px rgba(0,0,0,.4);
        ">${landmark.icon}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    [landmark.icon]
  )
  return (
    <Marker position={landmark.pos} icon={icon}>
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{landmark.name}</span>
      </Tooltip>
    </Marker>
  )
}

function HeatZones({ neighborhoods, kind }) {
  return (
    <>
      {neighborhoods.map((n) => {
        const { color, radius, opacity } = zoneStyle(n, kind)
        return (
          <Circle
            key={n.id + kind}
            center={n.center}
            radius={radius}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: opacity,
              weight: 1,
              opacity: 0.55,
              dashArray: '4 4',
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} sticky opacity={1}>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{n.name}</div>
                <div style={{ fontSize: 11, color: '#555' }}>
                  {n.pop.toLocaleString('es-ES')} hab. · MHS {n.mhs}
                </div>
              </div>
            </Tooltip>
          </Circle>
        )
      })}
    </>
  )
}

function zoneStyle(n, kind) {
  if (kind === 'calor') {
    const c = n.mhs >= 82 ? '#16A34A' : n.mhs >= 76 ? '#FBBF24' : '#EF4444'
    return { color: c, radius: 260, opacity: 0.18 }
  }
  if (kind === 'aire') {
    const c = n.id === 'poligono' ? '#EF4444' : n.id === 'estacio' ? '#FBBF24' : '#16A34A'
    return { color: c, radius: 280, opacity: 0.14 }
  }
  return { color: n.color, radius: 220, opacity: 0.1 }
}

function IncidentPin({ incident }) {
  const color = SEV_COLOR[incident.sev] || SEV_COLOR.info
  return (
    <>
      <Circle
        center={incident.pos}
        radius={incident.sev === 'crit' ? 110 : 70}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.12,
          weight: 0,
        }}
      />
      <CircleMarker
        center={incident.pos}
        radius={incident.sev === 'crit' ? 8 : 6}
        pathOptions={{
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        }}
      >
        <Popup className="cp-live-popup">
          <div style={{ minWidth: 200 }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: '#555',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginBottom: 4,
              }}
            >
              {incident.id} · {incident.dept}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{incident.text}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#666' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color,
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{incident.status}</span>
              <span>·</span>
              <span>hace {incident.age} min</span>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  )
}

function BudgetParticles({ tick }) {
  const ayto = RR_LANDMARKS.find((l) => l.id === 'ayto').pos
  const map = useMap()
  const groupRef = useRef(null)

  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map)
    }
    const group = groupRef.current
    return () => {
      group.clearLayers()
      map.removeLayer(group)
      groupRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!groupRef.current) return
    const group = groupRef.current
    group.clearLayers()

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
          fillOpacity: 0.8 * alpha,
          weight: 0,
          interactive: false,
        })
        group.addLayer(dot)
      }
    })
  }, [tick, map])

  return null
}

export default function LiveMap({ incidents, layer, budgetTick }) {
  return (
    <MapContainer
      center={RIBA_ROJA.center}
      zoom={RIBA_ROJA.zoom}
      className="cp-live-map"
      zoomControl
      scrollWheelZoom
      style={{ width: '100%', height: '100%' }}
      attributionControl={false}
      worldCopyJump={false}
    >
      <ResizeOnMount />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · CARTO'
      />

      {layer !== 'aire' && layer !== 'calor' && (
        <HeatZones neighborhoods={RR_NEIGHBORHOODS} kind="default" />
      )}
      {layer === 'calor' && <HeatZones neighborhoods={RR_NEIGHBORHOODS} kind="calor" />}
      {layer === 'aire' && <HeatZones neighborhoods={RR_NEIGHBORHOODS} kind="aire" />}

      {RR_LANDMARKS.map((lm) => (
        <LandmarkMarker key={lm.id} landmark={lm} />
      ))}

      {(layer === 'incidencias' || layer === 'calor') &&
        incidents.map((it) => <IncidentPin key={it.id} incident={it} />)}

      {layer === 'flujo' && <BudgetParticles tick={budgetTick} />}
    </MapContainer>
  )
}
