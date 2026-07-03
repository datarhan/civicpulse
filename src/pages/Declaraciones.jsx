import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import {
  usePlenoClaims,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../hooks/usePlenoClaims'
import { usePlenos } from '../hooks/usePlenos'
import { PARTY_TONE } from '../hooks/usePromises'
import { useT } from '../i18n'

const PAGE_SIZE = 50

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn'
      ? 'var(--warn-ink)'
      : tone === 'crit'
        ? 'var(--crit-ink)'
        : tone === 'ok'
          ? 'var(--ok-ink)'
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
        {value.toLocaleString('es-ES')}
      </div>
    </div>
  )
}

function FilterChip({ active, label, count, onClick, tone }) {
  const inactiveColor = 'var(--ink60)'
  const activeBg =
    tone === 'ok'
      ? 'var(--ok-soft)'
      : tone === 'warn'
        ? 'var(--warn-soft)'
        : tone === 'crit'
          ? 'var(--crit-soft)'
          : 'var(--soft)'
  const activeFg =
    tone === 'ok'
      ? 'var(--ok-ink)'
      : tone === 'warn'
        ? 'var(--warn-ink)'
        : tone === 'crit'
          ? 'var(--crit-ink)'
          : 'var(--ink)'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        border: '1px solid ' + (active ? 'transparent' : 'var(--border2)'),
        background: active ? activeBg : 'transparent',
        color: active ? activeFg : inactiveColor,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count != null && (
        <span className="mono" style={{ marginLeft: 6, fontSize: 10.5 }}>
          {count.toLocaleString('es-ES')}
        </span>
      )}
    </button>
  )
}

