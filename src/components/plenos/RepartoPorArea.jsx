import { Link } from 'react-router-dom'

/**
 * Qué áreas llevan el orden del día — y sobre cuántas sesiones se dice.
 *
 * La tarjeta anterior era lo PRIMERO de la página: un agregado derivado por
 * delante del objeto que el lector vino a ver. Baja aquí, detrás de las
 * sesiones, y conserva lo único que la hacía imprescindible — era el único
 * sitio donde se decía que el orden del día sólo se extrajo de 39 de 61
 * sesiones. Ese denominador ya no depende de esta tarjeta: la escalera de
 * cobertura lo publica arriba del todo.
 *
 * Las barras van a escala del máximo, no del total: son un reparto entre
 * áreas, no una cobertura.
 */
export function RepartoPorArea({ departamentos, agenda, sesiones }) {
  if (!departamentos?.length) return null
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--fs-meta)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--ink50)',
            }}
          >
            Reparto por área · {agenda.puntos} puntos de {agenda.sesiones} sesiones
          </div>
          <h2 style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '6px 0 0' }}>
            Qué áreas llevan el orden del día
          </h2>
        </div>
        <Link to="/departamentos" style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)' }}>
          Ver el panel por departamento →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
        {departamentos.map((d) => (
          <Link
            key={d.slug || d.nombre}
            to={d.slug ? `/departamentos/${d.slug}` : '/departamentos'}
            className="cp-plenos-area"
          >
            <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>{d.nombre}</span>
            <span
              className="cp-plenos-area-barra"
              aria-hidden="true"
              style={{
                height: 14,
                background: 'var(--soft)',
                borderRadius: 'var(--r-input)',
                overflow: 'hidden',
                display: 'block',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(d.cuota * 100).toFixed(1)}%`,
                  background: 'var(--civic)',
                  borderRadius: 'var(--r-input)',
                }}
              />
            </span>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', textAlign: 'right' }}
            >
              {d.n}
            </span>
          </Link>
        ))}
      </div>

      {/* La misma regla que MoneyCoverage: una capa que enseña una fracción de
          su dominio tiene que decirlo, y con el denominador delante. */}
      <p
        style={{
          margin: '13px 0 0',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.55,
          color: 'var(--ink70)',
          maxWidth: '96ch',
        }}
      >
        Son los puntos de las <strong>{agenda.sesiones} sesiones con orden del día extraído</strong>
        , no de las {sesiones}. Y sólo {agenda.conDepartamento} de los {agenda.puntos} puntos llevan
        área asignada. Un área con pocos puntos puede tener mucha actividad en sesiones que aún no
        hemos procesado: este reparto describe nuestra cobertura tanto como el trabajo del pleno.
      </p>
    </div>
  )
}
