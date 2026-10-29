import { Card } from '../components/Primitives'
import Plantilla from '../components/EmpleoPublico/Plantilla'
import ComoSeEntra from '../components/EmpleoPublico/ComoSeEntra'
import { useProcesosSelectivos } from '../hooks/useProcesosSelectivos'
import { agruparProcesos } from '../lib/empleo-publico'
import { useT } from '../i18n'

/** El título de cada grupo. Llamadas literales: el guard del catálogo las lee. */
function tituloDeTipo(tipo, t) {
  if (tipo === 'oposicion') return t('empleoPublico.tipo.oposicion')
  if (tipo === 'bolsa') return t('empleoPublico.tipo.bolsa')
  if (tipo === 'estabilizacion') return t('empleoPublico.tipo.estabilizacion')
  return t('empleoPublico.tipo.otro')
}

/*
 * La lectura vecinal (auditoría de las dos lecturas, §21): primero cómo se
 * entra a trabajar en el Ayuntamiento, con las palabras de los títulos
 * definidas; luego los procesos, bajo un título por tipo en vez de una píldora
 * en cada tarjeta, y diciendo que la lista no sabe cuáles siguen abiertos; al
 * final, cuánta gente trabaja ya en él.
 */

export default function EmpleoPublico() {
  const t = useT()
  const { loading, error, data } = useProcesosSelectivos()
  const procesos = data?.procesos ?? []
  const grupos = agruparProcesos(procesos)
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
        {t('empleoPublico.eyebrow')}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        {t('empleoPublico.title')}
      </h1>
      <p style={{ color: 'var(--ink70)', maxWidth: '64ch' }}>
        {t('empleoPublico.intro1')}
        <a href="/empleo" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
          /empleo
        </a>
        {t('empleoPublico.intro2')}
      </p>

      {loading && <p style={{ color: 'var(--ink70)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink70)' }}>No se pudo cargar el listado.</p>}
      {!loading && !error && procesos.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink70)' }}>{t('empleoPublico.empty')}</p>
        </Card>
      )}

      <ComoSeEntra />

      {grupos.length > 0 && (
        <section
          id="procesos"
          aria-labelledby="procesos-titulo"
          style={{ marginTop: 32, scrollMarginTop: 16 }}
        >
          <h2
            id="procesos-titulo"
            style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: 0, lineHeight: 1.3 }}
          >
            {t('empleoPublico.procesos.titulo')}
          </h2>
          <p
            style={{ margin: '8px 0 0', color: 'var(--ink70)', lineHeight: 1.55, maxWidth: '64ch' }}
          >
            {t('empleoPublico.procesos.sinEstado')}
          </p>
          {grupos.map((g) => (
            <section
              key={g.tipo}
              aria-labelledby={`procesos-${g.tipo}`}
              data-tipo-proceso={g.tipo}
              style={{ marginTop: 20 }}
            >
              <h3
                id={`procesos-${g.tipo}`}
                style={{ fontSize: 'var(--fs-card)', fontWeight: 700, margin: 0, lineHeight: 1.3 }}
              >
                {tituloDeTipo(g.tipo, t)}{' '}
                <span className="mono" style={{ color: 'var(--ink50)', fontWeight: 400 }}>
                  {g.procesos.length}
                </span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {g.procesos.map((p) => (
                  <Card key={p.url} hover>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        color: 'var(--ink)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {p.titulo}
                    </a>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </section>
      )}

      {/* Quién trabaja ya en el Ayuntamiento, con sus dos cifras y el puente
          entre ellas. Vivía en /cargos, que ahora enlaza aquí. */}
      <Plantilla />
    </div>
  )
}
