// @ts-check
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { useQuejas, prettyNeighborhood } from '../../../hooks/useQuejas'
import { aggregateNeighborhood } from '../../../lib/neighborhood-aggregate'
import { escapeHtml } from '../shared'
import { NeighborhoodPopup } from '../popups/NeighborhoodPopup'
import { BarrioTooltip } from '../popups/Tooltips'

/**
 * The 21 OSM neighborhoods — same dot + label as before, but now INTERACTIVE:
 * each marker opens an aggregated civic card (population + located spend +
 * quejas) joined at click time from geo + tender-geo + quejas. Replaces the old
 * decorative-only OsmNeighborhoods. Names stay escaped (divIcon = raw innerHTML).
 */
export function NeighborhoodsLayer() {
  const { loading, error, data: geo } = useGeo()
  const { data: tgeo } = useTenderGeo()
  const { data: quejas } = useQuejas()
  if (loading || error || !geo?.neighborhoods) return null
  const zones = tgeo?.zones || []
  return (
    <>
      {geo.neighborhoods.map((n) => {
        // La instantánea entera, no sólo `items`: ver `lib/neighborhood-aggregate`.
        const agg = aggregateNeighborhood({ neighborhood: n, zones, instantanea: quejas })
        const icon = L.divIcon({
          className: 'cp-osm-neigh',
          html: `<div class="cp-osm-neigh-dot"></div>
                 <div class="cp-osm-neigh-label">${escapeHtml(n.name)}</div>`,
          iconSize: [140, 20],
          iconAnchor: [6, 6],
        })
        return (
          <Marker key={n.id} position={n.centroid} icon={icon} title={prettyNeighborhood(n.name)}>
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
