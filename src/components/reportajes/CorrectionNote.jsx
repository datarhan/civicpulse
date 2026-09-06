/**
 * A correction on a published reportaje, shown ABOVE the figures it concerns.
 *
 * Reportaje figures are frozen on purpose: a published investigation should not
 * silently rewrite its numbers, and "datos a <fecha>" already tells the reader
 * the data has a cut-off. What that framing does NOT cover is a figure that was
 * never right — there "datos a X" reads as "correct as of X". Both pieces here
 * carried totals computed from a contract registry that was dropping every
 * `formalized` (i.e. signed) contract, so their money figures were floors, not
 * totals.
 *
 * Placed before the KPIs rather than in a footnote: what a correction owes the
 * reader is to reach them before they read the number, not after.
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

/**
 * Plegada por defecto desde el 17-08-2026, a petición: el HECHO de la
 * corrección sigue llegando antes que la cifra —summary con fecha y primera
 * frase, mismo tono crit, misma posición sobre los KPIs— y lo que se pliega
 * es el detalle. `<details>` nativo (el patrón de ServicioCard): sin estado
 * JS, accesible de serie, y el lector que quiere el porqué entero lo abre.
 */
export function CorrectionNote({ correcciones }) {
  if (!correcciones?.length) return null
  return (
    <>
      {correcciones.map((c) => (
        <details
          key={c.fecha}
          style={{
            border: '1px solid var(--border2)',
            borderLeft: '3px solid var(--crit)',
            background: 'var(--crit-soft)',
            borderRadius: 'var(--r-card)',
            padding: '12px 14px',
            margin: '0 0 26px',
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
    </>
  )
}
