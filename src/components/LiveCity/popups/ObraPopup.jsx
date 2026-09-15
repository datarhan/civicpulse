// @ts-check
import { Fragment } from 'react'
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'

/**
 * El globo de las obras de las fichas municipales —FEDER y Plan RENOVE— que el
 * registro de contratos nunca situó: una ficha por obra, y las que comparten
 * punto, en el mismo globo.
 *
 * Vivía escrito dentro de `ObrasLayer`, que no se monta sin un mapa, así que
 * ninguna prueba podía leerlo, y en la portada valenciana decía «baja», «meses»
 * y «Ver ficha» en castellano. Sale aquí por el mismo camino que siguió el globo
 * de la red completa hacia `NetworkStationPopup`, y su cromo pasa por el catálogo.
 */

const fmtEur = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

/** Nombres propios de los dos programas: no se traducen. */
export const PROGRAMA_LABEL = {
  feder: 'FEDER 2019–20',
  renove: 'Plan RENOVE 2023–24',
}

function FichaDeObra({ obra: o }) {
  const t = useT()
  const importe = o.importeAdjudicacion ?? o.costePrevisto
  const fecha = o.inicio
    ? rellena(t('map.obra.inicio'), { fecha: o.inicio })
    : o.fechaEjecucion
      ? rellena(t('map.obra.ejecucion'), { fecha: o.fechaEjecucion })
      : ''
  return (
    <div style={{ marginBottom: 6 }}>
      <strong>{o.nombre}</strong>
      {o.programa && (
        <span style={{ fontSize: 'var(--fs-micro)', marginLeft: 6, opacity: 0.7 }}>
          {PROGRAMA_LABEL[o.programa] ?? o.programa}
        </span>
      )}
      <div style={{ fontSize: 'var(--fs-meta)', marginTop: 2 }}>
        {o.empresa ? `${o.empresa}` : ''}
        {/* «adj.» se escribe igual en los dos idiomas, así que va solo en su nodo
            de texto: pegado a la cifra, la guarda del mapa en valencià no podría
            distinguirlo de un rótulo sin traducir. */}
        {importe != null && (
          <>
            {` · ${fmtEur(importe)} `}
            {t(o.importeAdjudicacion != null ? 'map.obra.adjudicado' : 'map.obra.previsto')}
          </>
        )}
        {typeof o.bajaPct === 'number'
          ? ` · ${rellena(t('map.obra.baja'), { pct: o.bajaPct })}`
          : ''}
        {o.plazoMeses ? ` · ${rellena(t('map.obra.meses'), { n: o.plazoMeses })}` : ''}
        {fecha ? ` · ${fecha}` : ''}
      </div>
      <a
        href={o.fichaUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 'var(--fs-micro)' }}
      >
        {t('map.obra.verFicha')}
      </a>
    </div>
  )
}

/** @param {{ obras: any[] }} props */
export function ObraPopup({ obras }) {
  return (
    <div style={{ minWidth: 180 }}>
      {/* La clave en un Fragment: en un fichero con @ts-check, `key` sobre un
          componente de props inferidas no compila. El DOM no cambia. */}
      {obras.map((o) => (
        <Fragment key={o.id}>
          <FichaDeObra obra={o} />
        </Fragment>
      ))}
    </div>
  )
}
