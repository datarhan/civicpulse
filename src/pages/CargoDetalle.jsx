import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import {
  usePromises,
  isPromiseFrozen,
  PARTY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
} from '../hooks/usePromises'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { useQuejas, STATE_LABEL, STATE_TONE } from '../hooks/useQuejas'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../scraper/departments'
import { useT, useLocale } from '../i18n'

function flattenAgendas(snap) {
  if (!snap?.plenos) return []
  const out = []
  for (const p of snap.plenos) {
    for (const it of p.agenda || []) {
      out.push({ plenoId: p.id, plenoDate: p.date, plenoTitle: p.title, ...it })
    }
  }
  return out
}

function portfolioSlugs(official) {
  const out = []
  const seen = new Set()
  for (const p of official?.portfolios ?? []) {
    const s = canonicalizeDepartment(p)
    if (s && !seen.has(s)) {
      out.push(s)
      seen.add(s)
    }
  }
  return out
}

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

export default function CargoDetalle() {
  const { slug } = useParams()
  const t = useT()
  const { locale } = useLocale()
  const officialsSnap = useOfficials()
  const promisesSnap = usePromises()
  const agendasSnap = usePlenoAgendas()
  const quejasSnap = useQuejas()
  const frozen = isPromiseFrozen(promisesSnap.data)

  if (officialsSnap.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>
        {t('common.loading')}
      </div>
    )
  }

  const official = officialsSnap.data?.officials?.find((o) => o.slug === slug)
  if (!official) {
    return (
      <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
        <Link
          to="/cargos"
          style={{
            fontSize: 12,
            color: 'var(--civic)',
            textDecoration: 'none',
            marginBottom: 18,
            display: 'inline-block',
          }}
        >
          ← {t('cargos.title')}
        </Link>
        <p style={{ color: 'var(--crit)' }}>{t('cargos.detalle.notFound')}</p>
      </div>
    )
  }

  const color = partyColor(official.party)
  const slugs = portfolioSlugs(official)
  const slugsSet = new Set(slugs)

  // Party-level promises. We never misattribute individual promises to one
  // councillor — even the mayor. The card shows N promesas del grupo X.
  const partyPromises = (promisesSnap.data?.items ?? []).filter((p) => p.party === official.party)

  // Agenda items whose canonical departmentSlug is in this official's
  // portfolio set. Count + flat list (trimmed).
  const agendaItems = flattenAgendas(agendasSnap.data).filter(
    (it) => it.departmentSlug && slugsSet.has(it.departmentSlug),
  )
  agendaItems.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  // Quejas assigned to this official (via the pre-aggregated byConcejal stats
  // from quejas.json). Never fabricate: if absent, render 0.
  const quejaStats = quejasSnap.data?.stats?.byConcejal?.[slug] ?? {
    total: 0,
    resueltas: 0,
    pendientes: 0,
    silencios: 0,
  }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
      <Link
        to="/cargos"
        style={{
          fontSize: 12,
          color: 'var(--civic)',
          textDecoration: 'none',
          marginBottom: 18,
          display: 'inline-block',
        }}
      >
        ← {t('cargos.title')}
      </Link>

      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          padding: '18px 0',
          borderBottom: '1px solid var(--border2)',
          marginBottom: 20,
        }}
      >
        {official.photoUrl && (
          <img
            src={official.photoUrl}
            alt={official.name}
            width={88}
            height={88}
            style={{
              width: 88,
              height: 88,
              borderRadius: 12,
              objectFit: 'cover',
              border: `2px solid ${color}33`,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span
              className="mono"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: color,
                color: 'white',
                padding: '2px 7px',
                borderRadius: 3,
              }}
            >
              {official.party}
            </span>
            {official.role === 'alcalde' && (
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
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
            {official.name}
          </div>
          {official.portfolios?.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.4 }}>
              {official.portfolios.join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
            <a
              href={`mailto:${official.email || 'alcaldia@ribarroja.es'}`}
              className="mono"
              style={{ color: 'var(--ink80)', textDecoration: 'none' }}
            >
              {official.email || 'alcaldia@ribarroja.es'}
            </a>
            {official.cvUrl && (
              <a
                href={official.cvUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
              >
                Biografía →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}
      >
        <MiniStat label={t('cargos.detalle.stat.portfolios')} value={slugs.length} />
        <MiniStat
          label={t('cargos.detalle.stat.partyPromises')}
          value={partyPromises.length}
        />
        <MiniStat label={t('cargos.detalle.stat.agendaItems')} value={agendaItems.length} />
        <MiniStat
          label={t('cargos.detalle.stat.quejas')}
          value={quejaStats.pendientes}
          tone={quejaStats.silencios > 0 ? 'crit' : undefined}
        />
      </div>

      {/* Portfolio department chips */}
      {slugs.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionHead
            eyebrow={t('cargos.detalle.portfolios.eyebrow')}
            title={t('cargos.detalle.portfolios.title')}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {slugs.map((s) => (
              <Link
                key={s}
                to={`/departamentos/${s}`}
                className="mono"
                style={{
                  fontSize: 11.5,
                  padding: '5px 10px',
                  background: 'var(--civic-soft)',
                  color: 'var(--civic)',
                  borderRadius: 5,
                  textDecoration: 'none',
                  fontWeight: 600,
                  letterSpacing: '.02em',
                }}
              >
                {locale === 'ca' ? DEPARTMENT_LABEL[s].ca : DEPARTMENT_LABEL[s].es} →
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Party promises (party-level attribution) */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.promesas.eyebrow')}
          title={`${t('cargos.detalle.promesas.title')} · ${official.party}`}
          right={
            <Link
              to="/promesas"
              style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
            >
              {t('cargos.detalle.promesas.viewAll')}
            </Link>
          }
        />
        {partyPromises.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.promesas.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {partyPromises.slice(0, 6).map((p) => (
              <Card key={p.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.title}</div>
                    <blockquote
                      style={{
                        margin: '6px 0 0',
                        padding: '6px 10px',
                        borderLeft: '3px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--ink70)',
                        lineHeight: 1.5,
                        fontStyle: 'italic',
                      }}
                    >
                      «{p.quote}»
                    </blockquote>
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 6 }}
                    >
                      {p.madeAt} · {p.source.publisher}
                    </div>
                  </div>
                  <Pill tone={STATUS_TONE[p.status]} size="xs">
                    {STATUS_LABEL[p.status]}
                  </Pill>
                </div>
              </Card>
            ))}
            {partyPromises.length > 6 && (
              <Link
                to="/promesas"
                style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
              >
                {t('cargos.detalle.promesas.more').replace('{n}', partyPromises.length - 6)}
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Agenda items in their portfolio depts */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.agenda.eyebrow')}
          title={t('cargos.detalle.agenda.title')}
        />
        {agendaItems.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.agenda.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {agendaItems.slice(0, 12).map((it) => (
              <div
                key={`${it.plenoId}-${it.number}`}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--border2)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 2 }}
                >
                  {it.plenoDate} · punto {it.number}
                  {it.department ? ` · ${it.department}` : ''}
                  {it.expediente ? ` · exp. ${it.expediente}` : ''}
                </div>
                <div style={{ color: 'var(--ink80)' }}>{it.title}</div>
              </div>
            ))}
            {agendaItems.length > 12 && (
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--ink50)', paddingTop: 4 }}
              >
                {t('cargos.detalle.agenda.more').replace('{n}', agendaItems.length - 12)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quejas assigned */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.quejas.eyebrow')}
          title={t('cargos.detalle.quejas.title')}
          right={
            quejaStats.total > 0 ? (
              <Link
                to="/quejas"
                style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
              >
                {t('cargos.detalle.quejas.viewAll')}
              </Link>
            ) : null
          }
        />
        {quejaStats.total === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.quejas.empty')}
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              marginTop: 10,
            }}
          >
            <MiniStat label="Total" value={quejaStats.total} />
            <MiniStat label="Resueltas" value={quejaStats.resueltas} />
            <MiniStat label="Pendientes" value={quejaStats.pendientes} />
            <MiniStat
              label="Silencios"
              value={quejaStats.silencios}
              tone={quejaStats.silencios > 0 ? 'crit' : undefined}
            />
          </div>
        )}
      </section>

      <div
        style={{
          marginTop: 20,
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 11.5,
          color: 'var(--ink60)',
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>Atribución.</strong>{' '}
        {t('cargos.detalle.methodology')}
        {' '}
        <a href="/metodologia" style={{ color: 'var(--civic)' }}>
          {t('cargos.detalle.methodology.link')}
        </a>
      </div>
    </div>
  )
}
