import { useMemo, useState } from 'react'
import { Card, Pill, ExtLink } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import {
  usePromises,
  usePromiseSuggestions,
  isPromiseFrozen,
  PARTY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  TOPIC_LABEL,
} from '../hooks/usePromises'
import { fmtDateLong } from '../lib/formatters'
import { useT } from '../i18n'

function FreezeBanner({ snap }) {
  if (!isPromiseFrozen(snap)) return null
  return (
    <div
      style={{
        padding: '12px 14px',
        marginBottom: 16,
        background: 'rgba(220, 38, 38, 0.06)',
        border: '1px solid rgba(220, 38, 38, 0.35)',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--ink)',
        lineHeight: 1.45,
      }}
      role="alert"
    >
      <strong style={{ color: '#DC2626' }}>
        Periodo electoral en vigor — tracker en modo solo-lectura.
      </strong>
      <div style={{ marginTop: 4, color: 'var(--ink70)' }}>
        Los estados quedan congelados hasta {fmtDateLong(snap.frozenUntil)} (LOREG art. 50). El
        motor de sugerencias sigue ejecutándose pero no publica cambios de estado. Para correcciones
        durante este periodo, abre una issue en{' '}
        <ExtLink href={snap.contactUrl} style={{ color: 'var(--civic)' }}>
          GitHub
        </ExtLink>
        .
      </div>
    </div>
  )
}

function LegalFooter({ snap }) {
  return (
    <div
      style={{
        marginTop: 40,
        padding: 14,
        background: 'var(--soft)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--ink60)',
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: 'var(--ink)' }}>Aviso editorial.</strong> {snap.legalNotice}
      <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a href="/metodologia" style={{ color: 'var(--civic)' }}>
          Metodología →
        </a>
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          Aviso legal →
        </a>
        <ExtLink href={snap.contactUrl} style={{ color: 'var(--civic)' }}>
          Proponer corrección / añadir fuente →
        </ExtLink>
      </div>
    </div>
  )
}

