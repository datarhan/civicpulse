import EnBreve, { TarjetaEnBreve } from '../../../components/EnBreve'
import BarrioPicker from '../../../components/Presupuesto/BarrioPicker'
import { porcentajeDelMapa } from '../../../components/LiveCity/controls/MoneyCoverage'
import {
  FiguraBarrio,
  FiguraGastado,
  eur0,
  eurM,
} from '../../../components/Presupuesto/FigurasEnBreve'
import { useOfficials } from '../../../hooks/useOfficials'
import { useBudget } from '../../../hooks/useBudget'
import { useBudgetExecution } from '../../../hooks/useBudgetExecution'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { usePlenos } from '../../../hooks/usePlenos'
import { usePlenoAgendas } from '../../../hooks/usePlenoAgendas'
import { usePlenoVotes } from '../../../hooks/usePlenoVotes'
import { enBrevePresupuesto } from '../../../scraper/en-breve-presupuesto'
import { enBrevePortada } from '../../../scraper/en-breve-portada'
import { summarizeSessions } from '../../../lib/pleno-summary.js'
import { fmtDateLong, rellena } from '../../../lib/formatters'
import { useLocale } from '../../../i18n'

/*
 * «Tu ayuntamiento en 30 segundos»: la primera capa de la portada, encima de
 * todo lo demás de la columna (auditoría de las dos lecturas, 25-10-2026).
 *
 * Las respuestas las deriva `scraper/en-breve-portada` con las funciones de las
 * páginas a las que enlaza; aquí sólo se eligen las frases, que son plantillas
 * del catálogo. El dinero y el barrio se dicen con las MISMAS figuras y frases
 * que /presupuesto, para que las dos capas no puedan contar cosas distintas.
 *
 * Cada tarjeta sale cuando llega su dato: la que falta no tumba a las demás, y
 * sin ninguna el bloque no se pinta. La quinta pregunta, «quiero quejarme», es
 * la llamada al bot que va justo debajo.
 */

/** Los concejales, uno por punto; en petróleo los del grupo de la alcaldía. */
function FiguraEscanos({ escanos, total, etiqueta }) {
  return (
    <svg
      viewBox={`0 0 ${total * 10} 10`}
      width="100%"
      height="12"
      role="img"
      aria-label={etiqueta}
      preserveAspectRatio="xMinYMid meet"
      style={{ display: 'block', maxWidth: total * 14 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={i}
          cx={i * 10 + 5}
          cy={5}
          r={4}
          fill={i < escanos ? 'var(--civic)' : 'var(--soft)'}
          stroke={i < escanos ? 'none' : 'var(--border)'}
          strokeWidth={0.6}
        />
      ))}
    </svg>
  )
}

