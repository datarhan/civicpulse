import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { Card, ExtLink, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useBudget, formatEuros } from '../hooks/useBudget'
import { contrastarPresupuesto, TOLERANCIA_EQUILIBRIO } from '../scraper/budget-contraste'
import { useBudgetExecution } from '../hooks/useBudgetExecution'
import { useObras } from '../hooks/useObras'
import { useBdns } from '../hooks/useBdns'
import { useDeudaViva } from '../hooks/useDeudaViva'
import { useTenders } from '../hooks/useTenders'
import { useTendersTed } from '../hooks/useTendersTed'
import {
  resumenMenores,
  TECHO_MENOR_SIN_IVA,
  NORMA_MENOR,
  pesoDelMayor,
} from '../scraper/contratos-menores'
import {
  cascadaGastos,
  lecturaCapitulos,
  capituloDominante,
  tendenciaDeuda,
  capitulosACero,
} from '../scraper/presupuesto-lectura'
import { isCommittedContract } from '../lib/contract-status'
import { fmtDateShort, fmtDateLong } from '../lib/formatters'
import { yearSpan } from '../lib/year-span'
import { EFICIENCIA_ENABLED } from '../flags'
import { useT } from '../i18n'
import GastoDashboard from '../components/Presupuesto/GastoDashboard'
import { TedNotices } from '../components/Presupuesto/TedNotices'

/*
 * /presupuesto, del crédito inicial a lo ejecutado — lámina 5b del lienzo
 * «Civicpulse UI/UX review».
 *
 * El hecho que la página tenía y no contaba: el estado de ejecución trae
 * 24,5 M€ de modificaciones sobre 37,6 M€ de crédito inicial —el presupuesto
 * creció un 65 % dentro del año, casi todo en un capítulo de inversiones que
 * abrió en cero— y de ahí sale el «30,4 % ejecutado», que puesto solo se leía
 * como no gastar. Ninguna de esas cifras va escrita aquí: las deriva
 * `scraper/presupuesto-lectura`, y las frases que describen la FORMA del dato
 * —cuánto creció, qué capítulo se lo llevó, hacia dónde va la deuda— nacen de
 * ese módulo con sus ausencias declaradas. La lámina se equivocó en una
 * («bajó tres años seguidos» sobre una serie que baja dos), que es exactamente
 * la clase de frase que no puede ir a mano.
 *
 * Tres cosas de la maqueta NO se copian. Su azul de acento es el hex de marca
 * del PP y su morado significa aquí «lo escribió una máquina», así que todo
 * pasa por los tokens. Decía «lo pagado» donde la cifra son obligaciones
 * reconocidas, que no son pagos. Y mandaba los cuatro bloques de contratación
 * «enteros a /datos», que es un catálogo y no los aloja: se quedan aquí, bajo
 * sus cuatro tarjetas-resumen, ancladas, porque borrarlos sería retirar del
 * sitio el listado de menores por encima del techo del art. 118.
 */

const eur0 = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
const eurM = (n, d = 1) =>
  `${(n / 1e6).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} M€`
const pct1 = (n) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct0 = (n) => Math.round(n).toLocaleString('es-ES')
const num = (n) => Number(n).toLocaleString('es-ES')

/** Rellena `{clave}` con su valor. Sin regex: una llave no es un patrón. */
function rellena(plantilla, vars = {}) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), plantilla)
}

/** Un par de asteriscos en el catálogo marca negrita. */
function Marcado({ texto }) {
  return String(texto)
    .split('**')
    .map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))
}

