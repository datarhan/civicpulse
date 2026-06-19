import { Link } from 'react-router-dom'
import { Card } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useIspa, ispaLatest, formatEuros, alcaldeGrowth } from '../hooks/useIspa'
import { useDedicaciones, dedicacionForSlug } from '../hooks/useDedicaciones'
import { useJsonFetch } from '../hooks/useJsonFetch'
import { useQuejas } from '../hooks/useQuejas'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../scraper/departments'
import { fmtDateLong } from '../lib/formatters'
import { useT, useLocale } from '../i18n'

function QuejaBadge({ slug }) {
  const { data } = useQuejas()
  const stats = data?.stats?.byConcejal?.[slug]
  if (!stats || stats.total === 0) return null
  const ok = stats.resueltas
  const pending = stats.pendientes
  const silencios = stats.silencios
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border2)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        fontSize: 11.5,
      }}
    >
      <Link
        to="/quejas"
        className="mono"
        style={{
          color: 'var(--ink60)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        Quejas asignadas
      </Link>
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
        {stats.total}
      </span>
      <span style={{ color: 'var(--ok)' }}>✓ {ok}</span>
      <span style={{ color: 'var(--civic)' }}>⏳ {pending}</span>
      {silencios > 0 && <span style={{ color: 'var(--crit)' }}>⚠ {silencios}</span>}
    </div>
  )
}

function DepartmentLinks({ portfolios }) {
  const { locale } = useLocale()
  // Collect unique slugs from all portfolios — some officials own 3-4
  // concejalías and the user should be able to jump to any of them.
  const slugs = []
  const seen = new Set()
  for (const p of portfolios ?? []) {
    const s = canonicalizeDepartment(p)
    if (s && !seen.has(s)) {
      slugs.push(s)
      seen.add(s)
    }
  }
  if (slugs.length === 0) return null
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        fontSize: 11,
      }}
    >
      {slugs.slice(0, 4).map((slug) => (
        <Link
          key={slug}
          to={`/departamentos/${slug}`}
          className="mono"
          style={{
            fontSize: 10.5,
            padding: '2px 7px',
            background: 'var(--civic-soft)',
            color: 'var(--civic)',
            borderRadius: 3,
            letterSpacing: '.04em',
            textDecoration: 'none',
          }}
        >
          {locale === 'ca' ? DEPARTMENT_LABEL[slug].ca : DEPARTMENT_LABEL[slug].es} →
        </Link>
      ))}
    </div>
  )
}

// Per-councillor salary mapped by ROLE: the pleno acuerdo (Exp 4533/2023)
// assigns each dedicación exclusiva to a cargo + its delegated áreas, which
// match the officials.json portfolios verbatim → a named, cited figure for each
// of the 7. The 14 sin-dedicación councillors get no figure (asistencias only).
function RetribucionBadge({ official }) {
  const { data } = useDedicaciones()
  const d = dedicacionForSlug(data, official.slug)
  if (!d) return null
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px dashed var(--border2)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11.5,
        color: 'var(--ink60)',
      }}
    >
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
        {formatEuros(d.amountEuros)}/año
      </span>
      <span>· dedicación {d.dedicacion}</span>
      {data.source?.url && (
        <a
          href={data.source.url}
          target="_blank"
          rel="noreferrer"
          title={`${d.role} — ${data.source.title}`}
          className="mono"
          style={{ color: 'var(--civic)', marginLeft: 'auto', fontSize: 10.5 }}
        >
          acuerdo ↗
        </a>
      )}
    </div>
  )
}

