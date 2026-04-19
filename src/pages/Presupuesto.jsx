import { Card, Delta, Pill, SectionHead } from '../components/Primitives'
import { BudgetBars } from '../components/Charts'
import {
  BUDGET_ACTUAL,
  BUDGET_KPI,
  BUDGET_MONTHS,
  BUDGET_PLAN,
  TAX_BREAKDOWN,
  TOP_CONTRACTS,
} from '../data/mockData'
import { useBudget, formatEuros, EXPENSE_COLORS, PROGRAM_COLORS } from '../hooks/useBudget'
import { useTenders, STATUS_LABEL, STATUS_TONE, formatDate } from '../hooks/useTenders'

function KStrip({ label, value, delta, invert }) {
  const d = invert ? -delta : delta
  return (
    <Card>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
          {value}
        </div>
        <Delta v={d} />
      </div>
    </Card>
  )
}

function TaxFlow() {
  const rows = TAX_BREAKDOWN.map((s) => ({ ...s, eur: Math.round((487 * s.pct) / 100) }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
      {rows.map((s, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{s.cat}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
              €{s.eur}
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', width: 40, textAlign: 'right' }}>
              {s.pct}%
            </span>
          </div>
          <div
            style={{
              height: 5,
              background: 'var(--soft)',
              borderRadius: 5,
              marginTop: 5,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: s.pct * 2.5 + '%',
                background: s.color,
                borderRadius: 5,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChapterRow({ label, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
        <span
          style={{
            width: 10,
            height: 10,
            background: color,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
          {formatEuros(amount, { compact: true })}
        </span>
        <span
          className="mono"
          style={{ fontSize: 11, color: 'var(--ink50)', width: 48, textAlign: 'right' }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: 'var(--soft)',
          borderRadius: 5,
          marginTop: 5,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: pct + '%', height: '100%', background: color }} />
      </div>
    </div>
  )
}

function RealContracts() {
  const { loading, error, data } = useTenders()
  if (loading) {
    return (
      <Card>
        <SectionHead eyebrow="Últimos contratos adjudicados" title="Cargando contratos…" />
      </Card>
    )
  }
  if (error || !data) {
    return (
      <Card>
        <SectionHead eyebrow="Últimos contratos adjudicados" title="Contratos municipales" />
        <div style={{ fontSize: 12.5, color: 'var(--warn)' }}>
          Ejecuta <code>npm run scrape:tenders</code> para regenerar los datos.
        </div>
      </Card>
    )
  }
  const recent = data.top?.recentAwarded || []
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const formatEur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)

  return (
    <Card>
      <SectionHead
        eyebrow={`${data.stats.totalContracts} contratos totales · € ${new Intl.NumberFormat('es-ES', {
          maximumFractionDigits: 0,
        }).format(data.stats.awardedTotalEuros)} adjudicados`}
        title="Últimos contratos adjudicados"
      />
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 2, marginBottom: 10 }}>
        Datos reales de ribalicita.ribarroja.es (Gobierto) · actualizado {generatedDate}
      </div>
      {recent.slice(0, 8).map((c, i) => (
        <div
          key={c.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 100px',
            padding: '10px 0',
            borderBottom:
              i === recent.slice(0, 8).length - 1 ? 'none' : '1px solid var(--border2)',
            alignItems: 'center',
            fontSize: 13,
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, lineHeight: 1.3 }}>
              {c.permalink ? (
                <a
                  href={c.permalink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title}
                </a>
              ) : (
                <span>{c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 2 }}>
              {c.contractor || 'Sin adjudicatario'} ·{' '}
              {c.awardDate ? formatDate(c.awardDate) : '—'}
            </div>
          </div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
            {formatEur(c.finalAmount)}
          </div>
          <div style={{ textAlign: 'right' }}>
            <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
              {STATUS_LABEL[c.status] || c.status}
            </Pill>
          </div>
        </div>
      ))}
    </Card>
  )
}

function RealBudgetHeader() {
  const { loading, error, data } = useBudget()
  if (loading || error || !data) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Transparencia fiscal
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
              Presupuesto municipal
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--ink50)' }}>
          {loading ? 'Cargando datos reales de MinHac (CONPREL)…' : 'No se pudo cargar el presupuesto real.'}
        </div>
      </>
    )
  }

  const s = data.snapshot
  const perCapita = s.population > 0 ? s.totalExpense / s.population : 0
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Transparencia fiscal · ejercicio {s.year} · CONPREL MinHac
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
            Presupuesto municipal {s.year}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4 }}>
            Datos reales de la Dirección General de Fondos Comunitarios y Coordinación Financiera con las Entidades Locales. Actualizado {generatedDate}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill tone="civic">{s.year}</Pill>
          <Pill tone="ok">REAL</Pill>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Card>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Ingresos totales
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-.01em' }}>
            {formatEuros(s.totalRevenue, { compact: true })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 2 }}>
            {formatEuros(s.totalRevenue)}
          </div>
        </Card>
        <Card>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Gastos totales
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-.01em' }}>
            {formatEuros(s.totalExpense, { compact: true })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 2 }}>
            {formatEuros(s.totalExpense)}
          </div>
        </Card>
        <Card>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Balance inicial
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-.01em', color: s.balance >= 0 ? 'var(--ok)' : 'var(--crit)' }}>
            {s.balance >= 0 ? '+' : ''}
            {formatEuros(s.balance, { compact: true })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 2 }}>
            {s.balance >= 0 ? 'superávit' : 'déficit'}
          </div>
        </Card>
        <Card>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Gasto por habitante
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-.01em' }}>
            {formatEuros(perCapita)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 2 }}>
            {s.population.toLocaleString('es-ES')} habitantes
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHead eyebrow={`Gastos ${s.year} · clasificación económica`} title="En qué se gasta el dinero público" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByEconomicChapter]
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c, i) => (
                <ChapterRow
                  key={c.code}
                  label={`Cap.${c.code} · ${c.label}`}
                  amount={c.amount}
                  total={s.totalExpense}
                  color={EXPENSE_COLORS[parseInt(c.code, 10) - 1] || '#64748B'}
                />
              ))}
          </div>
        </Card>
        <Card>
          <SectionHead eyebrow={`Gastos ${s.year} · clasificación por programas`} title="Para qué se gasta el dinero público" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByProgram]
              .filter((g) => g.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((g, i) => (
                <ChapterRow
                  key={g.label}
                  label={g.label}
                  amount={g.amount}
                  total={s.totalExpense}
                  color={PROGRAM_COLORS[s.expenseByProgram.indexOf(g)] || '#64748B'}
                />
              ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 28 }}>
        <Card>
          <SectionHead eyebrow={`Ingresos ${s.year} · clasificación económica`} title="De dónde vienen los ingresos municipales" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.revenueByEconomicChapter]
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c) => (
                <ChapterRow
                  key={c.code}
                  label={`Cap.${c.code} · ${c.label}`}
                  amount={c.amount}
                  total={s.totalRevenue}
                  color={EXPENSE_COLORS[parseInt(c.code, 10) - 1] || '#64748B'}
                />
              ))}
          </div>
        </Card>
      </div>
    </>
  )
}

export default function Presupuesto() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <RealBudgetHeader />

      <div
        className="mono"
        style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}
      >
        Secciones en desarrollo · datos de demostración
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHead eyebrow="Mi recibo del IBI" title="A dónde van tus €487" />
          <TaxFlow />
        </Card>
        <RealContracts />
      </div>

      <Card>
        <SectionHead eyebrow="Ejecución mensual" title="Gasto vs presupuesto 2026" />
        <BudgetBars months={BUDGET_MONTHS} plan={BUDGET_PLAN} actual={BUDGET_ACTUAL} />
      </Card>
    </div>
  )
}
