import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import BarrioPicker from '../Presupuesto/BarrioPicker'
import { Barra, FiguraBarrio, Leyenda } from '../Presupuesto/FigurasEnBreve'
import { useEntities } from '../../hooks/useEntities'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useTenders } from '../../hooks/useTenders'
import { enBreveContratos } from '../../scraper/en-breve-contratos'
import { decimal, entero, eurosBreves, rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * «En breve» de /contratos: tres preguntas de vecino y el selector de barrio,
 * encima de la página de siempre (auditoría de las dos lecturas, §5).
 *
 * Las cifras las deriva `scraper/en-breve-contratos` con las mismas funciones
 * que las secciones a las que enlaza; aquí sólo se eligen las frases. Cada clave
 * va literal en su llamada: el guard de `i18n-catalogue` lee las llamadas a
 * `rellena`, y una clave compuesta le escondería sus huecos.
 *
 * No nombra a ninguna empresa, y a propósito: la lista con sus nombres está en
 * «¿Quién recibe el dinero?», a un enlace, y aquí sólo se dice cuánto se
 * concentra. Nada en rojo: ninguna de estas cifras documenta un fallo.
 */

function FiguraAQuien({ aQuien }) {
  const t = useT()
  const resto = 100 - aQuien.deCada100
  return (
    <div className="cp-en-breve-figura">
      <Barra
        etiqueta={rellena(t('contratos.enBreve.aQuien.figura'), {
          n: aQuien.deCada100,
          resto,
        })}
      >
        <div
          className="cp-crece-x"
          style={{ width: `${aQuien.cuota * 100}%`, background: 'var(--civic)', '--i': 0 }}
        />
        <div
          className="cp-crece-x"
          style={{ width: `${(1 - aQuien.cuota) * 100}%`, background: 'var(--ink30)', '--i': 2 }}
        />
      </Barra>
      <Leyenda
        izquierda={rellena(t('contratos.enBreve.aQuien.cinco'), { n: aQuien.deCada100 })}
        derecha={rellena(t('contratos.enBreve.aQuien.resto'), { n: resto })}
      />
    </div>
  )
}

export default function EnBreveContratos() {
  const t = useT()
  const { data: tenders } = useTenders()
  const { data: tenderGeo } = useTenderGeo()
  const { data: entities } = useEntities()
  const r = enBreveContratos({ tenders, tenderGeo, entities })
  const ver = t('presupuesto.enBreve.ver')

  const tarjetas = []

  if (r.cuanto) {
    const c = r.cuanto
    const n = entero(c.adjudicados)
    tarjetas.push(
      <TarjetaEnBreve
        key="cuanto"
        id="cuanto"
        pregunta={t('contratos.enBreve.cuanto.pregunta')}
        cifra={eurosBreves(c.importe)}
        cifraNota={t('contratos.enBreve.cuanto.cifraNota')}
        frases={[
          c.ejercicios
            ? rellena(t('contratos.enBreve.cuanto.frase'), {
                n,
                desde: c.desde,
                hasta: c.hasta,
                k: c.ejercicios,
              })
            : rellena(t('contratos.enBreve.cuanto.fraseSinPeriodo'), { n }),
        ]}
        nota={[
          c.sinImporte > 0
            ? rellena(t('contratos.enBreve.cuanto.sinImporte'), { n: entero(c.sinImporte) })
            : '',
          c.ventas > 0
            ? rellena(t('contratos.enBreve.cuanto.ventas'), { n: entero(c.ventas) })
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        salvedad={
          !c.mayor
            ? undefined
            : c.mayor.esConcesion
              ? rellena(t('contratos.enBreve.cuanto.mayorConcesion'), {
                  importe: eurosBreves(c.mayor.importe),
                  pct: c.mayor.cuota,
                })
              : rellena(t('contratos.enBreve.cuanto.mayor'), {
                  importe: eurosBreves(c.mayor.importe),
                  pct: c.mayor.cuota,
                })
        }
        ancla="#mapa-gasto"
        anclaTexto={ver}
      />,
    )
  }

  if (r.aQuien) {
    const q = r.aQuien
    tarjetas.push(
      <TarjetaEnBreve
        key="aQuien"
        id="aQuien"
        pregunta={t('contratos.enBreve.aQuien.pregunta')}
        cifra={rellena(t('contratos.enBreve.aQuien.cifra'), { n: q.deCada100 })}
        cifraNota={t('contratos.enBreve.aQuien.cifraNota')}
        figura={<FiguraAQuien aQuien={q} />}
        frases={[
          rellena(t('contratos.enBreve.aQuien.frase'), {
            mayor: q.mayorDeCada100,
            total: entero(q.adjudicatarios),
          }),
        ]}
        salvedad={t('contratos.enBreve.aQuien.salvedad')}
        ancla="#quien-recibe"
        anclaTexto={ver}
      />,
    )
  }

  if (r.sinConcurso) {
    const s = r.sinConcurso
    tarjetas.push(
      <TarjetaEnBreve
        key="sinConcurso"
        id="sinConcurso"
        pregunta={t('contratos.enBreve.sinConcurso.pregunta')}
        cifra={rellena(t('contratos.enBreve.sinConcurso.cifra'), { n: s.deCada100 })}
        cifraNota={t('contratos.enBreve.sinConcurso.cifraNota')}
        frases={[
          rellena(t('contratos.enBreve.sinConcurso.frase'), {
            de: entero(s.de),
            n: entero(s.n),
            menores: entero(s.menores),
            negociados: entero(s.negociados),
          }),
          s.negociadosDana > 0
            ? rellena(t('contratos.enBreve.sinConcurso.dana'), { n: entero(s.negociadosDana) })
            : '',
        ]}
        nota={
          s.importePct == null
            ? undefined
            : s.importeSinElMayorPct == null
              ? rellena(t('contratos.enBreve.sinConcurso.importe'), {
                  pct: decimal(s.importePct),
                })
              : rellena(t('contratos.enBreve.sinConcurso.importeSinElMayor'), {
                  pct: decimal(s.importePct),
                  sin: decimal(s.importeSinElMayorPct),
                })
        }
        salvedad={t('contratos.enBreve.sinConcurso.salvedad')}
        ancla="#sin-convocatoria"
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
      intro={t('contratos.enBreve.intro')}
      saltarA="#todos-los-datos"
      saltarTexto={t('presupuesto.enBreve.saltar')}
      pie={pie}
    >
      {tarjetas}
    </EnBreve>
  )
}
