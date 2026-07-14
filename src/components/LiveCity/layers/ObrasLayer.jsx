// @ts-check
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { FitToPins } from './FitToPins'

const fmtEur = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

const PROGRAMA_LABEL = {
  feder: 'FEDER 2019–20',
  renove: 'Plan RENOVE 2023–24',
}

function renderObraDetail(o) {
  const importe = o.importeAdjudicacion ?? o.costePrevisto
  const importeLabel = o.importeAdjudicacion != null ? 'adj.' : 'previsto'
  const fecha = o.inicio
    ? `inicio ${o.inicio}`
    : o.fechaEjecucion
      ? `ejecución ${o.fechaEjecucion}`
      : ''
  return (
    <div key={o.id} style={{ marginBottom: 6 }}>
      <strong>{o.nombre}</strong>
      {o.programa && (
        <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>
          {PROGRAMA_LABEL[o.programa] ?? o.programa}
        </span>
      )}
      <div style={{ fontSize: 12, marginTop: 2 }}>
        {o.empresa ? `${o.empresa}` : ''}
        {importe != null ? ` · ${fmtEur(importe)} ${importeLabel}` : ''}
        {typeof o.bajaPct === 'number' ? ` · baja ${o.bajaPct}%` : ''}
        {o.plazoMeses ? ` · ${o.plazoMeses} meses` : ''}
        {fecha ? ` · ${fecha}` : ''}
      </div>
      <a href={o.fichaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
        Ver ficha ↗
      </a>
    </div>
  )
}

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
            <div style={{ minWidth: 180 }}>{group.map((o) => renderObraDetail(o))}</div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
