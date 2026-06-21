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

function SectionWrap({ title, children }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

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

function TranscriptExpander({ plenoId }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, text: null, missing: false })
  useEffect(() => {
    if (!open || state.text !== null || state.missing) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fetch(`/data/pleno-transcripts/${plenoId}.txt`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => alive && setState({ loading: false, text, missing: false }))
      .catch(() => alive && setState({ loading: false, text: null, missing: true }))
    return () => {
      alive = false
    }
  }, [open, plenoId, state.text, state.missing])

  return (
    <SectionWrap title={t('plenoDetail.transcript')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono"
        style={{
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid var(--border2)',
          background: 'transparent',
          color: 'var(--civic)',
          cursor: 'pointer',
        }}
      >
        {open ? '▾ ' : '▸ '}
        {t('plenoDetail.transcript')}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {state.loading && <EmptyNote>{t('plenoDetail.transcriptLoading')}</EmptyNote>}
          {state.missing && <EmptyNote>{t('plenoDetail.transcriptMissing')}</EmptyNote>}
          {state.text && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink70)',
                background: 'var(--soft)',
                padding: 12,
                borderRadius: 8,
                maxHeight: 420,
                overflow: 'auto',
              }}
            >
              {state.text}
            </pre>
          )}
        </div>
      )}
    </SectionWrap>
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

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 12, textDecoration: 'none' }}>
        {t('plenoDetail.back')}
      </Link>
      <div
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}
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

      <SectionWrap title={t('plenoDetail.agenda')}>
        {agenda && agenda.agenda?.length > 0 ? (
          <Card>
            {agenda.agenda.map((it, i) => (
              <AgendaRow key={i} item={it} />
            ))}
          </Card>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.agenda')}</EmptyNote>
        )}
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.votes')}>
        {votes.length > 0 ? (
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
        ) : (
          <EmptyNote>{t('plenoDetail.empty.votes')}</EmptyNote>
        )}
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.declarations')}>
        <ClaimLedger
          items={chunk?.items ?? []}
          emptyHint="Sin declaraciones contrastables para esta sesión."
        />
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.findings')}>
        {findings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.findings')}</EmptyNote>
        )}
      </SectionWrap>

      <TranscriptExpander plenoId={id} />
    </div>
  )
}
