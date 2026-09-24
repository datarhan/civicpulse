// @ts-check
/**
 * Las piezas del armazón de un reportaje que no son la pieza: el encabezado de
 * sección, el índice, la barra de lectura, el revelado de las barras y el
 * «más reportajes» del final.
 *
 * `SecHead` vivía copiado, idéntico byte a byte, en las cinco piezas. Con una
 * copia por fichero, darle un ancla a cada sección era cinco cambios que podían
 * divergir; ahora es uno.
 *
 * Nada de aquí escribe una cifra ni una frase de la pieza: el índice se LEE del
 * DOM que la pieza ya pintó —los `[data-seccion]` de sus encabezados—, así que no
 * hay una lista de apartados a mano que pueda quedarse vieja cuando la pieza
 * cambie. Es la misma disciplina que `src/reportajes.js` con las piezas.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReportaje } from '../../hooks/useReportaje'
import { REPORTAJE_SLUGS } from '../../reportajes'
import { fmtDateHuman } from '../../lib/formatters'
import { useT, useLocale } from '../../i18n'

const SERIF = "'Fraunces', Georgia, serif"

/** El ancla de una sección: `#seccion-03`. Estable mientras no se renumere. */
export const anclaSeccion = (/** @type {string} */ num) => `seccion-${num}`

/**
 * Encabezado de sección numerado. `data-seccion` es lo que lee el índice; el
 * `id` es lo que se enlaza, y `scrollMarginTop` deja el título fuera de la
 * barra superior fija al saltar a él (el mismo margen que el registro de
 * correcciones).
 *
 * @param {{ num: string, kicker: string, title: import('react').ReactNode }} props
 */
export function SecHead({ num, kicker, title }) {
  return (
    <div
      id={anclaSeccion(num)}
      data-seccion={num}
      style={{ margin: '34px 0 12px', scrollMarginTop: 72 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.04em',
          marginBottom: 6,
        }}
      >
        {num} · {kicker}
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-page)',
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
    </div>
  )
}

/**
 * «En esta pieza»: los apartados de la pieza, leídos de sus encabezados.
 *
 * Plegado por defecto: arriba ya hay titular, entradilla, figura y cifras, y un
 * índice abierto empujaría el cuerpo otra pantalla hacia abajo. Con menos de
 * tres apartados no se pinta: un índice de dos entradas es ruido.
 *
 * La lista sólo existe mientras está abierto. Plegada dentro de un <details>
 * seguía en el DOM, y cada titular de sección salía dos veces: la búsqueda del
 * navegador caía primero en la copia del índice (y lo desplegaba), y un
 * `getByText(titular).first()` de las pruebas resolvía a esa copia oculta en
 * vez de a la sección.
 *
 * No se imprime: en papel no hay adónde saltar.
 */
export function IndicePieza() {
  const t = useT()
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  const [secciones, setSecciones] = useState(
    /** @type {{ id: string, num: string, titulo: string }[]} */ ([]),
  )
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const raiz = ref.current?.closest('.cp-page')
    if (!raiz) return
    setSecciones(
      [...raiz.querySelectorAll('[data-seccion]')].map((el) => ({
        id: el.id,
        num: /** @type {HTMLElement} */ (el).dataset.seccion ?? '',
        titulo: el.querySelector('h2')?.textContent?.trim() ?? '',
      })),
    )
  }, [])

  return (
    <nav ref={ref} aria-label={t('reportajes.indice')} data-print-hide>
      {secciones.length >= 3 && (
        <details className="cp-indice" onToggle={(e) => setAbierto(e.currentTarget.open)}>
          <summary>
            <span className="cp-indice-titulo">{t('reportajes.indice')}</span>
            <span className="mono cp-indice-n">
              {t('reportajes.indice.apartados').replace('{n}', String(secciones.length))}
            </span>
          </summary>
          {abierto && (
            <ol>
              {secciones.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>
                    <span className="mono" aria-hidden="true">
                      {s.num}
                    </span>
                    <span>{s.titulo}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </nav>
  )
}

/**
 * La barra de lectura: una línea de petróleo sobre el borde inferior de la barra
 * superior, que se llena según se avanza por la página.
 *
 * Se cuelga de `.cp-shell-topbar`, que es `sticky`: así mide lo mismo que la
 * columna de contenido con barra lateral o sin ella, sin calcular anchos. No es
 * un nodo de React —se actualiza en cada `scroll`, y un `setState` por fotograma
 * repintaría la pieza entera—: se crea al montar, se mueve con una variable CSS
 * y se retira al desmontar. Mide el documento y no la pieza porque la monta el
 * armazón, que no sabe cuándo termina de cargar la pieza; la diferencia es el
 * pie de «más reportajes». Es decorativa (`aria-hidden`).
 */
export function ProgresoLectura() {
  useEffect(() => {
    const barra = document.querySelector('.cp-shell-topbar')
    if (!barra) return

    const linea = document.createElement('div')
    linea.className = 'cp-progreso'
    linea.setAttribute('aria-hidden', 'true')
    barra.appendChild(linea)

    let pendiente = 0
    const medir = () => {
      pendiente = 0
      const recorrido = document.documentElement.scrollHeight - window.innerHeight
      const p = recorrido > 0 ? Math.min(1, Math.max(0, window.scrollY / recorrido)) : 0
      linea.style.setProperty('--p', p.toFixed(4))
    }
    const pedir = () => {
      if (!pendiente) pendiente = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      cancelAnimationFrame(pendiente)
      linea.remove()
    }
  }, [])

  return null
}

/** ¿Se puede animar? Sin IntersectionObserver, o con movimiento reducido, no. */
function puedeAnimar() {
  return (
    typeof window !== 'undefined' &&
    'IntersectionObserver' in window &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Revela una figura la primera vez que entra en pantalla.
 *
 * Devuelve la ref y las dos marcas que lee la hoja: `data-armado` esconde las
 * marcas animables (barras, puntos, trazos) y `data-visto` las lanza. El
 * estado de reposo —sin ninguna de las dos— es la figura completa, y es lo que
 * recibe quien no tiene IntersectionObserver, quien pidió movimiento reducido y
 * quien imprime (la hoja de impresión anula el armado). Sólo se animan marcas,
 * nunca texto: ninguna cifra cuenta hacia arriba ni pasa por valores que no son
 * el suyo.
 *
 * @param {{ umbral?: number }} [opts]
 */
export function useRevelado({ umbral = 0.3 } = {}) {
  const ref = useRef(/** @type {Element|null} */ (null))
  const [armado] = useState(puedeAnimar)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!armado || !el) return
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisto(true)
          io.disconnect()
        }
      },
      { threshold: umbral },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [armado, umbral])

  return {
    ref,
    marcas: {
      'data-armado': armado && !visto ? '' : undefined,
      'data-visto': armado && visto ? '' : undefined,
    },
  }
}

/**
 * Un bloque cuyas barras (`.cp-crece-x`, `.cp-crece-y`) crecen al verlo.
 *
 * @param {{ children: import('react').ReactNode, style?: import('react').CSSProperties, className?: string }} props
 */
export function Revela({ children, style, className }) {
  const { ref, marcas } = useRevelado()
  return (
    <div
      ref={/** @type {import('react').RefObject<HTMLDivElement>} */ (ref)}
      className={['cp-revela', className].filter(Boolean).join(' ')}
      style={style}
      {...marcas}
    >
      {children}
    </div>
  )
}

const siempre = () => true

/**
 * Monta los hijos cuando el bloque se acerca a la pantalla (o de inmediato sin
 * IO). `listo` se pregunta en cada cruce y, si dice que no, se sigue mirando: el
 * pie está pegado al «Cargando reportaje…» mientras la pieza carga, y sin esa
 * pregunta se cruzaba nada más abrir, antes de que hubiera nada que leer.
 *
 * @param {string} [margen]
 * @param {() => boolean} [listo]
 */
function useCerca(margen = '600px', listo = siempre) {
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  const [cerca, setCerca] = useState(
    () => typeof window === 'undefined' || !('IntersectionObserver' in window),
  )
  useEffect(() => {
    const el = ref.current
    if (cerca || !el) return
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting) && listo()) {
          setCerca(true)
          io.disconnect()
        }
      },
      { rootMargin: margen },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [cerca, margen, listo])
  return { ref, cerca }
}

