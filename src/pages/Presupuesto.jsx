import { Card, ExtLink, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useBudget, formatEuros } from '../hooks/useBudget'
import { contrastarPresupuesto, TOLERANCIA_EQUILIBRIO } from '../scraper/budget-contraste'
import { useBudgetExecution } from '../hooks/useBudgetExecution'
import { useObras } from '../hooks/useObras'
import { useBdns } from '../hooks/useBdns'
import { fmtDateShort, fmtDateLong } from '../lib/formatters'
import GastoDashboard from '../components/Presupuesto/GastoDashboard'
import { TedNotices } from '../components/Presupuesto/TedNotices'

// §07: la barra de magnitud lleva un solo color, el de marca. Antes recibía
// uno de nueve por capítulo, sobre una fila que ya dice `Cap.1 · Personal`.
function ChapterRow({ label, amount, total }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 'var(--fs-aux)' }}>
        <span
          style={{
            width: 10,
            height: 10,
            background: 'var(--civic)',
            borderRadius: 'var(--r-pill)',
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
        <span className="mono" style={{ fontSize: 'var(--fs-aux)', fontWeight: 700 }}>
          {formatEuros(amount, { compact: true })}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            width: 48,
            textAlign: 'right',
          }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: 'var(--soft)',
          borderRadius: 'var(--r-pill)',
          marginTop: 5,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: pct + '%', height: '100%', background: 'var(--civic)' }} />
      </div>
    </div>
  )
}

function RealSubsidies() {
  const { loading, error, data } = useBdns()
  if (loading || error || !data) return null
  const items = (data.items || []).filter((i) => i.direction === 'granted').slice(0, 6)
  if (items.length === 0) return null
  const fmt = fmtDateShort
  return (
    <Card>
      <SectionHead
        eyebrow={`BDNS · ${data.stats.total} convocatorias · ${data.stats.granted} municipales`}
        title="Subvenciones · Base Nacional"
      />
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 2,
          marginBottom: 10,
        }}
      >
        Datos reales de MinHac BDNS · pap.hacienda.gob.es
      </div>
      {items.map((s, i) => (
        <div
          key={s.bdnsCode}
          style={{
            padding: '10px 0',
            borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border2)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
            <Pill tone="civic" size="xs">
              BDNS {s.bdnsCode}
            </Pill>
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {fmt(s.date)}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.4 }}>
            <ExtLink href={s.sourceUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
              {s.description.length > 180 ? s.description.slice(0, 180) + '…' : s.description}
            </ExtLink>
          </div>
        </div>
      ))}
    </Card>
  )
}

