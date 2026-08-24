import { EjePercentil } from './EjePercentil'

/**
 * Cómo se lee la posición — una vez, arriba del libro, y no trece veces.
 *
 * Los dos ejemplos NO se dibujan a mano: se le pasan al mismo `EjePercentil`
 * que pinta las filas, con una banda que cruza la mediana y otra que no, y es
 * el componente quien decide el punto hueco. Una leyenda con su propia copia de
 * la geometría es una leyenda que puede acabar explicando algo que la página ya
 * no hace.
 */
function Ejemplo({ percentil, banda, children }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink70)',
      }}
    >
      <span style={{ width: 120, flexShrink: 0 }}>
        <EjePercentil percentil={percentil} banda={banda} />
      </span>
      <span>{children}</span>
    </span>
  )
}

export function LeyendaPosicion() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 26,
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--border2)',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Cómo se lee la posición
      </span>
      <Ejemplo percentil={72} banda={[60, 86]}>
        Escala fija de percentil 0 a 100 · gris claro, la mitad central del grupo · línea, la
        mediana · barra, la banda plausible · punto, Riba-roja
      </Ejemplo>
      <Ejemplo percentil={44} banda={[30, 58]}>
        Si la barra cruza la mediana, el punto va hueco y con trazo discontinuo: la posición{' '}
        <strong>no se distingue</strong> del grupo
      </Ejemplo>
    </div>
  )
}
