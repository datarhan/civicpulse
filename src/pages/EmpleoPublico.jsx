import { Card, Pill } from '../components/Primitives'
import { useProcesosSelectivos } from '../hooks/useProcesosSelectivos'

const TIPO = {
  oposicion: { label: 'Oposición / concurso', tone: 'civic' },
  bolsa: { label: 'Bolsa de trabajo', tone: 'intel' },
  estabilizacion: { label: 'Estabilización', tone: 'ok' },
  otro: { label: 'Otro', tone: 'neutral' },
}

export default function EmpleoPublico() {
  const { loading, error, data } = useProcesosSelectivos()
  const procesos = data?.procesos ?? []
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
        Ayuntamiento · procesos selectivos
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Empleo público
      </h1>
      <p style={{ color: 'var(--ink60)', maxWidth: '64ch' }}>
        Procesos selectivos del propio Ayuntamiento de Riba-roja de Túria — oposiciones, bolsas de
        trabajo y estabilización. Distinto de las ofertas de la Agència de Col·locació (ver{' '}
        <a href="/empleo" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
          /empleo
        </a>
        ). Fuente: portal municipal.
      </p>

      {loading && <p style={{ color: 'var(--ink60)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink60)' }}>No se pudo cargar el listado.</p>}
      {!loading && !error && procesos.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink60)' }}>
            No hay procesos selectivos publicados ahora mismo.
          </p>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {procesos.map((p) => {
          const t = TIPO[p.tipo] ?? TIPO.otro
          return (
            <Card key={p.id} hover>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none', flex: 1 }}
                >
                  {p.titulo}
                </a>
                <Pill tone={t.tone}>{t.label}</Pill>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
