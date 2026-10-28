import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * Las cifras y figuras de «En breve» que comparten /presupuesto y la portada
 * («Tu ayuntamiento en 30 segundos»): el mismo formato y la misma marca para la
 * misma cifra en las dos capas. Sin hooks de datos a propósito: lo que importa
 * este módulo no arrastra ningún snapshot al grafo de rutas de quien lo usa.
 */

// Los euros salen de `euros` y `eurosBreves` (lib/formatters), como en el resto
// del sitio; aquí sólo queda el porcentaje que comparten con la portada.
export const pct0 = (n) => Math.round(n).toLocaleString('es-ES')

export function Barra({ children, alto = 12, etiqueta }) {
  return (
    <div
      role="img"
      aria-label={etiqueta}
      className="cp-en-breve-barra"
      style={{ height: alto, borderRadius: 'var(--r-pill)' }}
    >
      {children}
    </div>
  )
}

export function Leyenda({ izquierda, derecha }) {
  return (
    <div className="cp-en-breve-leyenda" aria-hidden="true">
      <span>{izquierda}</span>
      {derecha && <span>{derecha}</span>}
    </div>
  )
}

export function FiguraGastado({ gastado }) {
  const t = useT()
  const avance = gastado.avanceDelAnio
  const etiqueta =
    avance != null
      ? rellena(t('presupuesto.enBreve.gastado.figura'), {
          pct: pct0(gastado.pct),
          avance: pct0(avance * 100),
        })
      : rellena(t('presupuesto.enBreve.gastado.figuraSinAvance'), { pct: pct0(gastado.pct) })
  return (
    <div className="cp-en-breve-figura">
      <Barra etiqueta={etiqueta}>
        <div
          className="cp-crece-x"
          style={{
            width: `${Math.min(100, gastado.pct)}%`,
            background: 'var(--civic)',
            borderRadius: 'inherit',
          }}
        />
        {avance != null && (
          <div
            className="cp-en-breve-marca"
            style={{ left: `calc(${avance * 100}% - 1px)` }}
            data-avance={pct0(avance * 100)}
          />
        )}
      </Barra>
      <Leyenda
        izquierda={rellena(t('presupuesto.enBreve.gastado.barra'), { pct: pct0(gastado.pct) })}
        derecha={avance != null ? `${t('presupuesto.enBreve.gastado.avance')} ▏` : null}
      />
    </div>
  )
}

export function FiguraBarrio({ n }) {
  const t = useT()
  const cuadros = Array.from({ length: 100 }, (_, i) => i)
  return (
    <svg
      viewBox="0 0 100 100"
      width="64"
      height="64"
      role="img"
      aria-label={rellena(t('presupuesto.enBreve.barrio.figura'), { n })}
      style={{ flex: 'none' }}
    >
      {cuadros.map((i) => (
        <rect
          key={i}
          x={(i % 10) * 10 + 1}
          y={Math.floor(i / 10) * 10 + 1}
          width={8}
          height={8}
          rx={1.5}
          fill={i < n ? 'var(--civic)' : 'var(--soft)'}
          stroke={i < n ? 'none' : 'var(--border)'}
          strokeWidth={0.6}
        />
      ))}
    </svg>
  )
}
