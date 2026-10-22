import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { useBudget } from '../../hooks/useBudget'
import { useBudgetExecution } from '../../hooks/useBudgetExecution'
import { useDeudaViva } from '../../hooks/useDeudaViva'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { enBrevePresupuesto } from '../../scraper/en-breve-presupuesto'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * «En breve» de /presupuesto: cuatro preguntas de vecino y la advertencia del
 * mapa, encima de la página de siempre.
 *
 * Las cifras las deriva `scraper/en-breve-presupuesto` con las mismas funciones
 * que las secciones a las que enlaza; aquí sólo se eligen las frases. Cada
 * clave va literal en su llamada: el guard de `i18n-catalogue` lee las
 * llamadas a `rellena`, y una clave compuesta le escondería sus huecos.
 *
 * Los colores repiten los de la cascada de abajo —gris lo inicial, ámbar lo
 * añadido, petróleo lo ejecutado—, para que la misma marca signifique lo mismo
 * en las dos capas. Nada en rojo: aquí no se documenta ningún fallo.
 */

const eur0 = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
const eurM = (n) =>
  `${(n / 1e6).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M€`
const pct0 = (n) => Math.round(n).toLocaleString('es-ES')

function Barra({ children, alto = 12, etiqueta }) {
  return (
    <div
      role="img"
      aria-label={etiqueta}
      className="cp-en-breve-barra"
      style={{ height: alto, borderRadius: 'var(--r-pill)' }}
    >
      {children}
    </div>
  )
}

function Leyenda({ izquierda, derecha }) {
  return (
    <div className="cp-en-breve-leyenda" aria-hidden="true">
      <span>{izquierda}</span>
      {derecha && <span>{derecha}</span>}
    </div>
  )
}

function FiguraLimite({ limite }) {
  const t = useT()
  const pIni = (limite.inicial / limite.definitivo) * 100
  return (
    <div className="cp-en-breve-figura">
      <Barra
        etiqueta={rellena(t('presupuesto.enBreve.limite.figura'), {
          inicial: eurM(limite.inicial),
          mod: eurM(limite.modificaciones),
          definitivo: eurM(limite.definitivo),
        })}
      >
        <div
          className="cp-crece-x"
          style={{ width: `${pIni}%`, background: 'var(--ink30)', '--i': 0 }}
        />
        <div
          className="cp-crece-x"
          style={{ width: `${100 - pIni}%`, background: 'var(--warn)', '--i': 2 }}
        />
      </Barra>
      <Leyenda
        izquierda={rellena(t('presupuesto.enBreve.limite.inicial'), { x: eurM(limite.inicial) })}
        derecha={rellena(t('presupuesto.enBreve.limite.mod'), { x: eurM(limite.modificaciones) })}
      />
    </div>
  )
}

function FiguraGastado({ gastado }) {
  const t = useT()
  const avance = gastado.avanceDelAnio
  const etiqueta =
    avance != null
      ? rellena(t('presupuesto.enBreve.gastado.figura'), {
          pct: pct0(gastado.pct),
          avance: pct0(avance * 100),
        })
      : rellena(t('presupuesto.enBreve.gastado.figuraSinAvance'), { pct: pct0(gastado.pct) })
  return (
    <div className="cp-en-breve-figura">
      <Barra etiqueta={etiqueta}>
        <div
          className="cp-crece-x"
          style={{
            width: `${Math.min(100, gastado.pct)}%`,
            background: 'var(--civic)',
            borderRadius: 'inherit',
          }}
        />
        {avance != null && (
          <div
            className="cp-en-breve-marca"
            style={{ left: `calc(${avance * 100}% - 1px)` }}
            data-avance={pct0(avance * 100)}
          />
        )}
      </Barra>
      <Leyenda
        izquierda={rellena(t('presupuesto.enBreve.gastado.barra'), { pct: pct0(gastado.pct) })}
        derecha={avance != null ? `${t('presupuesto.enBreve.gastado.avance')} ▏` : null}
      />
    </div>
  )
}