const EYEBROW = {
  fontSize: 'var(--fs-micro)',
  color: 'var(--ink50)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}

function Eyebrow({ children, style }) {
  return (
    <div className="mono" style={{ ...EYEBROW, ...style }}>
      {children}
    </div>
  )
}

/** Un aviso con filete a la izquierda: ámbar para un cociente que engaña, marca para un dato. */
function Aviso({ tone = 'warn', children, id }) {
  const color = tone === 'warn' ? 'var(--warn)' : 'var(--civic)'
  const wash = tone === 'warn' ? 'var(--warn-soft)' : 'var(--civic-soft)'
  return (
    <p
      id={id}
      style={{
        margin: 0,
        padding: '12px 14px',
        background: wash,
        borderLeft: `3px solid ${color}`,
        borderRadius: '0 var(--r-input) var(--r-input) 0',
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.6,
        color: 'var(--ink70)',
        scrollMarginTop: 24,
      }}
    >
      {children}
    </p>
  )
}

// §07: la barra de magnitud lleva un solo color, el de marca. Antes recibía
// uno de nueve por capítulo, sobre una fila que ya dice `Cap.1 · Personal`.
function ChapterRow({ label, amount, total, nota }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 'var(--fs-aux)' }}>
        <span style={{ flex: 1, fontWeight: 500, minWidth: 0 }}>
          {label}
          {nota && (
            <span
              style={{
                display: 'block',
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                fontWeight: 400,
              }}
            >
              {nota}
            </span>
          )}
        </span>
        <span className="mono" style={{ fontSize: 'var(--fs-aux)', fontWeight: 700 }}>
          {eur0(amount)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            width: 48,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {pct1(pct)} %
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

/* ------------------------------------------------------------------------ */
/* Cabecera: el lede derivado y las dos fuentes                                */
/* ------------------------------------------------------------------------ */

function Cabecera() {
  const t = useT()
  const { loading, error, data } = useBudget()
  // Read before the early return — rules of hooks. Used only to state that the
  // town's own execution statement disagrees with CONPREL about the approved
  // budget; the figures below are never mixed or reconciled.
  const { data: execData } = useBudgetExecution()
  if (loading || error || !data) {
    return (
      <div>
        <Eyebrow>{t('presupuesto.title.sinAnio')}</Eyebrow>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.02em',
            margin: '6px 0 0',
            lineHeight: 1.15,
          }}
        >
          {t('presupuesto.title.sinAnio')}
        </h1>
        <div style={{ marginTop: 12, fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          {loading ? t('presupuesto.loading') : t('presupuesto.error')}
        </div>
      </div>
    )
  }

  const s = data.snapshot
  const perCapita = s.population > 0 ? s.totalExpense / s.population : 0
  const exec = execData?.latest
  // The two sources disagree about the APPROVED budget itself, not merely
  // about approved-vs-spent: CONPREL publishes 41.578.252,26 € for 2025 while
  // the town's own execution statement opens at 37.599.838,15 €. Neither is
  // averaged, chosen or quietly preferred — each is attributed and the gap is
  // named, because inventing the bridge between two public sources would be a
  // worse defect than the ambiguity. `contrastarPresupuesto` gates on the
  // years matching: comparing a CONPREL year against an execution statement
  // from a different exercise would manufacture a discrepancy that does not
  // exist.
  const contraste = contrastarPresupuesto(s, exec)
  const dosFuentes =
    contraste && Math.abs(contraste.diferenciaGastos) >= TOLERANCIA_EQUILIBRIO ? contraste : null
  // El lede sólo habla de la ejecución cuando es la del MISMO ejercicio que
  // el titular; si no, describe lo aprobado y deja la cascada, más abajo, con
  // su propio año en el rótulo.
  const mismoAnio = exec && exec.year === s.year
  const cascada = mismoAnio ? cascadaGastos(exec.gastos?.total) : null
  const dominante = mismoAnio ? capituloDominante(exec.gastos?.chapters, exec.gastos?.total) : null

  let lede
  if (cascada && cascada.cuadra) {
    lede = rellena(t('presupuesto.lede'), {
      inicial: eurM(cascada.inicial),
      mod: eurM(cascada.modificaciones),
      pct: pct0(cascada.ampliacionPct),
      ejecutado: eurM(cascada.ejecutado),
    })
    if (dominante) {
      lede += rellena(
        t(dominante.abrioEnCero ? 'presupuesto.lede.dominanteCero' : 'presupuesto.lede.dominante'),
        { cuota: pct0(dominante.cuotaAmpliacion * 100), capitulo: dominante.rotulo.toLowerCase() },
      )
    }
  } else {
    lede = rellena(t('presupuesto.lede.soloAprobado'), {
      year: s.year,
      gastos: eurM(s.totalExpense, 2),
    })
  }

  return (
    <div className={dosFuentes ? 'cp-presu-hero' : undefined}>
      <div>
        <Eyebrow>
          {rellena(t(cascada ? 'presupuesto.eyebrow' : 'presupuesto.eyebrow.aprobado'), {
            year: s.year,
          })}
        </Eyebrow>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.02em',
            margin: '6px 0 0',
            lineHeight: 1.15,
          }}
        >
          {rellena(t('presupuesto.title'), { year: s.year })}
        </h1>
        <p
          style={{
            margin: '14px 0 0',
            fontSize: 'var(--fs-head)',
            lineHeight: 1.5,
            color: 'var(--ink)',
            maxWidth: '62ch',
            textWrap: 'pretty',
          }}
        >
          {lede}
        </p>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.55,
            color: 'var(--ink50)',
            maxWidth: '66ch',
          }}
        >
          <Marcado texto={t('presupuesto.tres')} />{' '}
          {cascada && (
            <a href="#cascada" style={{ color: 'var(--civic)' }}>
              {t('presupuesto.tres.link')}
            </a>
          )}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 12,
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
          }}
        >
          <span>
            {rellena(t('presupuesto.meta'), {
              gastos: eurM(s.totalExpense, 2),
              porHab: eur0(perCapita),
              hab: num(s.population),
              fecha: fmtDateLong(data.generatedAt),
            })}
          </span>
          <DataAsOf iso={data.generatedAt} label="CONPREL" />
        </div>
      </div>

      {dosFuentes && (
        <Card style={{ borderLeft: '3px solid var(--warn)' }}>
          <div
            style={{
              fontSize: 'var(--fs-meta)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--warn-ink)',
            }}
          >
            {t('presupuesto.fuentes.title')}
          </div>
          <div style={{ marginTop: 10 }}>
            {[
              [t('presupuesto.fuentes.conprel'), dosFuentes.gastosConprel, false],
              [t('presupuesto.fuentes.municipal'), dosFuentes.gastosMunicipal, false],
              [t('presupuesto.fuentes.diferencia'), Math.abs(dosFuentes.diferenciaGastos), true],
            ].map(([rotulo, v, resalta], i, arr) => (
              <div
                key={rotulo}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border2)' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--fs-meta)',
                    lineHeight: 1.35,
                    color: resalta ? 'var(--warn-ink)' : 'var(--ink70)',
                    fontWeight: resalta ? 600 : 400,
                  }}
                >
                  {rotulo}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-body)',
                    fontWeight: resalta ? 600 : 500,
                    whiteSpace: 'nowrap',
                    flex: 'none',
                    color: resalta ? 'var(--warn-ink)' : 'var(--ink)',
                  }}
                >
                  {eur0(v)}
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: '10px 0 0',
              paddingTop: 10,
              borderTop: '1px solid var(--border2)',
              fontSize: 'var(--fs-micro)',
              lineHeight: 1.5,
              color: 'var(--ink50)',
            }}
          >
            <Marcado texto={t('presupuesto.fuentes.nota')} />
          </p>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* La cascada: inicial → modificaciones → definitivo → ejecutado              */