function CompositionBar({ items }) {
  const byParty = items.reduce((acc, it) => {
    acc[it.party] = (acc[it.party] || 0) + 1
    return acc
  }, {})
  const entries = Object.entries(byParty).sort((a, b) => b[1] - a[1])
  const total = items.length
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)', marginBottom: 6 }}>
        {total} compromisos en seguimiento · distribución por partido
      </div>
      <div
        style={{ display: 'flex', width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' }}
      >
        {entries.map(([party, n]) => (
          <div
            key={party}
            title={`${party}: ${n}`}
            style={{
              flex: n,
              background: PARTY_TONE[party] || '#64748B',
              display: 'grid',
              placeItems: 'center',
              fontSize: 9,
              color: 'white',
              fontWeight: 700,
            }}
            className="mono"
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
        {entries.map(([party, n]) => (
          <span key={party} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: PARTY_TONE[party] || '#64748B',
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{party}</span>
            <span className="mono" style={{ color: 'var(--ink60)' }}>
              {n}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PromiseCard({ p, suggestion, llmEvidence, frozen }) {
  const color = PARTY_TONE[p.party] || '#64748B'
  const fmt = fmtDateLong
  const showSuggestion = suggestion && !frozen && suggestion.reasoning.length > 0
  const llmItems = (llmEvidence || []).filter((e) => e.promiseId === p.id)
  const showLlm = !frozen && llmItems.length > 0
  return (
    <Card hover>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
        <span
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            background: color,
            color: 'white',
            padding: '2px 7px',
            borderRadius: 3,
          }}
        >
          {p.party}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--ink50)',
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          {TOPIC_LABEL[p.topic] || p.topic}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 'auto' }}>
          {fmt(p.madeAt)}
        </span>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 }}>
        {p.title}
      </div>
      <blockquote
        style={{
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--ink70)',
          borderLeft: `3px solid ${color}`,
          paddingLeft: 10,
          margin: '6px 0 10px',
        }}
      >
        «{p.quote}»
      </blockquote>
      <div
        style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 11.5 }}
      >
        <ExtLink
          href={p.source.url}
          style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
        >
          Fuente: {p.source.publisher} →
        </ExtLink>
        <Pill tone={STATUS_TONE[p.status] || 'ghost'} size="xs">
          {STATUS_LABEL[p.status] || p.status}
        </Pill>
      </div>

      {p.evidence.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11.5 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Evidencia curada · {p.evidence.length}
          </div>
          {p.evidence.map((e, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--ink60)', marginBottom: 3 }}>
              <span className="mono">{e.date}</span> · {e.publisher} ·{' '}
              <ExtLink href={e.url} style={{ color: 'var(--civic)' }}>
                ver
              </ExtLink>
            </div>
          ))}
        </div>
      )}

      {showSuggestion && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: 'rgba(36, 99, 235, 0.05)',
            border: '1px dashed rgba(36, 99, 235, 0.35)',
            borderRadius: 6,
            fontSize: 11.5,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--civic)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              marginBottom: 5,
              fontWeight: 700,
            }}
          >
            Propuesta automática · pendiente de revisión humana · confianza{' '}
            {(suggestion.confidence * 100).toFixed(0)}%
          </div>
          <div style={{ marginBottom: 6, color: 'var(--ink70)' }}>
            El motor propone estado:{' '}
            <strong style={{ color: 'var(--ink)' }}>
              {STATUS_LABEL[suggestion.proposedStatus]}
            </strong>
            . Esta propuesta no está publicada; sólo un curador humano puede aplicar un cambio de
            estado.
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)' }}>
            Fundamentación ({suggestion.reasoning.length} evidencias):
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11 }}>
            {suggestion.reasoning.slice(0, 3).map((r, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                <span className="mono">{r.date}</span> · {r.publisher || r.kind} ·{' '}
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
                  {r.quote.length > 80 ? r.quote.slice(0, 80) + '…' : r.quote}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showLlm && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderLeft: '3px solid var(--intel)',
            background: 'var(--intel-soft)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--ink80)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--intel-ink)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              marginBottom: 5,
              fontWeight: 700,
            }}
          >
            Evidencia sugerida por LLM · {llmItems.length} fuente{llmItems.length === 1 ? '' : 's'}{' '}
            · pendiente de revisión
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)', marginBottom: 5, lineHeight: 1.45 }}>
            Estas citas han sido identificadas automáticamente por el modelo a partir de prensa,
            actas de pleno, licitaciones, subvenciones y presupuesto.{' '}
            <strong>No publican estado</strong>; un curador debe verificarlas antes de incorporarlas
            al registro.
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11 }}>
            {llmItems.slice(0, 4).map((ev, i) => {
              const isTranscript = ev.corpus === 'pleno_transcript'
              return (
                <li key={i} style={{ marginBottom: 4 }}>
                  <span
                    className="mono"
                    title={
                      isTranscript
                        ? 'Transcripción automática del vídeo del pleno. El orador NO está atribuido (riesgo de difamación por errores de transcripción).'
                        : undefined
                    }
                    style={{ color: 'var(--intel-ink)', fontWeight: 600 }}
                  >
                    {isTranscript ? '🎙 transcript' : ev.corpus}
                  </span>
                  {' · '}
                  <span className="mono">{ev.date}</span> · {ev.publisher} ·{' '}
                  <ExtLink
                    href={ev.evidenceUrl}
                    style={{
                      color: 'var(--civic)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                  >
                    {ev.quote.length > 90 ? ev.quote.slice(0, 90) + '…' : ev.quote}
                  </ExtLink>{' '}
                  <span className="mono" style={{ color: 'var(--ink50)', fontSize: 10 }}>
                    (conf. {(ev.confidence * 100).toFixed(0)}%)
                  </span>
                  {isTranscript && (
                    <span style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 4 }}>
                      · sin atribución de orador
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {p.response && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: 'var(--soft)',
            borderRadius: 6,
            fontSize: 11.5,
          }}
        >
          <strong>Respuesta del grupo {p.response.from}:</strong> «{p.response.quote}»
          {p.response.source && (
            <>
              {' '}
              <ExtLink href={p.response.source.url} style={{ color: 'var(--civic)' }}>
                (fuente)
              </ExtLink>
            </>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: 'var(--ink50)',
        }}
      >
        <span>
          Réplica o corrección · contacto en{' '}
          <a href="/aviso-legal" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
            /aviso-legal
          </a>
        </span>
        <span style={{ marginLeft: 'auto' }} className="mono">
          id: {p.id}
        </span>
      </div>
    </Card>
  )
}

export default function Promesas() {
  const t = useT()
  const { loading, error, data } = usePromises()
  const { data: sugg } = usePromiseSuggestions()
  const [partyFilter, setPartyFilter] = useState('all')
  const [topicFilter, setTopicFilter] = useState('all')

  const items = useMemo(() => data?.items || [], [data])
  const parties = useMemo(() => Array.from(new Set(items.map((p) => p.party))).sort(), [items])
  const topics = useMemo(() => Array.from(new Set(items.map((p) => p.topic))).sort(), [items])

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (partyFilter !== 'all' && p.party !== partyFilter) return false
      if (topicFilter !== 'all' && p.topic !== topicFilter) return false
      return true
    })
  }, [items, partyFilter, topicFilter])

  const suggestionsById = useMemo(() => {
    const map = {}
    for (const s of sugg?.suggestions || []) map[s.promiseId] = s
    return map
  }, [sugg])

  const frozen = isPromiseFrozen(data)

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: '24px', color: 'var(--ink50)' }}>
        Cargando seguimiento de promesas…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="cp-page" style={{ padding: '24px', color: 'var(--warn)' }}>
        No se pudo cargar el tracker. Regenera con <code>npm run scrape:promise-suggestions</code>.
      </div>
    )
  }

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 16 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('promesas.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('promesas.title')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 780 }}>
          Compromisos públicos atribuidos a partidos y cargos del Ayuntamiento de Riba-roja de
          Túria, cada uno enlazado a su fuente primaria y con cadena de evidencia trazable. Los
          estados se mantienen en <strong>documentada</strong> o <strong>en verificación</strong>{' '}
          salvo que exista prueba directa (pleno, presupuesto, resolución) que justifique otro
          estado.
        </div>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label="Promesas" />
        </div>
      </div>

      <FreezeBanner snap={data} />

      <CompositionBar items={items} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          aria-label="Filtrar por partido"
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border2)',
            borderRadius: 6,
            background: 'white',
            fontSize: 13,
          }}
        >
          <option value="all">Todos los partidos ({items.length})</option>
          {parties.map((p) => (
            <option key={p} value={p}>
              {p} ({items.filter((it) => it.party === p).length})
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por área temática"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border2)',
            borderRadius: 6,
            background: 'white',
            fontSize: 13,
          }}
        >
          <option value="all">Todas las áreas</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABEL[t] || t}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink50)' }} className="mono">
          {filtered.length} resultados
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 14,
        }}
      >
        {filtered.map((p) => (
          <PromiseCard
            key={p.id}
            p={p}
            suggestion={suggestionsById[p.id]}
            llmEvidence={sugg?.llmEvidence || []}
            frozen={frozen}
          />
        ))}
      </div>

      <LegalFooter snap={data} />
    </div>
  )
}
