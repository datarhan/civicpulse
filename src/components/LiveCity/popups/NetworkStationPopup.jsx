// @ts-check
import { useT } from '../../../i18n'
import { readableInk } from '../../../lib/contrast'

/**
 * El globo de una estación de la red completa de FGV: su nombre, sus líneas y
 * adónde mirar los horarios. Vivía escrito dentro de `FullNetwork`, que no se
 * puede montar sin un mapa, así que ninguna prueba podía leerlo; aparte, se lee.
 * Y la frase del enlace pasa por el catálogo: en la portada valenciana salía en
 * castellano.
 *
 * @param {{ name: string, refs: string[], colors: Record<string, string> }} props
 */
export function NetworkStationPopup({ name, refs, colors }) {
  const t = useT()
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 180 }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-body)', marginBottom: 6 }}>{name}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {refs.map((r) => (
          <span
            key={r}
            style={{
              background: colors[r] || '#64748B',
              color: readableInk(colors[r] || '#64748B'),
              fontFamily: 'DM Mono, monospace',
              fontSize: 'var(--fs-micro)',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 'var(--r-input)',
            }}
          >
            {r}
          </span>
        ))}
      </div>
      <a
        href="https://www.metrovalencia.es"
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: 8,
          display: 'inline-block',
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          textDecoration: 'none',
        }}
      >
        {t('map.estacion.redHorarios')}
      </a>
    </div>
  )
}
