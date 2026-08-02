import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import EmpleoStats from '../components/empleo/EmpleoStats'
import EmpleoFilters from '../components/empleo/EmpleoFilters'
import { useEmpleo, deadlineInfo, effectiveStatus } from '../hooks/useEmpleo'
import {
  EMPTY_FILTERS,
  PER_PAGE,
  matchesFilters,
  computeEmpleoStats,
  distinctMunicipios,
  distinctContracts,
  paginate,
  shortContract,
  normalizeJornada,
} from '../lib/empleo'
import { fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

/** Deadline chip: "cierra en N días" / "cerrada" / the date, tone by urgency. */
function DeadlinePill({ deadline, t }) {
  const info = deadlineInfo(deadline)
  if (!info) return null
  const label = info.closed
    ? t('empleo.closed')
    : info.days === 0
      ? t('empleo.closesToday')
      : `${t('empleo.closesIn')} ${info.days} ${t('empleo.days')}`
  return (
    <Pill tone={info.tone} size="xs">
      {label}
    </Pill>
  )
}

function OfferRow({ o, t }) {
  const [expanded, setExpanded] = useState(false)
  const d = o.detail
  const contrato = d && d.tipoContrato ? shortContract(d.tipoContrato) : null
  const jornada = d ? normalizeJornada(d.jornada) : null
  const showJornada = jornada === 'Completa' || jornada === 'Parcial'
  const puestos = d ? parseInt(d.numPuestos, 10) : NaN
  const salario =
    d && d.salario && !/seg[uú]n convenio|a convenir|no especificad/i.test(d.salario)
      ? d.salario
      : null
  const occ = d && Array.isArray(d.ocupaciones) && d.ocupaciones.length ? d.ocupaciones[0] : null
  const extraOcc = occ ? d.ocupaciones.length - 1 : 0
  const funciones = d && d.funciones ? d.funciones : null
  const funcLong = !!funciones && funciones.length > 110
  const hasChips = o.inRibaRoja || contrato || showJornada || puestos > 1 || salario

  // The card body is one big Link; the "ver más" toggle is a SIBLING (not
  // nested inside the <a>, which would be a nested-interactive a11y violation).
  return (
    <div style={{ padding: '13px 6px', borderBottom: '1px solid var(--border2)' }}>
      <Link
        to={`/empleo/${o.id}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em' }}>{o.titulo}</span>
          {(() => {
            // Never show the portal's "Abierta" on an offer whose closing date
            // has passed — it rendered right beside a "cerrada" chip.
            const st = effectiveStatus(o)
            return (
              <Pill tone={st.tone} size="xs">
                {st.label}
              </Pill>
            )
          })()}
          <DeadlinePill deadline={o.deadline} t={t} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 4,
            fontSize: 12,
            color: 'var(--ink60)',
          }}
        >
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            {o.codigo}
          </span>
          {o.location && (
            <>
              <span style={{ color: 'var(--ink30)' }}>·</span>
              <span>{o.location}</span>
            </>
          )}
          <span style={{ color: 'var(--ink30)' }}>·</span>
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            {fmtDateShort(o.publishedAt)}
          </span>
        </div>

        {hasChips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {o.inRibaRoja && (
              <Pill tone="civic" size="xs">
                Riba-roja
              </Pill>
            )}
            {contrato && (
              <Pill tone="neutral" size="xs">
                {contrato}
              </Pill>
            )}
            {showJornada && (
              <Pill tone="ghost" size="xs">
                {jornada}
              </Pill>
            )}
            {puestos > 1 && (
              <Pill tone="neutral" size="xs">
                {puestos} {t('empleo.card.positions')}
              </Pill>
            )}
            {salario && (
              <Pill tone="ok" size="xs">
                {salario}
              </Pill>
            )}
          </div>
        )}

        {occ && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: 'var(--ink60)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: 'var(--ink40)' }}>{t('empleo.card.occ')}</span> {occ.nombre}
            {occ.experiencia ? ` · ${t('empleo.card.exp')} ${occ.experiencia}` : ''}
            {extraOcc > 0 ? ` · +${extraOcc}` : ''}
          </div>
        )}

        {funciones && (
          <div
            style={{
              marginTop: 7,
              fontSize: 12.5,
              color: 'var(--ink70)',
              lineHeight: 1.45,
              ...(expanded
                ? {}
                : {
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }),
            }}
          >
            {funciones}
          </div>
        )}
      </Link>

      {funcLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 4,
            fontSize: 11.5,
            color: 'var(--civic)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {expanded ? t('empleo.card.less') : t('empleo.card.more')}
        </button>
      )}
    </div>
  )
}

function Pager({ page, totalPages, onPage, t }) {
  if (totalPages <= 1) return null
  const btn = (enabled) => ({
    fontSize: 12.5,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--paper)',
    color: enabled ? 'var(--ink)' : 'var(--ink30)',
    cursor: enabled ? 'pointer' : 'default',
  })
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 14,
      }}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={btn(page > 1)}
      >
        ← {t('empleo.prev')}
      </button>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)' }}>
        {t('empleo.page')} {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        style={btn(page < totalPages)}
      >
        {t('empleo.next')} →
      </button>
    </div>
  )
}

export default function Empleo() {
  const t = useT()
  const { loading, error, data } = useEmpleo()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sortBy, setSortBy] = useState('deadline')
  const [page, setPage] = useState(1)

  const items = useMemo(() => data?.items ?? [], [data])
  const municipios = useMemo(() => distinctMunicipios(items), [items])
  const contracts = useMemo(() => distinctContracts(items), [items])

  const filtered = useMemo(() => {
    const out = items.filter((o) => matchesFilters(o, filters))
    out.sort((a, b) => {
      if (sortBy === 'published') return b.publishedAt.localeCompare(a.publishedAt)
      // deadline ascending — soonest-closing first, offers with no deadline last
      if (!a.deadline && !b.deadline) return b.publishedAt.localeCompare(a.publishedAt)
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    })
    return out
  }, [items, filters, sortBy])

  const stats = useMemo(() => computeEmpleoStats(filtered), [filtered])
  const pageData = paginate(filtered, page, PER_PAGE)

  const patch = (p) => {
    setFilters((f) => ({ ...f, ...p }))
    setPage(1)
  }
  const changeSort = (v) => {
    setSortBy(v)
    setPage(1)
  }
  const clear = () => {
    setFilters(EMPTY_FILTERS)
    setSortBy('deadline')
    setPage(1)
  }

  const hasData = !loading && !error && items.length > 0

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 12 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('empleo.eyebrow')}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
            {t('empleo.title')}
          </div>
          {data?.generatedAt && <DataAsOf iso={data.generatedAt} label="Empleo" />}
          <a
            href="/data/empleo-rss.xml"
            target="_blank"
            rel="noreferrer"
            title={t('empleo.rss')}
            className="mono"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--civic)',
              textDecoration: 'none',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 8px',
              letterSpacing: '.06em',
            }}
          >
            RSS
          </a>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink60)', marginTop: 6, lineHeight: 1.5 }}>
          {t('empleo.intro')}
        </div>
      </div>

      {hasData && (
        <EmpleoFilters
          filters={filters}
          onPatch={patch}
          sortBy={sortBy}
          onSort={changeSort}
          municipios={municipios}
          contracts={contracts}
          resultCount={filtered.length}
          onClear={clear}
          t={t}
        />
      )}

      {hasData && <EmpleoStats stats={stats} totalAll={items.length} offers={filtered} t={t} />}

      <Card pad={false} style={{ padding: '4px 14px' }}>
        {loading && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>…</div>}
        {error && (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--warn-ink)' }}>
            {t('empleo.error')} <code>npm run scrape:empleo</code>
          </div>
        )}
        {!loading && !error && pageData.items.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: 'var(--ink60)' }}>
            {t('empleo.empty')}
          </div>
        )}
        {pageData.items.map((o) => (
          <OfferRow key={o.id} o={o} t={t} />
        ))}
      </Card>

      <Pager page={pageData.page} totalPages={pageData.totalPages} onPage={setPage} t={t} />

      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5 }}>
        {t('empleo.sourceNote')}
      </div>
    </div>
  )
}
