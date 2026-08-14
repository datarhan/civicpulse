import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, PartyTag } from '../components/Primitives'
import { PlazoVencidoBadge } from '../components/PlazoVencidoBadge'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import {
  usePromises,
  isPromiseFrozen,
  PARTY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
} from '../hooks/usePromises'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_LABEL, OUTCOME_TONE } from '../hooks/usePlenoVotes'
import { useQuejas, STATE_LABEL, STATE_TONE } from '../hooks/useQuejas'
import { canonicalizeDepartment } from '../scraper/departments'
import { ClaimLedger } from '../components/ClaimLedger'
import { VoteTallyBar, DirectionLegend } from '../components/plenos/VoteTallyBar'
import { VoteBreakdownRetracted } from '../components/plenos/VoteBreakdownRetracted'
import { VoteProvenance } from '../components/plenos/VoteProvenance'
import { deptSlugToClaimTopics, promiseDeptSlug } from '../lib/department-claim-topics.js'
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

function VotesSection({ slug, frozen }) {
  const t = useT()
  const votesSnap = usePlenoVotes()
  if (votesSnap.loading) return null
  const votes = (votesSnap.data?.items ?? []).filter(
    (v) => canonicalizeDepartment(v.department) === slug,
  )
  if (votes.length === 0) {
    return (
      <p
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}
      >
        {t('departamentos.detalle.empty.votes')}
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      <DirectionLegend />
      {votes.map((v) => (
        <Card key={v.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, lineHeight: 1.4 }}>
                {v.title}
              </div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}
              >
                {v.plenoDate} · punto {v.itemNumber}
                {v.expediente ? ` · exp. ${v.expediente}` : ''}
              </div>
            </div>
            <Pill tone={OUTCOME_TONE[v.outcome] || 'neutral'} size="xs">
              {OUTCOME_LABEL[v.outcome] || v.outcome}
            </Pill>
          </div>
          {v.votesRetracted ? (
            <VoteBreakdownRetracted retraction={v.votesRetracted} />
          ) : (
            v.votes?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <VoteTallyBar tally={v.votes} />
              </div>
            )
          )}
          {v.dueBy && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {v.outcome === 'aprobado' ? (
                <PlazoVencidoBadge dueBy={v.dueBy} frozen={frozen} note={v.dueBySource} />
              ) : (
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  plazo: {v.dueBy}
                </span>
              )}
              {v.dueBySource && (
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 500,
                    color: 'var(--ink70)',
                    paddingLeft: 8,
                    borderLeft: '2px solid var(--civic)',
                  }}
                >
                  «{v.dueBySource}»
                </span>
              )}
            </div>
          )}
          {/* Was a single «Acta oficial →» pointing at regmeet — a label that
              named a document the link does not lead to, over a row whose
              per-bloc tally came from somewhere else again. */}
          <VoteProvenance provenance={v.provenance} />
        </Card>
      ))}
    </div>
  )
}

