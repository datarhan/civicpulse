// @ts-check
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'

/**
 * La puerta a la ficha de un barrio desde la ficha del pin que tapa su punto
 * (`lib/barrios-bajo-pines`): ese punto cede el toque al pin, y aquí se devuelve.
 * Casi siempre es el barrio del propio lugar —el pin de una urbanización va en su
 * mismo punto—; el nombre se escribe igual, porque a poco zoom puede ser otro.
 */
export function EnlacesABarrio({ barrios, onAbrir }) {
  const t = useT()
  if (!barrios?.length || !onAbrir) return null
  return (
    <div style={{ display: 'grid', justifyItems: 'start', gap: 2, marginTop: 4 }}>
      {barrios.map((b) => (
        <button
          key={b.id}
          type="button"
          className="cp-enlace-barrio"
          onClick={() => onAbrir(b)}
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'var(--fs-micro)',
            fontWeight: 600,
            color: 'var(--civic)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            textAlign: 'left',
          }}
        >
          {rellena(t('map.lugar.fichaBarrio'), { barrio: b.name })} →
        </button>
      ))}
    </div>
  )
}
