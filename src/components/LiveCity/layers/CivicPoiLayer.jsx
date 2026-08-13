// @ts-check
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useCivicPoi } from '../../../hooks/useCivicPoi'
import { POI_CATEGORIES } from '../../../lib/civic-poi'

/**
 * Public-service points of interest (schools, health, parks, sport, culture,
 * civic buildings) from OSM, one small category-coloured CircleMarker each.
 * Hover shows the name + category. Only NAMED civic facilities are in the
 * snapshot, so there's no private-pool noise.
 *
 * Two modes. On its own (`dimmed: false`) it is a directory of public
 * facilities. Underneath the money layer (`dimmed: true`) it is CONTEXT: the
 * same points at half strength and a smaller radius, there to answer "what is
 * at this address" for the spend pins on top, without competing with them.
 * That is the whole reason the layer survived being demoted from the landing
 * default — a euro figure floating over farmland says nothing; the same figure
 * over the Casa de Cultura says something.
 *
 * @param {{ dimmed?: boolean }} props
 */
export function CivicPoiLayer({ dimmed = false }) {
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
            radius={dimmed ? 3.5 : 5}
            pathOptions={{
              // Context takes no clicks and shows no tooltip — it exists to be
              // read past, not interacted with.
              interactive: !dimmed,
              color: dimmed ? 'rgba(11,15,25,.45)' : '#0B0F19',
              weight: 1,
              fillColor: cat.color,
              fillOpacity: dimmed ? 0.4 : 0.92,
            }}
          >
            {!dimmed && (
              <Tooltip direction="top">
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'var(--fs-meta)' }}>
                  <strong>{p.name}</strong>
                  <br />
                  <span style={{ color: cat.color, fontWeight: 600 }}>{cat.label}</span>
                </div>
              </Tooltip>
            )}
          </CircleMarker>
        )
      })}
    </>
  )
}
