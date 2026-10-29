import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import BarrioPicker from './BarrioPicker'
import { Barra, FiguraBarrio, FiguraGastado, Leyenda } from './FigurasEnBreve'
import { useBudget } from '../../hooks/useBudget'
import { useBudgetExecution } from '../../hooks/useBudgetExecution'
import { useDeudaViva } from '../../hooks/useDeudaViva'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { enBrevePresupuesto } from '../../scraper/en-breve-presupuesto'
import { euros, eurosBreves, rellena } from '../../lib/formatters'
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

function FiguraLimite({ limite }) {
  const t = useT()
  const pIni = (limite.inicial / limite.definitivo) * 100
  return (
    <div className="cp-en-breve-figura">
      <Barra
        etiqueta={rellena(t('presupuesto.enBreve.limite.figura'), {
          inicial: eurosBreves(limite.inicial),
          mod: eurosBreves(limite.modificaciones),
          definitivo: eurosBreves(limite.definitivo),
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
        izquierda={rellena(t('presupuesto.enBreve.limite.inicial'), {
          x: eurosBreves(limite.inicial),
        })}
        derecha={rellena(t('presupuesto.enBreve.limite.mod'), {
          x: eurosBreves(limite.modificaciones),
        })}
      />
    </div>
  )
}

function FiguraEnQue({ filas, nombre }) {
  const t = useT()
  const lista = filas.map((f) => `${nombre(f)} ${eurosBreves(f.ejecutado)}`).join(', ')
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
            <span className="mono">{eurosBreves(f.ejecutado)}</span>
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
        pregunta={
          l.enCurso
            ? rellena(t('presupuesto.enBreve.limite.pregunta.enCurso'), { year: l.year })
            : rellena(t('presupuesto.enBreve.limite.pregunta'), { year: l.year })
        }
        cifra={eurosBreves(l.definitivo)}
        cifraNota={
          l.porVecino != null
            ? rellena(t('presupuesto.enBreve.porVecino'), { x: euros(l.porVecino) })
            : undefined
        }
        figura={<FiguraLimite limite={l} />}
        frases={[
          l.enCurso
            ? rellena(t('presupuesto.enBreve.limite.frase.enCurso'), {
                inicial: eurosBreves(l.inicial),
                mod: eurosBreves(l.modificaciones),
              })
            : rellena(t('presupuesto.enBreve.limite.frase'), {
                inicial: eurosBreves(l.inicial),
                mod: eurosBreves(l.modificaciones),
              }),
        ]}
        salvedad={
          l.conprelDiscrepa != null
            ? rellena(t('presupuesto.enBreve.limite.dosFuentes'), {
                year: l.year,
                conprel: eurosBreves(l.conprelDiscrepa),
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
        cifra={eurosBreves(r.aprobado.total)}
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
        : g.enCurso
          ? rellena(t('presupuesto.enBreve.gastado.fecha.enCurso'), { fecha: g.fecha })
          : rellena(t('presupuesto.enBreve.gastado.fecha'), { fecha: g.fecha })
      : ''
    tarjetas.push(
      <TarjetaEnBreve
        key="gastado"
        id="gastado"
        pregunta={t('presupuesto.enBreve.gastado.pregunta')}
        cifra={eurosBreves(g.ejecutado)}
        cifraNota={rellena(t('presupuesto.enBreve.gastado.cifraNota'), { n: g.deCada100 })}
        figura={<FiguraGastado gastado={g} />}
        frases={[
          g.enCurso
            ? rellena(t('presupuesto.enBreve.gastado.frase.enCurso'), {
                year: g.year,
                n: g.deCada100,
              })
            : rellena(t('presupuesto.enBreve.gastado.frase'), { year: g.year, n: g.deCada100 }),
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
    // El tiempo verbal es el del gasto: «ha ido» mientras el año no ha cerrado.
    const enCurso = !!r.gastado?.enCurso
    const general = !b
      ? enCurso
        ? rellena(t('presupuesto.enBreve.enQue.uno.enCurso'), { a: enFrase(nombre(a)) })
        : rellena(t('presupuesto.enBreve.enQue.uno'), { a: enFrase(nombre(a)) })
      : q.dosLaMayoria
        ? enCurso
          ? rellena(t('presupuesto.enBreve.enQue.mayoria.enCurso'), {
              a: enFrase(nombre(a)),
              b: enFrase(nombre(b)),
            })
          : rellena(t('presupuesto.enBreve.enQue.mayoria'), {
              a: enFrase(nombre(a)),
              b: enFrase(nombre(b)),
            })
        : enCurso
          ? rellena(t('presupuesto.enBreve.enQue.primero.enCurso'), {
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
          !dom
            ? ''
            : enCurso
              ? rellena(t('presupuesto.enBreve.enQue.dominante.enCurso'), {
                  capitulo: enFrase(NOMBRES[dom.capitulo] ?? String(dom.capitulo)),
                  definitivo: eurosBreves(dom.definitivo),
                  ejecutado: eurosBreves(dom.ejecutado),
                })
              : rellena(t('presupuesto.enBreve.enQue.dominante'), {
                  capitulo: enFrase(NOMBRES[dom.capitulo] ?? String(dom.capitulo)),
                  definitivo: eurosBreves(dom.definitivo),
                  ejecutado: eurosBreves(dom.ejecutado),
                }),
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
        cifra={eurosBreves(d.deudaEuros)}
        cifraNota={
          d.porVecino != null
            ? rellena(t('presupuesto.enBreve.porVecino'), { x: euros(d.porVecino) })
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

  const zonas = (tenderGeo?.zones ?? []).filter((z) => z.slug && z.name)
  const pie = r.barrio && zonas.length > 0 && (
    <BarrioPicker
      cobertura={r.barrio}
      zonas={zonas}
      figura={!r.barrio.menosDeUno ? <FiguraBarrio n={r.barrio.deCada100} /> : null}
    />
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
