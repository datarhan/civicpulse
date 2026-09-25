/**
 * The corrections to a published reportaje: a one-line notice ABOVE the
 * figures, and the full log at the END of the piece.
 *
 * Reportaje figures are frozen on purpose: a published investigation should not
 * silently rewrite its numbers, and "datos a <fecha>" already tells the reader
 * the data has a cut-off. What that framing does NOT cover is a figure that was
 * never right — there "datos a X" reads as "correct as of X". Both pieces here
 * carried totals computed from a contract registry that was dropping every
 * `formalized` (i.e. signed) contract, so their money figures were floors, not
 * totals.
 *
 * What a correction owes the reader is to reach them before they read the
 * number, not after. Until 24-09-2026 that was met by putting every correction
 * above the KPIs; with four of them on one piece the head of the page read as a
 * list of mistakes before the reader reached the story. Now the FACT stays above
 * the figures — how many corrections there are, and the date of the latest —
 * in a single line that jumps to the full log, and the log itself closes the
 * piece. The rule did not move; only the detail did.
 */

/**
 * `**negrita**` y saltos de párrafo, y nada más — el trozeador nació aquí (la
 * corrección del 02-08-2026 llevó meses publicada enseñando sus propios
 * asteriscos) y desde el 06-09-2026 vive en src/lib/texto-negrita.js porque
 * los relatos de las biografías tenían el mismo defecto. Se re-exporta para
 * que el test que lo fijó siga leyéndolo de aquí.
 */
import { trozos, primeraFrase } from '../../lib/texto-negrita.js'
export { trozos, primeraFrase }

/** El ancla del registro al final de la pieza, compartida por el aviso y el registro. */
export const ANCLA_CORRECCIONES = 'correcciones'

/** La fecha más reciente: son ISO (AAAA-MM-DD), así que ordenan como texto. */
const ultima = (correcciones) => correcciones.map((c) => c.fecha).reduce((a, b) => (b > a ? b : a))

/**
 * Una línea sobre los KPIs: cuántas correcciones hay y la fecha de la última,
 * con un enlace al registro del final. Mismo tono crit que el registro, para
 * que el lector reconozca las dos piezas como la misma cosa.
 */
export function CorrectionNotice({ correcciones, style }) {
  if (!correcciones?.length) return null
  const n = correcciones.length
  const fecha = ultima(correcciones)
  return (
    <p
      className="mono cp-ancho"
      style={{
        borderLeft: '3px solid var(--crit)',
        background: 'var(--crit-soft)',
        borderRadius: 'var(--r-input)',
        padding: '8px 12px',
        margin: '0 0 26px',
        fontSize: 'var(--fs-meta)',
        lineHeight: 1.5,
        color: 'var(--ink70)',
        ...style,
      }}
    >
      <strong style={{ color: 'var(--crit-ink)' }}>
        {n === 1 ? 'Esta pieza tiene una corrección' : `Esta pieza tiene ${n} correcciones`}
      </strong>
      {n === 1 ? `, del ${fecha}` : ` · la última, del ${fecha}`} ·{' '}
      <a
        href={`#${ANCLA_CORRECCIONES}`}
        // El enlace no se parte: a 375px la flecha se quedaba sola en su línea.
        style={{ color: 'var(--crit-ink)', whiteSpace: 'nowrap' }}
      >
        {n === 1 ? 'verla al final ↓' : 'verlas al final ↓'}
      </a>
    </p>
  )
}

/**
 * El registro completo, al final de la pieza. Plegado por defecto desde el
 * 17-08-2026, a petición: la fecha y la primera frase de cada corrección a la
 * vista, y lo que se pliega es el detalle. `<details>` nativo (el patrón de
 * ServicioCard): sin estado JS, accesible de serie, y el lector que quiere el
 * porqué entero lo abre.
 */
export function CorrectionNote({ correcciones }) {
  if (!correcciones?.length) return null
  return (
    <section
      id={ANCLA_CORRECCIONES}
      aria-labelledby={`${ANCLA_CORRECCIONES}-titulo`}
      // La barra superior es fija: sin este margen, el salto desde el aviso deja
      // el título del registro debajo de ella.
      style={{ scrollMarginTop: 72, margin: '36px 0 0' }}
    >
      <h2
        id={`${ANCLA_CORRECCIONES}-titulo`}
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          fontWeight: 500,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          margin: '0 0 12px',
          paddingTop: 14,
          borderTop: '1px solid var(--border)',
        }}
      >
        Correcciones
      </h2>
      {correcciones.map((c) => (
        <details
          key={c.fecha}
          style={{
            border: '1px solid var(--border2)',
            borderLeft: '3px solid var(--crit)',
            background: 'var(--crit-soft)',
            borderRadius: 'var(--r-card)',
            padding: '12px 14px',
            margin: '0 0 14px',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.6,
            color: 'var(--ink70)',
          }}
        >
          <summary style={{ cursor: 'pointer' }}>
            <strong style={{ color: 'var(--crit-ink)' }}>Corrección · {c.fecha}.</strong>{' '}
            {primeraFrase(c.texto)}
          </summary>
          <div style={{ marginTop: 8 }}>
            {trozos(c.texto).map((parrafo, i) => (
              <p key={i} style={{ margin: i === 0 ? '0' : '10px 0 0' }}>
                {parrafo.map((t, j) =>
                  t.negrita ? <strong key={j}>{t.negrita}</strong> : <span key={j}>{t.texto}</span>,
                )}
              </p>
            ))}
          </div>
        </details>
      ))}
    </section>
  )
}
