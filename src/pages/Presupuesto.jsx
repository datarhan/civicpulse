import { Link, Navigate, useLocation } from 'react-router-dom'
import { Card, ExtLink, Marcado, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useBudget } from '../hooks/useBudget'
import {
  contrastarPresupuesto,
  desequilibrioDeConprel,
  TOLERANCIA_EQUILIBRIO,
} from '../scraper/budget-contraste'
import { esCierre, periodoDelAnio } from '../scraper/budget-execution'
import { useBudgetExecution } from '../hooks/useBudgetExecution'
import { useDeudaViva } from '../hooks/useDeudaViva'
import {
  cascadaGastos,
  lecturaCapitulos,
  capituloDominante,
  ceroDelDominante,
  tendenciaDeuda,
  capitulosACero,
  capitulosSinDato,
} from '../scraper/presupuesto-lectura'
import { entero, euros, eurosBreves, fmtDateLong, rellena } from '../lib/formatters'
import { titularDeuda } from '../lib/deuda-titular'
import { EFICIENCIA_ENABLED } from '../flags'
import { useLocale, useT } from '../i18n'
import EnBrevePresupuesto from '../components/Presupuesto/EnBrevePresupuesto'
import DivisorLecturas from '../components/DivisorLecturas'
import { SeccionExperta } from '../components/Lecturas'
import { IndiceExperta } from '../components/IndiceSecciones'
import { destinoEnContratos } from '../scraper/ruta-de-contratos'

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
 * «enteros a /datos», que es un catálogo y no los aloja: viven en /contratos,
 * bajo sus cuatro tarjetas-resumen, porque borrarlos sería retirar del sitio el
 * listado de menores por encima del techo del art. 118.
 */

const pct1 = (n) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct0 = (n) => Math.round(n).toLocaleString('es-ES')
const num = (n) => Number(n).toLocaleString('es-ES')

/**
 * «6, 7 y 8», no «6, 7, 8». Una lista de prosa lleva conjunción; sin ella la
 * frase se lee como una tabla. En valencià la conjunción cambia ante sonido
 * vocálico, así que se toma del catálogo en vez de escribirla aquí.
 */
