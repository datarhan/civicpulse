import { useEffect, useMemo } from 'react'
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from '../../lib/basemap'
import { fmtDateHuman } from '../../lib/formatters'

/**
 * El mapa de situación de «matrículas y móviles»: el Parc Natural del Túria,
 * las tres calles junto a las que el pliego sitúa sus aparcamientos con
 * cámaras, y Porxinos, sobre el mapa base del sitio (CARTO Voyager, de
 * OpenStreetMap, el mismo que los demás mapas del sitio: `lib/basemap.js`).
 *
 * La primera versión dibujaba todo esto a mano en un SVG, sin calles ni
 * pueblo alrededor: el lector veía tres trazos negros y un contorno sin saber
 * dónde estaba. Sobre un mapa de verdad, la calle, el río y el casco se leen
 * solos, y lo nuestro es sólo lo que el mapa base no dice.
 *
 * Lee el bloque `mapa` de la instantánea, congelado por
 * `scripts/build-mapa-pliego.ts` (que se niega a escribirlo si alguna calle cae
 * dentro del parque). Lo que la figura NO hace, a propósito: poner un pin
 * donde creemos que está cada aparcamiento. El pliego no da su posición, da
 * la calle; se dibuja la calle. Porxinos es el punto con ese nombre en
 * OpenStreetMap, no el contorno del valle. El pie dice las dos cosas.
 *
 * Se carga perezoso desde la pieza (`lazy`), como EmpleoMap: Leaflet no entra
 * en el trozo de la página hasta que hace falta.
 */

// Leaflet pinta en SVG con atributos: `var(--civic)` no resuelve ahí, así que
// los colores van en hexadecimal. Petróleo de la marca y la tinta del sitio.
const PETROLEO = '#0E5B62'
const TINTA = '#0B0F19'

/**
 * La vista: de Porxinos al casco, con margen, y un kilómetro de más al este
 * para que los rótulos de la derecha quepan. Con el encuadre entero del
 * bloque (siete kilómetros) las calles se apelotonaban en un punto.
 *
 * @param {any} mapa
 * @returns {[[number, number], [number, number]]}
 */
function vista(mapa) {
  const pts = [...mapa.aparcamientos.flatMap((a) => a.tramos.flat()), mapa.lugar.punto]
  const lats = pts.map((p) => p[0])
  const lons = pts.map((p) => p[1])
  return [
    [Math.min(...lats) - 0.003, Math.min(...lons) - 0.004],
    [Math.max(...lats) + 0.004, Math.max(...lons) + 0.012],
  ]
}

/**
 * Encaja la vista cada vez que el contenedor cambia de tamaño, y no deja
 * alejarse más. Al montarse desde `lazy`, el contenedor aún medía cero:
 * `fitBounds` sobre una caja vacía cae al zoom máximo, y el mapa salía a 30 m
 * de escala. Un ResizeObserver espera a que mida algo, y vuelve a encajar si
 * cambia el ancho (el móvil al girar).
 */
function Encaje({ bounds }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const encaja = () => {
      if (!el.clientWidth || !el.clientHeight) return
      map.invalidateSize()
      map.setMinZoom(0)
      map.fitBounds(bounds, { padding: [12, 12], animate: false })
      map.setMinZoom(map.getZoom())
    }
    encaja()
    const ro = new ResizeObserver(encaja)
    ro.observe(el)
    return () => ro.disconnect()
  }, [map, bounds])
  return null
}

