import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
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
      <p style={{ fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}>
        {t('departamentos.detalle.empty.votes')}
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
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
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{v.title}</div>
              <div
                className="mono"
                style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 4 }}
              >
                {v.plenoDate} · punto {v.itemNumber}
                {v.expediente ? ` · exp. ${v.expediente}` : ''}
              </div>
            </div>
            <Pill tone={OUTCOME_TONE[v.outcome] || 'neutral'} size="xs">
              {OUTCOME_LABEL[v.outcome] || v.outcome}
            </Pill>
          </div>
          {v.dueBy && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {v.outcome === 'aprobado' ? (
                <PlazoVencidoBadge dueBy={v.dueBy} frozen={frozen} note={v.dueBySource} />
              ) : (
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink60)' }}>
                  plazo: {v.dueBy}
                </span>
              )}
              {v.dueBySource && (
                <span style={{ fontSize: 11, color: 'var(--ink60)', fontStyle: 'italic' }}>
                  «{v.dueBySource}»
                </span>
              )}
            </div>
          )}
          <a
            href={v.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              marginTop: 10,
              fontSize: 11.5,
              color: 'var(--civic)',
              textDecoration: 'none',
            }}
          >
            Acta oficial →
          </a>
        </Card>
      ))}
    </div>
  )
}

function PromisesSection({ slug, frozen }) {
  const t = useT()
  const snap = usePromises()
  if (snap.loading) return null
  const items = (snap.data?.items ?? []).filter((p) => p.departmentSlug === slug)
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}>
        {t('departamentos.detalle.empty.promesas')}
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {items.map((p) => {
        const partyColor = PARTY_TONE[p.party] || 'var(--ink60)'
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
                <div
                  className="mono"
                  style={{ fontSize: 10, fontWeight: 700, color: partyColor, marginBottom: 3 }}
                >
                  {p.party}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
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
              style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 8 }}
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
  const t = useT()
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
            borderRadius: 8,
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 2 }}>
            {it.plenoDate} · punto {it.number}
            {it.expediente ? ` · exp. ${it.expediente}` : ''} · debatido, sin voto transcrito
          </div>
          <div style={{ color: 'var(--ink80)' }}>{it.title}</div>
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
      <p style={{ fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.5, marginTop: 8 }}>
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
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            color: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{q.title || q.id}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
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
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>
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
            fontSize: 12,
            color: 'var(--civic)',
            textDecoration: 'none',
            marginBottom: 18,
            display: 'inline-block',
          }}
        >
          {t('departamentos.detalle.back')}
        </Link>
        <p style={{ color: 'var(--crit)' }}>Departamento no encontrado.</p>
      </div>
    )
  }

  const label = locale === 'ca' ? bucket.labelCa : bucket.labelEs
  const official = bucket.responsableOfficial
  const partyColor = official?.party ? PARTY_TONE[official.party] || 'var(--ink60)' : null

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
      <Link
        to="/departamentos"
        style={{
          fontSize: 12,
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
            borderRadius: 8,
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
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {t('departamentos.card.responsable')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{official.name}</div>
          </div>
          <span
            className="mono"
            style={{ fontSize: 11, fontWeight: 700, color: partyColor }}
          >
            {official.party}
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--soft)',
            borderRadius: 8,
            marginTop: 8,
            color: 'var(--ink60)',
            fontSize: 12.5,
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
          tone={!frozen && (bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos) > 0 ? 'warn' : undefined}
        />
        <MiniStat label={t('departamentos.card.quejas')} value={bucket.quejas.abiertas} />
      </div>

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

      <div
        style={{
          marginTop: 40,
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 11.5,
          color: 'var(--ink60)',
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>Metodología.</strong> Los votos transcritos
        provienen de actas oficiales del pleno y son el hecho primario. Las promesas electorales
        son secundarias y nunca cambian de estado de forma automática. Un plazo vencido sin
        evidencia de ejecución se marca como aviso editorial, no como juicio.{' '}
        <a href="/metodologia" style={{ color: 'var(--civic)' }}>
          Leer metodología →
        </a>
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn'
      ? 'var(--warn-ink)'
      : tone === 'crit'
        ? 'var(--crit-ink)'
        : 'var(--ink)'
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
        style={{ fontSize: 9.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