/* ------------------------------------------------------------------------ */

function CascadaCard() {
  const t = useT()
  const { data } = useBudgetExecution()
  const p = data?.latest
  const c = cascadaGastos(p?.gastos?.total)
  if (!p || !c) return null

  const ingresos = p.ingresos?.total
  const pctIng =
    ingresos && ingresos.actual > 0 ? (ingresos.ejecutado / ingresos.actual) * 100 : null

  const filas = [
    {
      rotulo: t('presupuesto.cascada.inicial'),
      nota: t('presupuesto.cascada.inicial.nota'),
      v: c.inicial,
      barra: 'var(--ink30)',
      tinta: 'var(--ink)',
      id: 'inicial',
    },
    {
      rotulo: t('presupuesto.cascada.mod'),
      nota: rellena(t('presupuesto.cascada.mod.nota'), { pct: pct0(c.ampliacionPct) }),
      v: c.modificaciones,
      barra: 'var(--warn)',
      tinta: 'var(--warn-ink)',
      id: 'modificaciones',
    },
    {
      rotulo: t('presupuesto.cascada.definitivo'),
      nota: t('presupuesto.cascada.definitivo.nota'),
      v: c.definitivo,
      barra: 'var(--ink70)',
      tinta: 'var(--ink)',
      id: 'definitivo',
    },
    {
      rotulo: t('presupuesto.cascada.ejecutado'),
      nota: rellena(t('presupuesto.cascada.ejecutado.nota'), {
        pct: pct1(c.ejecutadoSobreDefinitivoPct),
      }),
      v: c.ejecutado,
      barra: 'var(--civic)',
      tinta: 'var(--civic-ink)',
      id: 'ejecutado',
    },
  ]
  const periodo = p.trimestre ? rellena(t('presupuesto.cascada.periodo'), { t: p.trimestre }) : ''

  return (
    <Card id="cascada" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={rellena(t('presupuesto.cascada.eyebrow'), { year: p.year, periodo })}
        title={
          c.cuadra
            ? rellena(t('presupuesto.cascada.title'), { pct: pct0(c.ampliacionPct) })
            : t('presupuesto.cascada.title.sinCuadre')
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {filas.map((f) => (
          <div key={f.id} className="cp-presu-cascada" data-cascada={f.id}>
            <div>
              <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, lineHeight: 1.3 }}>
                {f.rotulo}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  marginTop: 2,
                  lineHeight: 1.35,
                }}
              >
                {f.nota}
              </div>
            </div>
            <div
              style={{
                height: 26,
                background: 'var(--soft)',
                borderRadius: 'var(--r-input)',
                overflow: 'hidden',
              }}
            >
              <div
                data-barra={f.id}
                style={{
                  height: '100%',
                  width: `${Math.min(100, (f.v / c.definitivo) * 100)}%`,
                  background: f.barra,
                }}
              />
            </div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 500,
                textAlign: 'right',
                color: f.tinta,
                whiteSpace: 'nowrap',
              }}
            >
              {eur0(f.v)}
            </div>
          </div>
        ))}
      </div>

      {!c.cuadra && (
        <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--warn-ink)' }}>
          {rellena(t('presupuesto.cascada.noCuadra'), {
            suma: eur0(c.inicial + c.modificaciones),
          })}
        </p>
      )}

      {c.cuadra && (
        <div className="cp-presu-duo" style={{ marginTop: 18 }}>
          {c.modificaciones > 0 && (
            <Aviso tone="warn">
              <Marcado
                texto={rellena(t('presupuesto.callout.denominador'), {
                  pctDef: pct1(c.ejecutadoSobreDefinitivoPct),
                  pctIni: pct1(c.ejecutadoSobreInicialPct),
                })}
              />
            </Aviso>
          )}
          {pctIng != null && ingresos.ejecutado !== c.ejecutado && (
            <Aviso tone="civic">
              <Marcado
                texto={rellena(
                  t(
                    ingresos.ejecutado > c.ejecutado
                      ? 'presupuesto.callout.asimetria.entro'
                      : 'presupuesto.callout.asimetria.salio',
                  ),
                  {
                    mucho:
                      ingresos.ejecutado / c.ejecutado >= 2 ? t('presupuesto.callout.mucho') : '',
                    pctIng: pct1(pctIng),
                    ingEj: eurM(ingresos.ejecutado),
                    pctGas: pct1(c.ejecutadoSobreDefinitivoPct),
                    gasEj: eurM(c.ejecutado),
                  },
                )}
              />
            </Aviso>
          )}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginTop: 12,
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
        }}
      >
        <span>
          {rellena(t('presupuesto.cap.fuente'), {
            fecha: p.fechaListado
              ? rellena(t('presupuesto.cap.fecha'), { fecha: p.fechaListado })
              : '',
          })}
        </span>
        <DataAsOf iso={data?.generatedAt} file="budget-execution.json" />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------------ */
