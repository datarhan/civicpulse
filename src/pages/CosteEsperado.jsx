import { Card } from '../components/Primitives'
import { Pill } from '../components/Primitives'
import { Embudo } from '../components/coste-esperado/Embudo'
import DataAsOf from '../components/DataAsOf'
import { useCosteEsperado } from '../hooks/useCosteEsperado'

/**
 * /laboratorio/coste-esperado — el gasto observado contra el esperado dada la
 * población, al modo OpenCivitas.
 *
 * Es la respuesta a la objeción más razonable contra /eficiencia: «nosotros no
 * somos comparables». Puede ser verdad — y la manera honesta de comprobarlo no
 * es renunciar a comparar, es comparar contra lo que cabría esperar PARA UN
 * MUNICIPIO ASÍ. Aquí «así» significa, de momento, «de esta población»: la
 * escalera de impulsores está declarada abajo y éste es su primer peldaño.
 *
 * Vive en el laboratorio por la misma razón que la frontera: la recta es un
 * modelo con decisiones nuestras dentro, y las tres reglas de la DEA aplican
 * idénticas — ningún otro municipio con nombre, las especificaciones que
 * fallan se publican como fallidas, y nada de esta página entra jamás en la
 * tubería de fichas firmadas.
 */

const formateaEuros = (v) =>
  v >= 1e6
    ? `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M€`
    : `${Math.round(v).toLocaleString('es-ES')} €`

// Los motivos de exclusión son slugs del esquema; aquí llevan su tilde. Un
// motivo sin entrada se enseña con el slug tal cual — visible antes que mudo.
const MOTIVO_LABEL = {
  'otro-modo': 'otro modo de gestión',
  'sin-coste': 'sin coste',
  'sin-poblacion': 'sin población',
  'filas-duplicadas': 'filas duplicadas',
  'cifra-inverosimil': 'cifra inverosímil',
}

