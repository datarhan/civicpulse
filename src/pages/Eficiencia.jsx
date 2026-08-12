import { Card } from '../components/Primitives'
import { CoberturaEficiencia } from '../components/eficiencia/CoberturaEficiencia'
import { ServicioCard } from '../components/eficiencia/ServicioCard'
import { useIndicadores } from '../hooks/useIndicadores'
import { useT } from '../i18n'

/**
 * /eficiencia — cuánto costó cada servicio y qué se obtuvo a cambio.
 *
 * Deliberadamente NO hay nota global, ni por dimensión, ni ranking del
 * municipio. El precedente es `encaje declarado`: publica los componentes,
 * niégate a la suma. Un 0-100 en cabecera convierte la ponderación en la
 * noticia e invita a la tabla comparativa de ayuntamientos vecinos que después
 * habría que sostener.
 *
 * Las tarjetas bloqueadas son parte del contenido, no un residuo: que el
 * ayuntamiento declare 485.975,77 € de transporte urbano y cero viajeros dice
 * algo sobre su rendición de cuentas, y esconderlo dejaría la página más
 * completa y menos cierta.
 */
export default function Eficiencia() {
  const t = useT()
  const { loading, error, data } = useIndicadores()
  const indicadores = data?.indicadores ?? []

  const conRatio = indicadores
    .filter((i) => i.valor !== null)
    .sort((a, b) => (b.numerador.valor ?? 0) - (a.numerador.valor ?? 0))
  const bloqueados = indicadores.filter((i) => i.valor === null)

  const formateaCon = (unidad) => (v) => {
    const dec = v >= 1000 ? 0 : v >= 10 ? 2 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${unidad.replace(/^€\//, '€/')}`
  }

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
        {t('eficiencia.eyebrow')}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        {t('eficiencia.title')}
      </h1>
      <p style={{ color: 'var(--ink60)', maxWidth: '64ch' }}>{t('eficiencia.intro')}</p>

      {loading && <p style={{ color: 'var(--ink60)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink60)' }}>No se pudo cargar el panel.</p>}
      {!loading && !error && indicadores.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink60)' }}>{t('eficiencia.empty')}</p>
        </Card>
      )}

      {indicadores.length > 0 && (
        <CoberturaEficiencia universe={data?.universe} cobertura={data?.cobertura} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
        {conRatio.map((i) => (
          <ServicioCard key={i.id} indicador={i} formatea={formateaCon(i.unidad)} />
        ))}
      </div>

      {bloqueados.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 650,
              margin: '28px 0 4px',
              letterSpacing: '-.01em',
            }}
          >
            {t('eficiencia.bloqueados.titulo')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {bloqueados.map((i) => (
              <ServicioCard key={i.id} indicador={i} formatea={formateaCon(i.unidad)} />
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 28 }}>
        Cómo se calcula, qué se descarta y por qué no hay nota global:{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        .
      </p>
    </div>
  )
}
