// @ts-check
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'

const ENLACE = {
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
}

/**
 * La puerta a la ficha de un barrio desde la ficha del pin que tapa su punto
 * (`lib/barrios-bajo-pines`): ese punto cede el toque al pin, y aquí se devuelve.
 * Casi siempre es el barrio del propio lugar —el pin de una urbanización va en su
 * mismo punto—; el nombre se escribe igual, porque a poco zoom puede ser otro.
 *
 * Con varios barrios, un rótulo y los nombres seguidos, no una línea por barrio. A
 * 375×629 el mapa deja unos 115 px entre el aire de arriba (`AIRE_ARRIBA`; hasta
 * el 27-10-2026, la cinta «DIRECTO») y la pila de controles plegada, y la ficha
 * del Passeig del Molinet llevaba tres líneas de enlace: la
 * tercera, Santa Mònica, quedaba debajo de la pila (17-10-2026, al quitarse el pin
 * propio de Santa Mònica, cuyo punto pasó a ceder al del Molinet).
 */
export function EnlacesABarrio({ barrios, onAbrir }) {
  const t = useT()
  if (!barrios?.length || !onAbrir) return null
  if (barrios.length === 1) {
    const [b] = barrios
    return (
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          className="cp-enlace-barrio"
          onClick={() => onAbrir(b)}
          style={ENLACE}
        >
          {rellena(t('map.lugar.fichaBarrio'), { barrio: b.name })} →
        </button>
      </div>
    )
  }
  return (
    <div
      style={{
        marginTop: 4,
        fontSize: 'var(--fs-micro)',
        lineHeight: 1.45,
        color: 'var(--ink70)',
      }}
    >
      {t('map.lugar.fichasBarrio')}{' '}
      {barrios.map((b, i) => (
        <span key={b.id}>
          {i > 0 ? ' · ' : null}
          <button
            type="button"
            className="cp-enlace-barrio"
            onClick={() => onAbrir(b)}
            style={ENLACE}
          >
            {b.name}
          </button>
        </span>
      ))}
    </div>
  )
}
