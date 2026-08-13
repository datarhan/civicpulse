// @ts-check
import { useMemo } from 'react'
import { Circle, Tooltip } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { useQuejas, prettyNeighborhood } from '../../../hooks/useQuejas'
import { computePerNeighborhood, healthFromCounts } from '../../../lib/neighborhood-aggregate'

// Radius scales by sqrt(count) so 1 queja isn't an invisible dot and 100 don't
// swamp the map — identical formula to the /quejas heatmap so both surfaces read
// the same at zoom 13.
const bubbleRadius = (count) => 100 + Math.sqrt(count) * 90 // meters

/**
 * Citizen-quejas heat overlay for the landing map. One translucent Circle per
 * OSM barrio that has ≥1 queja, joined at render time from geo + quejas via the
 * same pure lib the /quejas heatmap uses (computePerNeighborhood + the shared
 * healthFromCounts colour scale). Returns null when no barrio has quejas — an
 * honest empty state, never a coloured absence. Replaces the retired
 * schematic-L9 MetroTrainsLayer in the map's layer control.
 */
export function QuejasLayer() {
  const { data: geo } = useGeo()
  const { data: quejas } = useQuejas()
  const rows = useMemo(
    () => computePerNeighborhood(quejas?.items ?? [], geo?.neighborhoods),
    [quejas, geo?.neighborhoods],
  )
  if (rows.length === 0) return null
  return (
    <>
      {rows.map((n) => {
        const { color } = healthFromCounts(n.total, n.resueltas, n.silencios)
        return (
          <Circle
            key={n.slug}
            center={n.centroid}
            radius={bubbleRadius(n.total)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.35,
              weight: 1.5,
              opacity: 0.8,
            }}
            eventHandlers={{
              // react-leaflet doesn't propagate pathOptions.className to the SVG
              // path reliably (see MoneyLayer), so tag it on layer-add — a stable
              // hook for tests + any future styling.
              add: (e) => {
                const el = e.target.getElement && e.target.getElement()
                if (el) el.classList.add('cp-queja-circle')
              },
            }}
          >
            <Tooltip direction="top" sticky>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                <strong>{prettyNeighborhood(n.name || n.slug)}</strong>
                <br />
                {n.total} queja{n.total === 1 ? '' : 's'} ·{' '}
                <span style={{ color: '#16A34A' }}>✓ {n.resueltas}</span> ·{' '}
                <span style={{ color: 'var(--civic)' }}>⏳ {n.pendientes}</span>
                {n.silencios > 0 && (
                  <>
                    {' '}
                    · <span style={{ color: '#DC2626' }}>⚠ {n.silencios}</span>
                  </>
                )}
              </div>
            </Tooltip>
          </Circle>
        )
      })}
    </>
  )
}
