// @ts-check
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useTenders } from '../../hooks/useTenders'
import { useObras } from '../../hooks/useObras'
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
import { QuejasLayer } from './layers/QuejasLayer'
import { ObrasLayer } from './layers/ObrasLayer'
import { LayerControl } from './controls/LayerControl'
import { MoneyTimeSlider } from './controls/MoneyTimeSlider'
import { FloodLegend } from './controls/FloodLegend'
import { PoiLegend } from './controls/PoiLegend'
import { QuejasLegend } from './controls/QuejasLegend'

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
  // always on; toggleable data layers default off except the Servicios
  // (civic-POI) flagship, so the landing reads richer on load with the public
  // facilities in view. Money (static snapshot at the latest date) / quejas
  // (citizen-complaint heat) / flood are opt-in via their chips.
  const [layers, setLayers] = useState({
    money: false,
    poi: true,
    quejas: false,
    flood: false,
    obras: false,
  })
  const toggleLayer = (k) => setLayers((s) => ({ ...s, [k]: !s[k] }))

  const { data: tgeo } = useTenderGeo()
  const { data: tenders } = useTenders()
  const { data: obrasData } = useObras()
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
        {layers.quejas && <QuejasLayer />}
        {layers.obras && <ObrasLayer obras={obrasData?.obras} />}
      </MapContainer>

      <NetworkLegend />
      <MapAttribution />

      {/* Anchored to the bottom-left: the toggle chips sit at the very bottom
          (above the attribution line); the money slider + POI/flood legends
          stack UPWARD above them via column-reverse, so the chip row stays put
          as contextual panels appear. */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 12,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column-reverse',
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
        {layers.quejas && <QuejasLegend />}
        {layers.flood && <FloodLegend />}
      </div>
    </div>
  )
}
