import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from './Primitives'
import { useT } from '../i18n'
import {
  usePlenoClaims,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../hooks/usePlenoClaims'
import { gateForDisplay, sortSignalFirst, filterClaims, facetCounts } from '../lib/claim-ledger'

function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' M €'
  if (n >= 1000) return (n / 1000).toFixed(0) + ' K €'
  return n.toFixed(0) + ' €'
}

function EvidenceRow({ e }) {
  const kindLabel =
    {
      tender: 'Contrato',
      bdns: 'Subvención BDNS',
      budget: 'Presupuesto',
      promise: 'Promesa documentada',
      'prior-claim': 'Pleno anterior',
    }[e.kind] || e.kind
  const body = (
    <>
      <span
        className="mono"
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '.1em',
          color: 'var(--ink50)',
          marginRight: 6,
        }}
      >
        {kindLabel.toUpperCase()}
      </span>
      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{e.snippet}</span>
      {typeof e.similarity === 'number' && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 6 }}>
          sim {e.similarity.toFixed(2)}
        </span>
      )}
    </>
  )
  if (e.ref && /^https?:\/\//.test(e.ref)) {
    return (
      <ExtLink
        href={e.ref}
        style={{ display: 'block', padding: '4px 0', textDecoration: 'none', color: 'inherit' }}
      >
        {body}
      </ExtLink>
    )
  }
  return <div style={{ padding: '4px 0' }}>{body}</div>
}

function ClaimCard({ item }) {
  const { claim, verification } = item
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <Pill tone={CLAIM_TYPE_TONE[claim.type] || 'neutral'} size="xs">
              {CLAIM_TYPE_LABEL[claim.type] || claim.type}
            </Pill>
            {claim.speakerGroup && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  color: 'var(--ink60)',
                  textTransform: 'uppercase',
                }}
              >
                {claim.speakerGroup}
              </span>
            )}
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {claim.plenoDate}
            </span>
            {claim.entities.amountEuros && (
              <span
                className="mono"
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}
              >
                {formatEuros(claim.entities.amountEuros)}
              </span>
            )}
            {claim.entities.count && claim.entities.countUnit && (
              <span
                className="mono"
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}
              >
                {claim.entities.count} {claim.entities.countUnit}
              </span>
            )}
          </div>
          <blockquote
            style={{
              margin: '4px 0 0',
              padding: '6px 10px',
              borderLeft: '3px solid var(--border)',
              fontSize: 13,
              color: 'var(--ink80)',
              lineHeight: 1.45,
              fontStyle: 'italic',
            }}
          >
            «{claim.verbatim}»
          </blockquote>
        </div>
        <Pill tone={VERDICT_TONE[verification.verdict] || 'neutral'} size="xs">
          {VERDICT_LABEL[verification.verdict] || verification.verdict}
        </Pill>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 8, lineHeight: 1.5 }}>
        {verification.summary}
      </div>
      {verification.evidence.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed var(--border2)',
          }}
        >
          {verification.evidence.map((e, i) => (
            <EvidenceRow key={i} e={e} />
          ))}
        </div>
      )}
      <div
        className="mono"
        style={{
          marginTop: 8,
          fontSize: 9.5,
          color: 'var(--ink50)',
          letterSpacing: '.06em',
        }}
      >
        Fuentes comprobadas: {verification.checkedAgainst.join(' · ') || 'ninguna'}
      </div>
    </Card>
  )
}

const SIGNAL_VERDICTS = ['contradicho', 'verificado', 'parcial', 'promesa-repetida']

