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
 * `**negrita**` y saltos de párrafo, y nada más.
 *
 * El texto se pintaba crudo, así que la corrección del 02-08-2026 llevaba meses
 * publicada enseñando sus propios asteriscos —«**Se ha corregido el ranking…**»—
 * y un párrafo único de doce líneas. Lo escribe una persona en un JSON y espera
 * que se lea como lo escribió.
 *
 * NO es un intérprete de Markdown y no debe convertirse en uno: React escapa
 * cada trozo, así que aquí no entra HTML por mucho que lo traiga el JSON. Un
 * asterisco suelto se queda como asterisco, que es lo que quiere decir.
 */
export function trozos(texto) {
  return texto.split(/\n\n+/).map((parrafo) =>
    parrafo.split(/(\*\*[^*]+\*\*)/g).map((t) => {
      if (t.startsWith('**') && t.endsWith('**') && t.length > 4) return { negrita: t.slice(2, -2) }
      return { texto: t }
    }),
  )
}

export function CorrectionNote({ correcciones }) {
  if (!correcciones?.length) return null
  return (
    <>
      {correcciones.map((c) => (
        <div
          key={c.fecha}
          style={{
            border: '1px solid var(--border2)',
            borderLeft: '3px solid var(--crit)',
            background: 'var(--crit-soft)',
            borderRadius: 10,
            padding: '12px 14px',
            margin: '0 0 26px',
            fontSize: 13.5,
            lineHeight: 1.6,
            color: 'var(--ink80)',
          }}
        >
          {trozos(c.texto).map((parrafo, i) => (
            <p key={i} style={{ margin: i === 0 ? '0' : '10px 0 0' }}>
              {i === 0 && (
                <strong style={{ color: 'var(--crit-ink)' }}>Corrección · {c.fecha}. </strong>
              )}
              {parrafo.map((t, j) =>
                t.negrita ? <strong key={j}>{t.negrita}</strong> : <span key={j}>{t.texto}</span>,
              )}
            </p>
          ))}
        </div>
      ))}
    </>
  )
}
