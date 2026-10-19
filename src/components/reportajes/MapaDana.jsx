import { useMemo } from 'react'
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
} from 'react-leaflet'
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from '../../lib/basemap'
import Encaje from './EncajeMapa'

/**
 * El mapa de §02 de «reconstrucción DANA»: los lugares que nombran los
 * contratos municipales, sobre el mapa base del sitio (CARTO Voyager, de
 * OpenStreetMap: `lib/basemap.js`).
 *
 * Hasta el 19-10-2026 era un SVG dibujado a mano: el contorno del término y
 * los círculos, sin una calle ni un nombre alrededor, y el racimo del casco
 * se leía como un borrón. Es el mismo defecto que tenía el mapa de
 * «matrículas y móviles», que el operador mandó «hacer real o quitar». Sobre
 * un mapa de verdad, el polígono, la urbanización y el casco se leen solos.
 *
 * Lo que no cambia: los puntos. Cada uno es un LUGAR que el título de algún
 * contrato nombra, resuelto por el resolutor de topónimos (tender-geo), con
 * su radio proporcional a √importe. Un contrato que nombra varios lugares no
 * se sitúa en ninguno. El emblema de la cabecera sigue siendo el SVG: es la
 * miniatura, no el mapa.
 *
 * Se carga perezoso desde la pieza (`lazy`), como los demás mapas.
 */

// Leaflet pinta en SVG con atributos: `var(--civic)` no resuelve ahí, así que
// los colores van en hexadecimal. Petróleo de la marca y la tinta del sitio.
const PETROLEO = '#0E5B62'
const TINTA = '#0B0F19'

/** @param {number} n */
const eurC = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(2).replace('.', ',') + ' M€'
    : n >= 1e3
      ? Math.round(n / 1e3) + ' k€'
      : Math.round(n) + ' €'

/**
 * @param {{
 *   boundary: [number, number][],
 *   bbox: { south: number, west: number, north: number, east: number },
 *   places: Array<{ name: string, amount: number, danaAmount: number, contractCount: number, danaContractCount: number, lat: number, lng: number }>,
 *   danaPlaces: Array<{ name: string, lat: number, lng: number }>,
 * }} props
 */
export default function MapaDana({ boundary, bbox, places, danaPlaces }) {
  /** @type {[[number, number], [number, number]]} */
  const bounds = useMemo(
    () => [
      [bbox.south, bbox.west],
      [bbox.north, bbox.east],
    ],
    [bbox],
  )
  // Un poco de holgura alrededor del término para poder moverse sin salir del
  // todo de él.
  const margen = 0.02
  const maxAmt = Math.max(...places.map((p) => p.amount))
  const radio = (/** @type {number} */ a) => 4 + Math.sqrt(a / maxAmt) * 16
  // Los grises primero y los de la DANA encima, cada grupo de mayor a menor:
  // un círculo pequeño no queda tapado por uno grande, y ninguno petróleo por
  // uno gris.
  const orden = [...places].sort(
    (a, b) => Number(a.danaAmount > 0) - Number(b.danaAmount > 0) || b.amount - a.amount,
  )
  // Los dos lugares con más gasto DANA llevan su nombre a la vista, como en el
  // texto de §02; los demás, al pasar por encima.
  const rotulados = new Set(danaPlaces.slice(0, 2).map((p) => p.name))
  const resumen =
    `Mapa del término municipal de Riba-roja de Túria con ${places.length} lugares que nombran ` +
    `contratos municipales. En petróleo, los ${places.filter((p) => p.danaAmount > 0).length} ` +
    `con algún contrato que referencia la DANA; en gris, el resto.`

  return (
    <div
      role="region"
      aria-label={resumen}
      className="cp-mapa-dana"
      style={{
        borderRadius: 'var(--r-card)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      <MapContainer
        bounds={bounds}
        maxBounds={[
          [bbox.south - margen, bbox.west - margen],
          [bbox.north + margen, bbox.east + margen],
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
        <Encaje bounds={bounds} padding={8} />

        {/* `interactive` como prop y no en `pathOptions`: ahí sólo se aplica
            como estilo, y la línea seguía recibiendo el ratón. */}
        <Polyline
          positions={boundary}
          interactive={false}
          pathOptions={{
            color: TINTA,
            weight: 1.5,
            opacity: 0.6,
            dashArray: '4 4',
            interactive: false,
          }}
        />

        {orden.map((p) => {
          const dana = p.danaAmount > 0
          return (
            <CircleMarker
              key={p.name}
              center={[p.lat, p.lng]}
              radius={radio(p.amount)}
              // Como prop: Leaflet sólo lee la clase al crear el círculo.
              className={dana ? 'cp-mapa-lugar cp-mapa-lugar-dana' : 'cp-mapa-lugar'}
              pathOptions={{
                color: '#ffffff',
                weight: 1.2,
                fillColor: dana ? PETROLEO : TINTA,
                fillOpacity: dana ? 0.85 : 0.4,
              }}
            >
              <Tooltip
                permanent={rotulados.has(p.name)}
                direction="right"
                offset={[radio(p.amount) + 2, 0]}
                className="cp-mapa-tip"
              >
                {rotulados.has(p.name) ? (
                  p.name
                ) : (
                  <>
                    {p.name} · {eurC(p.amount)} · {p.contractCount} contrato
                    {p.contractCount > 1 ? 's' : ''}
                    {dana ? ` · DANA ${eurC(p.danaAmount)}` : ''}
                  </>
                )}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
