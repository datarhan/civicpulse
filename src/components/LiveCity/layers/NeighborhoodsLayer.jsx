// @ts-check
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { useQuejas, prettyNeighborhood } from '../../../hooks/useQuejas'
import { aggregateNeighborhood } from '../../../lib/neighborhood-aggregate'
import { escapeHtml } from '../shared'
import { NeighborhoodPopup } from '../popups/NeighborhoodPopup'

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
  const quejaItems = quejas?.items || []
  return (
    <>
      {geo.neighborhoods.map((n) => {
        const agg = aggregateNeighborhood({ neighborhood: n, zones, quejaItems })
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
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                <strong>{prettyNeighborhood(n.name)}</strong>
                <br />
                {agg.population ? `${agg.population.toLocaleString('es-ES')} hab.` : 'Barrio OSM'}
                {agg.quejas.total > 0 &&
                  ` · ${agg.quejas.total} queja${agg.quejas.total === 1 ? '' : 's'}`}
              </div>
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
