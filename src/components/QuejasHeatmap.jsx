import { useEffect, useMemo } from 'react'
import {
  AttributionControl,
  Circle,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from '../lib/basemap'
import { useGeo } from '../hooks/useGeo'
import { useQuejas, prettyNeighborhood } from '../hooks/useQuejas'
import { coberturaDeBarrios, computePerNeighborhood } from '../lib/neighborhood-aggregate'
import { rellena } from '../lib/formatters'
import { useT } from '../i18n'

const RIBA_CENTER = [39.5439, -0.5711]

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
      pathOptions={{
        color: '#C85A3A',
        weight: 2,
        opacity: 0.55,
        dashArray: '6 4',
        fill: false,
      }}
    />
  )
}

// Radius scales by sqrt(count) so 1 queja ≠ tiny invisible dot and 100 doesn't
// swamp the map. Colour encodes "health" via the shared healthFromCounts scale.
const bubbleRadius = (count) => 100 + Math.sqrt(count) * 90 // meters

export default function QuejasHeatmap() {
  const t = useT()
  const { data: geo } = useGeo()
  const { data: quejas } = useQuejas()
  const items = useMemo(() => quejas?.items ?? [], [quejas])
  const hasData = items.some((q) => q.address_string)
  // La instantánea entera, no sólo `items`: decidir si ✓ ⏳ ⚠ significan algo
  // exige saber si el listado publicado está completo, y eso vive en `stats`.
  const perNeighborhood = useMemo(
    () => computePerNeighborhood(quejas, geo?.neighborhoods),
    [quejas, geo?.neighborhoods],
  )

  if (!hasData || perNeighborhood.length === 0) return null

  // Las quejas sin barrio —el casco no tiene— no se pintan, y el mapa lo dice:
  // sin la nota, las burbujas se leen como el total.
  const { pintadas, publicadas, entero, sinBarrio, desconocidas, restoSinBarrio } =
    coberturaDeBarrios(quejas, perNeighborhood, geo?.neighborhoods)
  const situaUnaParte = publicadas !== null && pintadas < publicadas
  // El motivo, sólo cuando es exacto: con el listado entero, «no tienen barrio»
  // si todas las que faltan llegaron sin él; si alguna trae un barrio que el
  // mapa no conoce, las dos cifras por separado; y truncado, sin motivo.
  const claveNota = restoSinBarrio
    ? 'quejas.mapa.cobertura'
    : entero
      ? 'quejas.mapa.coberturaDesglose'
      : 'quejas.mapa.coberturaParcial'

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          height: 360,
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
          border: '1px solid var(--border2)',
        }}
      >
        <MapContainer
          center={RIBA_CENTER}
          zoom={13}
          minZoom={12}
          maxZoom={16}
          scrollWheelZoom={false}
          zoomControl
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <ResizeOnMount />
          <TileLayer url={BASEMAP_URL} attribution={BASEMAP_ATTRIBUTION} />
          <AttributionControl prefix={false} />
          <Boundary />
          {perNeighborhood.map((n) => {
            // El tono viene ya calculado en la fila, con los recuentos crudos: sale
            // de lo que reportaron los vecinos, no de la respuesta municipal.
            const { color } = n.health
            const radius = bubbleRadius(n.total)
            return (
              <Circle
                key={n.slug}
                center={n.centroid}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.35,
                  weight: 1.5,
                  opacity: 0.8,
                }}
              >
                <Tooltip direction="top" sticky>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'var(--fs-meta)' }}>
                    <strong>{prettyNeighborhood(n.name || n.slug)}</strong>
                    <br />
                    {n.total} queja{n.total === 1 ? '' : 's'}
                    {/* ✓ ⏳ ⚠ cuentan respuestas del ayuntamiento, y el plazo de la
                      LPACAP corre desde el REGISTRO: sin ninguna queja del barrio
                      registrada, «⏳ 1» apuntaba una deuda que no tiene. */}
                    {n.medible ? (
                      <>
                        {' '}
                        · <span style={{ color: '#16A34A' }}>✓ {n.resueltas}</span> ·{' '}
                        <span style={{ color: 'var(--civic)' }}>⏳ {n.pendientes}</span>
                        {n.silencios > 0 && (
                          <>
                            {' '}
                            · <span style={{ color: '#DC2626' }}>⚠ {n.silencios}</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <br />
                        <span style={{ color: 'var(--ink50)' }}>
                          {t(`quejas.reloj.${n.motivo}.corto`)}
                        </span>
                      </>
                    )}
                  </div>
                </Tooltip>
              </Circle>
            )
          })}
        </MapContainer>
      </div>
      {situaUnaParte && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
          {rellena(t(claveNota), {
            nPintadas: pintadas,
            nPublicadas: publicadas,
            nSinBarrio: sinBarrio,
            nDesconocidas: desconocidas,
          })}
        </p>
      )}
    </div>
  )
}
