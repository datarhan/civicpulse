import { usePadron } from '../../hooks/usePadron'
import { useBudget, formatEuros as formatBudgetEuros } from '../../hooks/useBudget'
import { useTenders } from '../../hooks/useTenders'
import { useParo } from '../../hooks/useParo'
import { usePlenos, PLENO_LABEL } from '../../hooks/usePlenos'
import { isCommittedContract } from '../../lib/contract-status'
import { yearSpan } from '../../lib/year-span'
import { PALETTE, SERIF, SANS, MONO } from './tokens'
import { useT } from '../../i18n'

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

// Text gets the -Ink pair (AA on the warm paper); shapes keep the vivid fill,
// where contrast thresholds don't apply. Same split as `--ok` / `--ok-ink`.
const TONE_TEXT = { ok: PALETTE.okInk, warn: PALETTE.warnInk, crit: PALETTE.crit }
const TONE_FILL = { ok: PALETTE.ok, warn: PALETTE.warn, crit: PALETTE.crit }

function Kpi({ label, value, delta, tone, sub, spark, sparkColor, serif }) {
  const color = TONE_TEXT[tone] ?? PALETTE.ink
  const fill = TONE_FILL[tone] ?? PALETTE.ink
  return (
    <div
      className="d-kpi-cell"
      style={{
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
          fontSize: 'var(--fs-micro)',
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
            fontSize: serif ? 'var(--fs-page)' : 'var(--fs-head)',
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              color: delta.startsWith('▲')
                ? PALETTE.okInk
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
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>
              {sub}
            </span>
          )}
          {spark && <MiniSpark data={spark} color={sparkColor || fill} />}
        </div>
      )}
    </div>
  )
}

function KpiStrip() {
  const t = useT()
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
  // Span of the award dates, so the cumulative total carries its own period.
  //
  // Measured over EXACTLY the rows the cell counts — the committed contracts
  // behind `awardedContracts` / `awardedTotalEuros` — not over every dated row
  // in the file. A local copy of this loop read all 711 dated contracts while
  // labelling the 698 committed ones, so the period described 19 awards the
  // figure excludes. Both spans happen to be 2017–2026 today, which is exactly
  // why it could sit here unnoticed: a mislabelled period only becomes visibly
  // false on the scraper run where the two sets stop agreeing.
  const awardedYears = yearSpan(
    (tenders?.contracts ?? []).filter(isCommittedContract).map((c) => c.awardDate),
  )

  const nextPleno = (plenos?.items || [])[0]
  const plenoDate = nextPleno
    ? new Date(nextPleno.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '—'
  const plenoKind = nextPleno ? PLENO_LABEL[nextPleno.kind] || nextPleno.kind : ''
  const totalPlenos = plenos?.stats?.total

  return (
    // `.d-kpi` owns height + overflow: below the breakpoint the six cells no
    // longer fit, and squeezing them wrapped "27 jul" onto two lines and cut
    // the last cell off entirely. There it scrolls horizontally instead, with
    // each cell holding a legible minimum width.
    <footer
      className="d-kpi"
      // Scrollable below the breakpoint, so it must be keyboard-reachable —
      // otherwise the cells past the fold can only be read by touch or mouse
      // (axe `scrollable-region-focusable`, serious). tabIndex is harmless on
      // desktop where the strip doesn't scroll.
      tabIndex={0}
      aria-label={t('a11y.kpiLabel')}
      style={{
        display: 'flex',
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
      {/* The period is not decoration. This sits next to "Presup. 2025 · €41,6M",
          an ANNUAL figure, while this one is CUMULATIVE over a decade of awards
          and includes multi-year concessions — the water one alone is €55,7M
          awarded in a single go for a seventeen-year term. Unlabelled, the pair
          invites the reader to conclude the town awards more in contracts than
          its entire yearly budget. That inference only became available once
          the figure was corrected from €14,7M upwards, so the framing had to be
          corrected with it.

          Figures here are illustrative of the SHAPE only; the rendered numbers
          come from the snapshot. Two of them had already gone stale in this
          comment (€68,0M and «the €15,8M waste contract») while nothing on
          screen was wrong — the drift this repo built a hook for. */}
      <Kpi
        label={awardedYears ? `Contratos adj. ${awardedYears}` : 'Contratos adj.'}
        value={awardedValue}
        delta={awardedCount ? '· ' + awardedCount : '—'}
        tone="ok"
        sub="acumulado · Gobierto/PLACSP"
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
