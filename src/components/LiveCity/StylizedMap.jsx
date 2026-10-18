// @ts-check
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Pane, TileLayer, useMapEvents } from 'react-leaflet'
import { BASEMAP_URL } from '../../lib/basemap'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useTenders } from '../../hooks/useTenders'
import { useObras } from '../../hooks/useObras'
import { EMPTY_TENDER_GEO } from '../../lib/tender-geo'
import { BAJO_LA_CINTA, DEFAULT_CENTER, ResizeOnMount } from './shared'
import { MunicipalBoundary } from './network/MunicipalBoundary'
import { Railways } from './network/Railways'
import { FullNetwork } from './network/FullNetwork'
import { NetworkLegend } from './network/NetworkLegend'
import { MoneyLayer, pinRadius } from './layers/MoneyLayer'
import { NeighborhoodsLayer } from './layers/NeighborhoodsLayer'
import { IncendiosLayer } from './layers/IncendiosLayer'
import { IncendiosYearSlider } from './controls/IncendiosYearSlider'
import { useIncendios } from '../../hooks/useIncendios'
import { porAnyo } from '../../lib/incendios'
import { FloodRiskLayer } from './layers/FloodRiskLayer'
import { CivicPoiLayer } from './layers/CivicPoiLayer'
import { QuejasLayer } from './layers/QuejasLayer'
import { ObrasLayer, RADIO_OBRA } from './layers/ObrasLayer'
import { LayerControl } from './controls/LayerControl'
import { MoneyTimeSlider } from './controls/MoneyTimeSlider'
import { FloodLegend } from './controls/FloodLegend'
import { PoiLegend } from './controls/PoiLegend'
import { QuejasLegend } from './controls/QuejasLegend'
import { obrasWithoutMoneyPin, placeAmountsAt } from '../../lib/tender-points'
import { FitToPins } from './layers/FitToPins'

// La pila de controles se apoya a esta distancia del pie del mapa, sobre la línea
// de atribución.
const PILA_ABAJO = 28

