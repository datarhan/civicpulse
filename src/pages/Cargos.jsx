import { Link } from 'react-router-dom'
import { Card, ExtLink } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { barItems } from '../lib/party-order'
import { useIspa, ispaLatest, formatEuros, alcaldeGrowth } from '../hooks/useIspa'
import { useDedicaciones, dedicacionForSlug } from '../hooks/useDedicaciones'
import { useJsonFetch } from '../hooks/useJsonFetch'
import { useBioReportRoutes } from '../hooks/useBioReportRoutes'
import { useQuejas } from '../hooks/useQuejas'
import { useSocialFor, SOCIAL_PLATFORM_META } from '../hooks/useOfficialsSocial'
import { canonicalizeDepartments, DEPARTMENT_LABEL } from '../scraper/departments'
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

/**
 * Where this councillor's areas lead in the site, NOT what they hold.
 *
 * These are department pages, and a department is reachable from more than one
 * portfolio: several councillors legitimately show the same chip. Rendered bare
 * — a lone word under a person's name — the row reads as a list of their
 * competences instead, and on 2026-08-24 a reader took «Urbanismo →» on Rafael
 * Gómez Sánchez's card (from his área «Urbanizaciones») as a contradiction of
 * /eficiencia, which names Teresa Pozuelo Martín over the urbanismo figure.
 * Both pages were right; the unlabelled chip was not. The delegated areas
 * verbatim are printed above by the caller — this row is navigation, and now
 * says so.
 */
const MAX_CHIPS = 4