/**
 * Una pieza en el pie de otra. La misma puerta que el índice: sólo se lista lo
 * que está `publicado`, y mientras carga no ocupa sitio.
 *
 * `key` va en el tipo porque el proyecto no carga los tipos de React, y sin
 * ellos TypeScript no sabe que JSX la reserva.
 *
 * @param {{ slug: string, key?: string }} props
 */
function OtraPieza({ slug }) {
  const { loading, error, data } = useReportaje(slug)
  const { locale } = useLocale()
  if (loading || error || !data) return null
  const m = data.meta || {}
  if (m.estado !== 'publicado') return null
  const fecha = m.publicadoEl || m.fechaDatos
  return (
    <li className="cp-otra">
      {/* Sólo la fecha: «Reportaje · Dinero público · 9 de septiembre de 2026»
          partía en dos líneas en una ficha de media columna, y bajo «Más
          reportajes» la sección no dice nada que el titular no diga. */}
      {fecha && <div className="mono cp-otra-meta">{fmtDateHuman(fecha, locale)}</div>}
      <Link to={`/reportajes/${m.slug || slug}`} className="cp-otra-enlace">
        {m.titulo}
      </Link>
    </li>
  )
}

/** `listo` de `useCerca` para el pie. Módulo y no closure: la referencia no cambia entre renders. */
const piezaPintada = () => !!document.querySelector('.cp-page [data-seccion]')

/**
 * «Más reportajes», al pie de cada pieza: las demás del registro, en su orden
 * (la más reciente primero), y el índice.
 *
 * Va FUERA del contenedor de la pieza, no dentro: el registro de correcciones
 * es el último bloque de la pieza, y eso lo fija una prueba. Esto es navegación
 * del sitio, no parte del reportaje, y tampoco se imprime.
 *
 * Los snapshots de las demás piezas se piden cuando el pie se acerca a la
 * pantalla, no al abrir la pieza: quien no llega al final no los descarga.
 *
 * @param {{ actual: string }} props
 */
export function MasReportajes({ actual }) {
  const t = useT()
  // Lista cuando la pieza ya pintó sus apartados: antes, el pie está arriba.
  const { ref, cerca } = useCerca('600px', piezaPintada)
  const otras = REPORTAJE_SLUGS.filter((s) => s !== actual).slice(0, 4)
  if (!otras.length) return null
  return (
    <nav
      ref={/** @type {import('react').RefObject<HTMLElement>} */ (ref)}
      aria-labelledby="mas-reportajes-titulo"
      className="cp-mas-reportajes"
      data-print-hide
    >
      <h2 id="mas-reportajes-titulo" className="mono">
        {t('reportajes.mas')}
      </h2>
      {cerca && (
        <ul>
          {otras.map((s) => (
            <OtraPieza key={s} slug={s} />
          ))}
        </ul>
      )}
      <Link to="/reportajes" className="mono cp-mas-todos">
        {t('reportajes.todos')}
      </Link>
    </nav>
  )
}
