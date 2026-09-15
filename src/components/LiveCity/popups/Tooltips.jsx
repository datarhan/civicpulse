// @ts-check
import { prettyNeighborhood } from '../../../hooks/useQuejas'
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'

/**
 * Los rótulos que flotan al pasar por encima de un pin de dinero, un barrio, un
 * incendio o una burbuja de quejas.
 *
 * Vivían escritos dentro de cada capa, y una capa no se monta sin un mapa de
 * Leaflet: ninguna prueba podía leerlos, y en la portada valenciana decían
 * «obras», «Barrio OSM» y «consta en otro término» en castellano sin que nada lo
 * notara. Aquí se pintan solos, como los globos de al lado; la capa sólo decide
 * dónde flotan.
 */

const fmtEurCompacto = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

const cuerpo = { fontFamily: 'Outfit, sans-serif', fontSize: 'var(--fs-meta)' }

/** El pin del dinero situado: el lugar, lo situado y cuántas obras. */
export function PinDineroTooltip({ lugar }) {
  const t = useT()
  return (
    <div style={cuerpo}>
      <strong>{lugar.name}</strong>
      <br />
      {fmtEurCompacto(lugar.amount)} · {lugar.count}{' '}
      {t(lugar.count === 1 ? 'map.obras.una' : 'map.obras.varias')}
    </div>
  )
}

/** El punto de un barrio: su nombre, su padrón y cuántas quejas pusieron sus vecinos. */
export function BarrioTooltip({ agg }) {
  const t = useT()
  return (
    <div style={cuerpo}>
      <strong>{prettyNeighborhood(agg.name)}</strong>
      <br />
      {agg.population
        ? rellena(t('map.barrio.habitantes'), { n: agg.population.toLocaleString('es-ES') })
        : t('map.barrio.osm')}
      {agg.quejas.total > 0 &&
        ` · ${rellena(t(agg.quejas.total === 1 ? 'map.quejas.una' : 'map.quejas.varias'), { n: agg.quejas.total })}`}
    </div>
  )
}

/** Un perímetro de incendio: el año, el paraje y la superficie del incendio entero. */
export function IncendioTooltip({ incendio: i }) {
  const t = useT()
  return (
    <div style={cuerpo}>
      <strong>{i.anyo}</strong>
      {i.paraje ? ` · ${i.paraje}` : ''}
      <br />
      {i.superficieHa.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ha
      {!i.propio && ` · ${t('map.incendio.otroTermino')}`}
    </div>
  )
}

/** La burbuja de quejas de un barrio, con las tres cifras sólo si se pueden leer. */
export function QuejasTooltip({ fila: n }) {
  const t = useT()
  return (
    <div style={cuerpo}>
      <strong>{prettyNeighborhood(n.name || n.slug)}</strong>
      <br />
      {/* Variantes -ink: el tono base daba 3,3:1 sobre el blanco del
          popup, y axe no lo ve porque un popup de Leaflet no existe
          hasta que se abre. Es el mismo fallo que ya se corrigió en
          /quejas, vivo todavía aquí. */}
      {rellena(t(n.total === 1 ? 'map.quejas.una' : 'map.quejas.varias'), { n: n.total })}
      {/* Sin registro no hay respuesta municipal que contar: ver
          `lib/reloj-lpacap`. */}
      {n.medible ? (
        <>
          {' '}
          · <span style={{ color: 'var(--ok-ink)' }}>✓ {n.resueltas}</span> ·{' '}
          <span style={{ color: 'var(--civic)' }}>⏳ {n.pendientes}</span>
          {n.silencios > 0 && (
            <>
              {' '}
              · <span style={{ color: 'var(--crit-ink)' }}>⚠ {n.silencios}</span>
            </>
          )}
        </>
      ) : (
        <>
          <br />
          <span style={{ color: 'rgba(11,15,25,.55)' }}>{t(`quejas.reloj.${n.motivo}.corto`)}</span>
        </>
      )}
    </div>
  )
}
