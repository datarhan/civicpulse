// @ts-check
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useTenders } from '../../hooks/useTenders'
import { EMPTY_TENDER_GEO } from '../../lib/tender-geo'
import { DEFAULT_CENTER, ResizeOnMount } from './shared'
import { MunicipalBoundary } from './network/MunicipalBoundary'
import { Railways } from './network/Railways'
import { FullNetwork } from './network/FullNetwork'
import { NetworkLegend } from './network/NetworkLegend'
import { MoneyLayer } from './layers/MoneyLayer'
import { NeighborhoodsLayer } from './layers/NeighborhoodsLayer'
import { FloodRiskLayer } from './layers/FloodRiskLayer'
import { CivicPoiLayer } from './layers/CivicPoiLayer'
import { LayerControl } from './controls/LayerControl'
import { MoneyTimeSlider } from './controls/MoneyTimeSlider'
import { FloodLegend } from './controls/FloodLegend'
import { PoiLegend } from './controls/PoiLegend'

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
  // Which data layers are visible. Base layers (boundary/network/barrios) are
  // always on; toggleable data layers default off except the money flagship,
  // which shows a static snapshot (slider paused at the latest date) so the
  // landing reads richer on load without auto-animating.
  const [layers, setLayers] = useState({ money: true, poi: false, flood: false })
  const toggleLayer = (k) => setLayers((s) => ({ ...s, [k]: !s[k] }))

  const { data: tgeo } = useTenderGeo()
  const { data: tenders } = useTenders()
  const snapshot = tgeo || EMPTY_TENDER_GEO
  const dateMin = snapshot.universe?.dateMin ? new Date(snapshot.universe.dateMin).getTime() : null
  const dateMax = snapshot.universe?.dateMax ? new Date(snapshot.universe.dateMax).getTime() : null

  // Money-timeline cursor. `null` = "not yet touched" → resolves to dateMax so
  // the layer opens on the full cumulative picture; scrubbing/playing sets it.
  const [at, setAt] = useState(null)
  const [danaOnly, setDanaOnly] = useState(false)
  const effectiveAt = at ?? dateMax ?? Infinity

  const contractsById = useMemo(
    () => new Map((tenders?.contracts || []).map((c) => [c.id, c])),
    [tenders],
  )

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

        {layers.flood && <FloodRiskLayer />}

        <FullNetwork />
        <MunicipalBoundary />
        <NeighborhoodsLayer />
        <Railways />

        {layers.money && (
          <MoneyLayer
            snapshot={snapshot}
            at={effectiveAt}
            danaOnly={danaOnly}
            contractsById={contractsById}
          />
        )}
        {layers.poi && <CivicPoiLayer />}
      </MapContainer>

      <NetworkLegend />
      <MapAttribution />

      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 'calc(100% - 24px)',
        }}
      >
        <LayerControl layers={layers} onToggle={toggleLayer} />
        {layers.money && (
          <MoneyTimeSlider
            min={dateMin}
            max={dateMax}
            value={effectiveAt}
            onChange={setAt}
            danaOnly={danaOnly}
            onToggleDana={setDanaOnly}
          />
        )}
        {layers.poi && <PoiLegend />}
        {layers.flood && <FloodLegend />}
      </div>
    </div>
  )
}