function RealBudgetHeader() {
  const { loading, error, data } = useBudget()
  // Read before the early return — rules of hooks. Used only to state that the
  // town's own execution statement disagrees with CONPREL about the approved
  // budget; the figures below are never mixed or reconciled.
  const { data: execData } = useBudgetExecution()
  if (loading || error || !data) {
    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 18,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              Transparencia fiscal
            </div>
            <div
              style={{
                fontSize: 'var(--fs-page)',
                fontWeight: 700,
                letterSpacing: '-.015em',
                marginTop: 2,
              }}
            >
              Presupuesto municipal
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 16, fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          {loading
            ? 'Cargando datos reales de MinHac (CONPREL)…'
            : 'No se pudo cargar el presupuesto real.'}
        </div>
      </>
    )
  }

  const s = data.snapshot
  const perCapita = s.population > 0 ? s.totalExpense / s.population : 0
  const generatedDate = fmtDateLong(data.generatedAt)

  // The two sources disagree about the APPROVED budget itself, not merely
  // about approved-vs-spent: CONPREL publishes 41.578.252,26 € for 2025 while
  // the town's own execution statement opens at 37.599.838,15 €. Neither is
  // averaged, chosen or quietly preferred — each is attributed and the gap is
  // named, because inventing the bridge between two public sources would be a
  // worse defect than the ambiguity.
  //
  // Gated on the years matching. Comparing a CONPREL year against an execution
  // statement from a different exercise would manufacture a discrepancy that
  // does not exist, which is the same defect this note exists to fix.
  const exec = execData?.latest
  // Segundo desajuste, independiente del anterior y dentro de una sola fuente:
  // el presupuesto que publica el ministerio no cuadra ingresos contra gastos.
  // Se calcula con el módulo probado en vez de a ojo aquí, para que la cifra
  // que se publica sea la misma que la que comprueba la suite.
  const contraste = contrastarPresupuesto(s, exec)
  const desequilibrio =
    contraste && Math.abs(contraste.desequilibrioConprel) >= TOLERANCIA_EQUILIBRIO
      ? contraste.desequilibrioConprel
      : null
  const execInicial =
    exec && exec.year === s.year && exec.gastos?.total?.inicial > 0
      ? exec.gastos.total.inicial
      : null

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 18,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Transparencia fiscal · ejercicio {s.year} · CONPREL MinHac
          </div>
          <div
            style={{
              fontSize: 'var(--fs-page)',
              fontWeight: 700,
              letterSpacing: '-.015em',
              marginTop: 2,
            }}
          >
            Presupuesto municipal {s.year}
          </div>
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 4 }}>
            Datos reales de la Dirección General de Fondos Comunitarios y Coordinación Financiera
            con las Entidades Locales. Actualizado {generatedDate}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill tone="civic">{s.year}</Pill>
          {/* Was «REAL». Next to a year, above a euro total, and with an
              execution block further down the page, that pill read as "this is
              what the town really spent" — the exact opposite of what it
              marked. Every figure in this header is the APPROVED budget as
              published by CONPREL; what was actually spent is the `ejecutado`
              column below, and it is less than half of it. The pill now names
              the stage instead of asserting a verdict. */}
          <Pill tone="neutral">APROBADO</Pill>
          <DataAsOf iso={data.generatedAt} label="CONPREL" />
        </div>
      </div>

      {/* Cuatro columnas fijas. En 375px eso son pistas de ~70px que ninguna
          cifra en DM Mono puede ocupar, y como `1fr` no baja del contenido
          mínimo, la tira empujaba el documento hasta 581px. El colapso a 2×2
          vive en index.css: un estilo inline no puede llevar media queries y
          además gana a la clase, de ahí el `!important` de allí. */}
      <div
        className="cp-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Card>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Ingresos presupuestados
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-card)',
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: '-.01em',
            }}
          >
            {formatEuros(s.totalRevenue, { compact: true })}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
            {formatEuros(s.totalRevenue)}
          </div>
        </Card>
        <Card>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Gastos presupuestados
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-card)',
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: '-.01em',
            }}
          >
            {formatEuros(s.totalExpense, { compact: true })}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
            {formatEuros(s.totalExpense)}
          </div>
        </Card>
        <Card>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Balance inicial
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-card)',
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: '-.01em',
              // Ni verde ni rojo: un presupuesto que no cuadra no es una buena
              // noticia ni una mala, es un descuadre. Pintarlo de «ok» era lo
              // que convertía un defecto de la fuente en un colchón fiscal.
              color: desequilibrio !== null ? 'var(--warn-ink)' : 'var(--ink)',
            }}
          >
            {s.balance >= 0 ? '+' : ''}
            {formatEuros(s.balance, { compact: true })}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
            {desequilibrio !== null ? (
              <a href="#descuadre" style={{ color: 'var(--warn-ink)' }}>
                no cuadra ↓
              </a>
            ) : (
              'ingresos = gastos'
            )}
          </div>
        </Card>
        <Card>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Gasto presupuestado/hab.
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-card)',
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: '-.01em',
            }}
          >
            {formatEuros(perCapita)}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
            {s.population.toLocaleString('es-ES')} habitantes
          </div>
        </Card>
      </div>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
          margin: '0 0 16px',
        }}
      >
        Estas cuatro cifras son el presupuesto <strong>aprobado</strong> de {s.year} según CONPREL
        (Ministerio de Hacienda). No son gasto realizado: lo efectivamente gastado aparece más
        abajo, en «Ejecución presupuestaria».
        {execInicial !== null && (
          <>
            {' '}
            Las dos fuentes no coinciden sobre cuál fue el presupuesto aprobado: el estado de
            ejecución que publica el propio Ayuntamiento parte de un crédito inicial de{' '}
            <span className="mono">{formatEuros(execInicial)}</span>, frente a los{' '}
            <span className="mono">{formatEuros(s.totalExpense)}</span> de CONPREL. Esta página
            publica las dos y no las reconcilia: no consta el motivo de la diferencia y elegir una
            sería inventar el puente entre dos fuentes oficiales.
          </>
        )}
      </p>
      {desequilibrio !== null && (
        <p
          id="descuadre"
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.55,
            margin: '0 0 16px',
          }}
        >
          Y hay un segundo desajuste, dentro de la propia fuente del ministerio: le atribuye a
          Riba-roja <span className="mono">{formatEuros(s.totalRevenue)}</span> de ingresos frente a{' '}
          <span className="mono">{formatEuros(s.totalExpense)}</span> de gastos,{' '}
          <span className="mono">{formatEuros(Math.abs(desequilibrio))}</span> de diferencia. Un
          presupuesto general se aprueba <strong>sin déficit inicial</strong> (art. 165.4 del texto
          refundido de la Ley de Haciendas Locales), y la exigencia vale en los dos sentidos:
          tampoco debería sobrar. En ese mismo fichero, otras entidades cuadran al céntimo. No
          sabemos si el descuadre está en lo que remitió el ayuntamiento o en cómo lo publica el
          ministerio; se deja a la vista porque la cifra de arriba sale de esa misma fila.
        </p>
      )}
    </>
  )
}

