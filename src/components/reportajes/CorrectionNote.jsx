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
          <strong style={{ color: 'var(--crit-ink)' }}>Corrección · {c.fecha}.</strong> {c.texto}
        </div>
      ))}
    </>
  )
}
