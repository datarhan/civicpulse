// @ts-check
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'

const fmtEur = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

/**
 * "Obras en curso" pins on the landing map. One CircleMarker per obra the
 * place-resolver situated (obra name → gazetteer point at scrape time). Real
 * data only: an obra without a resolved point simply doesn't paint.
 */
export function ObrasLayer({ obras }) {
  const located = (obras ?? []).filter(
    (o) => typeof o.lat === 'number' && typeof o.lng === 'number',
  )
  return (
    <>
      {located.map((o) => (
        <CircleMarker
          key={o.id}
          center={[o.lat, o.lng]}
          radius={9}
          pathOptions={{ color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.55 }}
        >
          <Tooltip>{o.nombre}</Tooltip>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <strong>{o.nombre}</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {o.empresa ? `${o.empresa}` : ''}
                {o.importeAdjudicacion != null ? ` · ${fmtEur(o.importeAdjudicacion)} adj.` : ''}
                {typeof o.bajaPct === 'number' ? ` · baja ${o.bajaPct}%` : ''}
                {o.plazoMeses ? ` · ${o.plazoMeses} meses` : ''}
                {o.inicio ? ` · inicio ${o.inicio}` : ''}
              </div>
              <a
                href={o.fichaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11 }}
              >
                Ver ficha ↗
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
