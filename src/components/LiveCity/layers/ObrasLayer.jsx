// @ts-check
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { ObraPopup } from '../popups/ObraPopup'
import { FitToPins } from './FitToPins'

/**
 * Obra pins on the landing map. One CircleMarker per resolved point (obra name
 * or zona afectada → gazetteer point at scrape time); obras sharing the same
 * point (e.g. two actuaciones on the same urbanización street) stack into one
 * marker whose popup lists them all. Real data only: an obra without a
 * resolved point simply doesn't paint.
 */
export function ObrasLayer({ obras }) {
  const located = (obras ?? []).filter(
    (o) => typeof o.lat === 'number' && typeof o.lng === 'number',
  )
  const byPoint = new Map()
  for (const o of located) {
    const key = `${o.lat},${o.lng}`
    if (!byPoint.has(key)) byPoint.set(key, [])
    byPoint.get(key).push(o)
  }
  return (
    <>
      <FitToPins points={located.map((o) => [o.lat, o.lng])} />
      {[...byPoint.values()].map((group) => (
        <CircleMarker
          key={group[0].id}
          center={[group[0].lat, group[0].lng]}
          radius={9}
          pathOptions={{ color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.55 }}
        >
          <Tooltip>{group.map((o) => o.nombre).join(' · ')}</Tooltip>
          <Popup>
            <ObraPopup obras={group} />
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