/* Capítulo a capítulo: inicial y ampliación, adyacentes; ejecutado encima     */
/* ------------------------------------------------------------------------ */

function Swatch({ color, opacity = 1 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 8,
        borderRadius: 'var(--r-pill)',
        background: color,
        opacity,
        flex: 'none',
        display: 'inline-block',
      }}
    />
  )
}

function CapitulosCard() {
  const t = useT()
  const { data } = useBudgetExecution()
  const p = data?.latest
  const total = p?.gastos?.total
  const filas = lecturaCapitulos(p?.gastos?.chapters, total)
  if (!p || filas.length === 0 || !(total?.actual > 0)) return null
  const dominante = capituloDominante(p.gastos.chapters, total)
  const capMax = Math.max(...filas.map((f) => f.definitivo), 1)

  const notaDe = (f) => {
    // La cuota de la ampliación NO se repite aquí cuando el capítulo abrió en
    // cero: la frase de abajo la argumenta, y decirla dos veces con dos
    // precisiones distintas fue lo que enseñó el navegador.
    if (f.abrioEnCero) return t('presupuesto.cap.nota.cero')
    if (f.cuotaAmpliacion > 0.5)
      return rellena(t('presupuesto.cap.nota.cuota'), { cuota: pct0(f.cuotaAmpliacion * 100) })
    return null
  }

  return (
    <Card>
      <SectionHead
        eyebrow={rellena(t('presupuesto.cap.eyebrow'), { year: p.year })}
        title={t('presupuesto.cap.title')}
        right={
          <div
            data-leyenda="capitulos"
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              flexShrink: 0,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Swatch color="var(--ink30)" />
              {t('presupuesto.cap.leyenda.inicial')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Swatch color="var(--warn)" opacity={0.35} />
              {t('presupuesto.cap.leyenda.ampliacion')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Swatch color="var(--civic)" />
              {t('presupuesto.cap.leyenda.ejecutado')}
            </span>
          </div>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 8 }}>
        {filas.map((f) => {
          const nota = notaDe(f)
          return (
            <div key={f.capitulo} className="cp-presu-cap" data-capitulo={f.capitulo}>
              <div>
                <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, lineHeight: 1.3 }}>
                  Cap.{f.capitulo} · {f.rotulo}
                </div>
                {nota && (
                  <div
                    style={{
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--warn-ink)',
                      marginTop: 2,
                      lineHeight: 1.35,
                    }}
                  >
                    {nota}
                  </div>
                )}
              </div>
              {/* El crédito inicial y la ampliación van UNA AL LADO DE OTRA,
                  no una encima de otra, y juntas miden el crédito definitivo.
                  Superpuestas se veían mal de verdad: `--ink30` es un token con
                  alfa, así que el gris sobre el ámbar componía un caqui que no
                  era ninguno de los dos cuadraditos de la leyenda —el lector
                  buscaba un gris que no estaba en el gráfico—. Adyacentes,
                  cada tramo se pinta contra la ficha igual que su cuadradito, y
                  además la ampliación se lee como lo que es: lo que se le añadió
                  al crédito de enero. Todas comparten escala (`capMax`), así que
                  un capítulo que abrió en cero es ámbar de punta a punta.
                  El ejecutado sí va encima, más fino y opaco, porque no es una
                  parte del reparto: es cuánto de ese crédito se ha usado. */}
              <div style={{ position: 'relative', height: 20 }}>
                <div
                  data-barra-ini={f.capitulo}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${(f.inicial / capMax) * 100}%`,
                    background: 'var(--ink30)',
                    borderRadius: 'var(--r-input)',
                  }}
                />
                <div
                  data-barra-amp={f.capitulo}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${(f.inicial / capMax) * 100}%`,
                    width: `${(f.modificaciones / capMax) * 100}%`,
                    background: 'var(--warn)',
                    opacity: 0.35,
                    borderRadius: 'var(--r-input)',
                  }}
                />
                <div
                  data-barra-ej={f.capitulo}
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: 5,
                    left: 0,
                    width: `${(f.ejecutado / capMax) * 100}%`,
                    background: 'var(--civic)',
                    borderRadius: 'var(--r-input)',
                  }}
                />
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-meta)',
                  textAlign: 'right',
                  color: 'var(--ink70)',
                  whiteSpace: 'nowrap',
                }}
              >
                {eur0(f.ejecutado)}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-aux)',
                  textAlign: 'right',
                  fontWeight: 500,
                  color: f.pctEjecutado < 10 ? 'var(--warn-ink)' : 'var(--ink70)',
                  whiteSpace: 'nowrap',
                }}
              >
                {pct0(f.pctEjecutado)} %
              </div>
            </div>
          )
        })}
      </div>
      <p
        style={{
          margin: '16px 0 0',
          paddingTop: 14,
          borderTop: '1px solid var(--border2)',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.6,
          color: 'var(--ink70)',
          maxWidth: '100ch',
          textWrap: 'pretty',
        }}
      >
        {dominante && (
          <Marcado
            texto={rellena(
              t(
                dominante.abrioEnCero
                  ? 'presupuesto.cap.pie.cero'
                  : 'presupuesto.cap.pie.dominante',
              ),
              {
                capitulo: dominante.rotulo,
                definitivo: eurM(dominante.definitivo, 2),
                inicial: eurM(dominante.definitivo - dominante.modificaciones, 2),
                cuota: pct0(dominante.cuotaAmpliacion * 100),
                pct: pct1(dominante.pctEjecutado),
              },
            )}
          />
        )}
        {t('presupuesto.cap.pie.cociente')}
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------------------ */
/* Lo aprobado según CONPREL: en qué, de dónde, para qué                      */
/* ------------------------------------------------------------------------ */