function PromisesSection({ slug, frozen }) {
  const t = useT()
  const snap = usePromises()
  if (snap.loading) return null
  const items = (snap.data?.items ?? []).filter((p) => promiseDeptSlug(p) === slug)
  if (items.length === 0) {
    return (
      <p
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}
      >
        {t('departamentos.detalle.empty.promesas')}
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {items.map((p) => {
        const partyColor = PARTY_TONE[p.party] || 'var(--ink50)'
        return (
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
                <PartyTag
                  tone={partyColor}
                  style={{
                    fontSize: 'var(--fs-micro)',
                    marginBottom: 3,
                    display: 'inline-block',
                  }}
                >
                  {p.party}
                </PartyTag>
                <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, lineHeight: 1.4 }}>
                  {p.title}
                </div>
                <blockquote
                  style={{
                    margin: '6px 0 0',
                    padding: '6px 10px',
                    borderLeft: '3px solid var(--civic)',
                    fontSize: 'var(--fs-body)',
                    fontWeight: 500,
                    color: 'var(--ink)',
                    lineHeight: 1.5,
                    maxWidth: '68ch',
                  }}
                >
                  «{p.quote}»
                </blockquote>
              </div>
              <Pill tone={STATUS_TONE[p.status]} size="xs">
                {STATUS_LABEL[p.status]}
              </Pill>
            </div>
            {p.dueBy && (
              <div style={{ marginTop: 8 }}>
                <PlazoVencidoBadge dueBy={p.dueBy} frozen={frozen} />
              </div>
            )}
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 8 }}
            >
              {p.madeAt} · {p.source.publisher}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function UnvotedAgendasSection({ slug, votesSnap }) {
  const agendas = usePlenoAgendas()
  if (agendas.loading || votesSnap.loading) return null
  const voteIndex = new Set(
    (votesSnap.data?.items ?? []).map((v) => `${v.plenoId}|${v.itemNumber}`),
  )
  const items = flattenAgendas(agendas.data)
    .filter((it) => (it.departmentSlug || canonicalizeDepartment(it.department)) === slug)
    .filter((it) => !voteIndex.has(`${it.plenoId}|${it.number}`))
    .sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {items.slice(0, 12).map((it) => (
        <div
          key={`${it.plenoId}-${it.number}`}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-meta)',
            lineHeight: 1.45,
          }}
        >
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 2 }}
          >
            {it.plenoDate} · punto {it.number}
            {it.expediente ? ` · exp. ${it.expediente}` : ''} · debatido, sin voto transcrito
          </div>
          <div style={{ color: 'var(--ink70)' }}>{it.title}</div>
        </div>
      ))}
    </div>
  )
}

function QuejasSection({ slug }) {
  const t = useT()
  const snap = useQuejas()
  if (snap.loading) return null
  const items = (snap.data?.items ?? [])
    .filter((q) => canonicalizeDepartment(q.category) === slug)
    .filter((q) => q.state !== 'resuelta' && q.state !== 'cerrada_no_registrada')
  if (items.length === 0) {
    return (
      <p
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}
      >
        {t('departamentos.detalle.empty.quejas')}
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {items.slice(0, 10).map((q) => (
        <Link
          key={q.id}
          to={`/quejas/${q.id}`}
          style={{
            textDecoration: 'none',
            padding: '8px 12px',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-input)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            color: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500 }}>{q.title || q.id}</div>
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {q.createdAt?.slice(0, 10)}
            </div>
          </div>
          <Pill tone={STATE_TONE[q.state] || 'neutral'} size="xs">
            {STATE_LABEL[q.state] || q.state}
          </Pill>
        </Link>
      ))}
    </div>
  )
}

/**
 * Verdict-mix infographic: a stacked proportion bar + legend over the
 * concejalía's pleno declarations. Surfaces "how much of what this department
 * said is actually grounded in the open data" at a glance, instead of burying
 * it in the text ledger below.
 */
