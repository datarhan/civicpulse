import { Card, ExtLink, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useBudget, formatEuros } from '../hooks/useBudget'
import { contrastarPresupuesto, TOLERANCIA_EQUILIBRIO } from '../scraper/budget-contraste'
import { useBudgetExecution } from '../hooks/useBudgetExecution'
import { useObras } from '../hooks/useObras'
import { useBdns } from '../hooks/useBdns'
import { useDeudaViva } from '../hooks/useDeudaViva'
import { useTenders } from '../hooks/useTenders'
import {
  resumenMenores,
  TECHO_MENOR_SIN_IVA,
  NORMA_MENOR,
  pesoDelMayor,
} from '../scraper/contratos-menores'
import { isCommittedContract } from '../lib/contract-status'
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
            title="En qué prevé gastarse el dinero público"
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
            title="Para qué prevé gastarse el dinero público"
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

/**
 * Lo que el ayuntamiento DEBE.
 *
 * Distinto del capítulo «Deuda pública» que sale más abajo en el presupuesto:
 * aquél es el dinero que se aparta ese año para atenderla, esto es el saldo
 * vivo a 31 de diciembre. La distinción se dice en la propia tarjeta porque de
 * otro modo un lector suma dos cifras que no se suman.
 */
function DeudaVivaSection() {
  const { data } = useDeudaViva()
  const serie = data?.serie ?? []
  if (serie.length === 0) return null
  const ultimo = serie[serie.length - 1]
  const primero = serie[0]
  const tope = Math.max(...serie.map((p) => p.deudaEuros))
  const eur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  const delta = ultimo.deudaEuros - primero.deudaEuros

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Endeudamiento · entrega anual del Ministerio"
        title={`Deuda viva: ${eur(ultimo.deudaEuros)} a 31/12/${ultimo.ejercicio}`}
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 12px',
          maxWidth: '68ch',
        }}
      >
        Es el saldo que el Ayuntamiento debía al cerrar el ejercicio.{' '}
        <strong>No es el capítulo «Deuda pública» del presupuesto</strong>, que es lo que se aparta
        cada año para atenderla: son dos cifras distintas y no se suman.
      </p>

      <div style={{ display: 'grid', gap: 6, margin: '0 0 12px' }}>
        {serie.map((p) => (
          <div key={p.ejercicio} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', width: 40 }}
            >
              {p.ejercicio}
            </span>
            <div
              style={{
                flex: 1,
                height: 14,
                background: 'var(--crit-soft)',
                borderRadius: 'var(--r-pill)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${tope > 0 ? (p.deudaEuros / tope) * 100 : 0}%`,
                  height: '100%',
                  background: 'var(--crit)',
                  opacity: 0.75,
                }}
              />
            </div>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', width: 92, textAlign: 'right' }}
            >
              {eur(p.deudaEuros)}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <Pill tone={delta > 0 ? 'warn' : 'ok'}>
          {delta > 0 ? '+' : ''}
          {eur(delta)} desde {primero.ejercicio}
        </Pill>
        {ultimo.percentil != null && ultimo.reparto && (
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            por encima del {ultimo.percentil} % de los {ultimo.reparto.n.toLocaleString('es-ES')}{' '}
            ayuntamientos de la entrega — de los que {ultimo.reparto.aCero.toLocaleString('es-ES')}{' '}
            declaran cero deuda
          </span>
        )}
      </div>

      {data?.noPublicados?.length > 0 && (
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '0 0 8px' }}>
          Sin entrega publicada todavía: {data.noPublicados.join(', ')}. La serie se corta ahí
          porque el Ministerio aún no ha publicado ese ejercicio, no porque no haya deuda.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <DataAsOf iso={data?.generatedAt} file="deuda-viva.json" />
        <ExtLink href={data?.source?.portal}>Ministerio de Hacienda · deuda viva EE.LL.</ExtLink>
      </div>
    </Card>
  )
}

/**
 * La contratación menor: lo que se adjudica sin concurso.
 *
 * El dato llevaba ahí desde siempre —`minorContract`, leído de ribalicita— y no
 * lo enseñaba nadie: ni un fichero del front nombraba el campo. El portal del
 * Ayuntamiento se compromete a publicar estos contratos «como mínimo
 * trimestralmente», así que la pregunta que contesta esta tarjeta es la que el
 * propio compromiso invita a hacer.
 *
 * Todo se mide SIN IVA, que es como define el techo el art. 118. Con los
 * importes brutos salían quince contratos por encima del límite y son cuatro.
 */
function ContratacionMenorSection() {
  const { data } = useTenders()
  const contratos = data?.contracts ?? []
  if (contratos.length === 0) return null
  const r = resumenMenores(contratos)
  if (r.n === 0) return null

  const eur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  // El denominador son los ADJUDICADOS, no las filas del snapshot: de las 809
  // hay 108 anuladas, revocadas, desistidas o sin clasificar. Compararse con
  // ellas diluye el peso de la vía directa —23 % en vez del 26 % real— y lo
  // cazó la revisión lectora antes de que esto se publicara.
  const adjudicados = contratos.filter((c) => isCommittedContract(c))
  const totalNeto = adjudicados
    .map((c) => c.finalAmountNoTaxes ?? c.initialAmountNoTaxes ?? 0)
    .reduce((a, b) => a + b, 0)
  const cuota = totalNeto > 0 ? (r.importeSinIva / totalNeto) * 100 : null
  // El total lo domina una sola concesión adjudicada de una vez por todo su
  // plazo, así que «2,5 % del importe» dicho solo tranquiliza más de lo que el
  // dato sostiene. Derivado, nunca escrito: una concesión nueva lo mueve.
  const peso = pesoDelMayor(
    adjudicados.map((c) => c.finalAmountNoTaxes ?? c.initialAmountNoTaxes ?? 0),
    r.importeSinIva,
  )
  const topeAnio = Math.max(...r.porAnio.map((a) => a.n), 1)

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Contratación · vía directa"
        title={`Contratos menores: ${r.n} de ${adjudicados.length}, ${eur(r.importeSinIva)}`}
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 12px',
          maxWidth: '68ch',
        }}
      >
        El contrato menor se adjudica <strong>sin licitación ni publicidad previa</strong>. Son el{' '}
        {Math.round((r.n / adjudicados.length) * 100)} % de los contratos adjudicados o firmados y
        {cuota != null ? ` el ${cuota.toFixed(1)} % del importe` : ''}: muchos expedientes y poca
        parte del dinero.{' '}
        {peso && (
          <>
            Ese segundo porcentaje depende mucho del denominador — una sola concesión de{' '}
            {eur(peso.importeDelMayor)}, adjudicada de una vez por todo su plazo, es el{' '}
            {peso.cuotaDelMayor} % de todo lo contratado; apartándola, los menores serían el{' '}
            {peso.cuotaSinElMayor} %.{' '}
          </>
        )}
        Todas las cifras van <strong>sin IVA</strong>, porque así define el techo el art. 118 de la
        Ley 9/2017 —{eur(TECHO_MENOR_SIN_IVA.construction)} en obras,{' '}
        {eur(TECHO_MENOR_SIN_IVA.services)} en servicios y suministros.
      </p>

      <div style={{ display: 'grid', gap: 5, margin: '0 0 12px' }}>
        {r.porAnio.map((a) => (
          <div key={a.anio} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', width: 40 }}
            >
              {a.anio}
            </span>
            <div
              style={{
                flex: 1,
                height: 12,
                background: 'var(--civic-soft)',
                borderRadius: 'var(--r-pill)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(a.n / topeAnio) * 100}%`,
                  height: '100%',
                  background: 'var(--civic)',
                }}
              />
            </div>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', width: 118, textAlign: 'right' }}
            >
              {a.n} · {eur(a.importeSinIva)}
            </span>
          </div>
        ))}
      </div>

      {r.sobreTecho.length > 0 && (
        <div style={{ margin: '0 0 10px' }}>
          <Pill tone="warn">{r.sobreTecho.length} por encima del techo del art. 118</Pill>
          <ul
            style={{
              margin: '8px 0 0',
              paddingLeft: 18,
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
            }}
          >
            {r.sobreTecho.map((c) => (
              <li key={c.title} style={{ marginBottom: 3 }}>
                <span className="mono">{eur(c.importeSinIva)}</span> frente a{' '}
                <span className="mono">{eur(c.techo)}</span> — {c.title}
              </li>
            ))}
          </ul>
          <p
            style={{
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink50)',
              margin: '8px 0 0',
              maxWidth: '68ch',
            }}
          >
            La marca «contrato menor» la pone el portal de contratación, no nosotros, y una etiqueta
            equivocada en origen se parece exactamente a un incumplimiento. Esto mide la distancia
            al límite legal y la publica; llamarlo infracción es un paso que no da un programa.
          </p>
        </div>
      )}

      {(r.sinTecho > 0 || r.sinImporte > 0) && (
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '0 0 8px' }}>
          {r.sinTecho > 0 && `${r.sinTecho} sin techo declarado para su tipo de contrato`}
          {r.sinTecho > 0 && r.sinImporte > 0 && ' · '}
          {r.sinImporte > 0 && `${r.sinImporte} sin importe neto publicado`}: no se comparan con el
          límite, en vez de darlos por dentro.
          {r.anulados > 0 &&
            ` Otros ${r.anulados} venían marcados como menores y su adjudicación se deshizo: no cuentan como gasto ni se les mide el techo.`}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <DataAsOf iso={data?.generatedAt} file="tenders.json" />
        <ExtLink href={NORMA_MENOR}>Ley 9/2017, art. 118</ExtLink>
      </div>
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
      <DeudaVivaSection />
      <ContratacionMenorSection />
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
