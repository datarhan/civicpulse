import { Card } from '../components/Primitives'
import { DeclaracionCongelada } from '../components/frontera/DeclaracionCongelada'
import { EspecificacionCard } from '../components/frontera/EspecificacionCard'
import { SerieFrontera } from '../components/frontera/SerieFrontera'
import DataAsOf from '../components/DataAsOf'
import { useFrontera } from '../hooks/useFrontera'

/**
 * /laboratorio/frontera — análisis envolvente de datos sobre el coste efectivo.
 *
 * Es la única superficie de este sitio cuya cifra principal NO sale de una
 * fuente citable. Un coste unitario de /eficiencia es una división de dos
 * números que publica el ministerio y cualquiera puede rehacerla; una
 * puntuación DEA es el veredicto de un modelo con decisiones nuestras dentro
 * —qué servicios entran, qué rendimientos a escala se suponen, qué se hace con
 * quien no declara— y esas decisiones mueven el número. Por eso vive en el
 * laboratorio, dice que es un experimento antes de enseñar nada, y publica el
 * método entero.
 *
 * Tres reglas que la ordenan, y que están al revés de lo que apetece:
 *
 * 1. **La medición de la declaración va primero.** Que el 62 % de los
 *    denominadores lleve cuatro entregas sin moverse cambia lo que significan
 *    todas las cifras de abajo. Enseñar θ antes sería dejar que se lea como una
 *    medición.
 * 2. **Se publican las especificaciones que no salen**, con su motivo. Una
 *    página que enseñe sólo la cesta que funciona está enseñando el resultado en
 *    vez del método.
 * 3. **No se nombra a ningún otro municipio.** Ver el comentario largo de
 *    `src/scraper/dea-especificacion.ts`.
 */
export default function Frontera() {
  const { loading, error, data } = useFrontera()
  const especificaciones = data?.especificaciones ?? []
  const publicadas = especificaciones.filter((e) => e.estado === 'publicada')
  const principal = publicadas[0] ?? null

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Laboratorio · experimento
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        La frontera del gasto
      </h1>
      <p style={{ color: 'var(--ink60)', maxWidth: '66ch' }}>
        Dado lo que gastó cada ayuntamiento de la comarca comparable y lo que declaró producir a
        cambio, ¿existe alguna combinación de los demás que produjera al menos lo mismo con menos
        dinero? Es lo único que mide el análisis envolvente de datos, y es menos de lo que suena.
      </p>

      <Card style={{ marginTop: 14, borderLeft: '3px solid var(--intel)' }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink70)', maxWidth: '66ch' }}>
          <strong>Esto no es una nota ni un ranking.</strong> El resto del sitio publica cifras que
          se pueden rehacer desde su fuente. Esta página publica el resultado de un modelo con
          decisiones nuestras dentro, y con la misma fuente y otra cesta de servicios igual de
          defendible la puntuación de Riba-roja se mueve entre{' '}
          {publicadas.length > 1 ? 'una y otra punta de la escala' : 'valores muy distintos'}. Está
          en el laboratorio por eso, y no en{' '}
          <a href="/eficiencia" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
            /eficiencia
          </a>
          .
        </p>
      </Card>

      {loading && <p style={{ color: 'var(--ink60)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink60)' }}>No se pudo cargar el experimento.</p>}
      {!loading && !error && especificaciones.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink60)' }}>
            El experimento todavía no se ha ejecutado sobre esta instalación. Se genera con{' '}
            <code className="mono">npm run compute:dea</code>.
          </p>
        </Card>
      )}

      {/* Regla 1: la calidad de la declaración, antes que ninguna puntuación. */}
      <DeclaracionCongelada declaracion={data?.declaracion} />

      {especificaciones.length > 0 && (
        <>
          <h2
            style={{ fontSize: 15, fontWeight: 650, margin: '28px 0 0', letterSpacing: '-.01em' }}
          >
            Cuatro cestas defendibles, cuatro resultados
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink60)', fontSize: 13.5, maxWidth: '66ch' }}>
            Cada una usa el coste efectivo total de sus servicios como único recurso y la unidad
            física de cada servicio como producto. Todas exigen gestión directa: un municipio con la
            limpieza concesionada declara coste cero, y colado en la muestra saldría insuperable y
            empeoraría la puntuación de todos los demás.
          </p>
          {especificaciones.map((e) => (
            <EspecificacionCard key={e.id} e={e} principal={principal?.id === e.id} />
          ))}
        </>
      )}

      {principal && (
        <>
          <h2
            style={{ fontSize: 15, fontWeight: 650, margin: '28px 0 0', letterSpacing: '-.01em' }}
          >
            Qué pasa al mirarlo en el tiempo
          </h2>
          <SerieFrontera especificacion={principal} />
        </>
      )}

      {data?.modelo && (
        <>
          <h2
            style={{ fontSize: 15, fontWeight: 650, margin: '28px 0 0', letterSpacing: '-.01em' }}
          >
            El método, entero
          </h2>
          <Card style={{ marginTop: 10 }}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13.5,
                color: 'var(--ink70)',
                lineHeight: 1.65,
              }}
            >
              <li>
                Envolvente orientada a <strong>{data.modelo.orientacion}</strong>, rendimientos
                variables a escala como lectura principal y constantes para derivar la eficiencia de
                escala.
              </li>
              <li>
                Regla de grados de libertad:{' '}
                <span className="mono">{data.modelo.reglaGradosLibertad}</span>.
              </li>
              <li>
                Intervalos y corrección de sesgo por {data.modelo.bootstrap}, con{' '}
                <span className="mono">{data.modelo.replicas?.toLocaleString('es-ES')}</span>{' '}
                réplicas y α = <span className="mono">{data.modelo.alfa}</span>. La semilla se
                deriva del identificador de cada especificación y viaja en el propio fichero, así
                que dos pasadas dan el mismo intervalo hasta el último decimal.
              </li>
              <li>
                La corrección de sesgo sólo se recomienda cuando |sesgo| / error estándar supera{' '}
                <span className="mono">
                  {data.modelo.razonSesgoMinima?.toLocaleString('es-ES', {
                    maximumFractionDigits: 2,
                  })}
                </span>
                ; por debajo añade más varianza de la que quita y es preferible la cifra cruda.
              </li>
              <li>
                Fuente: <span className="mono">{data.fuente?.snapshot}</span>, entrega{' '}
                <span className="mono">{data.fuente?.entrega}</span>, conjunto de pares{' '}
                <span className="mono">{data.fuente?.conjunto}</span>. El coste efectivo de los
                servicios es una obligación del artículo 116 ter de la LRSAL y lo publica el
                Ministerio de Hacienda.
              </li>
              <li>
                Todo el código es público y el snapshot de partida también: cualquiera puede rehacer
                la tabla que aquí no se publica.{' '}
                <a
                  href="/metodologia#frontera"
                  style={{ color: 'var(--civic)', textDecoration: 'underline' }}
                >
                  Metodología
                </a>
                .
              </li>
            </ul>
          </Card>
        </>
      )}

      {data?.generatedAt && <DataAsOf iso={data.generatedAt} />}
    </div>
  )
}
