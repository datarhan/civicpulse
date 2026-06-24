import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { AgendaRow } from '../components/plenos/AgendaRow'
import { VoteTuple } from '../components/plenos/VoteTuple'
import { FindingCard } from '../components/PlenoFindings'
import { ClaimLedger } from '../components/ClaimLedger'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoChunk } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_LABEL, OUTCOME_TONE } from '../hooks/usePlenoVotes'
import { usePlenoVideos, indexVideosByPleno } from '../hooks/usePlenoVideos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { fmtDateLong, fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

const GROUNDED = new Set(['verificado', 'parcial', 'contradicho'])

function EmptyNote({ children }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--soft)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--ink60)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

/** At-a-glance tile in the summary strip. */
function Tile({ label, value, sub, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 10 }}>
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
      <div className="mono" style={{ fontSize: 20, fontWeight: 600, color, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

/** Lazy transcript panel — fetches only when its tab is mounted. */
function TranscriptPanel({ plenoId }) {
  const t = useT()
  const [state, setState] = useState({ loading: true, text: null, missing: false })
  useEffect(() => {
    let alive = true
    fetch(`/data/pleno-transcripts/${plenoId}.txt`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => alive && setState({ loading: false, text, missing: false }))
      .catch(() => alive && setState({ loading: false, text: null, missing: true }))
    return () => {
      alive = false
    }
  }, [plenoId])
  if (state.loading) return <EmptyNote>{t('plenoDetail.transcriptLoading')}</EmptyNote>
  if (state.missing) return <EmptyNote>{t('plenoDetail.transcriptMissing')}</EmptyNote>
  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--ink70)',
        background: 'var(--soft)',
        padding: 14,
        borderRadius: 10,
        maxHeight: '64vh',
        overflow: 'auto',
        margin: 0,
      }}
    >
      {state.text}
    </pre>
  )
}

