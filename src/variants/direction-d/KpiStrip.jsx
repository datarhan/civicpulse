import { usePadron } from '../../hooks/usePadron'
import { useBudget, formatEuros as formatBudgetEuros } from '../../hooks/useBudget'
import { useTenders } from '../../hooks/useTenders'
import { useParo } from '../../hooks/useParo'
import { usePlenos, PLENO_LABEL } from '../../hooks/usePlenos'
import { PALETTE, SERIF, SANS, MONO } from './tokens'

function MiniSpark({ data, color }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const W = 60
  const H = 20
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / (max - min || 1)) * (H - 2) - 1,
  ])
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: 60, height: 20, display: 'block' }}
    >
      <path
        d={path}
        stroke={color}
        strokeWidth="1.25"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Kpi({ label, value, delta, tone, sub, spark, sparkColor, serif }) {
  const color =
    tone === 'ok'
      ? PALETTE.ok
      : tone === 'warn'
        ? PALETTE.warn
        : tone === 'crit'
          ? PALETTE.crit
          : PALETTE.ink
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 16px',
        borderRight: '1px solid ' + PALETTE.hair,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: PALETTE.ink50,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span
          style={{
            fontFamily: serif ? SERIF : MONO,
            fontSize: serif ? 26 : 18,
            fontWeight: 800,
            color,
            letterSpacing: '-.015em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              color: delta.startsWith('▲')
                ? PALETTE.ok
                : delta.startsWith('▼')
                  ? PALETTE.crit
                  : PALETTE.ink50,
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {(sub || spark) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {sub && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: PALETTE.ink50 }}>{sub}</span>
          )}
          {spark && <MiniSpark data={spark} color={sparkColor || color} />}
        </div>
      )}
    </div>
  )
}

function KpiStrip() {
  const padron = usePadron().data
  const budget = useBudget().data
  const tenders = useTenders().data
  const paro = useParo().data
  const plenos = usePlenos().data

  const popSpark = padron?.series?.total?.slice(-10).map((p) => p.value) || null
  const popLatest = padron ? Math.round(padron.latestTotal / 100) / 10 : null
  const popDecade = padron ? padron.growth.decadePct : 0
  const popDeltaStr = padron
    ? (popDecade >= 0 ? '▲ ' : '▼ ') + Math.abs(popDecade).toFixed(1) + '%'
    : '—'

  const totalExpense = budget?.snapshot?.totalExpense
  const budgetYear = budget?.snapshot?.year
  const budgetValue = totalExpense ? formatBudgetEuros(totalExpense, { compact: true }) : '—'
  const balance = budget?.snapshot?.balance || 0

  const awardedTotal = tenders?.stats?.awardedTotalEuros
  const awardedCount = tenders?.stats?.awardedContracts
  const awardedValue = awardedTotal ? formatBudgetEuros(awardedTotal, { compact: true }) : '—'

  const nextPleno = (plenos?.items || [])[0]
  const plenoDate = nextPleno
    ? new Date(nextPleno.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '—'
  const plenoKind = nextPleno ? PLENO_LABEL[nextPleno.kind] || nextPleno.kind : ''
  const totalPlenos = plenos?.stats?.total

  return (
    <footer
      style={{
        display: 'flex',
        height: 76,
        background: PALETTE.paper,
        borderTop: '1px solid ' + PALETTE.rule,
        flexShrink: 0,
        fontFamily: SANS,
      }}
    >
      <Kpi
        label={padron ? `Población ${padron.latestYear}` : 'Población'}
        value={popLatest ? popLatest.toFixed(1) + 'k' : '—'}
        delta={popDeltaStr}
        tone={popDecade > 0 ? 'ok' : 'warn'}
        sub={padron ? `10 años · INE` : 'INE Padrón'}
        spark={popSpark}
        serif
      />
      <Kpi
        label={budgetYear ? `Presup. ${budgetYear}` : 'Presupuesto'}
        value={budgetValue}
        delta={budget ? (balance >= 0 ? '▲' : '▼') : '—'}
        tone={balance >= 0 ? 'ok' : 'warn'}
        sub="MinHac CONPREL"
      />
      <Kpi
        label="Gastos personal"
        value={
          budget?.snapshot?.expenseByEconomicChapter?.[0]?.amount
            ? formatBudgetEuros(budget.snapshot.expenseByEconomicChapter[0].amount, {
                compact: true,
              })
            : '—'
        }
        delta={
          totalExpense && budget?.snapshot?.expenseByEconomicChapter?.[0]?.amount
            ? ((budget.snapshot.expenseByEconomicChapter[0].amount / totalExpense) * 100).toFixed(
                0,
              ) + '%'
            : '—'
        }
        tone="civic"
        sub="Cap.1 económico"
      />
      <Kpi
        label="Contratos adj."
        value={awardedValue}
        delta={awardedCount ? '· ' + awardedCount : '—'}
        tone="ok"
        sub="Gobierto/PLACSP"
      />
      <Kpi
        label={paro ? `Paro ${paro.latestPeriod || ''}` : 'Paro'}
        value={paro ? paro.latestTotal.toLocaleString('es-ES') : '—'}
        delta={(() => {
          if (!paro?.series || paro.series.length < 2) return '—'
          const last = paro.series[paro.series.length - 1].total
          const prev = paro.series[paro.series.length - 2].total
          const diff = last - prev
          return (diff >= 0 ? '▲ +' : '▼ ') + diff
        })()}
        tone={(() => {
          if (!paro?.series || paro.series.length < 2) return 'civic'
          const last = paro.series[paro.series.length - 1].total
          const prev = paro.series[paro.series.length - 2].total
          return last < prev ? 'ok' : 'warn'
        })()}
        sub="SEPE · paro registrado"
        spark={paro?.series?.slice(-12).map((p) => p.total) || null}
        sparkColor={PALETTE.accent}
      />
      <Kpi
        label="Último pleno"
        value={plenoDate}
        delta={plenoKind || '—'}
        tone="civic"
        sub={totalPlenos ? `${totalPlenos} sesiones` : 'ribarroja.es'}
      />
    </footer>
  )
}
export { KpiStrip }
