// @ts-check
import { useMemo } from 'react'
import { Circle, Popup, Tooltip } from 'react-leaflet'
import { moneyRadiusMeters, zoneAmountsAt } from '../../../lib/tender-geo'
import { ZonePopup } from '../popups/ZonePopup'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

/**
 * Money-by-zone bubbles on the landing map. One <Circle> per tender-geo zone,
 * meter-radius sized by the € located ≤ the timeline cursor `at` (cumulative
 * via zoneAmountsAt). DANA-heavy zones read amber, ordinary spend civic-blue.
 * Hover → quick total; click → ZonePopup with the drill-down contract list.
 * Real data only: zones carry money solely when a contract title named them.
 */
export function MoneyLayer({ snapshot, at, danaOnly, contractsById }) {
  const amounts = useMemo(
    () => zoneAmountsAt(snapshot?.assignments, { at, danaOnly }),
    [snapshot, at, danaOnly],
  )
  const zones = (snapshot?.zones || [])
    .map((z) => ({ ...z, live: amounts.get(z.slug) || { amount: 0, count: 0 } }))
    .filter((z) => z.live.amount > 0)

  return (
    <>
      {zones.map((z) => {
        const danaHeavy = danaOnly || (z.danaAmount > 0 && z.danaAmount >= z.amount * 0.5)
        const color = danaHeavy ? '#E08600' : '#2463EB'
        return (
          <Circle
            key={z.slug}
            center={z.centroid}
            radius={moneyRadiusMeters(z.live.amount)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.34,
              weight: 1.5,
              opacity: 0.95,
            }}
          >
            <Tooltip direction="top">
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                <strong>{z.name}</strong>
                <br />
                {fmtEur(z.live.amount)} · {z.live.count} obra{z.live.count === 1 ? '' : 's'}
              </div>
            </Tooltip>
            <Popup closeButton={true} autoPan={true} maxWidth={320}>
              <ZonePopup
                zone={z}
                snapshot={snapshot}
                contractsById={contractsById}
                danaOnly={danaOnly}
              />
            </Popup>
          </Circle>
        )
      })}
    </>
  )
}
