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
import { obrasWithoutMoneyPin } from '../../lib/tender-points'

function MapAttribution() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 16,
        fontFamily: "'DM Mono', monospace",
        fontSize: 'var(--fs-micro)',
        color: 'rgba(11,15,25,.62)',
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
  // Which data layers are visible. Base layers (boundary / network / barrios)
  // are always on — the 21 barrios are the unit everything else aggregates to.
  //
  // `money` now opens by default and `poi` does not, reversing the previous
  // arrangement. The Servicios layer is an OSM directory of schools and parks:
  // static, unchanging, and already on every general-purpose map. Opening a
  // municipal-accountability site on it put the least mission-relevant layer in
  // the most valuable position. The located spend is what this project exists
  // to show.
  //
  // POIs are not gone, they are demoted to CONTEXT: whenever the money layer is
  // on they render dimmed underneath it, because "€64.960 SMART OFFICE" as a
  // free-floating pin means nothing while "€64.960 at the Casa de Cultura"
  // means something.
  const [layers, setLayers] = useState({
    money: true,
    poi: false,
    quejas: false,
    flood: false,
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
  const [obrasOnly, setObrasOnly] = useState(false)
  const effectiveAt = at ?? dateMax ?? Infinity

  const contractsById = useMemo(
    () => new Map((tenders?.contracts || []).map((c) => [c.id, c])),
    [tenders],
  )

  const unplacedObras = useMemo(
    () => obrasWithoutMoneyPin(obrasData?.obras, snapshot.places),
    [obrasData, snapshot],
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

        {/* POIs BEFORE money: later siblings paint on top in Leaflet's overlay
            pane, so rendering context after the spend pins put it over them and
            it swallowed their clicks. Context belongs underneath, literally. */}
        {(layers.poi || layers.money) && <CivicPoiLayer dimmed={!layers.poi} />}
        {layers.money && (
          <MoneyLayer
            snapshot={snapshot}
            at={effectiveAt}
            danaOnly={danaOnly}
            obrasOnly={obrasOnly}
            contractsById={contractsById}
          />
        )}
        {layers.quejas && <QuejasLayer />}
        {/* Obras fichas ride WITH the money layer rather than carrying their own
            chip: the Transparencia fichas and the contract registry describe the
            same works, and 6 of the 11 geolocated fichas share a point with a
            located contract. Only the ones PLACSP never placed are painted, so
            no work gets two markers with two amounts. */}
        {layers.money && <ObrasLayer obras={unplacedObras} />}
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
            snapshot={snapshot}
            min={dateMin}
            max={dateMax}
            value={effectiveAt}
            onChange={setAt}
            danaOnly={danaOnly}
            onToggleDana={setDanaOnly}
            obrasOnly={obrasOnly}
            onToggleObras={setObrasOnly}
          />
        )}
        {(layers.poi || layers.money) && <PoiLegend />}
        {layers.quejas && <QuejasLegend />}
        {layers.flood && <FloodLegend />}
      </div>
    </div>
  )
}
