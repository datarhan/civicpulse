// @ts-check
import { CircleMarker, Pane, Polyline, Popup } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { findMetroStation } from '../../../hooks/useNextMetro'
import { colorForMetroRef, HEAVY_RAIL_COLOR, METRO_COLOR } from '../shared'
import { StationSchedulePopup } from '../popups/StationSchedulePopup'

/**
 * Render railway tracks + stations from the real OSM geometry stored in
 * public/data/geo.json. Each way is a separate polyline so branch points
 * render correctly (we don't try to stitch disjoint segments into one ring).
 * Subway/light_rail gets the Metrovalencia yellow; heavy rail gets a muted
 * grey to distinguish Adif's Aranjuez–Valencia line from the passenger metro.
 */
export function Railways() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.railways) return null
  const ways = data.railways.ways || []
  const stations = data.railways.stations || []
  return (
    <>
      {ways.map((w) => {
        const isMetro = w.kind === 'subway' || w.kind === 'light_rail' || w.kind === 'tram'
        const color = isMetro ? colorForMetroRef(w.ref) : HEAVY_RAIL_COLOR
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
      {/*
        Las estaciones van en su propio panel, a z-610: por encima de los pines del
        dinero y de las vías (panel de vectores, 400), de los equipamientos (450) y de
        los puntos de barrio (panel de marcadores, 600), y por debajo de los rótulos
        flotantes (650) y de los globos (700). Medido: a 1280 px un punto de barrio caía
        sobre El Clot y un clic en la estación no le llegaba. Un panel tiene su propio
        SVG, cuya raíz no recibe punteros, así que sólo los discos pintados los
        reciben. El precio es el que describe CivicPoiLayer: un disco de 7 px muerde un
        poco un pin grande, y un pin grande no se traga una estación.
      */}
      <Pane name="cp-estaciones" style={{ zIndex: 610 }}>
        {stations.map((s) => {
          const match = findMetroStation(s.name)
          let fill = HEAVY_RAIL_COLOR
          let radius = 5
          let weight = 1.5
          if (match?.kind === 'l9') {
            fill = METRO_COLOR
            radius = 7
            weight = 2
          } else if (match?.kind === 'other') {
            fill = match.station.lineColor
            radius = 7
            weight = 2
          }
          return (
            <CircleMarker
              key={s.id}
              center={s.centroid}
              radius={radius}
              pathOptions={{
                color: '#0B0F19',
                weight,
                fillColor: fill,
                fillOpacity: match ? 1 : 0.85,
              }}
              eventHandlers={{
                // react-leaflet no propaga `pathOptions.className` al path SVG de forma
                // fiable (lo mismo que en MoneyLayer): se marca al añadirse, para las
                // pruebas que miden si una estación se puede tocar.
                add: (e) => {
                  const el = e.target.getElement && e.target.getElement()
                  if (el) {
                    el.classList.add('cp-estacion')
                    el.setAttribute('data-estacion', s.name)
                  }
                },
              }}
            >
              <Popup closeButton={true} autoPan={true}>
                <StationSchedulePopup name={s.name} match={match} rawStation={s} />
              </Popup>
            </CircleMarker>
          )
        })}
      </Pane>
    </>
  )
}
