// @ts-check
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useCivicPoi } from '../../../hooks/useCivicPoi'
import { POI_CATEGORIES } from '../../../lib/civic-poi'

/**
 * Public-service points of interest (schools, health, parks, sport, culture,
 * civic buildings) from OSM, one small category-coloured CircleMarker each.
 * Hover shows the name + category. Only NAMED civic facilities are in the
 * snapshot, so there's no private-pool noise. Rendered only while toggled on.
 */
export function CivicPoiLayer() {
  const { data } = useCivicPoi()
  const pois = data?.pois || []
  return (
    <>
      {pois.map((p) => {
        const cat = POI_CATEGORIES[p.category] || { label: p.category, color: '#64748B' }
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{ color: '#0B0F19', weight: 1, fillColor: cat.color, fillOpacity: 0.92 }}
          >
            <Tooltip direction="top">
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                <strong>{p.name}</strong>
                <br />
                <span style={{ color: cat.color, fontWeight: 600 }}>{cat.label}</span>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