function ServicioEsperado({ e }) {
  const p = e.propia
  const m = e.modelo
  return (
    <Card
      id={`ce-${e.programa.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
      style={{ marginTop: 12 }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ fontSize: 'var(--fs-head)', fontWeight: 650, margin: 0 }}>{e.label}</h3>
        {p && (
          <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            ×{p.razon.toLocaleString('es-ES', { maximumFractionDigits: 2 })} de lo esperado
          </span>
        )}
      </div>

      {p && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
          Declaró <strong className="mono">{formateaEuros(p.costeObservado)}</strong>. Para un
          municipio de{' '}
          <span className="mono">{Math.round(p.poblacion).toLocaleString('es-ES')}</span>{' '}
          habitantes, la recta esperaría{' '}
          <strong className="mono">{formateaEuros(p.esperado)}</strong>, con una banda del{' '}
          {Math.round((1 - m.nivelAlfa) * 100)} % entre{' '}
          <span className="mono">{formateaEuros(p.inferior)}</span> y{' '}
          <span className="mono">{formateaEuros(p.superior)}</span>:{' '}
          {p.dentroDeLoEsperado
            ? 'normal para un municipio así, con lo mucho que la población deja sin explicar.'
            : 'fuera incluso de esa banda ancha — el residuo pide una explicación que la población no da.'}
        </p>
      )}

      <Embudo modelo={m} muestra={e.muestra} propia={p} formateaEuros={formateaEuros} />

      <div
        className="mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 8,
        }}
      >
        <span>
          {m.n} municipios en gestión directa · R²{' '}
          {m.r2.toLocaleString('es-ES', { maximumFractionDigits: 2 })} · elasticidad{' '}
          {m.beta.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
        </span>
        <span>
          de {e.cobertura.declarantes} declarantes: fuera{' '}
          {Object.entries(e.cobertura.excluidas)
            .map(([k, v]) => `${v} ${MOTIVO_LABEL[k] ?? k}`)
            .join(' · ') || 'ninguno'}
        </span>
      </div>
    </Card>
  )
}

export default function CosteEsperado() {
  const { loading, error, data } = useCosteEsperado()
  const especificaciones = data?.especificaciones ?? []
  const publicadas = [...especificaciones.filter((e) => e.estado === 'publicada')].sort(
    (a, b) => (b.propia?.razon ?? 0) - (a.propia?.razon ?? 0),
  )
  const fallidas = especificaciones.filter((e) => e.estado !== 'publicada')
  const r2s = publicadas.map((e) => e.modelo.r2)
  const r2Min = r2s.length ? Math.min(...r2s) : null
  const r2Max = r2s.length ? Math.max(...r2s) : null
  const fmtR2 = (v) => Math.round(v * 100)

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Laboratorio · experimento
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        El coste esperado
      </h1>
      <p style={{ color: 'var(--ink50)', maxWidth: '66ch' }}>
        «Nosotros no somos comparables» es la objeción más razonable contra un panel de costes — y
        se puede comprobar. Para cada servicio, una recta sobre todos los municipios de la comunidad
        que lo declaran en gestión directa dice qué gasto cabría esperar con la población de
        Riba-roja, y con cuánto margen. Lo observado se lee contra eso: contra lo normal para un
        municipio así.
      </p>

      <Card style={{ marginTop: 14, borderLeft: '3px solid var(--intel)' }}>
        <p
          style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)', maxWidth: '66ch' }}
        >
          <strong>Esto no es una nota, y «dentro de la banda» no es un aprobado.</strong> La recta
          usa un solo impulsor —la población— y explica
          {r2Min !== null ? (
            <>
              {' '}
              entre el <span className="mono">{fmtR2(r2Min)} %</span> y el{' '}
              <span className="mono">{fmtR2(r2Max)} %</span> del gasto según el servicio
            </>
          ) : (
            ' una parte del gasto'
          )}
          ; todo lo demás —turismo, polígonos, dispersión, decisiones— queda fuera del modelo, y por
          eso las bandas son anchas y casi nada cae fuera. El número legible es cuántas veces lo
          esperado, con su banda al lado. Las reglas de{' '}
          <a
            href="/laboratorio/frontera"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            la frontera
          </a>{' '}
          aplican idénticas: ningún otro municipio se nombra, las especificaciones que fallan se
          publican como fallidas, y nada de aquí genera una ficha firmada.
        </p>
      </Card>

      {loading && <p style={{ color: 'var(--ink50)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink50)' }}>No se pudo cargar el experimento.</p>}
      {!loading && !error && especificaciones.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink50)' }}>
            El experimento todavía no se ha ejecutado sobre esta instalación. Se genera con{' '}
            <code className="mono">npm run compute:coste-esperado</code>.
          </p>
        </Card>
      )}

      {publicadas.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 'var(--fs-body)',
              fontWeight: 650,
              margin: '26px 0 2px',
              letterSpacing: '-.01em',
            }}
          >
            Servicio a servicio, de más a menos veces lo esperado
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            Entrega del coste efectivo de {data?.stats?.entrega} —la última publicada por el
            ministerio— · cada punto gris es un municipio de la muestra, sin nombre; el único con
            nombre es Riba-roja.
          </p>
          {publicadas.map((e) => (
            <ServicioEsperado key={e.programa} e={e} />
          ))}
        </>
      )}

      {fallidas.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 'var(--fs-body)',
              fontWeight: 650,
              margin: '26px 0 2px',
              letterSpacing: '-.01em',
            }}
          >
            Las que no salen, publicadas como fallidas
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            Enseñar sólo la especificación que funciona sería enseñar el resultado en vez del
            método.
          </p>
          <Card style={{ marginTop: 10 }}>
            {fallidas.map((e) => (
              <div
                key={e.programa}
                style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0' }}
              >
                <Pill tone="neutral">{e.estado}</Pill>
                <div>
                  <strong style={{ fontSize: 'var(--fs-meta)' }}>{e.label}</strong>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 'var(--fs-meta)',
                      color: 'var(--ink50)',
                    }}
                  >
                    {e.motivoEstado}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {especificaciones.length > 0 && (
        <Card style={{ marginTop: 26 }}>
          {/* Encabezado de verdad, no eyebrow: la sección del método es un
              destino de navegación (Frontera hace lo mismo), y el spec lo
              exige por rol — con un div estuvo rojo desde el primer día y un
              tail truncado lo leyó como verde. */}
          <h2
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
              fontWeight: 650,
              margin: 0,
            }}
          >
            El método entero
          </h2>
          <ul
            style={{
              margin: '8px 0 0',
              paddingLeft: 18,
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <li>
              Muestra: todos los municipios de la Comunitat Valenciana del libro CCAA-17 de la
              entrega ({data?.fuente?.municipiosCenso} en el censo CONPREL, que pone la población).
              Sólo gestión directa: el coste declarado bajo concesión no es lo que cuesta el
              servicio (regla 4 de la{' '}
              <a href="/metodologia#reglas-eficiencia" style={{ color: 'var(--civic)' }}>
                metodología
              </a>
              ), y un municipio con dos costes para el mismo servicio queda fuera (regla 1).
            </li>
            <li>
              Recta de mínimos cuadrados sobre (ln población, ln gasto), por servicio; banda de
              predicción analítica con t de Student al{' '}
              {data?.modelo?.nivelAlfa ? Math.round((1 - data.modelo.nivelAlfa) * 100) : 95} %. Sin
              remuestreo y sin azar: el análisis se reproduce exacto desde la muestra publicada, y
              la guarda <code className="mono">check:coste-esperado</code> lo hace cada noche.
            </li>
            <li>
              Mínimo muestral: {data?.modelo?.minMuestra} municipios por servicio. Por debajo, la
              especificación se publica como fallida en vez de estirar la muestra.
            </li>
            <li>
              La escalera de impulsores está declarada: v1 usa sólo log(población). La superficie no
              tiene tabla municipal utilizable del INE y la renta (ADRH) queda para una v2; cada
              peldaño nuevo se añadirá con su R² a la vista, no en su lugar.
            </li>
            <li>
              La muestra publicada es anónima —dos números por punto, ordenada por población— y
              ningún municipio ajeno aparece en el fichero servido. La población va exacta a
              propósito, aunque con un censo delante permita deducir qué municipio es cada punto: la
              negativa de esta casa es a <em>firmar</em> nombres, no a que el análisis sea
              reproducible, y redondearla rompería la reproducción exacta de la recta que la guarda
              comprueba. El método está entero precisamente para que esa negativa no sea opacidad:
              cualquiera puede rehacer la tabla desde los libros del ministerio.
            </li>
          </ul>
          {data?.generatedAt && (
            <div style={{ marginTop: 10 }}>
              <DataAsOf iso={data.generatedAt} />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
