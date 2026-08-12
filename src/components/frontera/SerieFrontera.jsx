import { Card } from '../Primitives'

const num = (v, d = 2) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * La misma especificación, entrega a entrega, con su tamaño de muestra al lado.
 *
 * Se publica como TABLA y no como línea a propósito. Una línea invita a leer
 * pendiente —«el municipio empeoró»— y aquí la pendiente no significa eso: la
 * frontera se reestima cada año contra quien haya declarado ese año, y el
 * denominador de casi todo el mundo lleva media década sin moverse. La tabla
 * pone el n de cada punto en la misma fila que su cifra, que es la única forma
 * de que las dos se lean juntas.
 *
 * Un año sin puntuación NO se interpola ni se salta: aparece con su motivo. Es
 * la misma regla que corta la línea del sparkline de /eficiencia.
 */
export function SerieFrontera({ especificacion }) {
  const e = especificacion
  const serie = e.serie ?? []
  if (serie.length === 0) return null
  const panel = e.panel?.serie ?? []
  const porAnio = new Map(panel.map((p) => [p.anio, p]))

  return (
    <Card style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Entrega a entrega · {e.titulo}
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 13.5, color: 'var(--ink70)', maxWidth: '66ch' }}>
        Dos columnas para la misma cifra. La primera compara contra quien declarase ese año, así que
        mezcla el movimiento del municipio con el de la muestra. La segunda usa sólo los{' '}
        {e.panel?.miembros ?? 0} municipios que declaran la cesta completa en todas las entregas, de
        modo que la composición ya no se mueve.
        {panel.length === 0 && (
          <>
            {' '}
            Aquí está vacía: Riba-roja no entra en ese grupo, porque hay entregas en las que no
            declara la cesta completa. Sin panel no hay serie comparable, y eso es un resultado.
          </>
        )}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink50)' }}>
              <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Entrega</th>
              <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>
                Muestra variable
              </th>
              <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>n</th>
              <th style={{ padding: '4px 0', fontWeight: 500, textAlign: 'right' }}>
                Panel equilibrado
              </th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => {
              const eq = porAnio.get(p.anio)
              return (
                <tr key={p.anio} style={{ borderTop: '1px solid var(--border2)' }}>
                  <td className="mono" style={{ padding: '6px 8px 6px 0' }}>
                    {p.anio}
                  </td>
                  <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {p.theta === null ? (
                      <span style={{ color: 'var(--ink50)' }}>sin puntuación</span>
                    ) : (
                      num(p.theta)
                    )}
                  </td>
                  <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {p.n}
                  </td>
                  <td className="mono" style={{ padding: '6px 0', textAlign: 'right' }}>
                    {eq?.theta == null ? (
                      <span style={{ color: 'var(--ink50)' }}>—</span>
                    ) : (
                      num(eq.theta)
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--ink50)', margin: '10px 0 0', maxWidth: '66ch' }}>
        Un «sin puntuación» quiere decir que esa entrega no llegaba a grados de libertad o que
        Riba-roja no declaraba la cesta completa. No se interpola: un hueco es un hueco.
      </p>
    </Card>
  )
}
