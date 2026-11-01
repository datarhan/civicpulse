import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useT } from '../i18n'

/*
 * El pliegue de las dos lecturas: «Ver: lo esencial · todo».
 *
 * La página sigue siendo una sola. Arriba, la lectura vecinal; debajo del
 * divisor, la experta, partida en secciones. Quien lo pide pliega la experta
 * hasta dejar de cada sección su título, y la elección se guarda en
 * `cp:tweaks`, junto al modo oscuro. No es un «modo fácil» aparte —lo que la
 * salvaguarda 4 del diseño de la lectura vecinal sigue rechazando— y cada
 * condición de su enmienda (decisión D1-B de la auditoría de las dos lecturas,
 * 25-10-2026) tiene aquí su sitio:
 *
 * - Por defecto, «todo», para cualquiera. Lo que no sea «esencial» se lee como
 *   «todo» (`normalizaLecturas`), y la elección nunca va en la URL: un enlace
 *   compartido abre la página entera.
 * - Una sola página. Lo plegado sigue en el DOM: el pliegue cambia lo que se
 *   ve, no lo que hay, y ningún componente dice otra cosa según el pliegue.
 *   Por eso la pestaña de cada sección se pinta siempre, y sólo se ve plegada.
 * - Una cifra y su salvedad se pliegan juntas o no se pliegan. Sólo se
 *   pliegan secciones enteras, y la pestaña de una plegada lleva un título sin
 *   cifras: si llevara una, quedaría a la vista sin la salvedad que va dentro.
 * - Todo camino hacia el detalle lo despliega: un enlace de la misma página
 *   (aquí, al pulsar, antes de que el navegador salte), un #fragmento al
 *   cargar y los resultados de Cmd+K (`useHashScroll`). Nunca se aterriza en
 *   una sección cerrada.
 * - La revisión lectora lee una sola superficie: lo hace con «todo», que es lo
 *   que tiene un navegador sin nada guardado. Al imprimir se despliega todo
 *   (index.css, `@media print`).
 * - El control está en la página, es un botón de verdad, con `aria-expanded`
 *   y `aria-controls`, y el divisor se queda en los dos estados.
 * - La congelación de la LOREG no depende del pliegue: lo que oculta se oculta
 *   en los dos.
 *
 * Lo que se pinta plegado o abierto lo decide la hoja de estilos
 * (`[data-plegada]`): así la impresión lo despliega sin JavaScript.
 */

/** Sólo «esencial» pliega; cualquier otra cosa guardada es «todo». */
export function normalizaLecturas(valor) {
  return valor === 'esencial' ? 'esencial' : 'todo'
}

const SELECTOR_PLEGADA = '[data-seccion-experta][data-plegada]'
const SIN_ABIERTAS = []

/**
 * Las secciones plegadas que hay que abrir para llegar a `el`: la que lo
 * contiene, si está dentro de una, y las que contiene, si es un contenedor —el
 * destino de «Saltar a todos los datos», o el ancla que envuelve un panel—.
 */
export function seccionesPlegadasHacia(el) {
  if (!el || typeof el.closest !== 'function') return []
  const fuera = el.closest(SELECTOR_PLEGADA)
  const dentro = [...el.querySelectorAll(SELECTOR_PLEGADA)]
  return [...(fuera ? [fuera] : []), ...dentro].map((s) => s.id)
}

const Contexto = createContext(null)

/** Quién abre secciones al aterrizar en un fragmento (`useHashScroll`). */
export function useAbrirSecciones() {
  return useContext(Contexto)?.abrir ?? null
}

/**
 * Guarda qué secciones hay en la página y cuáles se han abierto a mano.
 *
 * Lo abierto a mano es de la página que se está leyendo: se guarda junto a su
 * ruta y deja de valer al cambiar de ruta, sin un efecto que lo borre. Un
 * efecto llegaría tarde: corre después del de `useHashScroll`, que es el que
 * abre la sección de un enlace compartido, y la volvería a cerrar.
 */