function FiguraEnQue({ filas, nombre }) {
  const t = useT()
  const lista = filas.map((f) => `${nombre(f)} ${eurM(f.ejecutado)}`).join(', ')
  return (
    <div
      className="cp-en-breve-figura"
      role="img"
      aria-label={rellena(t('presupuesto.enBreve.enQue.figura'), { lista })}
      style={{ gap: 10 }}
    >
      {filas.map((f, i) => (
        <div key={f.capitulo ?? 'resto'} aria-hidden="true" title={f.label ?? undefined}>
          <div className="cp-en-breve-fila">
            <span>{nombre(f)}</span>
            <span className="mono">{eurM(f.ejecutado)}</span>
          </div>
          <div
            className="cp-en-breve-barra"
            style={{ height: 8, borderRadius: 'var(--r-pill)', marginTop: 4 }}
          >
            <div
              className="cp-crece-x"
              style={{
                width: `${f.cuota * 100}%`,
                background: f.capitulo == null ? 'var(--ink30)' : 'var(--civic)',
                borderRadius: 'inherit',
                '--i': i,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Cien ayuntamientos ordenados de menos a más deuda: huecos los que declaran
 * cero, rellenos los demás y, en petróleo pleno, el puesto de Riba-roja. Hueco
 * contra relleno, no sólo tono contra tono, para que se distingan sin color.
 */
function FiguraDeuda({ deuda }) {
  const t = useT()
  const nuestro = Math.min(99, Math.max(0, deuda.percentil))
  const puntos = Array.from({ length: 100 }, (_, i) => i)
  return (
    <div className="cp-en-breve-figura">
      <svg
        viewBox="0 0 250 40"
        width="100%"
        role="img"
        aria-label={rellena(t('presupuesto.enBreve.deuda.figura'), {
          cero: deuda.ceroDeCada100,
          p: deuda.percentil,
        })}
      >
        {puntos.map((i) => {
          const cx = 5 + (i % 25) * 10
          const cy = 5 + Math.floor(i / 25) * 10
          if (i === nuestro)
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={4.5}
                className="cp-brota"
                fill="var(--civic)"
                data-nuestro=""
                style={{ '--d': '300ms' }}
              />
            )
          return i < deuda.ceroDeCada100 ? (
            <circle key={i} cx={cx} cy={cy} r={3.2} fill="none" stroke="var(--ink50)" />
          ) : (
            <circle key={i} cx={cx} cy={cy} r={3.5} fill="var(--civic-band)" />
          )
        })}
      </svg>
      <Leyenda
        izquierda={`○ ${rellena(t('presupuesto.enBreve.deuda.sinDeuda'), { n: deuda.ceroDeCada100 })}`}
        derecha={`● ${t('presupuesto.enBreve.deuda.nosotros')}`}
      />
    </div>
  )
}

function FiguraBarrio({ n }) {
  const t = useT()
  const cuadros = Array.from({ length: 100 }, (_, i) => i)
  return (
    <svg
      viewBox="0 0 100 100"
      width="64"
      height="64"
      role="img"
      aria-label={rellena(t('presupuesto.enBreve.barrio.figura'), { n })}
      style={{ flex: 'none' }}
    >
      {cuadros.map((i) => (
        <rect
          key={i}
          x={(i % 10) * 10 + 1}
          y={Math.floor(i / 10) * 10 + 1}
          width={8}
          height={8}
          rx={1.5}
          fill={i < n ? 'var(--civic)' : 'var(--soft)'}
          stroke={i < n ? 'none' : 'var(--border)'}
          strokeWidth={0.6}
        />
      ))}
    </svg>
  )
}

export default function EnBrevePresupuesto() {
  const t = useT()
  const { data: budget } = useBudget()
  const { data: ejecucion } = useBudgetExecution()
  const { data: deudaData } = useDeudaViva()
  const { data: tenderGeo } = useTenderGeo()
  const r = enBrevePresupuesto({ budget, ejecucion, deuda: deudaData, tenderGeo })
  const ver = t('presupuesto.enBreve.ver')

  // Literales, por el guard del catálogo: una clave compuesta con el número
  // del capítulo le escondería al guard qué claves existen.
  const NOMBRES = {
    1: t('presupuesto.enBreve.cap.1'),
    2: t('presupuesto.enBreve.cap.2'),
    3: t('presupuesto.enBreve.cap.3'),
    4: t('presupuesto.enBreve.cap.4'),
    5: t('presupuesto.enBreve.cap.5'),
    6: t('presupuesto.enBreve.cap.6'),
    7: t('presupuesto.enBreve.cap.7'),
    8: t('presupuesto.enBreve.cap.8'),
    9: t('presupuesto.enBreve.cap.9'),
  }
  const nombre = (f) =>
    f.capitulo == null ? t('presupuesto.enBreve.enQue.resto') : (NOMBRES[f.capitulo] ?? f.label)
  const enFrase = (s) => s.charAt(0).toLowerCase() + s.slice(1)

  const tarjetas = []

  if (r.limite) {
    const l = r.limite
    tarjetas.push(
      <TarjetaEnBreve
        key="limite"
        id="limite"
        pregunta={rellena(t('presupuesto.enBreve.limite.pregunta'), { year: l.year })}
        cifra={eurM(l.definitivo)}
        cifraNota={
          l.porVecino != null
            ? rellena(t('presupuesto.enBreve.porVecino'), { x: eur0(l.porVecino) })
            : undefined
        }
        figura={<FiguraLimite limite={l} />}
        frases={[
          rellena(t('presupuesto.enBreve.limite.frase'), {
            inicial: eurM(l.inicial),
            mod: eurM(l.modificaciones),
          }),
        ]}
        salvedad={
          l.conprelDiscrepa != null
            ? rellena(t('presupuesto.enBreve.limite.dosFuentes'), {
                year: l.year,
                conprel: eurM(l.conprelDiscrepa),
              })
            : undefined
        }
        ancla="#cascada"
        anclaTexto={ver}
      />,
    )
  } else if (r.aprobado) {
    tarjetas.push(
      <TarjetaEnBreve
        key="aprobado"
        id="aprobado"
        pregunta={rellena(t('presupuesto.enBreve.aprobado.pregunta'), { year: r.aprobado.year })}
        cifra={eurM(r.aprobado.total)}
        frases={[t('presupuesto.enBreve.aprobado.frase')]}
        ancla="#aprobado"
        anclaTexto={ver}
      />,
    )
  }

  if (r.gastado) {
    const g = r.gastado
    const fecha = g.fecha
      ? g.avanceDelAnio === 1
        ? rellena(t('presupuesto.enBreve.gastado.fin'), { fecha: g.fecha })
        : rellena(t('presupuesto.enBreve.gastado.fecha'), { fecha: g.fecha })
      : ''
    tarjetas.push(
      <TarjetaEnBreve
        key="gastado"
        id="gastado"
        pregunta={t('presupuesto.enBreve.gastado.pregunta')}
        cifra={eurM(g.ejecutado)}
        cifraNota={rellena(t('presupuesto.enBreve.gastado.cifraNota'), { n: g.deCada100 })}
        figura={<FiguraGastado gastado={g} />}
        frases={[
          rellena(t('presupuesto.enBreve.gastado.frase'), { year: g.year, n: g.deCada100 }),
          fecha,
        ]}
        nota={t('presupuesto.enBreve.gastado.nota')}
        ancla="#cascada"
        anclaTexto={ver}
      />,
    )
  }

  if (r.enQue) {
    const q = r.enQue
    const [a, b] = q.filas.filter((f) => f.capitulo != null)
    const general = !b
      ? rellena(t('presupuesto.enBreve.enQue.uno'), { a: enFrase(nombre(a)) })
      : q.dosLaMayoria
        ? rellena(t('presupuesto.enBreve.enQue.mayoria'), {
            a: enFrase(nombre(a)),
            b: enFrase(nombre(b)),
          })
        : rellena(t('presupuesto.enBreve.enQue.primero'), {
            a: enFrase(nombre(a)),
            b: enFrase(nombre(b)),
          })
    const dom = q.dominante
    tarjetas.push(
      <TarjetaEnBreve
        key="enQue"
        id="enQue"
        pregunta={t('presupuesto.enBreve.enQue.pregunta')}
        figura={<FiguraEnQue filas={q.filas} nombre={nombre} />}
        frases={[
          general,
          dom
            ? rellena(t('presupuesto.enBreve.enQue.dominante'), {
                capitulo: enFrase(NOMBRES[dom.capitulo] ?? String(dom.capitulo)),
                definitivo: eurM(dom.definitivo),
                ejecutado: eurM(dom.ejecutado),
              })
            : '',
        ]}
        ancla="#capitulos"
        anclaTexto={ver}
      />,
    )
  }

  if (r.deuda) {
    const d = r.deuda
    const comparable = d.percentil != null && d.ceroDeCada100 != null
    tarjetas.push(
      <TarjetaEnBreve
        key="deuda"
        id="deuda"
        pregunta={t('presupuesto.enBreve.deuda.pregunta')}
        cifra={eurM(d.deudaEuros)}
        cifraNota={
          d.porVecino != null
            ? rellena(t('presupuesto.enBreve.porVecino'), { x: eur0(d.porVecino) })
            : undefined
        }
        figura={comparable ? <FiguraDeuda deuda={d} /> : undefined}
        frases={[
          comparable
            ? rellena(t('presupuesto.enBreve.deuda.comparacion'), {
                p: d.percentil,
                cero: d.ceroDeCada100,
              })
            : '',
        ]}
        nota={rellena(t('presupuesto.enBreve.deuda.frase'), { year: d.ejercicio })}
        ancla="#deuda"
        anclaTexto={ver}
      />,
    )
  }

  if (tarjetas.length === 0) return null

  const pie = r.barrio && (
    <a href="#mapa-gasto" className="cp-en-breve-barrio" data-en-breve="barrio">
      {!r.barrio.menosDeUno && <FiguraBarrio n={r.barrio.deCada100} />}
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>
        <span className="cp-en-breve-barrio-titulo">{t('presupuesto.enBreve.barrio.titulo')}</span>
        <span className="cp-en-breve-barrio-frase">
          {r.barrio.menosDeUno
            ? t('presupuesto.enBreve.barrio.menosDeUno')
            : rellena(t('presupuesto.enBreve.barrio.frase'), { n: r.barrio.deCada100 })}
        </span>
      </span>
      <span className="cp-en-breve-barrio-enlace">{t('presupuesto.enBreve.barrio.enlace')}</span>
    </a>
  )

  return (
    <EnBreve
      titulo={t('presupuesto.enBreve.titulo')}
      intro={t('presupuesto.enBreve.intro')}
      saltarA="#todos-los-datos"
      saltarTexto={t('presupuesto.enBreve.saltar')}
      pie={pie}
    >
      {tarjetas}
    </EnBreve>
  )
}
