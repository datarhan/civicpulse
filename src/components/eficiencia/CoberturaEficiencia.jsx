import { Card } from '../Primitives'
import { useT } from '../../i18n'

/**
 * Qué parte de su propio dominio enseña esta página.
 *
 * Mismo principio que `MoneyCoverage`: una cifra agregada sin denominador se
 * lee como completitud. Diez tarjetas bonitas dan a entender que ésos son los
 * servicios del ayuntamiento, cuando son los servicios cuyas dos cifras el
 * ayuntamiento declaró. El resto —la concesión, el cero sin declarar, el coste
 * duplicado— no son huecos de esta página: son hechos sobre la rendición de
 * cuentas municipal, y merecen decirse en voz alta.
 *
 * Los números salen del bloque `universe` del propio snapshot, nunca escritos a
 * mano, para que no puedan alejarse de las tarjetas que tienen al lado. Y los
 * cinco cubos son una PARTICIÓN comprobada por check:indicadores: si no
 * sumaran, la franja mentiría con más aplomo que el silencio.
 */
export function CoberturaEficiencia({ universe, cobertura }) {
  const t = useT()
  // Sin bloque `universe` no se dice nada, antes que insinuar una cobertura que
  // no se puede respaldar.
  if (!universe) return null

  const filas = [
    { n: universe.conRatio, k: 'conRatio' },
    { n: universe.enConcesion, k: 'concesion' },
    { n: universe.sinUnidad, k: 'sinUnidad' },
    { n: universe.sinCoste, k: 'sinCoste' },
    { n: universe.noSePresta, k: 'noSePresta' },
  ].filter((f) => f.n > 0)

  return (
    <Card style={{ marginTop: 18 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        {t('eficiencia.cobertura.titulo')}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink70, var(--ink60))' }}>
        De los <strong className="mono">{universe.serviciosEnRegistro}</strong> servicios que este
        panel sigue:{' '}
        {filas.map((f, idx) => (
          <span key={f.k}>
            <strong className="mono">{f.n}</strong> {t(`eficiencia.cobertura.${f.k}`)}
            {idx < filas.length - 1 ? ' · ' : '.'}
          </span>
        ))}{' '}
        <span className="mono">{universe.comparables}</span> tienen suficientes municipios
        comparables para situarlos.
      </p>
      {cobertura && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink60)' }}>
          Entregas publicadas por el ministerio:{' '}
          <span className="mono">{cobertura.entregasPublicadas?.join(', ')}</span>. Obtenidas aquí:{' '}
          <span className="mono">{cobertura.entregasObtenidas?.join(', ')}</span>.{' '}
          {cobertura.motivoFaltantes}
        </p>
      )}
    </Card>
  )
}