export function ProveedorLecturas({ lecturas, onCambiar, children }) {
  const { pathname } = useLocation()
  const [abiertasDe, setAbiertasDe] = useState({ ruta: null, ids: [] })
  const [secciones, setSecciones] = useState([])
  const abiertas = abiertasDe.ruta === pathname ? abiertasDe.ids : SIN_ABIERTAS

  const abrir = useCallback(
    (ids) =>
      setAbiertasDe((prev) => ({
        ruta: pathname,
        ids: [...new Set([...(prev.ruta === pathname ? prev.ids : []), ...ids])],
      })),
    [pathname],
  )

  const registrar = useCallback((id) => {
    setSecciones((prev) => (prev.includes(id) ? prev : [...prev, id]))
    return () => setSecciones((prev) => prev.filter((x) => x !== id))
  }, [])

  // Volver a elegir es volver a empezar: «lo esencial» pliega también lo que
  // se abrió una a una.
  const cambiar = useCallback(
    (valor) => {
      setAbiertasDe({ ruta: null, ids: [] })
      onCambiar(normalizaLecturas(valor))
    },
    [onCambiar],
  )

  // Un enlace de la misma página («Ver el detalle ↓», «Saltar a todos los
  // datos ↓»): se abre su destino ANTES de que el navegador salte, porque a un
  // elemento oculto no se salta. Va en la fase de captura y con `flushSync`
  // para que el salto, que es la acción por defecto de este mismo clic,
  // encuentre ya la sección abierta. Y no se fía de que la URL cambie: pulsar
  // dos veces el mismo enlace no la cambia, y la sección pudo plegarse entre
  // medias.
  useEffect(() => {
    function alPulsar(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const enlace = e.target?.closest?.('a[href^="#"]')
      if (!enlace) return
      let destino = null
      try {
        destino = document.getElementById(decodeURIComponent(enlace.getAttribute('href').slice(1)))
      } catch {
        return
      }
      const ids = enlace.hasAttribute('data-abre-todo')
        ? [...document.querySelectorAll(SELECTOR_PLEGADA)].map((s) => s.id)
        : seccionesPlegadasHacia(destino)
      if (ids.length) flushSync(() => abrir(ids))
    }
    document.addEventListener('click', alPulsar, true)
    return () => document.removeEventListener('click', alPulsar, true)
  }, [abrir])

  const valor = useMemo(
    () => ({
      lecturas: normalizaLecturas(lecturas),
      cambiar,
      abiertas,
      abrir,
      secciones,
      registrar,
    }),
    [lecturas, cambiar, abiertas, abrir, secciones, registrar],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/**
 * Una sección de la lectura experta: lo que el pliegue reduce a su título.
 *
 * `titulo` es lo único que se ve de ella plegada, así que no lleva cifras (lo
 * comprueban la prueba del catálogo y la e2e). El `id` es el de su ancla: un
 * enlace que apunta a él la abre. Sin proveedor —una prueba que monta la
 * página sola— se pinta abierta.
 *
 * Una sección cuyo cuerpo sale vacío —un panel sin datos todavía— no enseña
 * su pestaña: lo resuelve la hoja de estilos con `:empty`, que se entera
 * sola de cuándo llega el contenido.
 */
export function SeccionExperta({ id, titulo, children, className, style }) {
  const ctx = useContext(Contexto)
  const registrar = ctx?.registrar
  const cuerpo = useRef(null)
  useEffect(() => registrar?.(id), [registrar, id])
  const plegada = ctx ? ctx.lecturas === 'esencial' && !ctx.abiertas.includes(id) : false
  const idCuerpo = `${id}-cuerpo`

  function abrirla() {
    flushSync(() => ctx?.abrir([id]))
    // La pestaña desaparece al abrir: el foco va a lo que se ha abierto, no
    // se queda en un botón que ya no está.
    cuerpo.current?.focus()
  }

  return (
    <section
      id={id}
      data-seccion-experta=""
      data-plegada={plegada ? '' : undefined}
      className={className}
      style={style}
    >
      <h2 className="cp-experta-plegada">
        <button type="button" aria-expanded={!plegada} aria-controls={idCuerpo} onClick={abrirla}>
          <span>{titulo}</span>
          <span aria-hidden="true" className="cp-experta-plegada-flecha">
            ↓
          </span>
        </button>
      </h2>
      <div id={idCuerpo} ref={cuerpo} className="cp-experta-cuerpo" tabIndex={-1}>
        {children}
      </div>
    </section>
  )
}

/**
 * El control «Ver: lo esencial · todo», bajo el divisor. Sólo aparece si la
 * página tiene secciones que plegar: en una sin ninguna sería ruido.
 *
 * Es un botón, con las dos opciones a la vista y la activa marcada; su
 * `aria-expanded` dice si la lectura experta está desplegada.
 */
export function VerLecturas() {
  const ctx = useContext(Contexto)
  const t = useT()
  if (!ctx || ctx.secciones.length === 0) return null
  const esencial = ctx.lecturas === 'esencial'
  return (
    <div className="cp-ver-lecturas" data-print-hide="">
      <button
        type="button"
        className="cp-ver-lecturas-boton"
        data-ver-lecturas=""
        aria-expanded={!esencial}
        aria-controls={ctx.secciones.map((id) => `${id}-cuerpo`).join(' ')}
        onClick={() => ctx.cambiar(esencial ? 'todo' : 'esencial')}
      >
        <span className="cp-ver-lecturas-rotulo">{t('lecturas.ver')}</span>
        <span className="cp-ver-lecturas-opcion" data-activa={esencial ? '' : undefined}>
          {t('lecturas.esencial')}
        </span>
        <span className="cp-ver-lecturas-opcion" data-activa={esencial ? undefined : ''}>
          {t('lecturas.todo')}
        </span>
      </button>
    </div>
  )
}