// La atribución de los datos y las teselas se queda siempre a la vista, también con
// una ficha abierta: es la licencia (ODbL de OSM, CARTO) y no se lleva toques. Lleva
// fondo de papel, como el control de atribución de Leaflet, porque sin él sus letras
// se imprimían sobre el texto de la ficha que queda debajo.
function MapAttribution() {
  return (
    <div
      className="cp-atribucion"
      style={{
        position: 'absolute',
        bottom: 6,
        left: 12,
        padding: '1px 4px',
        borderRadius: 'var(--r-input)',
        background: '#EFE9D9',
        fontFamily: "'DM Mono', monospace",
        fontSize: 'var(--fs-micro)',
        color: 'rgba(11,15,25,.62)',
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

  const { data: tgeo, loading: tgeoCargando } = useTenderGeo()
  const { data: tenders } = useTenders()
  const { data: obrasData, loading: obrasCargando } = useObras()
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
  // La pila de controles, plegada por defecto. Sólo se nota por debajo de
  // MAPA_COMPACTO (la regla vive en DirectionD.jsx): a 375 px, desplegada, tapaba
  // las cuatro estaciones de Riba-roja. Plegada deja a la vista los chips y la
  // línea de cobertura del dinero, que es la declaración de honestidad de la capa.
  const [plegada, setPlegada] = useState(true)
  // Al desplegar, la pila enseña su principio. Es column-reverse, así que cuando no
  // cabe se desplaza anclada al final y lo que se sale es lo de ARRIBA: la primera
  // línea de la tarjeta que se acaba de pedir. A 320 y 375 px de ancho con 812 de
  // alto cabe entera y esto no mueve nada; en pantallas más bajas, sí. El scrollTop
  // de un column-reverse va en negativo y el navegador lo recorta a su tope.
  const pilaRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  useLayoutEffect(() => {
    const pila = pilaRef.current
    if (!plegada && pila) pila.scrollTop = -pila.scrollHeight
  }, [plegada])
  // Si hay una ficha abierta. En un mapa compacto la pila —con la leyenda de
  // Metrovalencia dentro— se aparta mientras lo está, y vuelve al cerrarla (la
  // regla, en DirectionD.jsx).
  const [fichaAbierta, setFichaAbierta] = useState(false)
  // null = sin tocar: se ve la serie entera hasta el último año cartografiado.
  const [anyoIncendios, setAnyoIncendios] = useState(null)
  const [danaOnly, setDanaOnly] = useState(false)
  const [obrasOnly, setObrasOnly] = useState(false)
  // Estado de la capa de inundación: null | 'cargando' | 'error'. Vive aquí
  // porque nace en la capa (los eventos de Leaflet) y se pinta en la leyenda,
  // que son hermanas. La capa lo limpia al montar, así que un fallo del
  // encendido anterior no acusa al siguiente antes de intentarlo.
  const [floodEstado, setFloodEstado] = useState(null)
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

  // Los pines que se pintan ahora, del dinero y de las obras: un punto de barrio que
  // tape el centro de uno le cede el toque (`lib/barrios-bajo-pines`). Una sola lista
  // para las tres capas, que así no pueden discrepar sobre qué punto cede.
  const pinesDelMapa = useMemo(() => {
    if (!layers.money) return []
    const dinero = [
      ...placeAmountsAt(snapshot.assignments, { at: effectiveAt, danaOnly, obrasOnly }).values(),
    ].map((p) => ({ point: p.point, radio: pinRadius(p.amount) }))
    const obras = unplacedObras
      .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
      .map((o) => ({ point: [o.lat, o.lng], radio: RADIO_OBRA }))
    return [...dinero, ...obras]
  }, [layers.money, snapshot, effectiveAt, danaOnly, obrasOnly, unplacedObras])

  // Un solo encuadre para todo el mapa: los pines del dinero y las obras sin pin,
  // juntos, y sólo cuando han llegado las dos instantáneas. Cada capa encuadraba por
  // su lado, y el mapa acababa a un zoom u otro según cuál llegaba antes (FitToPins).
  const puntosDelEncuadre = useMemo(() => {
    if (tgeoCargando || obrasCargando) return []
    const dinero = [
      ...placeAmountsAt(snapshot.assignments, { at: effectiveAt, danaOnly, obrasOnly }).values(),
    ].map((p) => p.point)
    const obras = unplacedObras
      .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
      .map((o) => [o.lat, o.lng])
    return [...dinero, ...obras]
  }, [tgeoCargando, obrasCargando, snapshot, effectiveAt, danaOnly, obrasOnly, unplacedObras])

  return (
    <div
      className="cp-mapa"
      data-ficha={fichaAbierta ? 'true' : 'false'}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#EFE9D9' }}
    >
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
        <AvisaFicha onCambio={setFichaAbierta} />

        <TileLayer url={BASEMAP_URL} attribution="" />

        {layers.flood && <FloodRiskLayer onEstado={setFloodEstado} />}

        <FullNetwork />
        <MunicipalBoundary />
        <NeighborhoodsLayer pines={pinesDelMapa} />
        <Railways />

        {/* El dinero y las obras van en su propio panel, a z-420, por encima de todo lo
            demás que es vector (panel de superposición, 400). En el panel compartido
            manda el orden en que llega cada capa, no el de este JSX: un polígono de
            incendio de 20 ha, un círculo de quejas o la línea L9, que carga después,
            se pintaban encima de los pines y se quedaban sus clics. Por debajo de los
            equipamientos (`cp-poi`, 450), de los puntos de barrio (marcadores, 600) y
            de las estaciones (610): lo pequeño encima de lo grande. Donde un punto de
            barrio tapa el CENTRO de un pin, el punto le cede el toque
            (`lib/barrios-bajo-pines`). */}
        {layers.incendios && <IncendiosLayer anyoVisible={anyoIncendios} />}
        {layers.poi && <CivicPoiLayer />}
        {layers.money && <FitToPins points={puntosDelEncuadre} />}
        {layers.money && (
          <Pane name="cp-dinero" style={{ zIndex: 420 }}>
            <MoneyLayer
              snapshot={snapshot}
              at={effectiveAt}
              danaOnly={danaOnly}
              obrasOnly={obrasOnly}
              contractsById={contractsById}
              pines={pinesDelMapa}
            />
            {/* Obras fichas ride WITH the money layer rather than carrying their own
                chip: the Transparencia fichas and the contract registry describe the
                same works, and 6 of the 11 geolocated fichas share a point with a
                located contract. Only the ones PLACSP never placed are painted, so
                no work gets two markers with two amounts. */}
            <ObrasLayer obras={unplacedObras} pines={pinesDelMapa} />
          </Pane>
        )}
        {layers.quejas && <QuejasLayer />}
      </MapContainer>

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
          chip row is the last flex child, so it is what stays pinned.

          El tope se mide desde el pie de la cinta «DIRECTO», no desde el borde
          del mapa. Medido desde el borde dejaba subir la pila hasta 12 px del
          techo, y la cinta va encima (401 contra 400): a 375×812, con el detalle
          del dinero abierto, la primera línea de la tarjeta quedaba debajo de la
          cinta (17-10-2026). */}
      <div
        ref={pilaRef}
        className="cp-mapa-pila"
        data-plegada={plegada ? 'true' : 'false'}
        style={{
          position: 'absolute',
          bottom: PILA_ABAJO,
          left: 12,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          maxWidth: 'calc(100% - 24px)',
          maxHeight: `calc(100% - ${PILA_ABAJO + BAJO_LA_CINTA}px)`,
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
            plegada={plegada}
            onPlegar={setPlegada}
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
        {layers.flood && <FloodLegend estado={floodEstado} />}
        {/* La última: column-reverse la pone arriba del todo, y es lo primero que
            se pliega en un mapa compacto (DirectionD.jsx). */}
        <NetworkLegend />
      </div>
    </div>
  )
}

/**
 * Avisa de si hay una ficha (popup) abierta en el mapa. Leaflet cierra la anterior
 * antes de abrir la siguiente, así que `popupclose` llega antes que `popupopen`.
 */
function AvisaFicha({ onCambio }) {
  useMapEvents({
    popupopen: () => onCambio(true),
    popupclose: () => onCambio(false),
  })
  return null
}
