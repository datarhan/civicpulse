// @ts-check
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { useQuejas } from '../../../hooks/useQuejas'
import { rotuloDeBarrio } from '../../../lib/formatters'
import { aggregateNeighborhood } from '../../../lib/neighborhood-aggregate'
import { escapeHtml } from '../shared'
import { NeighborhoodPopup } from '../popups/NeighborhoodPopup'
import { BarrioTooltip } from '../popups/Tooltips'
import { useCesionBarrios } from './cesion-barrios'

/**
 * The 21 OSM neighborhoods — same dot + label as before, but now INTERACTIVE:
 * each marker opens an aggregated civic card (population + located spend +
 * quejas) joined at click time from geo + tender-geo + quejas. Replaces the old
 * decorative-only OsmNeighborhoods. Names stay escaped (divIcon = raw innerHTML).
 *
 * Un punto que tapa el centro de un pin del dinero o de una obra (`pines`) cede el
 * toque: lleva `cp-osm-neigh--cede`, el toque llega al pin y la ficha del pin
 * lleva a la del barrio (`lib/barrios-bajo-pines`).
 */
export function NeighborhoodsLayer({ pines }) {
  const { loading, error, data: geo } = useGeo()
  const { data: tgeo } = useTenderGeo()
  const { data: quejas } = useQuejas()
  const { ceden } = useCesionBarrios(geo?.neighborhoods, pines)
  if (loading || error || !geo?.neighborhoods) return null
  const zones = tgeo?.zones || []
  return (
    <>
      {geo.neighborhoods.map((n) => {
        // La instantánea entera, no sólo `items`: ver `lib/neighborhood-aggregate`.
        const agg = aggregateNeighborhood({ neighborhood: n, zones, instantanea: quejas })
        const icon = L.divIcon({
          className: ceden.has(n.id) ? 'cp-osm-neigh cp-osm-neigh--cede' : 'cp-osm-neigh',
          html: `<div class="cp-osm-neigh-dot"></div>
                 <div class="cp-osm-neigh-label">${escapeHtml(n.name)}</div>`,
          iconSize: [140, 20],
          // El ancla, en el centro del punto: con `box-sizing: border-box` el punto
          // mide 8 px con su borde, y el ancla de antes (6, 6) lo dejaba 2 px arriba
          // y a la izquierda del centroide, así que un pin «en el mismo punto» no
          // quedaba concéntrico y la cuenta de `lib/barrios-bajo-pines` fallaba.
          iconAnchor: [4, 4],
        })
        return (
          <Marker key={n.id} position={n.centroid} icon={icon} title={rotuloDeBarrio(n.name)}>
            <Tooltip direction="top" offset={[0, -4]}>
              <BarrioTooltip agg={agg} />
            </Tooltip>
            <Popup closeButton autoPan maxWidth={300}>
              <NeighborhoodPopup agg={agg} />
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}
