import { useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Card, Pill, ExtLink } from '../components/Primitives'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'
import DataAsOf from '../components/DataAsOf'
import { usePlenoFindings, SEVERITY_LABEL, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { PARTY_TONE } from '../hooks/usePromises'
import { usePlenoClaims } from '../hooks/usePlenoClaims'
import { findingMatchesArea } from '../lib/finding-area'
import { DEPARTMENT_LABEL } from '../scraper/departments'
import { useT } from '../i18n'
import { blocLabel } from '../lib/party-label.js'

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

function RefList({ refs, kind }) {
  if (!refs || refs.length === 0) return null
  const label = kind === 'corroboration' ? 'Corrobora' : 'Contradice'
  const tone = kind === 'corroboration' ? 'var(--ok-ink)' : 'var(--crit-ink)'
  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: tone,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {refs.map((r, i) => {
        const isUrl = /^https?:\/\//.test(r.ref)
        const body = (
          <>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)', marginRight: 6 }}>
              {r.kind.toUpperCase()}
            </span>
            <span style={{ fontSize: 12 }}>{r.snippet}</span>
          </>
        )
        return isUrl ? (
          <ExtLink
            key={i}
            href={r.ref}
            style={{ display: 'block', padding: '2px 0', textDecoration: 'none', color: 'inherit' }}
          >
            {body}
          </ExtLink>
        ) : (
          <div key={i} style={{ padding: '2px 0' }}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

function FindingDetailCard({ f, permalink }) {
  return (
    <Card id={f.id} style={{ scrollMarginTop: 24 }}>
      <ClaimReviewJsonLd finding={f} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Pill tone={SEVERITY_TONE[f.severity] || 'neutral'} size="xs">
          {SEVERITY_LABEL[f.severity] || f.severity}
        </Pill>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          {f.plenoDate} · pleno {f.plenoId} · editado por {f.curatorName}
        </span>
        <a
          href={permalink}
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--civic)',
            textDecoration: 'none',
          }}
          title="Enlace permanente a este hallazgo"
        >
          #{f.id.slice(-12)}
        </a>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{f.title}</div>
      {f.individualSpeaker && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            padding: '3px 8px',
            background: 'var(--soft)',
            borderRadius: 12,
            fontSize: 11.5,
          }}
          title="Atribución individual confirmada por curaduría editorial"
        >
          <span
            className="mono"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: PARTY_TONE[f.individualSpeaker.party] || 'var(--ink50)',
            }}
          >
            {f.individualSpeaker.party}
          </span>
          <span>{f.individualSpeaker.name}</span>
        </div>
      )}
      <p
        style={{
          fontSize: 13,
          color: 'var(--ink80)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        {f.summary}
      </p>
      {f.quotes?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {f.quotes.map((q, i) => (
            <blockquote
              key={i}
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
              «{q.text}»{' '}
              {q.speakerGroup && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    fontStyle: 'normal',
                    color: PARTY_TONE[q.speakerGroup] || 'var(--ink50)',
                    marginLeft: 6,
                    fontWeight: 700,
                  }}
                >
                  {blocLabel(q.speakerGroup)}
                </span>
              )}
            </blockquote>
          ))}
        </div>
      )}
      <RefList refs={f.corroboration} kind="corroboration" />
      <RefList refs={f.contradiction} kind="contradiction" />
      {f.response ? (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--soft)',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--ink)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: PARTY_TONE[f.response.from] || 'var(--ink50)',
              marginBottom: 2,
              fontWeight: 700,
            }}
          >
            Réplica de {f.response.from} · {f.response.respondedAt}
          </div>
          «{f.response.quote}»
          {f.response.sourceUrl && (
            <div style={{ marginTop: 4 }}>
              <ExtLink
                href={f.response.sourceUrl}
                style={{ fontSize: 11, color: 'var(--civic)', textDecoration: 'none' }}
              >
                Fuente →
              </ExtLink>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'var(--ink50)',
          }}
        >
          ¿Eres el grupo afectado? Contacta con la redacción para ejercer derecho de réplica · ver{' '}
          <a href="/aviso-legal" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
            /aviso-legal
          </a>
        </div>
      )}
      {f.corrections?.length > 0 && (
        <details
          style={{
            marginTop: 10,
            paddingLeft: 10,
            borderLeft: '2px solid var(--border)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 10.5,
              color: 'var(--ink70)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Bitácora de correcciones · {f.corrections.length}
          </summary>
          <ol
            style={{
              margin: '6px 0 0',
              paddingLeft: 18,
              display: 'grid',
              gap: 8,
              fontSize: 11.5,
            }}
          >
            {f.corrections.map((c, idx) => (
              <li key={idx}>
                <div
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    color: 'var(--ink60)',
                    marginBottom: 2,
                  }}
                >
                  {c.field} · {c.correctedAt.slice(0, 10)} · {c.editor}
                </div>
                <div
                  style={{
                    textDecoration: 'line-through',
                    color: 'var(--ink60)',
                  }}
                >
                  {c.original}
                </div>
                <div style={{ color: 'var(--ink90)', marginTop: 1 }}>{c.corrected}</div>
                <div
                  style={{
                    marginTop: 2,
                    fontStyle: 'italic',
                    color: 'var(--ink70)',
                    fontSize: 10.5,
                  }}
                >
                  Motivo: {c.reason}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  )
}

function Chip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: '4px 10px',
        borderRadius: 14,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.02em',
        border: '1px solid ' + (active ? 'var(--civic)' : 'var(--border2)'),
        background: active ? 'var(--civic-soft)' : 'var(--paper)',
        color: active ? 'var(--civic)' : 'var(--ink60)',
        cursor: 'pointer',
      }}
    >
      {label}
      {typeof count === 'number' && (
        <span
          style={{ marginLeft: 6, fontSize: 10, color: active ? 'var(--civic)' : 'var(--ink50)' }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export default function Hallazgos() {
  const t = useT()
  const location = useLocation()
  const { loading, error, data } = usePlenoFindings()
  const [severityFilter, setSeverityFilter] = useState(null)
  const [speakerFilter, setSpeakerFilter] = useState(null)
  const [plenoFilter, setPlenoFilter] = useState(null)
  // Área arrives in the URL so a councillor's page can deep-link here. The
  // findings themselves carry no department: the link runs
  // finding → sourceClaimIds → claim.topic → department, reusing the same
  // mapping /departamentos uses, so both surfaces agree on what an área means.
  const areaFilter = new URLSearchParams(location.search).get('area')
  const { data: claimsForArea } = usePlenoClaims()

  const items = useMemo(() => data?.items ?? [], [data])

  const counts = useMemo(() => {
    const bySeverity = {}
    const bySpeaker = {}
    const byPleno = {}
    for (const f of items) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
      for (const q of f.quotes ?? []) {
        const s = q.speakerGroup ?? '—'
        bySpeaker[s] = (bySpeaker[s] ?? 0) + 1
      }
      byPleno[f.plenoDate] = (byPleno[f.plenoDate] ?? 0) + 1
    }
    return { bySeverity, bySpeaker, byPleno }
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((f) => {
      if (severityFilter && f.severity !== severityFilter) return false
      if (speakerFilter) {
        const speakers = new Set((f.quotes ?? []).map((q) => q.speakerGroup ?? '—'))
        if (!speakers.has(speakerFilter)) return false
      }
      if (plenoFilter && f.plenoDate !== plenoFilter) return false
      if (!findingMatchesArea(f, areaFilter, claimsForArea)) return false
      return true
    })
  }, [items, severityFilter, speakerFilter, plenoFilter, areaFilter, claimsForArea])

  // Group by pleno date
  const groups = useMemo(() => {
    const g = new Map()
    for (const f of filtered) {
      if (!g.has(f.plenoDate)) g.set(f.plenoDate, [])
      g.get(f.plenoDate).push(f)
    }
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>{t('common.loading')}</div>
    )
  }
  if (error) {
    return <div style={{ padding: 32, color: 'var(--crit)', fontSize: 13 }}>{error.message}</div>
  }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Deep-linked from a councillor's page. Says plainly that the filter is
          an ÁREA, not a person — findings name political groups, never
          individuals, and arriving here from someone's profile must not blur
          that. */}
      {areaFilter && DEPARTMENT_LABEL[areaFilter] && (
        <Card style={{ marginBottom: 16, background: 'var(--soft)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{ fontSize: 10.5, color: 'var(--ink50)', letterSpacing: '.06em' }}
            >
              {t('hallazgos.area.filtered')}
            </span>
            <strong style={{ fontSize: 14 }}>{DEPARTMENT_LABEL[areaFilter].es}</strong>
            <Link to="/hallazgos" style={{ fontSize: 12, color: 'var(--civic)' }}>
              {t('hallazgos.area.clear')}
            </Link>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 6, lineHeight: 1.5 }}>
            {t('hallazgos.area.note')}
          </div>
        </Card>
      )}
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
          Verificación editorial
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Hallazgos sobre declaraciones en pleno
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink60)',
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          Cada hallazgo es una nota editorial curada por una persona que toma una o más afirmaciones
          literales de un pleno y las sitúa en su contexto documental (contratos, subvenciones,
          presupuesto, promesas). Incluye corroboración, contradicción y derecho de réplica literal
          para el grupo afectado.
        </p>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label="Hallazgos" />
        </div>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <MiniStat label="Total hallazgos" value={items.length} />
        <MiniStat
          label="Críticos"
          value={counts.bySeverity.critical ?? 0}
          tone={(counts.bySeverity.critical ?? 0) > 0 ? 'crit' : undefined}
        />
        <MiniStat
          label="Relevantes"
          value={counts.bySeverity.notable ?? 0}
          tone={(counts.bySeverity.notable ?? 0) > 0 ? 'warn' : undefined}
        />
        <MiniStat label="Informativos" value={counts.bySeverity.informational ?? 0} />
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--border2)',
            borderRadius: 8,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                marginRight: 6,
              }}
            >
              Severidad
            </span>
            <Chip
              active={severityFilter === null}
              label="todas"
              onClick={() => setSeverityFilter(null)}
            />
            {['critical', 'notable', 'informational'].map((s) => (
              <Chip
                key={s}
                active={severityFilter === s}
                label={SEVERITY_LABEL[s] ?? s}
                count={counts.bySeverity[s] ?? 0}
                onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
              />
            ))}
          </div>
          {Object.keys(counts.bySpeaker).length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{
                  fontSize: 9.5,
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  marginRight: 6,
                }}
              >
                Grupo
              </span>
              <Chip
                active={speakerFilter === null}
                label="todos"
                onClick={() => setSpeakerFilter(null)}
              />
              {Object.entries(counts.bySpeaker)
                .sort((a, b) => b[1] - a[1])
                .map(([g, n]) => (
                  <Chip
                    key={g}
                    active={speakerFilter === g}
                    label={g}
                    count={n}
                    onClick={() => setSpeakerFilter(speakerFilter === g ? null : g)}
                  />
                ))}
            </div>
          )}
          {Object.keys(counts.byPleno).length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{
                  fontSize: 9.5,
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  marginRight: 6,
                }}
              >
                Pleno
              </span>
              <Chip
                active={plenoFilter === null}
                label="todos"
                onClick={() => setPlenoFilter(null)}
              />
              {Object.entries(counts.byPleno)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([d, n]) => (
                  <Chip
                    key={d}
                    active={plenoFilter === d}
                    label={d}
                    count={n}
                    onClick={() => setPlenoFilter(plenoFilter === d ? null : d)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* Grouped findings */}
      {groups.length === 0 ? (
        <div
          style={{
            padding: 16,
            background: 'var(--soft)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--ink60)',
            lineHeight: 1.5,
          }}
        >
          {items.length === 0
            ? 'Todavía no hay hallazgos editoriales publicados. El flujo de curación es: extraer declaraciones → verificar contra datos → promover a hallazgo.'
            : 'Ninguno coincide con los filtros actuales.'}
        </div>
      ) : (
        groups.map(([date, list]) => (
          <section key={date} style={{ marginBottom: 24 }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--ink50)',
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Pleno · {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((f) => (
                <FindingDetailCard key={f.id} f={f} permalink={`${location.pathname}#${f.id}`} />
              ))}
            </div>
          </section>
        ))
      )}

      <div
        style={{
          marginTop: 30,
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 11.5,
          color: 'var(--ink60)',
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>Cómo se escribe un hallazgo.</strong> Un curador
        humano revisa las afirmaciones extraídas automáticamente de las transcripciones del pleno,
        contrasta con la base documental municipal y redacta una nota editorial que cita verbatim.
        Los grupos afectados pueden responder con cita literal a través del enlace «Responder como
        grupo afectado».{' '}
        <a
          href="/metodologia#verificacion-declaraciones"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          Leer metodología →
        </a>
      </div>
    </div>
  )
}
