// @ts-check
import { Marker, Pane, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useCivicPoi } from '../../../hooks/useCivicPoi'
import { POI_CATEGORIES, POI_HALO, POI_INK, POI_SHAPES, POI_VIEWBOX } from '../../../lib/civic-poi'

/**
 * Public-service points of interest (schools, health, parks, sport, culture,
 * civic buildings) from OSM, one category-SHAPED marker each. Hover shows the
 * name + category.
 *
 * The category rides on the silhouette, not on a colour — see the §02 note in
 * lib/civic-poi.js for why six greys were one grey and why chroma is not
 * available here. The halo is what makes the ink legible over parks, water and
 * motorway ribbons alike, so it is not decoration.
 *
 * The layer paints only when its own chip is on. It used to render dimmed
 * underneath the money layer as "context", which meant the landing opened with
 * Servicios dots on the map and a Servicios chip that read OFF — a control
 * lying about what it controls, which is the one thing LayerControl documents
 * itself as never doing.
 */
export function CivicPoiLayer() {
  const { data } = useCivicPoi()
  const pois = data?.pois || []
  // Own pane at z-450: above the vector overlay that holds the spend pins
  // (400), below the marker pane that holds the barrio names (600). JSX order
  // cannot express this — a divIcon lands in the shared marker pane whatever
  // order it mounts in — so the stacking is declared here rather than inherited
  // by accident.
  //
  // Measured, because the obvious reading is the wrong one. Tucking the layer
  // UNDER the money was tried first, on the old "context belongs underneath"
  // logic: 27 of the 35 silhouettes then sat beneath a translucent spend circle,
  // washed out in the town centre where the contracts cluster and unhoverable at
  // their own centre. A layer the reader had to switch on by hand was legible
  // only where nothing was happening. The exchange is not symmetric either — a
  // 16px silhouette takes a small bite out of a large spend circle, while a
  // large spend circle swallows a silhouette whole — and the `pointer-events`
  // rule in index.css shrinks that bite to the painted shape.
  return (
    <Pane name="cp-poi" style={{ zIndex: 450 }}>
      {pois.map((p) => {
        // A category outside the closed scraper enum gets the outline
        // treatment: visible (it is a real facility, hiding it would be a lie
        // of omission) but plainly not one of the six the legend explains.
        const cat = POI_CATEGORIES[p.category]
        const path = cat ? POI_SHAPES[cat.shape] : POI_SHAPES.circulo
        const unassigned = !cat
        // divIcon html is raw innerHTML — every value below is a module
        // constant, never the OSM-supplied name or category.
        const icon = L.divIcon({
          className: 'cp-poi-marker',
          html: `<svg width="${POI_VIEWBOX}" height="${POI_VIEWBOX}" viewBox="0 0 ${POI_VIEWBOX} ${POI_VIEWBOX}" aria-hidden="true" focusable="false"><path d="${path}" fill="${unassigned ? 'none' : POI_INK}" stroke="${unassigned ? POI_INK : POI_HALO}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
          iconSize: [POI_VIEWBOX, POI_VIEWBOX],
          iconAnchor: [POI_VIEWBOX / 2, POI_VIEWBOX / 2],
        })
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon} title={p.name}>
            <Tooltip direction="top" offset={[0, -6]}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'var(--fs-meta)' }}>
                <strong>{p.name}</strong>
                <br />
                <span style={{ fontWeight: 600 }}>{cat ? cat.label : p.category}</span>
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </Pane>
  )
}
