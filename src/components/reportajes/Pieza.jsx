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
import { useRevelado } from '../../hooks/useRevelado'
import { useT, useLocale } from '../../i18n'

const SERIF = "'Fraunces', Georgia, serif"

/** El ancla de una sección: `#seccion-03`. Estable mientras no se renumere. */
export const anclaSeccion = (/** @type {string} */ num) => `seccion-${num}`

/**
 * Encabezado de sección numerado. `data-seccion` es lo que lee el índice; el
 * `id` es lo que se enlaza, y `scrollMarginTop` deja el título fuera de la
 * barra superior fija al saltar a él (el mismo margen que el registro de
 * correcciones). El título lleva su tinta: heredada, salía negro en dos piezas
 * y gris en las tres que envuelven el cuerpo en un `<article>` a --ink70.
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
          color: 'var(--ink)',
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

// El revelado de las figuras vive en `hooks/useRevelado`: lo usa también «En
// breve», y fuera de los reportajes no hay por qué cargar este módulo.
export { useRevelado }

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

/**
 * Un bloque de contexto, plegado: lo que amplía una sección sin ser su hilo
 * —la ficha de una sociedad, dónde está publicada una tarifa—. El rótulo dice
 * QUÉ hay dentro y, si el bloque afirma algo, lo afirma él mismo: plegar
 * esconde el detalle, no la afirmación. `review:surfaces` abre los `<details>`
 * antes de leer.
 *
 * Lo estrenó «coste efectivo» (19-10-2026), donde §02 —lo que promete el
 * título— empezaba a un tercio de la página, detrás de la concesión entera.
 *
 * @param {{ kicker: string, titulo: import('react').ReactNode, children: import('react').ReactNode }} props
 */
export function Pliegue({ kicker, titulo, children }) {
  return (
    <details className="cp-pliegue">
      <summary>
        <span className="cp-pliegue-kicker">{kicker}</span>
        <span className="cp-pliegue-titulo">{titulo}</span>
      </summary>
      {children}
    </details>
  )
}

/* Los tonos de un aparte. «basuras» tenía seis cajas ámbar, más el borde del
   recuadro de Parla y el del método, e «inteligencia turística» dos: con todo
   en el color de un aviso, ninguno avisaba. El tono dice qué es cada uno:
   - `nota` (por defecto), gris: una salvedad de la propia pieza —lo que no
     decimos, el control que hicimos, un defecto del dato—.
   - `foco`, petróleo: lo que la pieza señala, como la pregunta a la que lleva.
   - `aviso`, ámbar: lo que le sirve a quien lee para actuar —en «basuras», las
     dos horas distintas para sacar un mueble—. Uno, o ninguno, por pieza. */
const TONOS_APARTE = {
  nota: { fondo: 'var(--soft)', borde: 'var(--border)', rotulo: 'var(--ink50)' },
  foco: { fondo: 'var(--civic-soft)', borde: 'var(--civic)', rotulo: 'var(--civic-ink)' },
  aviso: { fondo: 'var(--warn-soft)', borde: 'var(--warn)', rotulo: 'var(--warn-ink)' },
}

/**
 * Un aparte con rótulo, en una caja a lo ancho de la columna.
 *
 * @param {{ title: string, tono?: 'nota' | 'foco' | 'aviso', children: import('react').ReactNode }} props
 */
export function Aparte({ title, tono = 'nota', children }) {
  const t = TONOS_APARTE[tono]
  if (!t) throw new Error(`Aparte: tono desconocido «${tono}»`)
  return (
    <div
      data-aparte={tono}
      style={{
        background: t.fondo,
        border: `1px solid ${t.borde}`,
        borderRadius: 'var(--r-card)',
        padding: '16px 20px',
        margin: '16px 0 8px',
      }}
    >
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: t.rotulo,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink70)', lineHeight: 1.5 }}>
        {children}
      </div>
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