/** Coloured proportion bar for the vote outcomes in this session. */
function VoteOutcomeBar({ votes }) {
  const counts = votes.reduce((acc, v) => {
    acc[v.outcome] = (acc[v.outcome] || 0) + 1
    return acc
  }, {})
  const segs = [
    { k: 'aprobado', color: 'var(--ok)' },
    { k: 'rechazado', color: 'var(--crit)' },
    { k: 'retirado', color: 'var(--warn)' },
    { k: 'aplazado', color: 'var(--ink40)' },
  ].filter((s) => counts[s.k] > 0)
  if (segs.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {segs.map((s) => (
          <div
            key={s.k}
            title={`${OUTCOME_LABEL[s.k]}: ${counts[s.k]}`}
            style={{ flex: counts[s.k], background: s.color, minWidth: 6 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
        {segs.map((s) => (
          <span
            key={s.k}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color }} />
            <span style={{ color: 'var(--ink70)' }}>{OUTCOME_LABEL[s.k]}</span>
            <strong className="mono" style={{ color: 'var(--ink)' }}>
              {counts[s.k]}
            </strong>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PlenoDetalle() {
  const t = useT()
  const { id } = useParams()
  const { data: plenosData, loading: plenosLoading } = usePlenos()
  const { data: chunk } = usePlenoChunk(id)
  const { data: agendasData } = usePlenoAgendas()
  const { data: votesData } = usePlenoVotes()
  const { data: findingsData } = usePlenoFindings()
  const { data: videosData } = usePlenoVideos()
  const [tab, setTab] = useState('agenda')

  const pleno = useMemo(() => (plenosData?.items ?? []).find((p) => p.id === id), [plenosData, id])
  const agenda = useMemo(
    () => (agendasData?.plenos ?? []).find((a) => a.id === id),
    [agendasData, id],
  )
  const votes = useMemo(
    () => (votesData?.items ?? []).filter((v) => v.plenoId === id),
    [votesData, id],
  )
  const findings = useMemo(
    () => (findingsData?.items ?? []).filter((f) => f.plenoId === id),
    [findingsData, id],
  )
  const video = useMemo(
    () => indexVideosByPleno(videosData, plenosData).get(id),
    [videosData, plenosData, id],
  )

  const agendaItems = agenda?.agenda ?? []
  const claimItems = useMemo(() => chunk?.items ?? [], [chunk])
  const groundedCount = useMemo(
    () => claimItems.filter((it) => GROUNDED.has(it.verification?.verdict)).length,
    [claimItems],
  )
  const aprobados = votes.filter((v) => v.outcome === 'aprobado').length

  if (plenosLoading) {
    return <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>…</div>
  }
  if (!pleno) {
    return (
      <div className="cp-page" style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <SectionHead eyebrow="Plenos" title={t('plenoDetail.notFound')} />
        <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 13 }}>
          {t('plenoDetail.back')}
        </Link>
      </div>
    )
  }

  const TABS = [
    { key: 'agenda', label: t('plenoDetail.agenda'), count: agendaItems.length },
    { key: 'votos', label: t('plenoDetail.votes'), count: votes.length },
    { key: 'declaraciones', label: t('plenoDetail.declarations'), count: groundedCount || null },
    { key: 'hallazgos', label: t('plenoDetail.findings'), count: findings.length },
    { key: 'transcripcion', label: t('plenoDetail.transcript'), count: null },
  ]

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 12, textDecoration: 'none' }}>
        {t('plenoDetail.back')}
      </Link>

      {/* Hero band */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginTop: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.015em' }}>
          {fmtDateLong(pleno.date)}
        </div>
        <Pill tone={PLENO_TONE[pleno.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[pleno.kind] || pleno.kind}
        </Pill>
        {video && (
          <ExtLink
            href={video.url}
            title={video.title}
            className="mono"
            style={{ fontSize: 12, color: 'var(--civic)' }}
          >
            {t('plenoDetail.video')} ↗
          </ExtLink>
        )}
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        <Tile label={t('plenoDetail.agenda')} value={agendaItems.length} />
        <Tile
          label={t('plenoDetail.votes')}
          value={votes.length}
          sub={votes.length ? `${aprobados} aprob.` : undefined}
        />
        <Tile label={t('plenoDetail.declarations')} value={groundedCount} sub="con evidencia" />
        <Tile
          label={t('plenoDetail.findings')}
          value={findings.length}
          tone={findings.length ? 'crit' : undefined}
        />
      </div>

      {/* Sticky tab bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          gap: 4,
          marginTop: 20,
          marginBottom: 18,
          borderBottom: '1px solid var(--border2)',
          overflowX: 'auto',
          background: 'var(--paper)',
        }}
      >
        {TABS.map((tb) => {
          const active = tab === tb.key
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className="mono"
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--civic)' : 'transparent'}`,
                color: active ? 'var(--ink)' : 'var(--ink60)',
                fontSize: 12.5,
                fontWeight: active ? 700 : 500,
                padding: '10px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tb.label}
              {tb.count != null && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: active ? 'var(--civic-soft)' : 'var(--soft)',
                    color: active ? 'var(--civic-ink)' : 'var(--ink50)',
                  }}
                >
                  {tb.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'agenda' &&
        (agendaItems.length > 0 ? (
          <Card>
            {agendaItems.map((it, i) => (
              <AgendaRow key={i} item={it} />
            ))}
          </Card>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.agenda')}</EmptyNote>
        ))}

      {tab === 'votos' &&
        (votes.length > 0 ? (
          <>
            <VoteOutcomeBar votes={votes} />
            <Card>
              {votes.map((rec) => (
                <div
                  key={rec.id}
                  style={{ padding: '10px 0', borderTop: '1px dashed var(--border2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                      {fmtDateShort(rec.plenoDate)}
                    </span>
                    <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">
                      {OUTCOME_LABEL[rec.outcome]}
                    </Pill>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    {rec.itemNumber}. {rec.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rec.votes.map((v) => (
                      <VoteTuple key={v.bloc} v={v} />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          </>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.votes')}</EmptyNote>
        ))}

      {tab === 'declaraciones' && (
        <ClaimLedger
          items={claimItems}
          showSummary
          emptyHint="Sin declaraciones contrastables para esta sesión."
        />
      )}

      {tab === 'hallazgos' &&
        (findings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.findings')}</EmptyNote>
        ))}

      {tab === 'transcripcion' && <TranscriptPanel plenoId={id} />}
    </div>
  )
}
