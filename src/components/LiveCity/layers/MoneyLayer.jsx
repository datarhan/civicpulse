// @ts-check
import { useMemo } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { placeAmountsAt } from '../../../lib/tender-points'
import { useCpvLabels } from '../../../hooks/useCpvLabels'
import { PlacePopup } from '../popups/PlacePopup'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

/** Pixel radius for a money pin, √-scaled so a €500k obra doesn't dwarf a €20k one. */
function pinRadius(amount) {
  const a = Number(amount) || 0
  if (a <= 0) return 0
  return Math.max(6, Math.min(26, 5 + Math.sqrt(a) / 28))
}

/**
 * Precise "obras situadas" pins on the landing map. One CircleMarker per place
 * the resolver situated money at (street / equipment / urbanización / barrio),
 * meter... pixel-radius sized by the € located ≤ the timeline cursor `at`
 * (cumulative via placeAmountsAt). DANA-heavy pins read amber, ordinary spend
 * civic-blue. Hover → quick total; click → PlacePopup with the contract cards.
 * Real data only: a pin exists only when a contract title named that place.
 */
export function MoneyLayer({ snapshot, at, danaOnly, contractsById }) {
  const { data: cpv } = useCpvLabels()
  const places = useMemo(
    () => [...placeAmountsAt(snapshot?.assignments, { at, danaOnly }).values()],
    [snapshot, at, danaOnly],
  )

  return (
    <>
      {places.map((p) => {
        const color = p.dana ? '#E08600' : '#2463EB'
        return (
          <CircleMarker
            key={p.sourceId}
            center={p.point}
            radius={pinRadius(p.amount)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.5,
              weight: 1.5,
              opacity: 0.95,
            }}
            eventHandlers={{
              // react-leaflet doesn't propagate pathOptions.className to the SVG
              // path reliably, so tag it on layer-add (a stable hook for tests +
              // any future styling).
              add: (e) => {
                const el = e.target.getElement && e.target.getElement()
                if (el) el.classList.add('cp-money-pin')
              },
            }}
          >
            <Tooltip direction="top">
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                <strong>{p.name}</strong>
                <br />
                {fmtEur(p.amount)} · {p.count} obra{p.count === 1 ? '' : 's'}
              </div>
            </Tooltip>
            <Popup closeButton={true} autoPan={true} maxWidth={320}>
              <PlacePopup
                place={p}
                assignments={snapshot?.assignments}
                contractsById={contractsById}
                danaOnly={danaOnly}
                cpvDict={cpv?.codes}
              />
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
