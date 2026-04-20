import { Button, Card, Pill, SectionHead } from '../components/Primitives'
import { AGENDA_PLENO, HISTORIC_VOTES } from '../data/mockData'
import { useParticipa, KIND_ICON, KIND_LABEL } from '../hooks/useParticipa'
import { useMemo, useState } from 'react'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoAgendas, SECTION_LABEL, SECTION_TONE } from '../hooks/usePlenoAgendas'

function AgendaRow({ item }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px dashed var(--border2)',
        fontSize: 12.5,
      }}
    >
      <div className="mono" style={{ color: 'var(--ink50)', textAlign: 'right' }}>
        {item.number}.
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {item.department && (
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                color: 'var(--civic)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {item.department}
            </span>
          )}
          {item.expediente && (
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)' }}>
              Expte. {item.expediente}
            </span>
          )}
          <Pill tone={SECTION_TONE[item.section] || 'ghost'} size="xs">
            {SECTION_LABEL[item.section] || item.section}
          </Pill>
        </div>
        <div style={{ marginTop: 2, color: 'var(--ink)', lineHeight: 1.4 }}>{item.title}</div>
      </div>
    </div>
  )
}

function PlenoRow({ p, agenda, expanded, onToggle }) {
  const fmt = (iso) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div style={{ borderBottom: '1px solid var(--border2)', padding: '10px 0' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '110px 1fr 80px 110px',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
        }}
      >
        <div className="mono" style={{ fontSize: 12, color: 'var(--ink60)' }}>
          {fmt(p.date)}
        </div>
        <div style={{ minWidth: 0 }}>
          <a
            href={p.link}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
          >
            {p.title}
          </a>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink60)', textAlign: 'right' }}>
          {agenda && agenda.agendaCount > 0 ? `${agenda.agendaCount} puntos` : '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          {agenda && agenda.agendaCount > 0 && (
            <button
              onClick={onToggle}
              style={{
                marginRight: 6,
                padding: '2px 8px',
                fontSize: 11,
                background: 'transparent',
                border: '1px solid var(--border2)',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'var(--civic)',
              }}
            >
              {expanded ? 'Ocultar' : 'Ver'}
            </button>
          )}
          <Pill tone={PLENO_TONE[p.kind] || 'ghost'} size="xs">
            {PLENO_LABEL[p.kind] || p.kind}
          </Pill>
        </div>
      </div>
      {expanded && agenda && agenda.agenda.length > 0 && (
        <div style={{ marginTop: 10, paddingLeft: 122, paddingRight: 16 }}>
          {agenda.agenda.map((it, i) => (
            <AgendaRow key={i} item={it} />
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink50)' }}>
            Fuente:{' '}
            <a href={p.link} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
              ribarroja.es
            </a>{' '}
            · orden del día de la convocatoria
          </div>
        </div>
      )}
    </div>
  )
}

function TopDepartmentsCard({ agendas }) {
  if (!agendas?.topDepartments?.length) return null
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionHead
        eyebrow={`Plenos analizados · ${agendas.stats.plenosFetched} sesiones · ${agendas.stats.agendaItemsTotal} puntos`}
        title="Departamentos con más presencia en el pleno"
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {agendas.topDepartments.map((d) => (
          <span
            key={d.department}
            className="mono"
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'var(--civic-soft)',
              color: 'var(--civic)',
              borderRadius: 3,
              letterSpacing: '.05em',
            }}
          >
            {d.department}
            <span style={{ marginLeft: 5, color: 'var(--ink60)' }}>· {d.count}</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function RealPlenosList() {
  const { loading, error, data } = usePlenos()
  const { data: agendas } = usePlenoAgendas()
  const [expanded, setExpanded] = useState({})
  const items = (data?.items || []).slice(0, 20)
  const agendasById = useMemo(() => {
    const m = {}
    for (const a of agendas?.plenos || []) m[a.id] = a
    return m
  }, [agendas])
  if (loading || error || !data) return null
  return (
    <div style={{ marginTop: 28 }}>
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
          Plenos recientes
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · {data.stats.total} sesiones · ribarroja.es/plenos
        </div>
      </div>
      <TopDepartmentsCard agendas={agendas} />
      <Card>
        {items.map((p) => (
          <PlenoRow
            key={p.id}
            p={p}
            agenda={agendasById[p.id]}
            expanded={!!expanded[p.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
          />
        ))}
      </Card>
    </div>
  )
}

function ParticipaBlock() {
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = data.items || []
  if (items.length === 0) return null
  const generated = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ marginTop: 28 }}>
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
          Participación ciudadana
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · datos reales de participa.ribarroja.es · {data.stats.total} posts · actualizado {generated}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {items.map((i) => (
          <Card key={i.id} hover>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: i.kind === 'survey' ? 'var(--civic-soft)' : 'var(--ok-soft)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {KIND_ICON[i.kind] || '📢'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Pill tone={i.kind === 'survey' ? 'civic' : 'ok'} size="xs">
                    {KIND_LABEL[i.kind] || 'Aviso'}
                  </Pill>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                    {fmtDate(i.date)}
                  </span>
                </div>
                <a
                  href={i.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'inherit',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {i.title.length > 90 ? i.title.slice(0, 90) + '…' : i.title}
                </a>
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink60)',
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {i.excerpt}
            </div>
            <div style={{ marginTop: 10, fontSize: 11 }}>
              <a
                href={i.link}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
              >
                Ver convocatoria →
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function Plenos() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
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
          Órganos de gobierno
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Plenos municipales
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Pill tone="civic" size="xs">
                HOY · 18:00
              </Pill>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 6, letterSpacing: '-.01em' }}>
                Sesión plenaria ordinaria
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink60)', marginTop: 2 }}>
                Salón de plenos · streaming disponible
              </div>
            </div>
            <Button variant="solid">Ver directo →</Button>
          </div>
          <div style={{ marginTop: 16 }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                marginBottom: 10,
              }}
            >
              Orden del día · {AGENDA_PLENO.length} puntos · 2 h 10 min
            </div>
            {AGENDA_PLENO.map((a, i) => (
              <div
                key={a.n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 90px 60px',
                  padding: '12px 0',
                  borderBottom: i === AGENDA_PLENO.length - 1 ? 'none' : '1px solid var(--border2)',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink40)', fontWeight: 700 }}>
                  {a.n}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {a.title}
                    {a.hot && (
                      <Pill tone="warn" size="xs">
                        caliente
                      </Pill>
                    )}
                  </div>
                </div>
                <Pill
                  tone={
                    a.type === 'votación'
                      ? 'civic'
                      : a.type === 'debate'
                      ? 'intel'
                      : a.type === 'moción'
                      ? 'warn'
                      : 'neutral'
                  }
                  size="xs"
                >
                  {a.type}
                </Pill>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', textAlign: 'right' }}>
                  {a.time}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHead eyebrow="Histórico" title="Últimas votaciones" />
          {HISTORIC_VOTES.map((v, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 80px 70px',
                alignItems: 'center',
                padding: '11px 0',
                borderBottom: i === HISTORIC_VOTES.length - 1 ? 'none' : '1px solid var(--border2)',
                gap: 6,
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
                {v.date}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{v.title}</div>
              <Pill tone={v.tone} size="xs">
                {v.result}
              </Pill>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink60)', textAlign: 'right' }}>
                {v.counts}
              </div>
            </div>
          ))}
        </Card>
      </div>

      <RealPlenosList />
      <ParticipaBlock />
    </div>
  )
}
