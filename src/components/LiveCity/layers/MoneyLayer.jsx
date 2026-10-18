// @ts-check
import { useMemo } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { placeAmountsAt } from '../../../lib/tender-points'
import { useCpvLabels } from '../../../hooks/useCpvLabels'
import { useGeo } from '../../../hooks/useGeo'
import { PlacePopup } from '../popups/PlacePopup'
import { PinDineroTooltip } from '../popups/Tooltips'
import { MARGEN_FICHA_ARRIBA } from '../shared'
import { useAbreBarrio, useCesionBarrios } from './cesion-barrios'

/** Pixel radius for a money pin, √-scaled so a €500k obra doesn't dwarf a €20k one. */
export function pinRadius(amount) {
  const a = Number(amount) || 0
  if (a <= 0) return 0
  return Math.max(6, Math.min(26, 5 + Math.sqrt(a) / 28))
}

/**
 * Precise "contratos situados" pins on the landing map. One CircleMarker per place
 * the resolver situated money at (street / equipment / urbanización / barrio),
 * meter... pixel-radius sized by the € located ≤ the timeline cursor `at`
 * (cumulative via placeAmountsAt). DANA-heavy pins read amber, ordinary spend
 * civic-blue. Hover → quick total; click → PlacePopup with the contract cards.
 * Real data only: a pin exists only when a contract title named that place.
 */
export function MoneyLayer({
  snapshot,
  at,
  danaOnly,
  obrasOnly,
  contractsById,
  grupos,
  tenders,
  pines,
}) {
  const { data: cpv } = useCpvLabels()
  const { data: geo } = useGeo()
  // Un punto de barrio que tapa el centro de un pin le cede el toque, y la ficha
  // del pin lleva a la del barrio (`lib/barrios-bajo-pines`). `pines` son estos
  // mismos más los de las obras, de StylizedMap: las tres capas ven el mismo mapa.
  const { bajoElPin } = useCesionBarrios(geo?.neighborhoods, pines)
  const abreBarrio = useAbreBarrio()
  const places = useMemo(
    () => [...placeAmountsAt(snapshot?.assignments, { at, danaOnly, obrasOnly }).values()],
    [snapshot, at, danaOnly, obrasOnly],
  )

  return (
    <>
      {/* El encuadre lo hace StylizedMap, una sola vez y con las obras: dos encuadres
          sueltos acababan en un zoom u otro según qué instantánea llegara antes. */}
      {places.map((p) => {
        // Petróleo, no el hex del PP. Leaflet escribe esto en un atributo SVG,
        // donde var(--civic) no resuelve, así que el literal es obligado.
        // §07: la magnitud lleva un solo color; el ámbar marca el subconjunto DANA.
        const color = p.dana ? '#E08600' : '#0E5B62'
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
            {/* Globo y rótulo en los paneles propios de Leaflet, a z-700 y 650: dentro
                de un <Pane>, react-leaflet los mete en él, y la ficha se abría a z-420,
                debajo de los puntos de barrio, las estaciones y los controles. */}
            <Tooltip direction="top" pane="tooltipPane">
              <PinDineroTooltip lugar={p} />
            </Tooltip>
            <Popup
              closeButton={true}
              autoPan={true}
              autoPanPaddingTopLeft={MARGEN_FICHA_ARRIBA}
              maxWidth={320}
              pane="popupPane"
            >
              <PlacePopup
                place={p}
                assignments={snapshot?.assignments}
                contractsById={contractsById}
                grupos={grupos}
                tenders={tenders}
                danaOnly={danaOnly}
                obrasOnly={obrasOnly}
                cpvDict={cpv?.codes}
                barriosDebajo={bajoElPin({ point: p.point, radio: pinRadius(p.amount) })}
                onAbrirBarrio={abreBarrio}
              />
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
