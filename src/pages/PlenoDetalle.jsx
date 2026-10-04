import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import Compartir from '../components/Compartir'
import { AgendaRow } from '../components/plenos/AgendaRow'
import { VoteTallyBar, DirectionLegend } from '../components/plenos/VoteTallyBar'
import { VoteBreakdownRetracted } from '../components/plenos/VoteBreakdownRetracted'
import { VoteProvenance } from '../components/plenos/VoteProvenance'
import { FindingCard } from '../components/PlenoFindings'
import { ClaimLedger } from '../components/ClaimLedger'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoChunk, chunkExtraido } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_LABEL, OUTCOME_TONE } from '../hooks/usePlenoVotes'
import { usePlenoVideos, indexVideosByPleno } from '../hooks/usePlenoVideos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { fmtDateLong, fmtDateShort, rellena } from '../lib/formatters'
import { conHuecos } from '../lib/huecos'
import { useT } from '../i18n'
import { transcriptKind } from '../lib/transcript-kind.js'

const GROUNDED = new Set(['verificado', 'parcial', 'contradicho'])

function EmptyNote({ children }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--soft)',
        borderRadius: 'var(--r-input)',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
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
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-card)', fontWeight: 600, color, marginTop: 2 }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 1 }}>
          {sub}
        </div>
      )}
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
      .then(async (r) => {
        // A missing .txt falls through to the SPA index.html (HTTP 200, text/html)
        // on the dev server — don't render the page DOM as a "transcript".
        const ct = r.headers.get('content-type') || ''
        if (!r.ok || ct.includes('text/html')) throw new Error('missing')
        const text = await r.text()
        if (/^\s*<(!doctype|html)\b/i.test(text)) throw new Error('missing') // body guard
        return text
      })
      .then((text) => alive && setState({ loading: false, text, missing: false }))
      .catch(() => alive && setState({ loading: false, text: null, missing: true }))
    return () => {
      alive = false
    }
  }, [plenoId])
  if (state.loading) return <EmptyNote>{t('plenoDetail.transcriptLoading')}</EmptyNote>
  if (state.missing) return <EmptyNote>{t('plenoDetail.transcriptMissing')}</EmptyNote>
  const kind = transcriptKind(state.text)
  return (
    <>
      {/* 23 of 42 files here are acta text, not audio. Identical extension,
          identical line shape, identical tab — and a "verbatim" taken from an
          acta quotes the secretary's already-condensed minutes, not what a
          councillor said. Say which one the reader is looking at. */}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {kind === 'acta'
          ? 'Texto del acta oficial, no del audio. Las marcas de tiempo son sintéticas: el acta es un resumen ya redactado por secretaría, así que una cita literal de aquí cita el acta, no la intervención.'
          : kind === 'audio'
            ? 'Transcripción automática del audio de la sesión. Puede contener errores de reconocimiento; el acta oficial prevalece.'
            : null}
      </div>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.6,
          color: 'var(--ink70)',
          background: 'var(--soft)',
          padding: 14,
          borderRadius: 'var(--r-card)',
          maxHeight: '64vh',
          overflow: 'auto',
          margin: 0,
        }}
      >
        {state.text}
      </pre>
    </>
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
    { k: 'aplazado', color: 'var(--ink50)' },
  ].filter((s) => counts[s.k] > 0)
  if (segs.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          gap: 2,
        }}
      >
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 'var(--fs-micro)',
            }}
          >
            <span
              style={{ width: 9, height: 9, borderRadius: 'var(--r-input)', background: s.color }}
            />
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

/**
 * Una pieza de la línea del resumen: la clave del catálogo en singular o en plural
 * según `n`, con la cifra en negrita. Las dos claves se escriben enteras en cada uso,
 * que es como `tests/i18n-catalogue.test.ts` encuentra quién rellena sus huecos.
 */