function DepartmentLinks({ portfolios }) {
  const { locale } = useLocale()
  const t = useT()
  // Collect unique slugs from all portfolios — some officials own 3-4
  // concejalías and the user should be able to jump to any of them.
  const slugs = []
  const seen = new Set()
  for (const p of portfolios ?? []) {
    // Every department a compound área names, not only the longest match:
    // «Juventud y Servicios Jurídicos» leads to Juventud too.
    for (const s of canonicalizeDepartments(p)) {
      if (!seen.has(s)) {
        slugs.push(s)
        seen.add(s)
      }
    }
  }
  if (slugs.length === 0) return null
  const shown = slugs.slice(0, MAX_CHIPS)
  const hidden = slugs.length - shown.length
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: 6,
        fontSize: 'var(--fs-micro)',
      }}
    >
      <span
        className="mono"
        style={{
          color: 'var(--ink50)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {t('cargos.card.departamentos')}
      </span>
      {shown.map((slug) => (
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
      {/* Never a silent cap: a row that stops at four without saying so reads
          as "these are all of them". */}
      {hidden > 0 && (
        <span className="mono" style={{ color: 'var(--ink50)' }}>
          {t('cargos.card.departamentos.mas').replace('{n}', hidden)}
        </span>
      )}
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
  const t = useT()
  const { data } = useIspa()
  const { data: dedic } = useDedicaciones()
  const latest = ispaLatest(data)
  if (!latest) return null
  const s = latest.summary
  const trend = data.alcaldeTrend || []
  // Derived, never restated: the trienios caveat renders only while the
  // acuerdo's own quote still says «(+ trienios)» for the Alcaldía. If that
  // clause leaves the source, the sentence leaves the page with it.
  const alcaldeAcuerdo = (dedic?.byOfficial ?? []).find((o) => /alcald/i.test(o.role || ''))
  const trienios = !!alcaldeAcuerdo && /\(\+\s*trienios\)/.test(dedic?.source?.quote || '')
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
            {t('cargos.ispa.total').replace('{n}', s.total).replace('{year}', latest.year)}
          </div>
        </div>
      </div>
      {/* What ISPA sums is what the electos received. Naming the three things it
          leaves out is what keeps the figure from reading as a bigger claim. */}
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
          maxWidth: '68ch',
          marginBottom: 12,
        }}
      >
        {t('cargos.ispa.totalNota')}
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
          {trienios && (
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                lineHeight: 1.5,
                maxWidth: '68ch',
                marginTop: 6,
              }}
            >
              {t('cargos.ispa.trienios').replace(
                '{importe}',
                formatEuros(alcaldeAcuerdo.amountEuros),
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.5 }}>
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
          fontSize: 'var(--fs-aux)',
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
            fontSize: 'var(--fs-aux)',
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

/**
 * One card per person, sitting or former.
 *
 * `former` is a different card, not a dimmed one: every block below the header
 * — salary, growth, department chips, encaje, quejas, social — is a
 * present-tense claim about a seat, and none of them may be painted over
 * someone who no longer holds it. What a former member keeps is what is
 * history: name, party, photograph, biography, and the acta that records the
 * departure. A row the corrections ADDED (`o.correccion`) carries its own
 * provenance line and, when the source publishes no portrait, says why the
 * initials are there instead of letting them read as a failed image.
 */
function OfficialCard({ o, big = false, bioRoute, former = false }) {
  const t = useT()
  const color = partyColor(o.party)
  const sourceUrl = former ? o.source?.url : o.correccion?.source?.url
  const sourceTitle = former ? o.source?.title : o.correccion?.source?.title
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
            title={o.photoNote || undefined}
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
                  color: 'var(--civic)',
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
          {former && (
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)', marginTop: 4 }}
            >
              {t(o.honorific === 'Sra.' ? 'cargos.card.hastaF' : 'cargos.card.hastaM').replace(
                '{fecha}',
                fmtDateLong(o.until),
              )}
              {' · '}
              {t(`cargos.baja.${o.reason}`)}
            </div>
          )}
          {!former && o.correccion?.tipo === 'alta' && (
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}
            >
              {t('cargos.card.altaDesde').replace('{fecha}', fmtDateLong(o.correccion.since))}
            </div>
          )}
          {o.photoNote && (
            <div
              className="mono"
              title={o.photoNote}
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
            >
              {t('cargos.card.sinRetrato')}
            </div>
          )}
          {!former && o.portfolios.length > 0 && (
            <div
              style={{
                fontSize: 'var(--fs-aux)',
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
          gap: 10,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
        }}
      >
        {/* Never a substitute address: the source published none, so the card
            says so instead of pointing a reader at somebody else's mailbox. */}
        {o.email ? (
          <a
            href={`mailto:${o.email}`}
            style={{ color: 'var(--ink)', textDecoration: 'none' }}
            className="mono"
          >
            {o.email}
          </a>
        ) : (
          <span className="mono">{t('cargos.card.sinCorreo')}</span>
        )}
        <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
          {sourceUrl && (
            <ExtLink
              href={sourceUrl}
              title={sourceTitle}
              className="mono"
              style={{ color: 'var(--civic)', textDecoration: 'none' }}
            >
              {t('cargos.card.acta')}
            </ExtLink>
          )}
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
        </span>
      </div>
      {!former && (
        <>
          <SocialLinks slug={o.slug} />
          <RetribucionBadge official={o} />
          <SalaryGrowth official={o} />
          <DepartmentLinks portfolios={o.portfolios} />
          <EncajeCard official={o} bioRoute={bioRoute} />
          <QuejaBadge slug={o.slug} />
        </>
      )}
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
  // The order and the painter live in lib/party-order and are imported by the
  // test that pins «every seat is painted», so neither can drift from the other.
  const items = barItems(composition)
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
  const t = useT()
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
  const former = data.formerOfficials ?? []
  const corr = data.corrections
  // Derived from the snapshot's own block, never typed: the second line of
  // the stamp exists exactly when a correction does, and counts what it counts.
  const nCorr = corr ? (corr.bajas ?? 0) + (corr.altas ?? 0) : 0
  const generatedDate = fmtDateLong(data.generatedAt)

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
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
          · {t('cargos.corporacion.raspado').replace('{fecha}', generatedDate)}
        </div>
        <DataAsOf iso={data.generatedAt} label="Officials" />
      </div>
      {nCorr > 0 && (
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--warn-ink)',
            lineHeight: 1.5,
            maxWidth: '76ch',
            marginBottom: 10,
          }}
        >
          {t('cargos.corporacion.correcciones')
            .replace('{n}', nCorr)
            .replace('{bajas}', corr.bajas ?? 0)
            .replace('{altas}', corr.altas ?? 0)}{' '}
          <Link
            to="/metodologia#corporacion"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            {t('cargos.corporacion.correccionesLink')}
          </Link>
        </div>
      )}

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

      {former.length > 0 && (
        <>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginTop: 22,
              marginBottom: 4,
            }}
          >
            {t('cargos.bajas.title')}
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              marginBottom: 8,
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            {t('cargos.bajas.note')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}
          >
            {former.map((o) => (
              <OfficialCard key={o.slug} o={o} former bioRoute={bioRoutes.get(o.slug)} />
            ))}
          </div>
        </>
      )}
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
          {t('cargos.intro')}
        </div>
      </div>

      <CorporacionMunicipal />
    </div>
  )
}
