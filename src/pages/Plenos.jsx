import { Card, Pill, SectionHead } from '../components/Primitives'
import { useParticipa, KIND_ICON, KIND_LABEL } from '../hooks/useParticipa'
import { useMemo, useState } from 'react'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoAgendas, SECTION_LABEL, SECTION_TONE } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_LABEL, OUTCOME_TONE, DIRECTION_TONE } from '../hooks/usePlenoVotes'
import { usePlenoVideos, usePlenoVoteSuggestions, indexVideosByPleno } from '../hooks/usePlenoVideos'
import { partyColor } from '../hooks/useOfficials'
import { useT } from '../i18n'

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

function PlenoRow({ p, agenda, video, expanded, onToggle }) {
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
          {video && (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              title={video.title}
              className="mono"
              style={{
                marginRight: 6,
                padding: '2px 8px',
                fontSize: 10.5,
                background: 'transparent',
                border: '1px solid var(--border2)',
                borderRadius: 4,
                color: 'var(--civic)',
                textDecoration: 'none',
              }}
            >
              ▸ vídeo
            </a>
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
  const { data: videos } = usePlenoVideos()
  const [expanded, setExpanded] = useState({})
  const items = (data?.items || []).slice(0, 20)
  const agendasById = useMemo(() => {
    const m = {}
    for (const a of agendas?.plenos || []) m[a.id] = a
    return m
  }, [agendas])
  const videosByPleno = useMemo(() => indexVideosByPleno(videos, data), [videos, data])
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
            video={videosByPleno.get(p.id)}
            expanded={!!expanded[p.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
          />
        ))}
      </Card>
    </div>
  )
}

function VoteTuple({ v }) {
  const tone = DIRECTION_TONE[v.direction] || 'neutral'
  const toneVar = tone === 'ok' ? 'var(--ok-ink)'
    : tone === 'crit' ? 'var(--crit-ink)'
    : tone === 'warn' ? 'var(--warn-ink)'
    : 'var(--ink60)'
  const bg = tone === 'ok' ? 'var(--ok-soft)'
    : tone === 'crit' ? 'var(--crit-soft)'
    : tone === 'warn' ? 'var(--warn-soft)'
    : 'var(--soft)'
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        background: bg,
        color: toneVar,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: partyColor(v.bloc) }} />
      {v.bloc} · {v.direction === 'a_favor' ? '✓' : v.direction === 'en_contra' ? '✗' : v.direction === 'abstencion' ? '○' : '—'}
    </span>
  )
}

function PlenoVotesBlock() {
  const t = useT()
  const { loading, error, data } = usePlenoVotes()
  if (loading) return null
  const items = data?.items || []
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('plenos.votes.heading')}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · transcrito verbatim del acta · {items.length} acuerdo{items.length === 1 ? '' : 's'}
        </div>
      </div>

      {error && (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink60)' }}>
            No se pudo cargar /data/pleno-votes.json.
          </div>
        </Card>
      )}

      {!error && items.length === 0 && (
        <Card>
          <SectionHead
            eyebrow={t('plenos.votes.empty.eyebrow')}
            title={t('plenos.votes.empty.title')}
          />
          <div style={{ fontSize: 13, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.55 }}>
            Este módulo transcribe el sentido del voto de cada grupo municipal sobre los
            acuerdos del pleno. Las transcripciones se incorporan a partir del acta oficial
            publicada por la secretaría del ayuntamiento — manual y verificable. Cuando se
            publique el primer acuerdo votado, aparecerá aquí con cita a la fuente.
          </div>
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <a
              href="https://github.com/datarhan/civicpulse/issues/new?template=pleno-vote.yml"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              Enviar acta con voto registrado →
            </a>
          </div>
        </Card>
      )}

      {!error && items.length > 0 && (
        <Card>
          {items.slice(0, 20).map((rec, i) => (
            <div
              key={rec.id}
              style={{
                padding: i === 0 ? '0 0 14px' : '14px 0',
                borderTop: i === 0 ? 'none' : '1px dashed var(--border2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                  {fmtDate(rec.plenoDate)}
                </span>
                <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">
                  {OUTCOME_LABEL[rec.outcome]}
                </Pill>
                {rec.department && (
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--civic)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                    {rec.department}
                  </span>
                )}
                {rec.expediente && (
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)' }}>
                    Expte. {rec.expediente}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 8 }}>
                {rec.itemNumber}. {rec.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {rec.votes.map((v) => <VoteTuple key={v.bloc} v={v} />)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink60)' }}>
                <a
                  href={rec.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  Ver acta en {rec.sourcePublisher} →
                </a>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function PlenoVoteSuggestionsBlock() {
  const t = useT()
  const { data } = usePlenoVoteSuggestions()
  const items = data?.items || []
  if (items.length === 0) return null  // hide entirely when there's nothing to surface
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--warn-ink)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Propuestas automáticas · pendiente de revisión humana
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · transcritas de YouTube · {items.length} segmento{items.length === 1 ? '' : 's'}
        </div>
      </div>
      <Card style={{ borderLeft: '3px solid var(--warn)' }}>
        <div style={{ fontSize: 12, color: 'var(--ink60)', marginBottom: 12, lineHeight: 1.5 }}>
          Estos votos han sido inferidos automáticamente a partir de la transcripción del vídeo del
          pleno. <strong>No sustituyen al acta oficial.</strong> Un curador debe verificar cada caso
          antes de publicarlo en el registro oficial. La precisión de Whisper sobre nombres propios
          y jerga municipal ronda el 90 %.
        </div>
        {items.slice(0, 15).map((rec, i) => (
          <div
            key={`${rec.plenoId}-${i}`}
            style={{
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px dashed var(--border2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                {fmtDate(rec.plenoDate)}
              </span>
              {rec.itemNumber && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink60)' }}>
                  Punto {rec.itemNumber}
                </span>
              )}
              {rec.outcome && (
                <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">{OUTCOME_LABEL[rec.outcome]}</Pill>
              )}
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: rec.confidence >= 0.8 ? 'var(--ok-ink)' : 'var(--warn-ink)',
                }}
              >
                conf. {(rec.confidence * 100).toFixed(0)}%
              </span>
              {rec.engine && (
                <span
                  className="mono"
                  title={rec.engine === 'llm' ? 'Sugerencia generada por el motor LLM (Qwen/GPT-4o-mini)' : 'Sugerencia generada por el motor de expresiones regulares'}
                  style={{
                    fontSize: 9.5,
                    padding: '1px 6px',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    fontWeight: 700,
                    background: rec.engine === 'llm' ? 'var(--intel-soft)' : 'var(--soft)',
                    color: rec.engine === 'llm' ? 'var(--intel-ink)' : 'var(--ink60)',
                  }}
                >
                  {rec.engine}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {rec.votes.map((v) => <VoteTuple key={v.bloc} v={v} />)}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--ink60)',
                background: 'var(--soft)',
                padding: '6px 9px',
                borderRadius: 4,
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              “{rec.excerpt}”
            </div>
          </div>
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
  const t = useT()
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
          {t('plenos.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('plenos.title')}
        </div>
      </div>

      <RealPlenosList />
      <PlenoVotesBlock />
      <PlenoVoteSuggestionsBlock />
      <ParticipaBlock />
    </div>
  )
}