export function EnBrevePortada() {
  const { t, locale } = useLocale()
  const { data: officials } = useOfficials()
  const { data: budget } = useBudget()
  const { data: ejecucion } = useBudgetExecution()
  const { data: tenderGeo } = useTenderGeo()
  const { data: plenos } = usePlenos()
  const { data: agendas } = usePlenoAgendas()
  const { data: votos } = usePlenoVotes()

  const r = enBrevePortada({
    officials,
    presupuesto: enBrevePresupuesto({ budget, ejecucion, deuda: null, tenderGeo }),
    // Sin votaciones el pleno espera: un `votos` a null antes de que llegue el
    // fichero diría «todavía no hemos transcrito ninguna», que puede ser falso.
    sesiones:
      plenos && agendas && votos
        ? summarizeSessions({
            plenos: plenos.items ?? [],
            agendas: agendas.plenos ?? [],
            votesByPleno: votos.stats?.byPleno ?? {},
          })
        : [],
    hoy: new Date().toISOString().slice(0, 10),
  })
  const ver = t('landing.enBreve.ver')
  const tarjetas = []

  if (r.manda) {
    const m = r.manda
    tarjetas.push(
      <TarjetaEnBreve
        key="manda"
        id="manda"
        pregunta={t('landing.enBreve.manda.pregunta')}
        // La cifra es la del recuento; el nombre va en la frase. En la letra de
        // cifras (DM Mono) un nombre parecía un dato, y salía dos veces.
        cifra={rellena(t('landing.enBreve.manda.cifra'), { escanos: m.escanos, total: m.total })}
        cifraNota={t('landing.enBreve.manda.cifraNota')}
        figura={
          <FiguraEscanos
            escanos={m.escanos}
            total={m.total}
            etiqueta={rellena(t('landing.enBreve.manda.figura'), {
              escanos: m.escanos,
              total: m.total,
            })}
          />
        }
        frases={[
          rellena(t('landing.enBreve.manda.frase'), { alcalde: m.alcalde, partido: m.partido }),
        ]}
        ancla="/cargos"
        anclaTexto={ver}
      />,
    )
  }

  if (r.dinero) {
    const { limite: l, gastado: g } = r.dinero
    const fecha = g?.fecha
      ? g.avanceDelAnio === 1
        ? rellena(t('presupuesto.enBreve.gastado.fin'), { fecha: g.fecha })
        : rellena(t('presupuesto.enBreve.gastado.fecha'), { fecha: g.fecha })
      : ''
    // Con lo gastado, la cifra grande es lo gastado, como en la tarjeta «¿Cuánto
    // ha gastado?» de /presupuesto, y el tope va en una frase que lo llama tope.
    // Con el tope arriba y la barra «Gastado» debajo, la revisión lectora leyó
    // «67,1 M€ … gastado»: /presupuesto separa las dos cifras en dos tarjetas, y
    // aquí, en una sola, la grande tiene que ser la que la barra mide.
    tarjetas.push(
      <TarjetaEnBreve
        key="dinero"
        id="dinero"
        pregunta={rellena(t('landing.enBreve.dinero.pregunta'), { year: l.year })}
        cifra={eurM(g ? g.ejecutado : l.definitivo)}
        cifraNota={
          g
            ? rellena(t('landing.enBreve.dinero.cifraNota'), { year: g.year })
            : l.porVecino != null
              ? rellena(t('presupuesto.enBreve.porVecino'), { x: eur0(l.porVecino) })
              : undefined
        }
        figura={g ? <FiguraGastado gastado={g} /> : undefined}
        frases={
          g
            ? [
                rellena(t('presupuesto.enBreve.gastado.frase'), { year: g.year, n: g.deCada100 }),
                rellena(t('landing.enBreve.dinero.topeCifra'), { limite: eurM(l.definitivo) }),
                fecha,
              ]
            : [t('landing.enBreve.dinero.tope'), t('landing.enBreve.dinero.sinGastado')]
        }
        nota={g ? t('presupuesto.enBreve.gastado.nota') : undefined}
        salvedad={
          l.conprelDiscrepa != null
            ? rellena(t('presupuesto.enBreve.limite.dosFuentes'), {
                year: l.year,
                conprel: eurM(l.conprelDiscrepa),
              })
            : undefined
        }
        ancla="/presupuesto#cascada"
        anclaTexto={ver}
      />,
    )
  }

  if (r.aprobado) {
    // Sin listado municipal del ejercicio: la misma tarjeta que /presupuesto.
    tarjetas.push(
      <TarjetaEnBreve
        key="aprobado"
        id="aprobado"
        pregunta={rellena(t('presupuesto.enBreve.aprobado.pregunta'), { year: r.aprobado.year })}
        cifra={eurM(r.aprobado.total)}
        frases={[t('presupuesto.enBreve.aprobado.frase')]}
        ancla="/presupuesto#aprobado"
        anclaTexto={ver}
      />,
    )
  }

  if (r.pleno) {
    const p = r.pleno
    tarjetas.push(
      <TarjetaEnBreve
        key="pleno"
        id="pleno"
        pregunta={t('landing.enBreve.pleno.pregunta')}
        cifra={fmtDateLong(p.fecha, locale)}
        frases={[
          p.puntos == null
            ? t('landing.enBreve.pleno.sinPuntos')
            : p.puntos === 1
              ? t('landing.enBreve.pleno.puntos.uno')
              : rellena(t('landing.enBreve.pleno.puntos'), { n: p.puntos }),
          p.votos == null
            ? t('landing.enBreve.pleno.sinVotos')
            : p.votos === 1
              ? t('landing.enBreve.pleno.votos.una')
              : rellena(t('landing.enBreve.pleno.votos'), { n: p.votos }),
        ]}
        // Con votaciones, siempre: las transcritas no son todas. Sin ninguna, la
        // frase de arriba ya lo dice, y «puede haber más» detrás de «ninguna» no
        // se entiende.
        nota={p.votos != null ? t('landing.enBreve.pleno.aviso') : undefined}
        ancla={`/plenos/${p.id}`}
        anclaTexto={ver}
      />,
    )
  }

  if (tarjetas.length === 0) return null

  const zonas = (tenderGeo?.zones ?? []).filter((z) => z.slug && z.name)
  // El mapa de la portada imprime otro porcentaje (los contratos con un sitio,
  // no los que nombran un barrio) a unos píxeles de esta tarjeta. Las dos cifras
  // son ciertas y ninguna contiene a la otra, así que se nombran las dos y por
  // qué difieren; si coinciden, no hay nada que reconciliar.
  const enMapa = porcentajeDelMapa(tenderGeo?.universe)
  const menosDeUno = t('landing.enBreve.barrio.menosDeUno')
  const aqui = r.barrio && (r.barrio.menosDeUno ? '<1' : String(r.barrio.deCada100))
  const puente =
    enMapa && aqui && enMapa !== aqui
      ? rellena(t('landing.enBreve.barrio.puente'), {
          pct: enMapa === '<1' ? menosDeUno : enMapa,
          n: aqui === '<1' ? menosDeUno : aqui,
        })
      : null
  const pie = r.barrio && zonas.length > 0 && (
    <BarrioPicker
      cobertura={r.barrio}
      zonas={zonas}
      ruta="/presupuesto"
      puente={puente}
      figura={!r.barrio.menosDeUno ? <FiguraBarrio n={r.barrio.deCada100} /> : null}
    />
  )

  return (
    <EnBreve
      titulo={t('landing.enBreve.titulo')}
      intro={t('landing.enBreve.intro')}
      saltarA="#contenido"
      saltarTexto={t('landing.enBreve.saltar')}
      pie={pie}
    >
      {tarjetas}
    </EnBreve>
  )
}