function VerdictChip({ verdict, count, active, onClick }) {
  const tone = VERDICT_TONE[verdict] || 'neutral'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="mono"
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${active ? `var(--${tone}-ink)` : 'var(--border2)'}`,
        background: active ? `var(--${tone}-soft)` : 'transparent',
        color: active ? `var(--${tone}-ink)` : 'var(--ink60)',
        fontWeight: active ? 700 : 500,
      }}
    >
      {VERDICT_LABEL[verdict] || verdict} · {count}
    </button>
  )
}

function LedgerControls({ items, state, set }) {
  const t = useT()
  const counts = useMemo(() => facetCounts(items), [items])
  const plenos = useMemo(() => {
    const seen = new Map()
    for (const it of items) if (it.claim?.plenoId) seen.set(it.claim.plenoId, it.claim.plenoDate)
    return [...seen.entries()].sort((a, b) => String(b[1]).localeCompare(String(a[1])))
  }, [items])
  const grupos = useMemo(
    () => [...new Set(items.map((it) => it.claim?.speakerGroup).filter(Boolean))].sort(),
    [items],
  )
  const selStyle = {
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border2)',
    background: 'var(--paper)',
    color: 'var(--ink)',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SIGNAL_VERDICTS.filter((v) => counts.verdict[v]).map((v) => (
          <VerdictChip
            key={v}
            verdict={v}
            count={counts.verdict[v]}
            active={state.verdict === v}
            onClick={() => set({ verdict: state.verdict === v ? null : v })}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="search"
          aria-label={t('ledger.search')}
          placeholder={t('ledger.search')}
          value={state.query}
          onChange={(e) => set({ query: e.target.value })}
          style={{ ...selStyle, flex: '1 1 200px', minWidth: 160 }}
        />
        <select
          aria-label={t('ledger.allTypes')}
          value={state.type ?? ''}
          onChange={(e) => set({ type: e.target.value || null })}
          style={selStyle}
        >
          <option value="">{t('ledger.allTypes')}</option>
          {Object.keys(counts.type).map((ty) => (
            <option key={ty} value={ty}>
              {CLAIM_TYPE_LABEL[ty] || ty}
            </option>
          ))}
        </select>
        <select
          aria-label={t('ledger.allPlenos')}
          value={state.pleno ?? ''}
          onChange={(e) => set({ pleno: e.target.value || null })}
          style={selStyle}
        >
          <option value="">{t('ledger.allPlenos')}</option>
          {plenos.map(([id, date]) => (
            <option key={id} value={id}>
              {date}
            </option>
          ))}
        </select>
        <select
          aria-label={t('ledger.allGroups')}
          value={state.grupo ?? ''}
          onChange={(e) => set({ grupo: e.target.value || null })}
          style={selStyle}
        >
          <option value="">{t('ledger.allGroups')}</option>
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <label
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--ink60)',
            display: 'inline-flex',
            gap: 6,
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={state.showSinDatos}
            onChange={(e) => set({ showSinDatos: e.target.checked })}
          />
          {t('ledger.showSinDatos')}
        </label>
      </div>
    </div>
  )
}

/**
 * The public claim ledger. Always gated (drops `hidden` — opinativa /
 * sin-datos accusations) via claim-public-gate, then signal-sorted. With
 * `controls` it renders verdict chips + type/pleno/grupo selects + search
 * + a "mostrar sin datos" toggle (the /plenos surface). Without controls
 * (e.g. /departamentos/:slug) it shows the gated+sorted list, sin-datos
 * included, narrowed by the `filter` prop.
 *
 * Honest empty state when no data-grounded declarations exist yet — the
 * pipeline hasn't surfaced contrastable claims, not that the government is
 * clean.
 */
export function ClaimLedger({ filter, limit = 20, emptyHint, controls = false }) {
  const t = useT()
  const { loading, data } = usePlenoClaims()
  const [state, setState] = useState({
    verdict: null,
    type: null,
    pleno: null,
    grupo: null,
    query: '',
    showSinDatos: false,
  })
  const [shown, setShown] = useState(limit)
  const set = (patch) => {
    setState((s) => ({ ...s, ...patch }))
    setShown(limit)
  }

  // Gate (defense-in-depth) → apply external topic filter → signal-sort.
  const base = useMemo(() => {
    const gated = gateForDisplay(data?.items ?? [])
    const scoped = filter ? gated.filter(filter) : gated
    return sortSignalFirst(scoped)
  }, [data, filter])

  const visible = useMemo(() => {
    // controls surface: honor the toggle. Department surface: include sin-datos.
    return controls ? filterClaims(base, state) : filterClaims(base, { showSinDatos: true })
  }, [base, controls, state])

  if (loading) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>
        Cargando verificaciones…
      </div>
    )
  }
  if (base.length === 0) {
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
        {emptyHint ||
          'Todavía no hay declaraciones contrastadas con los datos municipales para mostrar aquí.'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {controls && <LedgerControls items={base} state={state} set={set} />}
      {visible.length === 0 && (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--ink60)' }}>{t('ledger.empty')}</div>
      )}
      {visible.slice(0, shown).map((it) => (
        <ClaimCard key={it.claim.id} item={it} />
      ))}
      {visible.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 25)}
          className="mono"
          style={{
            alignSelf: 'flex-start',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--civic)',
            cursor: 'pointer',
          }}
        >
          {t('ledger.loadMore')} ({visible.length - shown})
        </button>
      )}
    </div>
  )
}

export function ClaimLedgerSection({ filter, limit, title, eyebrow, hint, controls }) {
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow={eyebrow || 'Verificación automática de declaraciones'}
        title={title || 'Declaraciones hechas en el pleno · contraste con los datos'}
      />
      {hint && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink60)',
            marginTop: 4,
            marginBottom: 10,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          {hint}{' '}
          <Link to="/metodologia#verificacion-declaraciones" style={{ color: 'var(--civic)' }}>
            Cómo se filtran estas declaraciones →
          </Link>
        </p>
      )}
      <ClaimLedger filter={filter} limit={limit} controls={controls} />
    </section>
  )
}