function BudgetCharts() {
  const { loading, error, data } = useBudget()
  if (loading || error || !data) return null
  const s = data.snapshot
  return (
    <>
      {/* Misma historia que la tira de KPIs: dos columnas fijas que en móvil
          no caben. Colapsa a una en index.css. */}
      <div
        className="cp-charts-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}
      >
        <Card>
          <SectionHead
            eyebrow={`Gastos ${s.year} · clasificación económica`}
            title="En qué se gasta el dinero público"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByEconomicChapter]
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c) => (
                <ChapterRow
                  key={c.code}
                  label={`Cap.${c.code} · ${c.label}`}
                  amount={c.amount}
                  total={s.totalExpense}
                />
              ))}
          </div>
        </Card>
        <Card>
          <SectionHead
            eyebrow={`Gastos ${s.year} · clasificación por programas`}
            title="Para qué se gasta el dinero público"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByProgram]
              .filter((g) => g.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((g) => (
                <ChapterRow
                  key={g.label}
                  label={g.label}
                  amount={g.amount}
                  total={s.totalExpense}
                />
              ))}
          </div>
        </Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 28 }}>
        <Card>
          <SectionHead
            eyebrow={`Ingresos ${s.year} · clasificación económica`}
            title="De dónde vienen los ingresos municipales"
          />
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
                />
              ))}
          </div>
        </Card>
      </div>
    </>
  )
}

