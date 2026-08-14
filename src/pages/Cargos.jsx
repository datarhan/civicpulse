import { Link } from 'react-router-dom'
import { Card, ExtLink } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useIspa, ispaLatest, formatEuros, alcaldeGrowth } from '../hooks/useIspa'
import { useDedicaciones, dedicacionForSlug } from '../hooks/useDedicaciones'
import { useJsonFetch } from '../hooks/useJsonFetch'
import { useBioReportRoutes } from '../hooks/useBioReportRoutes'
import { useQuejas } from '../hooks/useQuejas'
import { useSocialFor, SOCIAL_PLATFORM_META } from '../hooks/useOfficialsSocial'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../scraper/departments'
import { EncajeCard } from '../components/EncajeDeclarado'
import { fmtDateLong } from '../lib/formatters'
import { useT, useLocale } from '../i18n'

/**
 * Verified public accounts for this official.
 *
 * Renders ONLY curator-promoted rows (public/data/officials-social.json); the
 * machine suggestions are never fetched by the app. Nothing renders when an
 * official has no verified account — an absent row means "not verified", not
 * "no presence", and an honest blank beats a guess on a named person's card.
 */
function SocialLinks({ slug }) {
  const { accounts } = useSocialFor(slug)
  if (accounts.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {accounts.map((a) => {
        const meta = SOCIAL_PLATFORM_META[a.platform] ?? { label: a.platform, glyph: '↗' }
        return (
          <ExtLink
            key={a.platform}
            href={a.url}
            title={`${meta.label}: @${a.handle} — verificado por ${a.curator ?? 'curación'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border2)',
              background: 'var(--soft)',
              color: 'var(--ink70)',
              fontSize: 'var(--fs-micro)',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden="true" className="mono">
              {meta.glyph}
            </span>
            <span>{meta.label}</span>
          </ExtLink>
        )
      })}
    </div>
  )
}

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
        fontSize: 'var(--fs-micro)',
      }}
    >
      <Link
        to="/quejas"
        className="mono"
        style={{
          color: 'var(--ink50)',
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
      <span style={{ color: 'var(--ok-ink)' }}>✓ {ok}</span>
      <span style={{ color: 'var(--civic)' }}>⏳ {pending}</span>
      {silencios > 0 && <span style={{ color: 'var(--crit-ink)' }}>⚠ {silencios}</span>}
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
        fontSize: 'var(--fs-micro)',
      }}
    >
      {slugs.slice(0, 4).map((slug) => (
        <Link
          key={slug}
          to={`/departamentos/${slug}`}
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            padding: '2px 7px',
            background: 'var(--civic-soft)',
            color: 'var(--civic)',
            borderRadius: 'var(--r-input)',
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
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
      }}
    >
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
        {formatEuros(d.amountEuros)}/año
      </span>
      <span>· dedicación {d.dedicacion}</span>
      {data.source?.url && (
        <ExtLink
          href={data.source.url}
          title={`${d.role} — ${data.source.title}`}
          className="mono"
          style={{ color: 'var(--civic)', marginLeft: 'auto', fontSize: 'var(--fs-micro)' }}
        >
          acuerdo ↗
        </ExtLink>
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
      <div
        className="mono"
        style={{ marginTop: 6, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
      >
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
        fontSize: 'var(--fs-micro)',
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
            <span style={{ color: 'var(--ink50)' }}>—</span>
          ) : (
            <span
              style={{ color: w.pct >= 0 ? 'var(--ok-ink)' : 'var(--crit-ink)', fontWeight: 700 }}
            >
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
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
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
          <div className="mono" style={{ fontSize: 'var(--fs-head)', fontWeight: 800 }}>
            {s.conDedicacion} / {s.total}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            con dedicación · {s.sinDedicacion} solo asistencias
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 'var(--fs-head)', fontWeight: 800 }}>
            {formatEuros(s.totalAnnualEuros)}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            coste anual de la corporación
          </div>
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
                fontSize: 'var(--fs-micro)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-input)',
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
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 5 }}
          >
            Retribución del alcalde por año (ISPA)
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            {trend.map((t, i) => {
              const prev = trend[i - 1]
              const up = prev && t.amountEuros > prev.amountEuros
              const down = prev && t.amountEuros < prev.amountEuros
              return (
                <span key={t.year} className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                  <span style={{ color: 'var(--ink50)' }}>{t.year}</span>{' '}
                  <span style={{ fontWeight: 700 }}>{formatEuros(t.amountEuros)}</span>{' '}
                  {prev && (
                    <span
                      style={{
                        color: up ? 'var(--ok-ink)' : down ? 'var(--crit-ink)' : 'var(--ink50)',
                      }}
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
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', lineHeight: 1.5 }}>
        {data.source?.note}{' '}
        {data.source?.home && (
          <ExtLink href={data.source.home} style={{ color: 'var(--civic)' }}>
            Fuente: ISPA · Ministerio de Hacienda y Función Pública ↗
          </ExtLink>
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
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
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
          <div className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 800 }}>
            {data.total}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            empleados públicos
          </div>
        </div>
        {typeof data.women === 'number' && typeof data.men === 'number' && (
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
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
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
          marginTop: 8,
        }}
      >
        {data.note}{' '}
        {data.source?.url && (
          <ExtLink href={data.source.url} style={{ color: 'var(--civic)' }}>
            Fuente: {data.source.publisher} ({String(data.source.date).slice(0, 4)}) ↗
          </ExtLink>
        )}
      </div>
      {data.authorized && typeof data.authorized.plazas === 'number' && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 'var(--fs-body)', fontWeight: 800, color: 'var(--ink)' }}
          >
            {data.authorized.approx ? '≈' : ''}
            {data.authorized.plazas}
          </span>{' '}
          {data.authorized.label}
          {data.authorized.asOf ? ` · ${data.authorized.asOf}` : ''}
          <div style={{ marginTop: 4, color: 'var(--ink50)' }}>
            {data.authorized.note}{' '}
            {data.authorized.source?.url && (
              <ExtLink href={data.authorized.source.url} style={{ color: 'var(--civic)' }}>
                Fuente: {data.authorized.source.publisher} ↗
              </ExtLink>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function OfficialCard({ o, big = false, bioRoute }) {
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
              borderRadius: 'var(--r-card)',
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
              borderRadius: 'var(--r-card)',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--soft)',
              color: 'var(--ink50)',
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
                fontSize: 'var(--fs-micro)',
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: color,
                color: 'white',
                padding: '2px 6px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              {o.party}
            </span>
            {o.role === 'alcalde' && (
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
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
          <div
            style={{
              fontSize: big ? 'var(--fs-head)' : 'var(--fs-body)',
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            <Link to={`/cargos/${o.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {o.name}
            </Link>
          </div>
          {o.portfolios.length > 0 && (
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                marginTop: 4,
                lineHeight: 1.35,
              }}
            >
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
          fontSize: 'var(--fs-micro)',
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
        {bioRoute ? (
          <Link
            to={bioRoute}
            title="Informe biográfico del agente periodista de CivicPulse"
            style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
          >
            Biografía →
          </Link>
        ) : (
          o.cvUrl && (
            <ExtLink
              href={o.cvUrl}
              style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
            >
              Biografía →
            </ExtLink>
          )
        )}
      </div>
      <SocialLinks slug={o.slug} />
      <RetribucionBadge official={o} />
      <SalaryGrowth official={o} />
      <DepartmentLinks portfolios={o.portfolios} />
      <EncajeCard official={o} bioRoute={bioRoute} />
      <QuejaBadge slug={o.slug} />
    </Card>
  )
}

function CompositionBar({ composition, total }) {
  // The known parties fix the reading order; anything else in the snapshot is
  // APPENDED rather than dropped. A hard-coded allow-list here erased EU-Podem
  // — a party holding a real seat — so the bar painted 20 escaños under a label
  // reading «Total 21», and the councillor elected for it did not appear in the
  // corporation at all. A whitelist that silently discards live data is the
  // same defect this repo keeps finding in its enums; a party that wins a seat
  // must never depend on someone remembering to add it here.
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem', 'Otro']
  const known = order.filter((p) => composition[p])
  const rest = Object.keys(composition)
    .filter((p) => composition[p] && !order.includes(p))
    .sort((a, b) => composition[b] - composition[a])
  const items = [...known, ...rest].map((p) => ({ p, n: composition[p] }))
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 14,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
        }}
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 8,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {items.map(({ p, n }) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: partyColor(p) }} />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: 'var(--ink50)' }}>
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
  const bioRoutes = useBioReportRoutes()

  if (loading) {
    return (
      <div style={{ marginBottom: 28, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
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
          borderRadius: 'var(--r-input)',
          color: 'var(--warn-ink)',
          fontSize: 'var(--fs-aux)',
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
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Corporación Municipal
        </div>
        <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          · datos reales de ribarroja.es · actualizado {generatedDate}
        </div>
        <DataAsOf iso={data.generatedAt} label="Officials" />
      </div>

      {mayor && (
        <div style={{ marginBottom: 14 }}>
          <OfficialCard o={mayor} big bioRoute={bioRoutes.get(mayor.slug)} />
        </div>
      )}

      <CompositionBar composition={data.composition} total={data.count} />
      <RetribucionesPanel />
      <PlantillaCard />

      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
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
          <OfficialCard key={o.slug} o={o} bioRoute={bioRoutes.get(o.slug)} />
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
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('cargos.eyebrow')}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            marginTop: 2,
          }}
        >
          {t('cargos.title')}
        </div>
        <div
          style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 4, maxWidth: 620 }}
        >
          Titulares del Ayuntamiento, sus departamentos, presupuesto asignado, promesas adquiridas y
          rendimiento operacional.
        </div>
      </div>

      <CorporacionMunicipal />
    </div>
  )
}
