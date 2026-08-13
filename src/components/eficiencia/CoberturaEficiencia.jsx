import { Card } from '../Primitives'
import { useT } from '../../i18n'
import { LeyendaEscalones } from './Escalones'

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
export function CoberturaEficiencia({ universe, cobertura, indicadores = [] }) {
  const t = useT()
  // Sin bloque `universe` no se dice nada, antes que insinuar una cobertura que
  // no se puede respaldar.
  if (!universe) return null

  // Cuántos de los cocientes publicados descansan sobre un denominador que el
  // ayuntamiento no vuelve a medir. Va aquí y no repetido en cada tarjeta: cada
  // ficha lleva ya su salvedad concreta, y diez avisos idénticos en fila se
  // leen como decoración. Lo que hace falta arriba es el recuento.
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const congelados = conRatio.filter((i) => i.declaracion?.denominador?.congelada)
  const anios = congelados
    .map((i) => i.declaracion.denominador.desde)
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b)
  // Un solo año cuando coinciden; el rango cuando no. «Desde 2018» con la mitad
  // congelada en 2019 es una fecha más antigua de la que sostiene el dato.
  const desde =
    anios.length === 0
      ? null
      : anios[0] === anios[anios.length - 1]
        ? `${anios[0]}`
        : `${anios[0]}-${anios[anios.length - 1]}`

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
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink70, var(--ink50))' }}>
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
      <LeyendaEscalones indicadores={indicadores} />
      {congelados.length > 0 && (
        <p
          style={{
            margin: '10px 0 0',
            paddingLeft: 10,
            borderLeft: '3px solid var(--warn)',
            fontSize: 13,
            color: 'var(--ink70, var(--ink50))',
          }}
        >
          {congelados.length === conRatio.length ? (
            <>
              Los <strong className="mono">{conRatio.length}</strong> cocientes de arriba tienen
            </>
          ) : (
            <>
              <strong className="mono">
                {congelados.length} de {conRatio.length}
              </strong>{' '}
              de estos cocientes tienen
            </>
          )}{' '}
          un denominador que el ayuntamiento no vuelve a medir: declara la misma cantidad
          {desde ? ` desde ${desde}` : ''} entrega tras entrega, mientras actualiza el coste en cada
          una. Un coste unitario así puede subir sin que el servicio haya cambiado, y su serie no se
          puede leer como gestión. Cada tarjeta va marcada con el año desde el que no se remide, y
          lleva dentro cuántos municipios comparables hacen lo mismo.{' '}
          <a
            href="/laboratorio/frontera"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            La medición completa
          </a>
          .
        </p>
      )}
      {cobertura && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink50)' }}>
          Entregas publicadas por el ministerio:{' '}
          <span className="mono">{cobertura.entregasPublicadas?.join(', ')}</span>. Obtenidas aquí:{' '}
          <span className="mono">{cobertura.entregasObtenidas?.join(', ')}</span>.{' '}
          {cobertura.motivoFaltantes}
        </p>
      )}
    </Card>
  )
}