function ClaimRow({ item, plenoTitle }) {
  const c = item.claim
  const v = item.verification
  const speakerColor = c.speakerGroup
    ? PARTY_TONE[c.speakerGroup] || 'var(--ink60)'
    : 'var(--ink50)'
  const ent = []
  if (c.entities?.amountEuros) ent.push('€' + c.entities.amountEuros.toLocaleString('es-ES'))
  if (c.entities?.count)
    ent.push(c.entities.count + (c.entities.countUnit ? ' ' + c.entities.countUnit : ''))
  if (c.entities?.date) ent.push(c.entities.date)
  return (
    <Card>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        <Pill tone={VERDICT_TONE[v.verdict] ?? 'neutral'} size="xs">
          {VERDICT_LABEL[v.verdict] ?? v.verdict}
        </Pill>
        <Pill tone={CLAIM_TYPE_TONE[c.type] ?? 'neutral'} size="xs">
          {CLAIM_TYPE_LABEL[c.type] ?? c.type}
        </Pill>
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: speakerColor,
            fontWeight: 700,
            letterSpacing: '.04em',
          }}
        >
          {c.speakerGroup ?? 'sin atribuir'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink50)' }}>· {c.topic}</span>
        <span style={{ flex: 1 }} />
        <Link
          to={`/plenos`}
          style={{ fontSize: 11, color: 'var(--ink50)', textDecoration: 'none' }}
          title={plenoTitle ?? c.plenoId}
        >
          {c.plenoDate}
        </Link>
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 6 }}>«{c.verbatim}»</div>
      {ent.length > 0 && (
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink60)', marginBottom: 6 }}>
          {ent.join(' · ')}
        </div>
      )}
      {v.evidence?.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px dashed var(--border2)',
            fontSize: 11.5,
            color: 'var(--ink60)',
            lineHeight: 1.5,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--ink50)',
              marginBottom: 3,
            }}
          >
            {v.evidence.length} {v.evidence.length === 1 ? 'evidencia' : 'evidencias'} ·{' '}
            {v.checkedAgainst?.includes('llm-second-pass')
              ? 'verificador LLM'
              : 'verificador determinista'}
          </div>
          {v.evidence.slice(0, 2).map((e, i) => (
            <div key={i} style={{ marginTop: 2 }}>
              <span
                className="mono"
                style={{ fontSize: 10, color: 'var(--ink50)', marginRight: 6 }}
              >
                [{e.kind}]
              </span>
              {e.snippet}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

const ALL_VERDICTS = ['verificado', 'parcial', 'contradicho', 'promesa-repetida', 'sin-datos']
const ALL_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Otro', null]

export default function Declaraciones() {
  const t = useT()
  const claims = usePlenoClaims()
  const plenos = usePlenos()
  const [verdictFilter, setVerdictFilter] = useState('with-evidence') // 'all' | 'with-evidence' | one-of-ALL_VERDICTS
  const [blocFilter, setBlocFilter] = useState('all') // 'all' | one-of-ALL_BLOCS | 'attributed' | 'null'
  const [topicFilter, setTopicFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)

  const items = useMemo(() => claims.data?.items ?? [], [claims.data])

  // Aggregate counts for the chip badges, computed once per snapshot.
  const stats = useMemo(() => {
    const byVerdict = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    const byBloc = { PSOE: 0, PP: 0, VOX: 0, Compromís: 0, Otro: 0, null: 0 }
    const topics = new Set()
    for (const it of items) {
      byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1
      const b = it.claim.speakerGroup ?? 'null'
      byBloc[b] = (byBloc[b] ?? 0) + 1
      topics.add(it.claim.topic)
    }
    return {
      total: items.length,
      byVerdict,
      withEvidence: byVerdict.verificado + byVerdict.parcial + byVerdict.contradicho,
      byBloc,
      topics: [...topics].sort(),
    }
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (verdictFilter === 'with-evidence') {
        if (!['verificado', 'parcial', 'contradicho'].includes(it.verification.verdict))
          return false
      } else if (verdictFilter !== 'all' && it.verification.verdict !== verdictFilter) {
        return false
      }
      if (blocFilter === 'attributed') {
        if (!it.claim.speakerGroup) return false
      } else if (blocFilter === 'null') {
        if (it.claim.speakerGroup) return false
      } else if (blocFilter !== 'all' && it.claim.speakerGroup !== blocFilter) {
        return false
      }
      if (topicFilter !== 'all' && it.claim.topic !== topicFilter) return false
      if (q && !it.claim.verbatim.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, verdictFilter, blocFilter, topicFilter, search])

  // Reset pagination when filters change.
  const filtersKey = verdictFilter + '|' + blocFilter + '|' + topicFilter + '|' + search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setShown(PAGE_SIZE), [filtersKey])

  // Index plenoId → title for the inline date link tooltip.
  const plenoIndex = useMemo(() => {
    const m = new Map()
    for (const p of plenos.data?.items ?? []) m.set(p.id, p.title)
    return m
  }, [plenos.data])

  if (claims.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>{t('common.loading')}</div>
    )
  }
  if (claims.error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit)', fontSize: 13 }}>{claims.error.message}</div>
    )
  }

  const visible = filtered.slice(0, shown)

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <SectionHead eyebrow={t('declaraciones.eyebrow')} title={t('declaraciones.title')} />
      <p
        style={{
          fontSize: 13,
          color: 'var(--ink60)',
          lineHeight: 1.55,
          maxWidth: 780,
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        {t('declaraciones.subtitle')}
      </p>
      <div style={{ marginBottom: 18 }}>
        <DataAsOf iso={claims.data?.generatedAt} label="Declaraciones" />
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <MiniStat label={t('declaraciones.stat.total')} value={stats.total} />
        <MiniStat
          label={t('declaraciones.stat.conEvidencia')}
          value={stats.withEvidence}
          tone="ok"
        />
        <MiniStat label="verificado" value={stats.byVerdict.verificado} tone="ok" />
        <MiniStat label="parcial" value={stats.byVerdict.parcial} tone="warn" />
        <MiniStat label="contradicho" value={stats.byVerdict.contradicho} tone="crit" />
        <MiniStat label="sin-datos" value={stats.byVerdict['sin-datos']} />
      </div>

      {/* Filter strips */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginBottom: 14,
          padding: 10,
          border: '1px solid var(--border2)',
          borderRadius: 8,
          background: 'var(--soft)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.verdict')}:
          </span>
          <FilterChip
            active={verdictFilter === 'with-evidence'}
            label={t('declaraciones.filter.conEvidencia')}
            count={stats.withEvidence}
            onClick={() => setVerdictFilter('with-evidence')}
            tone="ok"
          />
          <FilterChip
            active={verdictFilter === 'all'}
            label={t('declaraciones.filter.todas')}
            count={stats.total}
            onClick={() => setVerdictFilter('all')}
          />
          {ALL_VERDICTS.map((v) => (
            <FilterChip
              key={v}
              active={verdictFilter === v}
              label={VERDICT_LABEL[v] ?? v}
              count={stats.byVerdict[v] ?? 0}
              onClick={() => setVerdictFilter(v)}
              tone={VERDICT_TONE[v]}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.bloc')}:
          </span>
          <FilterChip
            active={blocFilter === 'all'}
            label={t('declaraciones.filter.todos')}
            count={stats.total}
            onClick={() => setBlocFilter('all')}
          />
          <FilterChip
            active={blocFilter === 'attributed'}
            label={t('declaraciones.filter.atribuidas')}
            count={stats.total - (stats.byBloc.null ?? 0)}
            onClick={() => setBlocFilter('attributed')}
          />
          {ALL_BLOCS.filter((b) => b !== null).map((b) => (
            <FilterChip
              key={b}
              active={blocFilter === b}
              label={b}
              count={stats.byBloc[b] ?? 0}
              onClick={() => setBlocFilter(b)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.topic')}:
          </span>
          <FilterChip
            active={topicFilter === 'all'}
            label={t('declaraciones.filter.todos')}
            onClick={() => setTopicFilter('all')}
          />
          {stats.topics.map((tp) => (
            <FilterChip
              key={tp}
              active={topicFilter === tp}
              label={tp}
              onClick={() => setTopicFilter(tp)}
            />
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('declaraciones.search.placeholder')}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 12.5,
            }}
          />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink50)', marginBottom: 8 }}>
        {filtered.length.toLocaleString('es-ES')} {t('declaraciones.matchCount')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((it) => (
          <ClaimRow key={it.claim.id} item={it} plenoTitle={plenoIndex.get(it.claim.plenoId)} />
        ))}
      </div>

      {filtered.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border2)',
              background: 'var(--soft)',
              color: 'var(--ink)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {t('declaraciones.loadMore')} (
            {Math.min(PAGE_SIZE, filtered.length - shown).toLocaleString('es-ES')})
          </button>
        </div>
      )}
      {filtered.length === 0 && (
        <Card>
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink50)', fontSize: 13 }}>
            {t('declaraciones.empty')}
          </div>
        </Card>
      )}
    </div>
  )
}