// Salary growth, only where the data supports it. The alcalde's office has a
// continuous ISPA series → real %s per window (with "—" where ISPA has no base
// year). Councillors' dedicación dates from the 2023 acuerdo, so they carry an
// honest "no prior history" note instead of an invented figure.
function SalaryGrowth({ official }) {
  const ispa = useIspa()
  const { data: dedic } = useDedicaciones()
  if (!dedicacionForSlug(dedic, official.slug)) return null
  if (official.role !== 'alcalde') {
    return (
      <div className="mono" style={{ marginTop: 6, fontSize: 10, color: 'var(--ink50)' }}>
        Salario fijado en el acuerdo de 2023 · sin variación interanual disponible
      </div>
    )
  }
  const windows = alcaldeGrowth(ispa.data)
  if (windows.length === 0) return null
  return (
    <div
      className="mono"
      title="Variación del salario del alcalde según ISPA (importe percibido por año). 1, 5 y 10 años no disponibles: la serie ISPA cubre 2020-2024 y los años electorales 2019/2023 son anómalos."
      style={{
        marginTop: 6,
        fontSize: 10,
        color: 'var(--ink50)',
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'baseline',
      }}
    >
      <span style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Δ salario (ISPA)</span>
      {windows.map((w) => (
        <span key={w.years}>
          {w.years} a.{' '}
          {w.pct === null ? (
            <span style={{ color: 'var(--ink40)' }}>—</span>
          ) : (
            <span style={{ color: w.pct >= 0 ? 'var(--ok)' : 'var(--crit)', fontWeight: 700 }}>
              {w.pct >= 0 ? '+' : ''}
              {w.pct.toFixed(1).replace('.', ',')}%
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function RetribucionesPanel() {
  const { data } = useIspa()
  const latest = ispaLatest(data)
  if (!latest) return null
  const s = latest.summary
  const trend = data.alcaldeTrend || []
  return (
    <Card style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink60)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Retribuciones de la corporación · ISPA {latest.year}
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>
            {s.conDedicacion} / {s.total}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>
            con dedicación · {s.sinDedicacion} solo asistencias
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>
            {formatEuros(s.totalAnnualEuros)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>coste anual de la corporación</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {s.brackets
          .filter((b) => /dedicaci/i.test(b.dedicacion))
          .map((b, i) => (
            <span
              key={i}
              className="mono"
              style={{
                fontSize: 11,
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 8px',
                color: 'var(--ink70)',
              }}
            >
              {b.count}× {formatEuros(b.amountEuros)} · {b.dedicacion}
            </span>
          ))}
      </div>
      {trend.length >= 2 && (
        <div style={{ marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 5 }}>
            Retribución del alcalde por año (ISPA)
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            {trend.map((t, i) => {
              const prev = trend[i - 1]
              const up = prev && t.amountEuros > prev.amountEuros
              const down = prev && t.amountEuros < prev.amountEuros
              return (
                <span key={t.year} className="mono" style={{ fontSize: 11.5 }}>
                  <span style={{ color: 'var(--ink50)' }}>{t.year}</span>{' '}
                  <span style={{ fontWeight: 700 }}>{formatEuros(t.amountEuros)}</span>{' '}
                  {prev && (
                    <span
                      style={{ color: up ? 'var(--ok)' : down ? 'var(--crit)' : 'var(--ink60)' }}
                    >
                      {up ? '↑' : down ? '↓' : '→'}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--ink50)', lineHeight: 1.5 }}>
        {data.source?.note}{' '}
        {data.source?.home && (
          <a
            href={data.source.home}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            Fuente: ISPA · Ministerio de Hacienda y Función Pública ↗
          </a>
        )}
      </div>
    </Card>
  )
}

function PlantillaCard() {
  const { data } = useJsonFetch('/data/plantilla.json', null)
  if (!data || !data.total) return null
  const pct = (n) => Math.round((n / data.total) * 100)
  return (
    <Card style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink60)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Plantilla municipal{data.asOf ? ` · ${String(data.asOf).slice(0, 4)}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>
            {data.total}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>empleados públicos</div>
        </div>
        {typeof data.women === 'number' && typeof data.men === 'number' && (
          <div style={{ fontSize: 12, color: 'var(--ink70)' }}>
            <span className="mono" style={{ fontWeight: 700 }}>
              {data.women}
            </span>{' '}
            mujeres ({pct(data.women)}%) ·{' '}
            <span className="mono" style={{ fontWeight: 700 }}>
              {data.men}
            </span>{' '}
            hombres ({pct(data.men)}%)
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}>
        {data.note}{' '}
        {data.source?.url && (
          <a
            href={data.source.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            Fuente: {data.source.publisher} ({String(data.source.date).slice(0, 4)}) ↗
          </a>
        )}
      </div>
    </Card>
  )
}

function OfficialCard({ o, big = false }) {
  const color = partyColor(o.party)
  return (
    <Card hover>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {o.photoUrl ? (
          <img
            src={o.photoUrl}
            alt={o.name}
            width={big ? 72 : 52}
            height={big ? 72 : 52}
            style={{
              width: big ? 72 : 52,
              height: big ? 72 : 52,
              borderRadius: 10,
              objectFit: 'cover',
              flexShrink: 0,
              border: `2px solid ${color}22`,
            }}
          />
        ) : (
          <div
            style={{
              width: big ? 72 : 52,
              height: big ? 72 : 52,
              borderRadius: 10,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--soft)',
              color: 'var(--ink60)',
              fontWeight: 700,
            }}
          >
            {o.name
              .split(' ')
              .slice(0, 2)
              .map((x) => x[0])
              .join('')}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 2,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: color,
                color: 'white',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {o.party}
            </span>
            {o.role === 'alcalde' && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                Alcalde
              </span>
            )}
          </div>
          <div style={{ fontSize: big ? 17 : 14, fontWeight: 600, lineHeight: 1.2 }}>
            <Link to={`/cargos/${o.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {o.name}
            </Link>
          </div>
          {o.portfolios.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.35 }}>
              {o.portfolios.slice(0, 4).join(' · ')}
              {o.portfolios.length > 4 && ' · …'}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: big ? 14 : 10,
          paddingTop: big ? 12 : 8,
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11.5,
          color: 'var(--ink50)',
        }}
      >
        <a
          href={`mailto:${o.email || 'alcaldia@ribarroja.es'}`}
          style={{ color: 'var(--ink)', textDecoration: 'none' }}
          className="mono"
        >
          {o.email || 'alcaldia@ribarroja.es'}
        </a>
        {o.cvUrl && (
          <a
            href={o.cvUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
          >
            Biografía →
          </a>
        )}
      </div>
      <RetribucionBadge official={o} />
      <SalaryGrowth official={o} />
      <DepartmentLinks portfolios={o.portfolios} />
      <QuejaBadge slug={o.slug} />
    </Card>
  )
}

function CompositionBar({ composition, total }) {
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro']
  const items = order.filter((p) => composition[p]).map((p) => ({ p, n: composition[p] }))
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{ display: 'flex', width: '100%', height: 14, borderRadius: 7, overflow: 'hidden' }}
      >
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 11 }}>
        {items.map(({ p, n }) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: partyColor(p) }} />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: 'var(--ink60)' }}>
              {n}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: 'var(--ink50)' }} className="mono">
          Total {total} escaños
        </div>
      </div>
    </div>
  )
}

function CorporacionMunicipal() {
  const { loading, error, data } = useOfficials()

  if (loading) {
    return (
      <div style={{ marginBottom: 28, color: 'var(--ink50)', fontSize: 13 }}>
        Cargando Corporación Municipal…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div
        style={{
          marginBottom: 28,
          padding: 12,
          border: '1px solid var(--warn-soft)',
          borderRadius: 8,
          color: 'var(--warn)',
          fontSize: 13,
        }}
      >
        No se pudo cargar la Corporación Municipal. Ejecuta <code>npm run scrape:officials</code>{' '}
        para regenerar los datos.
      </div>
    )
  }

  const mayor = data.officials.find((o) => o.role === 'alcalde')
  const rest = data.officials.filter((o) => o.role !== 'alcalde')
  const generatedDate = fmtDateLong(data.generatedAt)

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Corporación Municipal
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · datos reales de ribarroja.es · actualizado {generatedDate}
        </div>
        <DataAsOf iso={data.generatedAt} label="Officials" />
      </div>

      {mayor && (
        <div style={{ marginBottom: 14 }}>
          <OfficialCard o={mayor} big />
        </div>
      )}

      <CompositionBar composition={data.composition} total={data.count} />
      <RetribucionesPanel />
      <PlantillaCard />

      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginTop: 22,
          marginBottom: 8,
        }}
      >
        Concejalas y concejales
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        {rest.map((o) => (
          <OfficialCard key={o.slug} o={o} />
        ))}
      </div>
    </div>
  )
}

export default function Cargos() {
  const t = useT()
  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('cargos.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('cargos.title')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Titulares del Ayuntamiento, sus departamentos, presupuesto asignado, promesas adquiridas y
          rendimiento operacional.
        </div>
      </div>

      <CorporacionMunicipal />
    </div>
  )
}