function AprobadoPar() {
  const t = useT()
  const { loading, error, data } = useBudget()
  const { data: execData } = useBudgetExecution()
  if (loading || error || !data) return null
  const s = data.snapshot
  const contraste = contrastarPresupuesto(s, execData?.latest)
  const desequilibrio =
    contraste && Math.abs(contraste.desequilibrioConprel) >= TOLERANCIA_EQUILIBRIO
      ? contraste.desequilibrioConprel
      : null
  const aCero = capitulosACero(s.expenseByEconomicChapter)

  return (
    <div className="cp-presu-duo">
      <Card>
        <SectionHead
          eyebrow={rellena(t('presupuesto.econ.eyebrow'), { year: s.year })}
          title={t('presupuesto.econ.title')}
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
        {aCero.length > 0 && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-micro)',
              lineHeight: 1.5,
              color: 'var(--ink50)',
            }}
          >
            {aCero.length === 1
              ? rellena(t('presupuesto.econ.cero'), {
                  code: aCero[0].code,
                  label: aCero[0].label.toLowerCase(),
                })
              : rellena(t('presupuesto.econ.ceroVarios'), {
                  lista: aCero.map((c) => `${c.code} (${c.label.toLowerCase()})`).join(', '),
                })}
          </p>
        )}
      </Card>

      <Card>
        <SectionHead
          eyebrow={rellena(t('presupuesto.ing.eyebrow'), { year: s.year })}
          title={t('presupuesto.ing.title')}
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
        {desequilibrio !== null && (
          <div style={{ marginTop: 12 }}>
            <Aviso tone="warn" id="descuadre">
              <Marcado
                texto={rellena(t('presupuesto.descuadre'), {
                  ingresos: eur0(s.totalRevenue),
                  gastos: eur0(s.totalExpense),
                  dif: eur0(Math.abs(desequilibrio)),
                })}
              />
            </Aviso>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Las seis áreas de gasto de la Orden EHA/3565/2008, por su rótulo en CONPREL. */
const GLOSA_PROGRAMA = {
  'deuda pública': 'presupuesto.prog.glosa.deuda',
  'servicios públicos básicos': 'presupuesto.prog.glosa.basicos',
  'actuaciones de protección y promoción social': 'presupuesto.prog.glosa.social',
  'producción de bienes públicos de carácter preferente': 'presupuesto.prog.glosa.preferentes',
  'actuaciones de carácter económico': 'presupuesto.prog.glosa.economico',
  'actuaciones de carácter general': 'presupuesto.prog.glosa.general',
}

function ProgramasCard() {
  const t = useT()
  const { loading, error, data } = useBudget()
  const { data: deudaData } = useDeudaViva()
  if (loading || error || !data) return null
  const s = data.snapshot
  const programas = [...(s.expenseByProgram ?? [])]
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  if (programas.length === 0) return null
  const deudaPrograma = programas.find((g) => g.label.toLowerCase() === 'deuda pública')
  const ultimoDeuda = deudaData?.ultimo

  return (
    <Card>
      <SectionHead
        eyebrow={rellena(t('presupuesto.prog.eyebrow'), { year: s.year })}
        title={rellena(t('presupuesto.prog.title'), { total: eurM(s.totalExpense, 2) })}
        right={
          <div
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              maxWidth: '34ch',
              textAlign: 'right',
              lineHeight: 1.45,
              flexShrink: 1,
            }}
          >
            {t('presupuesto.prog.nota')}
          </div>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 8 }}>
        {programas.map((g) => {
          const pct = s.totalExpense > 0 ? (g.amount / s.totalExpense) * 100 : 0
          const glosa = GLOSA_PROGRAMA[g.label.toLowerCase()]
          return (
            <div key={g.label} className="cp-presu-prog">
              <div>
                <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, lineHeight: 1.3 }}>
                  {g.label}
                </div>
                {glosa && (
                  <div
                    style={{
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      marginTop: 2,
                      lineHeight: 1.35,
                    }}
                  >
                    {t(glosa)}
                  </div>
                )}
              </div>
              <div
                style={{
                  height: 14,
                  background: 'var(--soft)',
                  borderRadius: 'var(--r-pill)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--civic)' }} />
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-meta)',
                  textAlign: 'right',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {eur0(g.amount)}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  textAlign: 'right',
                  color: 'var(--ink50)',
                  whiteSpace: 'nowrap',
                }}
              >
                {pct1(pct)} %
              </div>
            </div>
          )
        })}
      </div>
      {deudaPrograma && ultimoDeuda?.deudaEuros > 0 && (
        <p
          style={{
            margin: '14px 0 0',
            paddingTop: 12,
            borderTop: '1px solid var(--border2)',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.6,
            color: 'var(--ink70)',
          }}
        >
          {rellena(t('presupuesto.prog.deuda'), {
            importe: eurM(deudaPrograma.amount, 2),
            deuda: eurM(ultimoDeuda.deudaEuros, 2),
          })}
        </p>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------------ */
/* Deuda viva: la forma de la serie, contada                                   */
/* ------------------------------------------------------------------------ */

/**
 * Lo que el ayuntamiento DEBE.
 *
 * Distinto del capítulo «Deuda pública» del presupuesto: aquél es el dinero
 * que se aparta ese año para atenderla, esto es el saldo vivo a 31 de
 * diciembre. La distinción se dice en la propia tarjeta porque de otro modo
 * un lector suma dos cifras que no se suman.
 */
function DeudaVivaSection() {
  const t = useT()
  const { data } = useDeudaViva()
  const { data: budget } = useBudget()
  const serie = data?.serie ?? []
  const tendencia = tendenciaDeuda(serie)
  if (!tendencia) return null
  const { ultimo, puntos } = tendencia
  const primero = puntos[0]
  const tope = Math.max(...puntos.map((p) => p.deudaEuros), 1)
  const delta = ultimo.deudaEuros - primero.deudaEuros
  const programaDeuda = (budget?.snapshot?.expenseByProgram ?? []).find(
    (g) => g.label.toLowerCase() === 'deuda pública',
  )
  const reparto = data?.ultimo?.reparto
  const percentil = data?.ultimo?.percentil

  return (
    <Card>
      <SectionHead
        eyebrow={t('presupuesto.deuda.eyebrow')}
        title={tendencia.titular}
        right={
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.02em' }}
            >
              {eur0(ultimo.deudaEuros)}
            </div>
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
              {rellena(t('presupuesto.deuda.saldo'), { year: ultimo.ejercicio })}
            </div>
          </div>
        }
      />
      <div className="cp-presu-deuda" style={{ marginTop: 8 }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {puntos.map((p) => (
              <div key={p.ejercicio} className="cp-presu-deuda-fila" data-deuda={p.ejercicio}>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}
                >
                  {p.ejercicio}
                </span>
                <div
                  style={{
                    height: 16,
                    background: 'var(--crit-soft)',
                    borderRadius: 'var(--r-pill)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(p.deudaEuros / tope) * 100}%`,
                      height: '100%',
                      background: 'var(--crit)',
                      opacity: 0.75,
                    }}
                  />
                </div>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-meta)', textAlign: 'right', whiteSpace: 'nowrap' }}
                >
                  {eur0(p.deudaEuros)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    color:
                      p.delta === null
                        ? 'var(--ink50)'
                        : p.delta > 0
                          ? 'var(--crit-ink)'
                          : p.delta < 0
                            ? 'var(--ok-ink)'
                            : 'var(--ink50)',
                  }}
                >
                  {p.delta === null
                    ? '—'
                    : `${p.delta > 0 ? '+' : p.delta < 0 ? '−' : ''}${eur0(Math.abs(p.delta)).replace(/\s?€$/, '')}`}
                </span>
              </div>
            ))}
          </div>
          <div
            className="mono"
            style={{ marginTop: 10, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
          >
            {rellena(t('presupuesto.deuda.desde'), {
              anio: primero.ejercicio,
              delta: `${delta > 0 ? '+' : ''}${eur0(delta)}`,
            })}
          </div>
        </div>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.6,
              color: 'var(--ink70)',
            }}
          >
            <Marcado
              texto={rellena(t('presupuesto.deuda.nota1'), {
                importe:
                  programaDeuda && budget?.snapshot?.year
                    ? rellena(t('presupuesto.deuda.nota1.importe'), {
                        x: eurM(programaDeuda.amount, 2),
                        year: budget.snapshot.year,
                      })
                    : '',
              })}
            />
          </p>
          {percentil != null && reparto && (
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 'var(--fs-aux)',
                lineHeight: 1.6,
                color: 'var(--ink70)',
              }}
            >
              <Marcado
                texto={rellena(t('presupuesto.deuda.nota2'), {
                  percentil,
                  n: num(reparto.n),
                  aCero: num(reparto.aCero),
                  mediana: eur0(reparto.mediana ?? 0),
                  p90: eurM(reparto.p90, 2),
                })}
              />
            </p>
          )}
          {data?.noPublicados?.length > 0 && (
            <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '10px 0 0' }}>
              {rellena(t('presupuesto.deuda.noPublicados'), {
                lista: data.noPublicados.join(', '),
              })}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <DataAsOf iso={data?.generatedAt} file="deuda-viva.json" />
            <ExtLink href={data?.source?.portal}>{t('presupuesto.deuda.fuente')}</ExtLink>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------------ */
