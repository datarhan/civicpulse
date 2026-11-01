import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { ANCLA_INDICE, GRUPOS_METODOLOGIA, anclaDeGrupo, grupoEnPosicion } from './grupos'

/**
 * El índice de /metodologia y las piezas que lo sostienen en la página.
 *
 * Son dos índices y sólo se ve uno. Con sitio al lado del texto, el lateral:
 * pegado, con los grupos y desplegado sólo el que se está leyendo, porque la lista
 * entera no cabe en una pantalla y un índice con su propia barra de scroll no
 * orienta. Sin sitio, uno plegado arriba: pegado se comería la pantalla de un móvil
 * y taparía cada destino, así que cada grupo trae un «Índice ↑» para volver. La
 * lista del plegado sólo existe mientras está abierto, por la misma razón que en
 * `IndicePieza`: la búsqueda del navegador caería primero en la copia.
 *
 * Son enlaces `<a href="#…">`, sin router, como todos los de esta página: el
 * aterrizaje lo hace `useHashScroll`, que descuenta la barra superior.
 */

const ENLACE_ACTUAL = { 'aria-current': 'true' }

/** Cuánto por debajo de lo alto de la ventana se decide qué grupo se lee. */
const FRANJA_DE_LECTURA = 0.3

function useGrupoActual() {
  const [actual, setActual] = useState(GRUPOS_METODOLOGIA[0].id)

  useEffect(() => {
    let pendiente = 0
    const medir = () => {
      pendiente = 0
      const cabeceras = GRUPOS_METODOLOGIA.flatMap((g) => {
        const el = document.getElementById(anclaDeGrupo(g.id))
        return el ? [{ id: g.id, top: el.getBoundingClientRect().top }] : []
      })
      const siguiente = grupoEnPosicion(cabeceras, window.innerHeight * FRANJA_DE_LECTURA)
      if (siguiente) setActual(siguiente)
    }
    const alMoverse = () => {
      if (!pendiente) pendiente = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', alMoverse, { passive: true })
    window.addEventListener('resize', alMoverse)
    return () => {
      if (pendiente) cancelAnimationFrame(pendiente)
      window.removeEventListener('scroll', alMoverse)
      window.removeEventListener('resize', alMoverse)
    }
  }, [])

  return actual
}

export function IndiceLateral() {
  const t = useT()
  const actual = useGrupoActual()
  return (
    <nav
      className="cp-met-lateral"
      aria-label={t('metodologia.indice')}
      data-indice-lateral=""
      data-print-hide=""
    >
      <div className="mono cp-met-lateral-titulo">{t('metodologia.indice')}</div>
      <ol>
        {GRUPOS_METODOLOGIA.map((g) => {
          const leyendo = g.id === actual
          return (
            <li key={g.id}>
              <a href={`#${anclaDeGrupo(g.id)}`} {...(leyendo ? ENLACE_ACTUAL : {})}>
                {t(`metodologia.grupo.${g.id}`)}
              </a>
              {leyendo && (
                <ol>
                  {g.secciones.map((s) => (
                    <li key={s}>
                      <a href={`#${s}`}>{t(`metodologia.seccion.${s}`)}</a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function IndicePlegado() {
  const t = useT()
  const [abierto, setAbierto] = useState(false)
  const apartados = GRUPOS_METODOLOGIA.reduce((n, g) => n + g.secciones.length, 0)
  return (
    <nav
      id={ANCLA_INDICE}
      className="cp-met-plegado"
      aria-label={t('metodologia.indice')}
      data-print-hide=""
    >
      <details className="cp-indice" onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary>
          <span className="cp-indice-titulo">{t('metodologia.indice')}</span>
          <span className="mono cp-indice-n">
            {t('metodologia.indice.apartados').replace('{n}', String(apartados))}
          </span>
        </summary>
        {abierto && (
          <ol className="cp-met-plegado-grupos">
            {GRUPOS_METODOLOGIA.map((g) => (
              <li key={g.id}>
                <a href={`#${anclaDeGrupo(g.id)}`} className="cp-met-plegado-grupo">
                  {t(`metodologia.grupo.${g.id}`)}
                </a>
                <ol>
                  {g.secciones.map((s) => (
                    <li key={s}>
                      <a href={`#${s}`}>{t(`metodologia.seccion.${s}`)}</a>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </details>
    </nav>
  )
}

/** El título de un grupo. Sus apartados son lo que sigue hasta el grupo siguiente. */
export function CabeceraGrupo({ id }) {
  const t = useT()
  return (
    <div className="cp-met-grupo">
      <h2 id={anclaDeGrupo(id)} data-grupo-metodologia="">
        {t(`metodologia.grupo.${id}`)}
      </h2>
      <a href={`#${ANCLA_INDICE}`} className="cp-met-volver" data-print-hide="">
        {t('metodologia.indice.volver')}
      </a>
    </div>
  )
}

/**
 * La regla de un apartado dicha en una frase. Lo que vale es el texto de debajo:
 * la frase no añade nada, y por eso no lleva plazos ni cifras, que viven en la
 * regla y aquí envejecerían solos.
 */
export function EnUnaFrase({ id }) {
  const t = useT()
  return (
    <p className="cp-en-una-frase" data-en-una-frase={id}>
      <span className="mono">{t('metodologia.enUnaFrase')}</span>
      {t(`metodologia.frase.${id}`)}
    </p>
  )
}
