// @ts-check
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { BASEMAP_URL } from '../../lib/basemap'
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
import { IncendiosLayer } from './layers/IncendiosLayer'
import { IncendiosYearSlider } from './controls/IncendiosYearSlider'
import { useIncendios } from '../../hooks/useIncendios'
import { porAnyo } from '../../lib/incendios'
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
  // `money` opens by default and `poi` does not. The Servicios layer is an OSM
  // directory of schools and parks: static, unchanging, and already on every
  // general-purpose map. Opening a municipal-accountability site on it put the
  // least mission-relevant layer in the most valuable position. The located
  // spend is what this project exists to show.
  //
  // A default OFF here means OFF ON THE MAP TOO. For a while POIs were demoted
  // to "context" instead of hidden — dimmed underneath the money layer whenever
  // money was on, which is always on load. The landing therefore opened with
  // Servicios dots painted and its Servicios chip reading OFF, and the legend
  // card for a layer nobody had switched on. Whatever the reading is worth, a
  // control that does not describe the map is the defect LayerControl documents
  // itself as never having: the chips are the only account the reader gets of
  // what those marks mean.
  const [layers, setLayers] = useState({
    money: true,
    poi: false,
    quejas: false,
    flood: false,
    incendios: false,
  })
  const toggleLayer = (k) => setLayers((s) => ({ ...s, [k]: !s[k] }))

  const { data: tgeo } = useTenderGeo()
  const { data: tenders } = useTenders()
  const { data: obrasData } = useObras()
  // El índice de incendios (sin geometría, ~7 KB comprimido) hace falta aquí
  // para el rango del deslizador; los anillos los pide la capa, y sólo cuando
  // alguien la enciende.
  const { data: incendiosIdx } = useIncendios()
  const snapshot = tgeo || EMPTY_TENDER_GEO
  const dateMin = snapshot.universe?.dateMin ? new Date(snapshot.universe.dateMin).getTime() : null
  const dateMax = snapshot.universe?.dateMax ? new Date(snapshot.universe.dateMax).getTime() : null

  // Money-timeline cursor. `null` = "not yet touched" → resolves to dateMax so
  // the layer opens on the full cumulative picture; scrubbing/playing sets it.
  const [at, setAt] = useState(null)
  // null = sin tocar: se ve la serie entera hasta el último año cartografiado.
  const [anyoIncendios, setAnyoIncendios] = useState(null)
  const [danaOnly, setDanaOnly] = useState(false)
  const [obrasOnly, setObrasOnly] = useState(false)
  const effectiveAt = at ?? dateMax ?? Infinity

  const incendiosUniverse = incendiosIdx?.universe
  const serieIncendios = useMemo(
    () =>
      incendiosUniverse
        ? porAnyo(incendiosIdx?.incendios, incendiosUniverse.anyoMin, incendiosUniverse.anyoMax)
        : [],
    [incendiosIdx, incendiosUniverse],
  )

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

        <TileLayer url={BASEMAP_URL} attribution="" />

        {layers.flood && <FloodRiskLayer />}

        <FullNetwork />
        <MunicipalBoundary />
        <NeighborhoodsLayer />
        <Railways />

        {/* POIs BEFORE money: later siblings paint on top in Leaflet's overlay
            pane, so rendering them after the spend pins put them over the
            money and they swallowed its clicks. */}
        {/* Antes que el dinero: los hermanos posteriores pintan encima en el
          panel de superposición de Leaflet, y un polígono de 20 ha sobre los
          pines se comería sus clics. */}
        {layers.incendios && <IncendiosLayer anyoVisible={anyoIncendios} />}
        {layers.poi && <CivicPoiLayer />}
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
          as contextual panels appear.

          The stack is CAPPED to the map and scrolls when it doesn't fit. It
          grows with the number of open layers while the map does not: measured
          at 375px the map is 277px tall and the chips + money slider alone
          already ran 59px past its top edge — a panel could end up above the
          viewport entirely, unreachable rather than merely overlapping. The
          chip row is the last flex child, so it is what stays pinned. */}
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
          maxHeight: 'calc(100% - 40px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
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
        {layers.poi && <PoiLegend />}
        {layers.quejas && <QuejasLegend />}
        {layers.incendios && (
          <IncendiosYearSlider
            anyoMin={incendiosUniverse?.anyoMin ?? 1993}
            anyoMax={incendiosUniverse?.anyoMax ?? new Date().getFullYear()}
            value={anyoIncendios}
            onChange={setAnyoIncendios}
            serie={serieIncendios}
          />
        )}
        {layers.flood && <FloodLegend />}
      </div>
    </div>
  )
}