function VerdictMixBar({ d }) {
  const segs = [
    { n: d.verificado || 0, color: 'var(--ok)', label: 'Verificado' },
    { n: d.parcial || 0, color: 'var(--warn)', label: 'Parcial' },
    { n: d.contradicho || 0, color: 'var(--crit)', label: 'Contradicho' },
    { n: d.sinDatos || 0, color: 'var(--ink50)', label: 'Sin contraste' },
  ]
  const total = segs.reduce((a, s) => a + s.n, 0)
  if (total === 0) return null
  const pct = Math.round(((d.conEvidencia || 0) / total) * 100)
  const visible = segs.filter((s) => s.n > 0)
  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--ink50)',
          }}
        >
          Verificación de declaraciones
        </span>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          <strong className="mono" style={{ fontSize: 'var(--fs-head)', color: 'var(--ink)' }}>
            {pct}%
          </strong>{' '}
          con evidencia · {total} en total
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 12,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          background: 'var(--soft)',
        }}
      >
        {visible.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.n}`}
            style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
        {visible.map((s) => (
          <span
            key={s.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 'var(--fs-micro)',
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 'var(--r-input)',
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--ink70)' }}>{s.label}</span>
            <strong className="mono" style={{ color: 'var(--ink)' }}>
              {s.n}
            </strong>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function DepartamentoDetalle() {
  const { slug } = useParams()
  const t = useT()
  const { locale } = useLocale()
  const stats = useDepartmentStats()
  const votesSnap = usePlenoVotes()
  const promisesSnap = usePromises()
  const frozen = isPromiseFrozen(promisesSnap.data)

  if (stats.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
        {t('common.loading')}
      </div>
    )
  }

  const bucket = stats.data?.bySlug?.[slug]
  if (!bucket) {
    return (
      <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>
        <Link
          to="/departamentos"
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--civic)',
            textDecoration: 'none',
            marginBottom: 18,
            display: 'inline-block',
          }}
        >
          {t('departamentos.detalle.back')}
        </Link>
        <p style={{ color: 'var(--crit-ink)' }}>Departamento no encontrado.</p>
      </div>
    )
  }

  const label = locale === 'ca' ? bucket.labelCa : bucket.labelEs
  const official = bucket.responsableOfficial
  const partyColor = official?.party ? PARTY_TONE[official.party] || 'var(--ink50)' : null

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
      <Link
        to="/departamentos"
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          textDecoration: 'none',
          marginBottom: 18,
          display: 'inline-block',
        }}
      >
        {t('departamentos.detalle.back')}
      </Link>

      <SectionHead eyebrow={t('departamentos.eyebrow')} title={label} />

      {official ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            padding: '12px 14px',
            background: 'var(--soft)',
            borderRadius: 'var(--r-input)',
          }}
        >
          {official.photoUrl && (
            <img
              src={official.photoUrl}
              alt=""
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {t('departamentos.card.responsable')}
            </div>
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600 }}>{official.name}</div>
          </div>
          <PartyTag tone={partyColor} style={{ fontSize: 'var(--fs-micro)' }}>
            {official.party}
          </PartyTag>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--soft)',
            borderRadius: 'var(--r-input)',
            marginTop: 8,
            color: 'var(--ink50)',
            fontSize: 'var(--fs-meta)',
          }}
        >
          {t('departamentos.card.sinResponsable')}
        </div>
      )}

      {/* Summary strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        <MiniStat label={t('departamentos.card.aprobados')} value={bucket.plenoVotes.aprobado} />
        <MiniStat label={t('departamentos.card.promesas')} value={bucket.promesas.total} />
        <MiniStat
          label={t('departamentos.card.vencidos')}
          value={frozen ? '—' : bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos}
          tone={
            !frozen && bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos > 0
              ? 'warn'
              : undefined
          }
        />
        <MiniStat label={t('departamentos.card.quejas')} value={bucket.quejas.abiertas} />
      </div>

      <VerdictMixBar d={bucket.declaraciones} />

      <section style={{ marginTop: 28 }}>
        <SectionHead title={t('departamentos.detalle.compromisos')} />
        <VotesSection slug={slug} frozen={frozen} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHead title={t('departamentos.detalle.promesas')} />
        <PromisesSection slug={slug} frozen={frozen} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHead title={t('departamentos.detalle.agendas')} />
        <UnvotedAgendasSection slug={slug} votesSnap={votesSnap} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHead title={t('departamentos.detalle.quejas')} />
        <QuejasSection slug={slug} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHead
          eyebrow="Verificación de declaraciones"
          title="Afirmaciones de esta concejalía en plenos"
        />
        <ClaimLedger
          filter={(it) => {
            const topics = deptSlugToClaimTopics(slug)
            return topics.has(it.claim.topic)
          }}
          limit={10}
          showSummary
          emptyHint="Sin declaraciones verificadas para esta concejalía todavía."
        />
      </section>

      <details
        style={{
          marginTop: 40,
          padding: '10px 14px',
          background: 'var(--soft)',
          borderRadius: 'var(--r-input)',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
        }}
      >
        <summary
          className="mono"
          style={{
            cursor: 'pointer',
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--ink50)',
          }}
        >
          Metodología
        </summary>
        <p style={{ margin: '8px 0 0' }}>
          Los votos transcritos provienen de actas oficiales del pleno y son el hecho primario. Las
          promesas electorales son secundarias y nunca cambian de estado de forma automática. Un
          plazo vencido sin evidencia de ejecución se marca como aviso editorial, no como juicio.{' '}
          <a href="/metodologia" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
            Leer metodología →
          </a>
        </p>
      </details>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
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
        style={{ fontSize: 'var(--fs-head)', fontWeight: 600, color, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  )
}
