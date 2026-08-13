import { Card, SectionHead } from '../components/Primitives'
import { usePlenos } from '../hooks/usePlenos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { useQuejas } from '../hooks/useQuejas'
import { useTenders } from '../hooks/useTenders'
import { summarizeImpact } from '../lib/impact-stats'

// Contact: operator's real mailbox. Swap to redaccion@civicpulse.es once the
// domain mailbox exists (tracked in docs/superpowers/audits/…-opensource-preflight.md §4).
const CONTACT_EMAIL = 'slutchenko@gmail.com'

function StatCell({ value, label, loading }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 120 }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>
        {loading ? '—' : value.toLocaleString('es-ES')}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ImpactStrip() {
  const plenos = usePlenos()
  const findings = usePlenoFindings()
  const quejas = useQuejas()
  const tenders = useTenders()
  const loading = plenos.loading || findings.loading || quejas.loading || tenders.loading
  const s = summarizeImpact({
    plenos: plenos.data,
    findings: findings.data,
    quejas: quejas.data,
    tenders: tenders.data,
  })
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 6 }}>
        <StatCell value={s.plenosCount} label="plenos indexados" loading={loading} />
        <StatCell value={s.findingsCount} label="hallazgos publicados" loading={loading} />
        <StatCell value={s.contractsCount} label="contratos indexados" loading={loading} />
        <StatCell value={s.quejasCount} label="quejas ciudadanas" loading={loading} />
      </div>
      {s.lastFindingAt && (
        <p style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 10, marginBottom: 0 }}>
          Último hallazgo publicado: <span className="mono">{s.lastFindingAt}</span>. Cada cifra
          enlaza con su fuente primaria en las secciones correspondientes del panel.
        </p>
      )}
    </div>
  )
}

function OperatorPhoto() {
  return (
    <div style={{ width: 72, height: 72, flexShrink: 0 }}>
      <img
        src="/data/photos/operator.jpg"
        alt="Sergei Lutchenko, responsable de CivicPulse"
        width={72}
        height={72}
        style={{ width: 72, height: 72, borderRadius: 'var(--r-card)', objectFit: 'cover' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextSibling.style.display = 'flex'
        }}
      />
      <div
        aria-hidden="true"
        style={{
          display: 'none',
          width: 72,
          height: 72,
          borderRadius: 'var(--r-card)',
          background: 'var(--civic-soft)',
          color: 'var(--civic)',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        SL
      </div>
    </div>
  )
}

export default function Nosotros() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Transparencia editorial
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Quiénes somos
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="Quién está detrás" title="Identidad y responsabilidad editorial" />
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 8 }}>
          <OperatorPhoto />
          <div>
            <p style={{ marginTop: 0 }}>
              <strong>Sergei Lutchenko</strong> — creador y responsable editorial de CivicPulse.
              Desarrollador de software. Diseña los sistemas de datos, cura cada hallazgo publicado
              y asume personalmente la responsabilidad editorial que describe el{' '}
              <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                aviso legal
              </a>
              .
            </p>
            <p>
              CivicPulse no pertenece a ningún partido, administración ni grupo empresarial. La
              metodología completa — de dónde salen los datos, cómo se verifica una declaración,
              cuándo se publica un hallazgo — está en{' '}
              <a href="/metodologia" style={{ color: 'var(--civic)' }}>
                /metodologia
              </a>
              .
            </p>
            <p style={{ marginBottom: 0 }}>
              Contacto, correcciones y derecho de réplica:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--civic)' }}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Financiación" title="Quién financia esto" />
        <p>
          A fecha de julio de 2026, CivicPulse no ha recibido ningún ingreso externo: está{' '}
          <strong>autofinanciado por su responsable</strong>. Este apartado se actualizará con cada
          fuente de financiación que se incorpore — subvención, beca, donación o premio — indicando
          origen, importe y fecha.
        </p>
        <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li>Sin publicidad.</li>
          <li>
            Sin fondos de ninguna administración bajo investigación editorial activa de este
            proyecto — empezando por el Ayuntamiento de Riba-roja de Túria.
          </li>
          <li>Ninguna fuente de financiación superará el 40 % de los ingresos anuales.</li>
          <li>Toda financiación se publica en esta página.</li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Datos reales, en producción" title="Impacto en cifras" />
        <ImpactStrip />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="El proyecto" title="Qué es CivicPulse" />
        <p>
          Un monitor independiente de lo que hace el Ayuntamiento: plenos transcritos y verificados,
          presupuesto y contratos geolocalizados, promesas electorales con su fuente verbatim, y un
          canal de quejas vecinales con reloj legal. Riba-roja de Túria es el municipio piloto; el
          objetivo es que el mismo estándar de rendición de cuentas llegue a cualquier municipio
          español.
        </p>
        <p style={{ marginBottom: 0 }}>
          <a href="/metodologia" style={{ color: 'var(--civic)' }}>
            Metodología
          </a>
          {' · '}
          <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
            Aviso legal
          </a>
          {' · '}
          <a href="/datos" style={{ color: 'var(--civic)' }}>
            Catálogo de datos
          </a>
          {' · '}
          <a href="/about" style={{ color: 'var(--civic)' }}>
            About (English)
          </a>
        </p>
      </Card>
    </div>
  )
}