function EjecucionSection() {
  const { data } = useBudgetExecution()
  const p = data?.latest
  if (!p || !(p.gastos?.total?.actual > 0)) return null
  const eur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  const maxCh = Math.max(...p.gastos.chapters.map((c) => c.actual), 1)
  return (
    <Card>
      <SectionHead
        eyebrow={`Ejecución · ${p.year}${p.trimestre ? ` · ${p.trimestre}º trimestre` : ''}`}
        title="Ejecución presupuestaria"
      />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '10px 0 18px' }}>
        {[
          {
            k: 'Gastos ejecutados',
            e: p.gastos.total.ejecutado,
            a: p.gastos.total.actual,
            pc: p.ejecucionPct.gastos,
          },
          {
            k: 'Ingresos ejecutados',
            e: p.ingresos.total.ejecutado,
            a: p.ingresos.total.actual,
            pc: p.ejecucionPct.ingresos,
          },
        ].map((s) => (
          <div key={s.k} style={{ flex: '1 1 220px' }}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-card)', fontWeight: 600, color: 'var(--civic)' }}
            >
              {s.pc}%
            </div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 4 }}>
              {s.k} · <span className="mono">{eur(s.e)}</span> de{' '}
              <span className="mono">{eur(s.a)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {p.gastos.chapters.map((c) => {
          const cp = c.actual > 0 ? Math.round((c.ejecutado / c.actual) * 100) : 0
          return (
            <div key={c.capitulo}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 'var(--fs-meta)',
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </span>
                <span className="mono" style={{ color: 'var(--ink50)', flexShrink: 0 }}>
                  {cp}% · {eur(c.ejecutado)}
                </span>
              </div>
              <div
                style={{
                  height: 7,
                  background: 'var(--soft)',
                  borderRadius: 'var(--r-pill)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, (c.actual / maxCh) * 100)}%`,
                    background: 'var(--border)',
                    borderRadius: 'var(--r-input)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${cp}%`,
                      background: 'var(--civic)',
                      borderRadius: 'var(--r-input)',
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 12,
          marginBottom: 0,
        }}
      >
        Ejecutado = obligaciones reconocidas netas sobre presupuesto definitivo. Fuente:
        Ayuntamiento de Riba-roja · estados de ejecución presupuestaria.
      </p>
    </Card>
  )
}

function ObrasEnCursoSection() {
  const { data } = useObras()
  const obras = data?.obras ?? []
  if (obras.length === 0) return null
  const eur = (n) =>
    typeof n === 'number'
      ? new Intl.NumberFormat('es-ES', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(n)
      : '—'
  const renove = obras.filter((o) => o.programa === 'renove')
  const feder = obras.filter((o) => o.programa !== 'renove')
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Urbanismo · infraestructuras"
        title="Obras de infraestructura · fichas municipales 2019–2024"
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 8px',
          maxWidth: '68ch',
        }}
      >
        {obras.length} obras publicadas por el Ayuntamiento en fichas oficiales:{' '}
        {renove.length > 0 &&
          `${renove.length} actuaciones del Plan RENOVE de adecuación de viales (ejecutadas 2023–2024) y `}
        {feder.length} obras de 2019–2020 cofinanciadas con el FEDER de la Comunitat Valenciana
        2014–2020.
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '0 0 14px',
          flexWrap: 'wrap',
        }}
      >
        <Pill tone="warn">Últimas fichas publicadas: feb 2024</Pill>
        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          obras ya ejecutadas · no refleja obras posteriores
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {obras.map((o) => {
          const importe = o.importeAdjudicacion ?? o.costePrevisto
          const importeLabel = o.importeAdjudicacion != null ? 'adj.' : 'previsto'
          return (
            <div key={o.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border2)' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ fontWeight: 600 }}>{o.nombre}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <Pill tone="neutral">{o.programa === 'renove' ? 'Plan RENOVE' : 'FEDER'}</Pill>
                  {typeof o.bajaPct === 'number' && (
                    <Pill tone={o.bajaPct >= 20 ? 'ok' : 'neutral'}>
                      baja <span className="mono">{o.bajaPct}%</span>
                    </Pill>
                  )}
                </span>
              </div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}
              >
                {o.empresa ? `${o.empresa} · ` : ''}
                {importe != null ? `${eur(importe)} ${importeLabel}` : ''}
                {o.plazoMeses ? ` · ${o.plazoMeses} meses` : ''}
                {o.inicio ? ` · inicio ${o.inicio}` : ''}
                {o.fechaEjecucion ? ` · ejecución ${o.fechaEjecucion}` : ''}
              </div>
              <a
                href={o.fichaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--civic)',
                  textDecoration: 'underline',
                }}
              >
                Ver ficha ↗
              </a>
            </div>
          )
        })}
      </div>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 10,
          marginBottom: 0,
        }}
      >
        Fuente: Ayuntamiento de Riba-roja de Túria — Portal de Transparencia («obras de
        infraestructuras en curso») y página del Plan RENOVE de adecuación de viales.
      </p>
    </Card>
  )
}

export default function Presupuesto() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <RealBudgetHeader />
      <div style={{ marginBottom: 16 }}>
        <EjecucionSection />
      </div>
      <ObrasEnCursoSection />
      <div style={{ marginBottom: 16 }}>
        <GastoDashboard />
        <TedNotices />
      </div>
      <BudgetCharts />
      <div style={{ marginBottom: 16 }}>
        <RealSubsidies />
      </div>
    </div>
  )
}