function listaProsa(partes, y) {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} ${y} ${partes[partes.length - 1]}`
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
function ChapterRow({ label, amount, total, escala, nota }) {
  // Sin total en la fuente no hay porcentaje que dar: la barra se mide contra
  // el capítulo mayor (`escala`) y la columna dice «—», no «0,0 %».
  const pct = total > 0 ? (amount / total) * 100 : null
  const ancho = pct ?? (escala > 0 ? (amount / escala) * 100 : 0)
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
          {euros(amount)}
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
          {pct === null ? '—' : `${pct1(pct)} %`}
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
        <div style={{ width: ancho + '%', height: '100%', background: 'var(--civic)' }} />
      </div>
    </div>
  )
}

/**
 * Lo que CONPREL no trae, dicho junto a las barras que faltan por eso.
 *
 * Un importe null (celda vacía o ilegible en la fuente; `budget.ts`) no tiene
 * barra, y sin esta frase el lector no distinguiría un capítulo que falta de
 * uno que no existe. Tampoco puede ir en la lista de «aprobado a 0 €»: eso
 * afirmaría la cifra que no tenemos. `sinTotal` es la frase, ya traducida,
 * para cuando falta el total y las barras se miden entre sí.
 */
function NotaSinDato({ marca, capitulos, sinTotal }) {
  const t = useT()
  if (capitulos.length === 0 && !sinTotal) return null
  return (
    <p
      data-sin-dato={marca}
      style={{
        margin: '12px 0 0',
        fontSize: 'var(--fs-micro)',
        lineHeight: 1.5,
        color: 'var(--ink50)',
      }}
    >
      {capitulos.length === 1 &&
        rellena(t('presupuesto.econ.sinDato'), {
          code: capitulos[0].code,
          label: capitulos[0].label.toLowerCase(),
        })}
      {capitulos.length > 1 &&
        rellena(t('presupuesto.econ.sinDatoVarios'), {
          lista: listaProsa(
            capitulos.map((c) => `${c.code} (${c.label.toLowerCase()})`),
            t('presupuesto.econ.cero.y'),
          ),
        })}
      {capitulos.length > 0 && sinTotal ? ' ' : ''}
      {sinTotal}
    </p>
  )
}

/* ------------------------------------------------------------------------ */
/* Cabecera: el lede derivado y las dos fuentes                                */
/* ------------------------------------------------------------------------ */

function Cabecera() {
  const { locale, t } = useLocale()
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
  // `totalExpense` es null cuando CONPREL no trae el total: no hay gasto por
  // habitante que publicar, y un «0 € por habitante» lo inventaría.
  const hayTotal = typeof s.totalExpense === 'number'
  const perCapita = hayTotal && s.population > 0 ? s.totalExpense / s.population : null
  const exec = execData?.latest
  // The two sources disagree about the APPROVED budget itself, not merely
  // about approved-vs-spent: CONPREL publishes 41.578.252,26 € for 2025 while
  // the town's own execution statement opens at 37.599.838,15 €. Neither is
  // averaged, chosen or quietly preferred — each is attributed and the gap is
  // named, because inventing the bridge between two public sources would be a
  // worse defect than the ambiguity. `contrastarPresupuesto` gates on the
  // years matching: comparing a CONPREL year against an execution statement
  // from a different exercise would manufacture a discrepancy that does not
  // exist. So it is fed the execution of CONPREL's OWN year (`periodoDelAnio`),
  // not `latest`, which can be a newer year's quarter.
  const contraste = contrastarPresupuesto(s, periodoDelAnio(execData, s.year))
  const dosFuentes =
    contraste && Math.abs(contraste.diferenciaGastos) >= TOLERANCIA_EQUILIBRIO ? contraste : null
  // El lede habla de la ejecución cuando es la del MISMO ejercicio que CONPREL
  // o una MÁS NUEVA: en octubre de 2026 el Ministerio aún da el aprobado de
  // 2025 y el Ayuntamiento ya ha publicado el primer trimestre de 2026, y la
  // página va por el año más nuevo, con su año en el titular. Una ejecución más
  // VIEJA que CONPREL no gobierna: el lede describe lo aprobado y la cascada,
  // más abajo, lleva su propio año en el rótulo.
  const mismoAnio = exec && exec.year === s.year
  const masNuevo = exec && exec.year > s.year
  const cascada = mismoAnio || masNuevo ? cascadaGastos(exec.gastos?.total) : null
  const dominante =
    mismoAnio || masNuevo ? capituloDominante(exec.gastos?.chapters, exec.gastos?.total) : null
  // Un año sin cerrar se cuenta en presente: «lleva ejecutados», no «ejecutó».
  const enCurso = !!exec?.fechaListado && !esCierre(exec)
  const anio = masNuevo ? exec.year : s.year

  let lede
  if (cascada && cascada.cuadra) {
    lede = enCurso
      ? rellena(t('presupuesto.lede.enCurso'), {
          year: exec.year,
          inicial: eurosBreves(cascada.inicial),
          mod: eurosBreves(cascada.modificaciones),
          pct: pct0(cascada.ampliacionPct),
          ejecutado: eurosBreves(cascada.ejecutado),
          fecha: exec.fechaListado,
        })
      : rellena(t('presupuesto.lede'), {
          inicial: eurosBreves(cascada.inicial),
          mod: eurosBreves(cascada.modificaciones),
          pct: pct0(cascada.ampliacionPct),
          ejecutado: eurosBreves(cascada.ejecutado),
        })
    if (dominante) {
      // El cero del capítulo es de UNA de las dos fuentes que publica la
      // página, y el lede lo decía plano: «un capítulo que había empezado en
      // cero» se lee como 22 M€ de inversión sin presupuestar en enero, y
      // CONPREL le daba 905.517 € (revisión lectora, 18-10-2026). Misma
      // lectura que el pie de «Capítulo a capítulo», de la misma función, para
      // que no vuelvan a decir cosas distintas. Las claves van literales en la
      // llamada por el guard de `i18n-catalogue` (lo explica el pie).
      const cero = ceroDelDominante(dominante, s, exec.year)
      lede += rellena(
        t(
          enCurso
            ? !cero
              ? 'presupuesto.lede.dominante.enCurso'
              : cero.estado === 'discrepan'
                ? 'presupuesto.lede.dominanteCeroDiscrepan.enCurso'
                : cero.estado === 'sinConprel'
                  ? 'presupuesto.lede.dominanteCeroSinConprel.enCurso'
                  : cero.estado === 'sinContraste'
                    ? 'presupuesto.lede.dominanteCeroSinContraste.enCurso'
                    : 'presupuesto.lede.dominanteCero.enCurso'
            : !cero
              ? 'presupuesto.lede.dominante'
              : cero.estado === 'discrepan'
                ? 'presupuesto.lede.dominanteCeroDiscrepan'
                : cero.estado === 'sinConprel'
                  ? 'presupuesto.lede.dominanteCeroSinConprel'
                  : cero.estado === 'sinContraste'
                    ? 'presupuesto.lede.dominanteCeroSinContraste'
                    : 'presupuesto.lede.dominanteCero',
        ),
        {
          cuota: pct0(dominante.cuotaAmpliacion * 100),
          capitulo: dominante.rotulo.toLowerCase(),
          // Al euro, como en el pie: remite a la tarjeta de CONPREL de más
          // abajo, que lo publica así.
          conprel: euros(cero?.conprel ?? 0),
        },
      )
    }
    // Con la ejecución por delante de CONPREL, lo que sigue en la página del
    // Ministerio es de otro año: se dice aquí, y cada tarjeta lleva el suyo.
    if (masNuevo) lede += rellena(t('presupuesto.lede.conprelAnterior'), { year: s.year })
  } else {
    // Dos ausencias distintas, dos frases distintas: que el listado municipal
    // no esté publicado para este ejercicio, y que esté publicado pero no
    // cuadre consigo mismo. La segunda es el estado para el que existe
    // `cuadra`, y decirle al lector que la cifra «aparecerá en cuanto se
    // publique» sería falso justo ahí.
    lede = rellena(
      t(
        cascada
          ? hayTotal
            ? 'presupuesto.lede.sinCuadre'
            : 'presupuesto.lede.sinCuadre.sinTotal'
          : hayTotal
            ? 'presupuesto.lede.soloAprobado'
            : 'presupuesto.lede.soloAprobado.sinTotal',
      ),
      { year: s.year, gastos: hayTotal ? eurosBreves(s.totalExpense) : '' },
    )
  }

  return (
    <div className={dosFuentes ? 'cp-presu-hero' : undefined}>
      <div>
        <Eyebrow>
          {rellena(
            t(
              !cascada
                ? 'presupuesto.eyebrow.aprobado'
                : enCurso
                  ? 'presupuesto.eyebrow.enCurso'
                  : 'presupuesto.eyebrow',
            ),
            { year: anio },
          )}
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
          {rellena(t('presupuesto.title'), { year: anio })}
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
          data-lede="presupuesto"
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
            {rellena(t(perCapita !== null ? 'presupuesto.meta' : 'presupuesto.meta.sinTotal'), {
              year: s.year,
              gastos: hayTotal ? eurosBreves(s.totalExpense) : '',
              porHab: perCapita !== null ? euros(perCapita) : '',
              hab: s.population > 0 ? num(s.population) : '—',
              fecha: fmtDateLong(data.generatedAt, locale),
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
                  {euros(v)}
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
  const enCurso = !!p.fechaListado && !esCierre(p)

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
          !c.cuadra
            ? t('presupuesto.cascada.title.sinCuadre')
            : enCurso
              ? rellena(t('presupuesto.cascada.title.enCurso'), { pct: pct0(c.ampliacionPct) })
              : rellena(t('presupuesto.cascada.title'), { pct: pct0(c.ampliacionPct) })
        }
      />
      <div
        className="cp-presu-filas"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}
      >
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
              {euros(f.v)}
            </div>
          </div>
        ))}
      </div>

      {!c.cuadra && (
        <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--warn-ink)' }}>
          {rellena(t('presupuesto.cascada.noCuadra'), {
            suma: euros(c.inicial + c.modificaciones),
          })}
        </p>
      )}

      {c.cuadra && (
        <div className="cp-presu-duo" style={{ marginTop: 18 }}>
          {c.modificaciones > 0 && (
            <Aviso tone="warn">
              <Marcado
                texto={
                  enCurso
                    ? rellena(t('presupuesto.callout.denominador.enCurso'), {
                        pctDef: pct1(c.ejecutadoSobreDefinitivoPct),
                        pctIni: pct1(c.ejecutadoSobreInicialPct),
                      })
                    : rellena(t('presupuesto.callout.denominador'), {
                        pctDef: pct1(c.ejecutadoSobreDefinitivoPct),
                        pctIni: pct1(c.ejecutadoSobreInicialPct),
                      })
                }
              />
            </Aviso>
          )}
          {/* La asimetría es el dato de un año CERRADO. A mitad de año, gastos e
              ingresos no se reconocen al mismo ritmo, y decir que su diferencia
              «es el dato» sería sacar una conclusión que el corte no sostiene:
              las dos cifras siguen en la cascada, sin el comentario. */}
          {!enCurso && pctIng != null && ingresos.ejecutado !== c.ejecutado && (
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
                    ingEj: eurosBreves(ingresos.ejecutado),
                    pctGas: pct1(c.ejecutadoSobreDefinitivoPct),
                    gasEj: eurosBreves(c.ejecutado),
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

/** Qué parte del definitivo ocupa un tramo, dentro del envoltorio de la barra. */
function pctDentro(parte, definitivo) {
  return definitivo > 0 ? (parte / definitivo) * 100 : 0
}

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
  const { data: aprobado } = useBudget()
  const p = data?.latest
  const total = p?.gastos?.total
  const filas = lecturaCapitulos(p?.gastos?.chapters, total)
  if (!p || filas.length === 0 || !(total?.actual > 0)) return null
  const enCurso = !!p.fechaListado && !esCierre(p)
  const dominante = capituloDominante(p.gastos.chapters, total)
  const capMax = Math.max(...filas.map((f) => f.definitivo), 1)
  // Qué dice de ese mismo capítulo la OTRA fuente: `ceroDelDominante`, la
  // misma lectura que el lede. Se lee el capítulo del snapshot, no de
  // `contrastarPresupuesto`: ésta calla entera cuando a CONPREL le falta el
  // total de gastos, y el pie caía entonces en «no estaba en ninguno de los
  // dos» con la cifra del capítulo a la vista. Si los ejercicios no casan el
  // estado es `sinContraste`, no `coinciden`: con un solo presupuesto de ese
  // año a la vista, «ninguno de los dos» afirmaba algo de uno que la página no
  // había cotejado.
  const cero = ceroDelDominante(dominante, aprobado?.snapshot, p.year)

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
    <Card id="capitulos" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={rellena(t('presupuesto.cap.eyebrow'), { year: p.year })}
        title={t('presupuesto.cap.title')}
        right={
          // Sin `flexShrink: 0`. La fila de SectionHead manda la leyenda a su
          // propia línea cuando no cabe junto al título, y sólo las junta cuando
          // caben las dos enteras, así que junto al título nunca encoge. Sola en
          // su línea, si ni así cabe, tiene que poder encoger para que sus tres
          // rótulos envuelvan: a 320 px pedía 282 px en una fila de 230 y la
          // página entera medía 327. Entre líneas, 6 px: los 16 son para
          // separar un rótulo de otro, no una línea de la siguiente.
          <div
            data-leyenda="capitulos"
            style={{
              display: 'flex',
              gap: '6px 16px',
              flexWrap: 'wrap',
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
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
      <div
        className="cp-presu-filas"
        style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 8 }}
      >
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
                {/* El crédito definitivo es UNA barra con dos tramos dentro, y
                    el redondeo vive en el envoltorio que los recorta.

                    Redondeando cada tramo por su cuenta salían dos píldoras con
                    una muesca en medio —la ampliación parecía una barra suelta
                    al lado del crédito, no su continuación—. Y redondear sólo el
                    extremo de fuera de cada uno tampoco valía: el capítulo 4
                    amplía 13.258 € sobre una escala de 22 M€, o sea un tercio de
                    píxel, así que su tramo ámbar es invisible y dejaba al gris
                    con el canto derecho en cuadrado y sin nada que lo rematara.
                    Con el envoltorio, el remate no depende de que el último
                    tramo llegue a verse.

                    Dentro, los dos tramos se miden contra el DEFINITIVO y el
                    segundo va con `right: 0`, así que embaldosan el envoltorio
                    exactamente: no hay anchura que redondear mal ni hueco que
                    dejar. */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${(f.definitivo / capMax) * 100}%`,
                    borderRadius: 'var(--r-input)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    data-barra-ini={f.capitulo}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${pctDentro(f.inicial, f.definitivo)}%`,
                      background: 'var(--ink30)',
                    }}
                  />
                  <div
                    data-barra-amp={f.capitulo}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${pctDentro(f.inicial, f.definitivo)}%`,
                      right: 0,
                      background: 'var(--warn)',
                      opacity: 0.35,
                    }}
                  />
                </div>
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
                {euros(f.ejecutado)}
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
        data-pie="capitulos"
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
              // Tres frases, y la del medio es la que faltaba. «Ese crédito no
              // estaba en el presupuesto que se aprobó» está bien dicho de un
              // ayuntamiento con UN presupuesto aprobado, y esta página publica
              // dos: el estado de ejecución del propio ayuntamiento abre
              // Inversiones reales en 0 € y el remitido a CONPREL le da
              // 905.517,35 €. La frase elegía una de las dos sin decirlo, y
              // elegía justo en el capítulo donde más discrepan — mientras la
              // tarjeta de más abajo se titula «Dos fuentes, dos presupuestos
              // aprobados» y promete que cada cifra dice de cuál viene.
              //
              // Derivado, no escrito: el día que las dos coincidan en ese
              // capítulo, la frase vuelve sola a la simple. Y la clave se
              // nombra AQUÍ, en la misma llamada que rellena sus huecos, no en
              // una variable: el guard de `i18n-catalogue` lee el objeto pegado
              // al literal, y con la clave escondida en un ayudante se pone
              // rojo, que es lo que tiene que hacer un guard que no puede mirar.
              t(
                enCurso
                  ? !dominante.abrioEnCero
                    ? 'presupuesto.cap.pie.dominante.enCurso'
                    : cero.estado === 'discrepan'
                      ? 'presupuesto.cap.pie.ceroDiscrepan.enCurso'
                      : cero.estado === 'sinConprel'
                        ? 'presupuesto.cap.pie.ceroSinConprel.enCurso'
                        : cero.estado === 'sinContraste'
                          ? 'presupuesto.cap.pie.ceroSinContraste.enCurso'
                          : 'presupuesto.cap.pie.cero.enCurso'
                  : !dominante.abrioEnCero
                    ? 'presupuesto.cap.pie.dominante'
                    : cero.estado === 'discrepan'
                      ? 'presupuesto.cap.pie.ceroDiscrepan'
                      : cero.estado === 'sinConprel'
                        ? 'presupuesto.cap.pie.ceroSinConprel'
                        : cero.estado === 'sinContraste'
                          ? 'presupuesto.cap.pie.ceroSinContraste'
                          : 'presupuesto.cap.pie.cero',
              ),
              {
                capitulo: dominante.rotulo,
                definitivo: eurosBreves(dominante.definitivo),
                inicial: eurosBreves(dominante.definitivo - dominante.modificaciones),
                cuota: pct0(dominante.cuotaAmpliacion * 100),
                pct: pct1(dominante.pctEjecutado),
                // Al euro, no en millones como el resto de la frase: esta cifra
                // es una REMISIÓN a la tarjeta de CONPREL que hay dos pantallas
                // más abajo, donde ese capítulo aparece como «905.517 €». La
                // frase existe para que el lector lo compruebe allí, y un
                // «0,91 M€» le pone una conversión por delante.
                conprel: euros(cero?.conprel ?? 0),
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
  if (loading || error || !data) return null
  const s = data.snapshot
  // De CONPREL solo, sin la ejecución: este aviso habla de sus ingresos frente
  // a sus gastos. Se sacaba del cotejo con el listado municipal, y cuando el
  // periodo más nuevo fue de otro año el cotejo dio null y el aviso dejó de
  // salir (`desequilibrioDeConprel`).
  const d = desequilibrioDeConprel(s)
  const desequilibrio = d !== null && Math.abs(d) >= TOLERANCIA_EQUILIBRIO ? d : null
  const aCero = capitulosACero(s.expenseByEconomicChapter)
  // Lo que CONPREL no trae (null en el snapshot) no es un capítulo a cero: se
  // dice aparte, con su propia frase, y nunca entra en la lista de «a 0 €».
  const sinDato = capitulosSinDato(s.expenseByEconomicChapter)
  const sinDatoIng = capitulosSinDato(s.revenueByEconomicChapter)
  const escala = (caps) => Math.max(0, ...caps.map((c) => c.amount ?? 0))
  // Los ingresos también tienen capítulos a cero —enajenación de inversiones y
  // transferencias de capital, en 2025— y se caían del filtro `amount > 0` sin
  // que nadie lo dijera, mientras la tarjeta de al lado sí lo decía de los
  // suyos. La misma ausencia se publica igual en las dos.
  const aCeroIng = capitulosACero(s.revenueByEconomicChapter)

  return (
    <div id="aprobado" className="cp-presu-duo" style={{ scrollMarginTop: 24 }}>
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
                escala={escala(s.expenseByEconomicChapter)}
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
                  lista: listaProsa(
                    aCero.map((c) => `${c.code} (${c.label.toLowerCase()})`),
                    t('presupuesto.econ.cero.y'),
                  ),
                })}
          </p>
        )}
        <NotaSinDato
          marca="gastos"
          capitulos={sinDato}
          sinTotal={s.totalExpense === null ? t('presupuesto.econ.sinTotal') : null}
        />
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
                escala={escala(s.revenueByEconomicChapter)}
              />
            ))}
        </div>
        {aCeroIng.length > 0 && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-micro)',
              lineHeight: 1.5,
              color: 'var(--ink50)',
            }}
          >
            {aCeroIng.length === 1
              ? rellena(t('presupuesto.econ.cero'), {
                  code: aCeroIng[0].code,
                  label: aCeroIng[0].label.toLowerCase(),
                })
              : rellena(t('presupuesto.econ.ceroVarios'), {
                  lista: listaProsa(
                    aCeroIng.map((c) => `${c.code} (${c.label.toLowerCase()})`),
                    t('presupuesto.econ.cero.y'),
                  ),
                })}
          </p>
        )}
        <NotaSinDato
          marca="ingresos"
          capitulos={sinDatoIng}
          sinTotal={s.totalRevenue === null ? t('presupuesto.ing.sinTotal') : null}
        />
        {desequilibrio !== null && (
          <div style={{ marginTop: 12 }}>
            <Aviso tone="warn" id="descuadre">
              <Marcado
                texto={rellena(t('presupuesto.descuadre'), {
                  ingresos: euros(s.totalRevenue),
                  gastos: euros(s.totalExpense),
                  dif: euros(Math.abs(desequilibrio)),
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
  // Igual que en los capítulos: sin total no hay porcentaje, y un área sin
  // importe en CONPREL se dice, no se pinta a cero ni se calla.
  const hayTotal = s.totalExpense > 0
  const mayor = programas[0].amount
  const sinDatoProg = capitulosSinDato(s.expenseByProgram)

  return (
    <Card>
      <SectionHead
        eyebrow={rellena(t('presupuesto.prog.eyebrow'), { year: s.year })}
        title={
          hayTotal
            ? rellena(t('presupuesto.prog.title'), { total: eurosBreves(s.totalExpense) })
            : t('presupuesto.prog.title.sinTotal')
        }
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
      <div
        className="cp-presu-filas"
        style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 8 }}
      >
        {programas.map((g) => {
          const pct = hayTotal ? (g.amount / s.totalExpense) * 100 : null
          const ancho = pct ?? (g.amount / mayor) * 100
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
                <div style={{ height: '100%', width: `${ancho}%`, background: 'var(--civic)' }} />
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
                {euros(g.amount)}
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
                {pct === null ? '—' : `${pct1(pct)} %`}
              </div>
            </div>
          )
        })}
      </div>
      {sinDatoProg.length > 0 && (
        <p
          data-sin-dato="programas"
          style={{
            margin: '12px 0 0',
            fontSize: 'var(--fs-micro)',
            lineHeight: 1.5,
            color: 'var(--ink50)',
          }}
        >
          {rellena(t('presupuesto.prog.sinDato'), {
            lista: listaProsa(
              sinDatoProg.map((g) => `«${g.label}»`),
              t('presupuesto.econ.cero.y'),
            ),
          })}
        </p>
      )}
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
            importe: eurosBreves(deudaPrograma.amount),
            deuda: eurosBreves(ultimoDeuda.deudaEuros),
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
 * Distinto del programa «Deuda pública» del presupuesto: aquél es el dinero
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
  // Con el importe sin dato en CONPREL la remisión se calla: «0,00 M€» sería
  // una cifra que la fuente no da.
  const programaDeuda = (budget?.snapshot?.expenseByProgram ?? []).find(
    (g) => g.label.toLowerCase() === 'deuda pública' && typeof g.amount === 'number',
  )
  const reparto = data?.ultimo?.reparto
  const percentil = data?.ultimo?.percentil

  return (
    <Card id="deuda" className="cp-presu-deuda-marco" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={t('presupuesto.deuda.eyebrow')}
        title={titularDeuda(tendencia, t)}
        right={
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.02em' }}
            >
              {euros(ultimo.deudaEuros)}
            </div>
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
              {rellena(t('presupuesto.deuda.saldo'), { year: ultimo.ejercicio })}
            </div>
          </div>
        }
      />
      <div className="cp-presu-deuda" style={{ marginTop: 8 }}>
        <div>
          <div
            className="cp-presu-filas"
            style={{ display: 'flex', flexDirection: 'column', gap: 7 }}
          >
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
                  {euros(p.deudaEuros)}
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
                    : `${p.delta > 0 ? '+' : p.delta < 0 ? '−' : ''}${entero(Math.round(Math.abs(p.delta)))}`}
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
              delta: `${delta > 0 ? '+' : ''}${euros(delta)}`,
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
                        x: eurosBreves(programaDeuda.amount),
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
                  mediana: euros(reparto.mediana ?? 0),
                  p90: eurosBreves(reparto.p90),
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
/* Pie: fuentes y salidas                                                      */
/* ------------------------------------------------------------------------ */

function PiePresupuesto() {
  const { locale, t } = useLocale()
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
        {rellena(t('presupuesto.pie.fuentes.c'), {
          fecha: fmtDateLong(budget.generatedAt, locale),
        })}
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
        <Link to="/metodologia#grupo-datos" style={{ color: 'var(--civic)' }}>
          {t('presupuesto.pie.metodologia')}
        </Link>
      </div>
    </div>
  )
}

/**
 * Dónde están los contratos. Vivieron aquí hasta el 1-11-2026, y quien baja por
 * la página los sigue buscando debajo de la deuda.
 */
function PuenteContratos() {
  const t = useT()
  return (
    <p
      data-puente-contratos=""
      style={{
        margin: 0,
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.55,
        color: 'var(--ink70)',
        maxWidth: '92ch',
      }}
    >
      {t('presupuesto.puente.contratos')}{' '}
      <Link to="/contratos" style={{ color: 'var(--civic)' }}>
        {t('presupuesto.puente.contratos.enlace')}
      </Link>
    </p>
  )
}

export default function Presupuesto() {
  const t = useT()
  const { search, hash } = useLocation()
  const destino = destinoEnContratos(search, hash)
  if (destino) return <Navigate to={destino} replace />
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
      {/* La primera capa, para quien llega con una pregunta y no con el
          vocabulario de la Intervención. Resume y enlaza; no sustituye a nada
          de lo que va debajo. */}
      <EnBrevePresupuesto />
      {/* Las dos lecturas (auditoría de las dos lecturas, §5): arriba, «En
          breve»; debajo del divisor, todo lo de siempre, partido en secciones
          que «Ver: lo esencial» pliega hasta su título (components/Lecturas.jsx).
          «Saltar a todos los datos» aterriza en el divisor, que es donde
          empiezan. El pie, con las fuentes, se queda a la vista. */}
      <div id="todos-los-datos" style={{ scrollMarginTop: 24 }}>
        <DivisorLecturas />
      </div>
      <IndiceExperta />
      <SeccionExperta id="presupuesto-cascada" titulo={t('presupuesto.cascada.title.sinCuadre')}>
        <CascadaCard />
      </SeccionExperta>
      <SeccionExperta id="presupuesto-capitulos" titulo={t('presupuesto.cap.title')}>
        <CapitulosCard />
      </SeccionExperta>
      <SeccionExperta id="presupuesto-aprobado" titulo={t('presupuesto.seccion.aprobado')}>
        <AprobadoPar />
      </SeccionExperta>
      <SeccionExperta id="presupuesto-programas" titulo={t('presupuesto.prog.title.sinTotal')}>
        <ProgramasCard />
      </SeccionExperta>
      <SeccionExperta id="presupuesto-deuda" titulo={t('presupuesto.seccion.deuda')}>
        <DeudaVivaSection />
      </SeccionExperta>
      <PuenteContratos />
      <PiePresupuesto />
    </div>
  )
}