/** @param {{ mapa: any }} props */
export default function MapaPliego({ mapa }) {
  const bounds = useMemo(() => vista(mapa), [mapa])
  // El encuadre del bloque cae dentro del marco al que se recortó el contorno
  // del parque: no dejar salir de él evita ver el corte.
  const [s, w, n, e] = mapa.encuadre
  const resumen =
    `Mapa. Las tres calles junto a las que el pliego sitúa los aparcamientos con cámaras ` +
    `(${mapa.aparcamientos.map((a) => a.calle).join(', ')}) están en el casco urbano, fuera del ` +
    `${mapa.parque.nombre}. ${mapa.lugar.nombre} queda ${mapa.lugar.dentroDelParque ? 'dentro' : 'fuera'} del parque.`

  return (
    <figure className="cp-ancho" style={{ margin: '18px 0' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 8,
        }}
      >
        Dónde pone el pliego sus aparatos
      </div>
      <div
        role="region"
        aria-label={resumen}
        className="cp-mapa-pliego"
        style={{
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        <MapContainer
          bounds={bounds}
          maxBounds={[
            [s, w],
            [n, e],
          ]}
          maxBoundsViscosity={1}
          zoomSnap={0.25}
          scrollWheelZoom={false}
          attributionControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={BASEMAP_URL} attribution={BASEMAP_ATTRIBUTION} />
          <AttributionControl prefix={false} />
          <ScaleControl imperial={false} position="bottomleft" />
          <Encaje bounds={bounds} />

          <Polygon
            positions={mapa.parque.anillos}
            pathOptions={{
              color: PETROLEO,
              weight: 1.5,
              opacity: 0.8,
              fillColor: PETROLEO,
              fillOpacity: 0.2,
              fillRule: 'evenodd',
              interactive: false,
            }}
          />
          <CircleMarker
            center={mapa.parque.rotulo}
            radius={0}
            pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
          >
            <Tooltip permanent direction="center" className="cp-mapa-tip cp-mapa-tip-parque">
              {mapa.parque.nombre}
            </Tooltip>
          </CircleMarker>

          {/* Rótulos alternos, de norte a sur: derecha, izquierda, derecha. En
              el móvil las calles quedan a 14 px y dos rótulos del mismo lado
              se pisaban. */}
          {[...mapa.aparcamientos]
            .sort((x, y) => norte(y) - norte(x))
            .map((a, i) => (
              <Calle key={a.calle} a={a} lado={i % 2 ? 'left' : 'right'} />
            ))}

          <CircleMarker
            center={mapa.lugar.punto}
            radius={6}
            pathOptions={{ color: TINTA, weight: 2.5, fillColor: '#ffffff', fillOpacity: 1 }}
          >
            <Tooltip permanent direction="right" offset={[8, 0]} className="cp-mapa-tip">
              {mapa.lugar.nombre}
            </Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>
      <figcaption
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 6, lineHeight: 1.4 }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            marginRight: 5,
            verticalAlign: '-1px',
            background: 'var(--civic)',
            opacity: 0.35,
          }}
        />
        {mapa.parque.nombre}, según OpenStreetMap. En negro, cada aparcamiento dibujado como la
        calle junto a la que lo sitúa el pliego (
        {mapa.aparcamientos.map((a) => `${a.nombre}: ${a.calle}`).join('; ')}): el pliego no da su
        posición exacta. {mapa.lugar.nombre}, por el punto con ese nombre en OpenStreetMap, no por
        el contorno del valle. Contorno y calles consultados el{' '}
        {fmtDateHuman(mapa.fuente.consultadoEl)}.
      </figcaption>
    </figure>
  )
}

/** La latitud media de una calle, para ordenarlas de norte a sur. */
const norte = (/** @type {{ tramos: [number, number][][] }} */ a) => {
  const pts = a.tramos.flat()
  return pts.reduce((t, p) => t + p[0], 0) / pts.length
}

/**
 * Una calle del pliego: su trazado, con un borde blanco debajo para que se lea
 * sobre las calles del mapa base, y su rótulo a un lado.
 *
 * @param {{ a: { nombre: string, calle: string, tramos: [number, number][][] }, lado: 'left' | 'right' }} props
 */
function Calle({ a, lado }) {
  // El rótulo cuelga del extremo de la calle en su lado: así queda junto al
  // trazo y no encima.
  const pts = a.tramos.flat()
  const ancla = pts.reduce((m, p) => ((lado === 'right' ? p[1] > m[1] : p[1] < m[1]) ? p : m))
  return (
    <>
      <Polyline
        positions={a.tramos}
        pathOptions={{
          color: '#ffffff',
          weight: 9,
          opacity: 0.9,
          lineCap: 'round',
          interactive: false,
        }}
      />
      <Polyline
        positions={a.tramos}
        pathOptions={{ color: TINTA, weight: 5, lineCap: 'round', interactive: false }}
      />
      <CircleMarker
        center={ancla}
        radius={0}
        pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
      >
        <Tooltip
          permanent
          direction={lado}
          offset={[lado === 'right' ? 10 : -10, 0]}
          className="cp-mapa-tip"
        >
          {a.nombre}
        </Tooltip>
      </CircleMarker>
    </>
  )
}
