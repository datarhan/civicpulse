// @ts-check
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { ObraPopup } from '../popups/ObraPopup'
import { MARGEN_FICHA_ARRIBA } from '../shared'
import { useAbreBarrio, useCesionBarrios } from './cesion-barrios'

/** Radio, en px, del pin de una obra. */
export const RADIO_OBRA = 9

/**
 * Obra pins on the landing map. One CircleMarker per resolved point (obra name
 * or zona afectada → gazetteer point at scrape time); obras sharing the same
 * point (e.g. two actuaciones on the same urbanización street) stack into one
 * marker whose popup lists them all. Real data only: an obra without a
 * resolved point simply doesn't paint.
 */
export function ObrasLayer({ obras, pines }) {
  const { data: geo } = useGeo()
  const { bajoElPin } = useCesionBarrios(geo?.neighborhoods, pines)
  const abreBarrio = useAbreBarrio()
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
      {/* El encuadre lo hace StylizedMap, una sola vez y con las obras: dos encuadres
          sueltos acababan en un zoom u otro según qué instantánea llegara antes. */}
      {[...byPoint.values()].map((group) => (
        <CircleMarker
          key={group[0].id}
          center={[group[0].lat, group[0].lng]}
          radius={RADIO_OBRA}
          pathOptions={{ color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.55 }}
          eventHandlers={{
            // Como `cp-money-pin`: un gancho estable para las pruebas.
            add: (e) => e.target.getElement?.()?.classList.add('cp-obra-pin'),
          }}
        >
          {/* En los paneles de Leaflet y no en el del dinero: ver MoneyLayer. */}
          <Tooltip pane="tooltipPane">{group.map((o) => o.nombre).join(' · ')}</Tooltip>
          <Popup pane="popupPane" autoPanPaddingTopLeft={MARGEN_FICHA_ARRIBA}>
            <ObraPopup
              obras={group}
              barriosDebajo={bajoElPin({
                point: [group[0].lat, group[0].lng],
                radio: RADIO_OBRA,
              })}
              onAbrirBarrio={abreBarrio}
            />
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