function PiezaResumen({ n, uno, varios, huecos = {}, color = 'var(--ink)' }) {
  const t = useT()
  return conHuecos(t(n === 1 ? uno : varios), {
    '{n}': <strong style={{ color }}>{n}</strong>,
    ...huecos,
  })
}

/** Uppercase mono section label used inside the Resumen tab. */
function OLabel({ children }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Contrastadas frente a sin contraste, en las declaraciones de la sesión. Sin
 * verde: «contrastadas» incluye las contradichas, y en verde se leía como respaldo.
 */
function DeclMixBar({ items }) {
  const g = items.filter((it) => GROUNDED.has(it.verification?.verdict)).length
  const s = items.filter((it) => it.verification?.verdict === 'sin-datos').length
  if (g + s === 0) return null
  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          background: 'var(--soft)',
        }}
      >
        {g > 0 && <div style={{ flex: g, background: 'var(--civic)' }} />}
        {s > 0 && <div style={{ flex: s, background: 'var(--ink50)' }} />}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 'var(--fs-micro)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 'var(--r-input)',
              background: 'var(--civic)',
            }}
          />
          <span style={{ color: 'var(--ink70)' }}>contrastadas</span>
          <strong className="mono" style={{ color: 'var(--ink)' }}>
            {g}
          </strong>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 'var(--r-input)',
              background: 'var(--ink50)',
            }}
          />
          <span style={{ color: 'var(--ink70)' }}>sin contraste</span>
          <strong className="mono" style={{ color: 'var(--ink)' }}>
            {s}
          </strong>
        </span>
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
  const [tab, setTab] = useState('resumen')

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
  // No record in plenos-agendas.json means the orden del día was never
  // ingested — regmeet blocks CI and goes down for stretches, so a session
  // can sit unfetched for weeks. That is NOT the same as a session that met
  // and resolved nothing, and rendering it as "0 puntos" asserted exactly
  // that about a real council meeting.
  const agendaKnown = agenda !== undefined
  const claimItems = useMemo(() => chunk?.items ?? [], [chunk])
  // Una sesión sin declaraciones extraídas no tiene fichero, y el hook resuelve ese
  // 404 a un fragmento vacío: `chunk` existe igual. «Extraída y sin nada» y «sin
  // extraer» sólo se distinguen por de dónde vino.
  const extraida = chunkExtraido(chunk)
  const groundedCount = useMemo(
    () => claimItems.filter((it) => GROUNDED.has(it.verification?.verdict)).length,
    [claimItems],
  )
  const aprobados = votes.filter((v) => v.outcome === 'aprobado').length

  if (plenosLoading) {
    return <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>…</div>
  }
  if (!pleno) {
    return (
      <div
        className="cp-page"
        data-no-resuelta
        style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}
      >
        <SectionHead eyebrow="Plenos" title={t('plenoDetail.notFound')} />
        <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 'var(--fs-aux)' }}>
          {t('plenoDetail.back')}
        </Link>
      </div>
    )
  }

  const TABS = [
    { key: 'resumen', label: t('plenoDetail.summary'), count: null },
    {
      key: 'agenda',
      label: t('plenoDetail.agenda'),
      count: agendaKnown ? agendaItems.length : null,
    },
    // Una cifra en la pestaña afirma que se midió: sin votaciones transcritas, o sin
    // declaraciones extraídas y ningún hallazgo, no hay cero que dar. Es la regla del
    // orden del día de al lado, de las fichas del resumen y del índice de /plenos.
    {
      key: 'votos',
      label: t('plenoDetail.votes'),
      count: votes.length > 0 ? votes.length : null,
    },
    { key: 'declaraciones', label: t('plenoDetail.declarations'), count: groundedCount || null },
    {
      key: 'hallazgos',
      label: t('plenoDetail.findings'),
      count: findings.length > 0 ? findings.length : extraida ? 0 : null,
    },
    // Sin `data-pestana` (ver el botón): la revisión lectora pulsa las demás
    // para leerlas, y ésta no. Es el acta hablada, no prosa nuestra, y pesa lo
    // que la sesión entera.
    { key: 'transcripcion', label: t('plenoDetail.transcript'), count: null, lectora: false },
  ]

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <Link
        to="/plenos"
        style={{ color: 'var(--civic)', fontSize: 'var(--fs-meta)', textDecoration: 'none' }}
      >
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
        <div style={{ fontSize: 'var(--fs-page)', fontWeight: 700, letterSpacing: '-.015em' }}>
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
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}
          >
            {t('plenoDetail.video')} ↗
          </ExtLink>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Compartir titulo={`Pleno · ${pleno.title}`} />
      </div>

      {/* Tira de resumen. La rejilla vive en `.cp-pleno-fichas` (src/index.css)
          porque pasa de cuatro columnas a dos y a una según el ancho de la tira,
          y un `style` inline no admite esa consulta. */}
      <div className="cp-pleno-resumen">
        <div className="cp-pleno-fichas">
          <Tile
            label={t('plenoDetail.agenda')}
            value={agendaKnown ? agendaItems.length : '—'}
            sub={agendaKnown ? undefined : t('plenoDetail.agendaPending')}
          />
          {/* «—» y no 0 para lo que nadie ha medido. Las votaciones se transcriben a
              mano desde el acta y una sesión puede no tener ninguna transcrita: «0»
              afirmaba que un pleno ordinario no votó nada, y seguro que votó. Las
              declaraciones y los hallazgos, igual: de una sesión sin extraer no hay
              cero que dar. La ficha del orden del día ya lo distinguía.
              Con alguna transcrita, la nota dice «transcritas» y no las aprobadas:
              «1» con «1 aprob.» es el mismo número que la revisión lectora del
              04-10-2026 leyó en la línea del resumen como las votaciones de la sesión,
              y se lee igual. Las aprobadas van en esa línea. */}
          <Tile
            label={t('plenoDetail.votes')}
            value={votes.length > 0 ? votes.length : '—'}
            sub={t(
              votes.length === 0
                ? 'plenoDetail.votesPending'
                : votes.length === 1
                  ? 'plenoDetail.votesTranscribed.uno'
                  : 'plenoDetail.votesTranscribed.varios',
            )}
          />
          <Tile
            label={t('plenoDetail.declarations')}
            value={extraida ? groundedCount : '—'}
            sub={extraida ? undefined : t('plenoDetail.extractionPending')}
          />
          <Tile
            label={t('plenoDetail.findings')}
            value={findings.length > 0 || extraida ? findings.length : '—'}
            sub={findings.length > 0 || extraida ? undefined : t('plenoDetail.extractionPending')}
            tone={findings.length ? 'crit' : undefined}
          />
        </div>
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
              // Las pestañas se montan al pulsarlas, así que una carga sólo ve
              // el resumen. `review:surfaces` las abre por este atributo, que no
              // cambia con el idioma (estado `pestanas`, reader-review.ts).
              data-pestana={tb.lectora === false ? undefined : tb.key}
              className="mono"
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--civic)' : 'transparent'}`,
                color: active ? 'var(--ink)' : 'var(--ink50)',
                fontSize: 'var(--fs-meta)',
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
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 'var(--r-pill)',
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
      {tab === 'resumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Cada cifra dice qué cuenta, con las palabras del índice de /plenos. «15
              puntos en el orden del día · 1 votaciones» se leía como que la sesión votó
              una sola cosa (revisión lectora del 04-10-2026, en 10yl550): son las que
              hemos transcrito, y ningún dato registra que estén todas, así que el aviso
              del índice va siempre detrás. Sin declaraciones extraídas no hay cero que
              dar: «sin extraer», como su ficha. */}
          <p
            style={{
              margin: 0,
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.55,
            }}
          >
            {agendaKnown ? (
              <PiezaResumen
                n={agendaItems.length}
                uno="plenoDetail.line.agenda.uno"
                varios="plenoDetail.line.agenda.varios"
              />
            ) : (
              <span>{t('plenoDetail.agendaPendingLong')}</span>
            )}
            {votes.length > 0 && (
              <>
                {' · '}
                <PiezaResumen
                  n={votes.length}
                  uno="plenoDetail.line.votes.uno"
                  varios="plenoDetail.line.votes.varios"
                  huecos={{
                    '{aprobadas}': rellena(
                      t(
                        aprobados === 1
                          ? 'plenoDetail.line.approved.uno'
                          : 'plenoDetail.line.approved.varios',
                      ),
                      { n: aprobados },
                    ),
                  }}
                />
              </>
            )}
            {' · '}
            {extraida ? (
              <PiezaResumen
                n={groundedCount}
                uno="plenoDetail.line.declarations.uno"
                varios="plenoDetail.line.declarations.varios"
              />
            ) : (
              t('plenoDetail.line.declarationsPending')
            )}
            {findings.length > 0 && (
              <>
                {' · '}
                <PiezaResumen
                  n={findings.length}
                  uno="plenoDetail.line.findings.uno"
                  varios="plenoDetail.line.findings.varios"
                  color="var(--crit-ink)"
                />
              </>
            )}
            {'. '}
            {t('plenos.indice.lede.aviso')}
          </p>

          {votes.length > 0 && (
            <div>
              <OLabel>{t('plenoDetail.votes')}</OLabel>
              <VoteOutcomeBar votes={votes} />
            </div>
          )}

          {claimItems.length > 0 && (
            <div>
              <OLabel>{t('plenoDetail.declarations')}</OLabel>
              <DeclMixBar items={claimItems} />
            </div>
          )}

          {findings.length > 0 && (
            <div>
              <OLabel>{t('plenoDetail.findings')}</OLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {findings.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTab('hallazgos')}
                    style={{
                      textAlign: 'left',
                      appearance: 'none',
                      background: 'var(--soft)',
                      border: '1px solid var(--border2)',
                      borderRadius: 'var(--r-input)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'baseline',
                    }}
                  >
                    <Pill
                      tone={
                        f.severity === 'critical'
                          ? 'crit'
                          : f.severity === 'notable'
                            ? 'warn'
                            : 'neutral'
                      }
                      size="xs"
                    >
                      {f.severity}
                    </Pill>
                    <span
                      style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink)', fontWeight: 600 }}
                    >
                      {f.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {votes.length === 0 && claimItems.length === 0 && findings.length === 0 && (
            <EmptyNote>
              {agendaKnown
                ? t('plenoDetail.empty.summary')
                : t('plenoDetail.empty.summaryNoAgenda')}
            </EmptyNote>
          )}
        </div>
      )}

      {tab === 'agenda' &&
        (agendaItems.length > 0 ? (
          <Card>
            {agendaItems.map((it, i) => (
              <AgendaRow key={i} item={it} />
            ))}
          </Card>
        ) : (
          <EmptyNote>
            {agendaKnown ? t('plenoDetail.empty.agenda') : t('plenoDetail.empty.agendaPending')}
          </EmptyNote>
        ))}

      {tab === 'votos' &&
        (votes.length > 0 ? (
          <>
            <DirectionLegend />
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
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                    >
                      {fmtDateShort(rec.plenoDate)}
                    </span>
                    <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">
                      {OUTCOME_LABEL[rec.outcome]}
                    </Pill>
                  </div>
                  <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginBottom: 8 }}>
                    {rec.itemNumber}. {rec.title}
                  </div>
                  {rec.votesRetracted ? (
                    <VoteBreakdownRetracted retraction={rec.votesRetracted} />
                  ) : (
                    <VoteTallyBar tally={rec.votes} />
                  )}
                  {/* This tab showed a tally with no citation at all — the
                      reader could not tell the outcome and the breakdown come
                      from two different sources, let alone which. */}
                  <VoteProvenance provenance={rec.provenance} />
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