/* Contratación: cuatro tarjetas-resumen y, debajo, sus fichas enteras         */
/* ------------------------------------------------------------------------ */

function TarjetaContratacion({ href, eyebrow, cifra, nota, enlace }) {
  return (
    <a
      href={href}
      className="cp-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        color: 'inherit',
        textDecoration: 'none',
        padding: 16,
      }}
    >
      <div className="mono" style={{ ...EYEBROW, letterSpacing: '.07em' }}>
        {eyebrow}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.01em' }}
      >
        {cifra}
      </div>
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', lineHeight: 1.45 }}>
        {nota}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          marginTop: 'auto',
          paddingTop: 6,
          fontWeight: 500,
        }}
      >
        {enlace}
      </div>
    </a>
  )
}

/** Los cuatro recuentos, con los MISMOS predicados que las fichas de abajo. */
function ContratacionBanda() {
  const t = useT()
  const { data: tenders } = useTenders()
  const { data: obrasData } = useObras()
  const { data: ted } = useTendersTed()
  const { data: bdns } = useBdns()

  const contratos = tenders?.contracts ?? []
  const r = contratos.length > 0 ? resumenMenores(contratos) : null
  const adjudicados = contratos.filter((c) => isCommittedContract(c))
  const totalNeto = adjudicados
    .map((c) => c.finalAmountNoTaxes ?? c.initialAmountNoTaxes ?? 0)
    .reduce((a, b) => a + b, 0)

  const obras = obrasData?.obras ?? []
  const renove = obras.filter((o) => o.programa === 'renove').length

  const anuncios = ted?.items ?? []
  const valorados = anuncios.filter((i) => i.totalValueEur)
  const totalTed = valorados.reduce((s, i) => s + i.totalValueEur, 0)
  const mayorTed = valorados.reduce(
    (a, b) => (b.totalValueEur > (a?.totalValueEur ?? 0) ? b : a),
    null,
  )
  const cuotaMayor = totalTed > 0 && mayorTed ? mayorTed.totalValueEur / totalTed : 0
  const spanTed = yearSpan(anuncios.map((i) => i.publicationDate))

  const tarjetas = []
  if (r && r.n > 0 && adjudicados.length > 0) {
    tarjetas.push({
      href: '#menores',
      eyebrow: t('presupuesto.contra.menores'),
      cifra: num(r.n),
      nota: rellena(t('presupuesto.contra.menores.nota'), {
        adj: num(adjudicados.length),
        importe: eurM(r.importeSinIva, 2),
        pctN: pct0((r.n / adjudicados.length) * 100),
        pctImporte: totalNeto > 0 ? pct1((r.importeSinIva / totalNeto) * 100) : '—',
      }),
      enlace: t('presupuesto.contra.menores.link'),
    })
  }
  if (obras.length > 0) {
    tarjetas.push({
      href: '#obras',
      eyebrow: t('presupuesto.contra.obras'),
      cifra: num(obras.length),
      nota: rellena(t('presupuesto.contra.obras.nota'), {
        renove,
        feder: obras.length - renove,
      }),
      enlace: t('presupuesto.contra.obras.link'),
    })
  }
  if (anuncios.length > 0) {
    tarjetas.push({
      href: '#ted',
      eyebrow: t('presupuesto.contra.ted'),
      cifra: num(anuncios.length),
      nota:
        rellena(t('presupuesto.contra.ted.nota'), {
          span: spanTed ? ` ${spanTed}` : '',
          valued: num(valorados.length),
          total: eurM(totalTed, 2),
        }) +
        (cuotaMayor >= 0.25
          ? rellena(t('presupuesto.contra.ted.mayor'), { pct: pct0(cuotaMayor * 100) })
          : ''),
      enlace: t('presupuesto.contra.ted.link'),
    })
  }
  if (bdns?.stats?.granted > 0) {
    tarjetas.push({
      href: '#subvenciones',
      eyebrow: t('presupuesto.contra.bdns'),
      cifra: num(bdns.stats.granted),
      nota: rellena(t('presupuesto.contra.bdns.nota'), { total: num(bdns.stats.total) }),
      enlace: t('presupuesto.contra.bdns.link'),
    })
  }
  if (tarjetas.length === 0) return null

  return (
    <div>
      <SectionHead
        eyebrow={t('presupuesto.contra.eyebrow')}
        title={t('presupuesto.contra.title')}
        size="head"
      />
      <p
        style={{
          margin: '0 0 14px',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.55,
          color: 'var(--ink70)',
          maxWidth: '92ch',
        }}
      >
        <Marcado texto={t('presupuesto.contra.intro')} />
      </p>
      <div className="cp-presu-contra">
        {tarjetas.map((c) => (
          <TarjetaContratacion key={c.href} {...c} />
        ))}
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
    <Card id="subvenciones" style={{ scrollMarginTop: 24 }}>
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

function ObrasEnCursoSection() {
  const { data } = useObras()
  const obras = data?.obras ?? []
  if (obras.length === 0) return null
  const eur = (n) => (typeof n === 'number' ? eur0(n) : '—')
  const renove = obras.filter((o) => o.programa === 'renove')
  const feder = obras.filter((o) => o.programa !== 'renove')
  return (
    <Card id="obras" style={{ scrollMarginTop: 24 }}>
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

  const eur = eur0
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
    <Card id="menores" style={{ scrollMarginTop: 24 }}>
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

/* ------------------------------------------------------------------------ */
/* Pie: fuentes y salidas                                                      */
/* ------------------------------------------------------------------------ */

function PiePresupuesto() {
  const t = useT()
  const { data: budget } = useBudget()
  const { data: deuda } = useDeudaViva()
  if (!budget) return null
  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 18,
        display: 'flex',
        gap: 24,
        alignItems: 'baseline',
        flexWrap: 'wrap',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'var(--fs-meta)',
          lineHeight: 1.55,
          color: 'var(--ink50)',
          maxWidth: '62ch',
        }}
      >
        {t('presupuesto.pie.fuentes.a')}
        <ExtLink href={budget.source} style={{ color: 'var(--civic)' }}>
          {t('presupuesto.pie.fuentes.conprel')}
        </ExtLink>
        {t('presupuesto.pie.fuentes.b')}
        <ExtLink href={deuda?.source?.portal} style={{ color: 'var(--civic)' }}>
          {t('presupuesto.pie.fuentes.deuda')}
        </ExtLink>
        {rellena(t('presupuesto.pie.fuentes.c'), { fecha: fmtDateLong(budget.generatedAt) })}
      </p>
      <span style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 'var(--fs-aux)',
          whiteSpace: 'nowrap',
          flexWrap: 'wrap',
        }}
      >
        {/* Detrás del mismo interruptor que la registra en el router y en la
            navegación: con el flag apagado /eficiencia cae al comodín y este
            enlace dejaría al lector en la portada sin decir nada. */}
        {EFICIENCIA_ENABLED && (
          <Link to="/eficiencia" style={{ color: 'var(--civic)' }}>
            {t('presupuesto.pie.eficiencia')}
          </Link>
        )}
        <Link to="/datos" style={{ color: 'var(--civic)' }}>
          {t('presupuesto.pie.datos')}
        </Link>
        <Link to="/metodologia" style={{ color: 'var(--civic)' }}>
          {t('presupuesto.pie.metodologia')}
        </Link>
      </div>
    </div>
  )
}

export default function Presupuesto() {
  return (
    <div
      className="cp-page"
      style={{
        padding: '24px 24px 48px',
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <Cabecera />
      <CascadaCard />
      <CapitulosCard />
      <AprobadoPar />
      <ProgramasCard />
      <GastoDashboard />
      <DeudaVivaSection />
      <ContratacionBanda />
      <ContratacionMenorSection />
      <ObrasEnCursoSection />
      <div id="ted" style={{ scrollMarginTop: 24 }}>
        <TedNotices />
      </div>
      <RealSubsidies />
      <PiePresupuesto />
    </div>
  )
}

// Se exporta para que una prueba pueda comprobar que el ejecutado se pinta con
// el nombre de la magnitud y no con una palabra prestada.
export { formatEuros }
