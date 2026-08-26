import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scroll a `#fragment` into view once the element it names actually exists.
 *
 * The browser's own fragment handling runs on load, finds nothing, and never
 * tries again. On an SPA that reads its content from static JSON that is always
 * the wrong moment: `/hallazgos#f-2026-…` mounts its 52 finding cards several
 * hundred milliseconds after the document is parsed. So every permalink we
 * publish — the card's own «enlace permanente», the Cmd+K result, the
 * `#anchor` links on /metodologia — dropped the reader at the top of the page
 * with no indication anything had gone wrong.
 *
 * Deliberate choices:
 *
 *   · It waits for the element via MutationObserver instead of a fixed sleep,
 *     and gives up after GIVE_UP_MS. A permalink to a retracted finding must
 *     stop trying, not observe the DOM for the rest of the session.
 *   · It offsets by the real measured height of the sticky topbar. Hard-coding
 *     52 would silently misplace every target the day the topbar changes.
 *   · A reader who scrolls first has taken over, and we abort. Yanking the
 *     viewport out from under someone who started reading is worse than
 *     landing them at the top.
 */
const GIVE_UP_MS = 8000
const BREATHING_ROOM = 12

function headerOffset() {
  // Todo lo que se queda pegado arriba descuenta altura del aterrizaje. Hoy
  // sólo hay una barra: la topbar del shell. Hubo una segunda —el submenú de
  // secciones de /eficiencia, .cp-subnav— y este bucle nació de medir sólo la
  // primera y dejar el destino tapado por la otra; se queda como bucle, y no
  // como una sola consulta, porque la lección era esa y la siguiente barra
  // pegajosa sólo tendrá que añadirse a la lista. `MARGEN_ANCLA` es la
  // contrapartida estática de esta medida, en components/eficiencia/anclas.js.
  let total = 0
  for (const selector of ['.cp-shell-topbar']) {
    const barra = document.querySelector(selector)
    if (!barra) continue
    const { position } = window.getComputedStyle(barra)
    if (position !== 'sticky' && position !== 'fixed') continue
    total += barra.getBoundingClientRect().height
  }
  return total === 0 ? 0 : total + BREATHING_ROOM
}

export function useHashScroll() {
  const { hash, key } = useLocation()

  useEffect(() => {
    if (!hash || hash.length < 2) return undefined

    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      // A malformed fragment is not worth an exception on every route change.
      return undefined
    }

    let done = false
    let observer
    let timer

    const stop = () => {
      done = true
      observer?.disconnect()
      if (timer) clearTimeout(timer)
      window.removeEventListener('wheel', takeOver)
      window.removeEventListener('touchmove', takeOver)
      window.removeEventListener('keydown', takeOver)
    }

    function takeOver() {
      stop()
    }

    const colocar = () => {
      const el = document.getElementById(id)
      if (!el) return false
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset()
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      return true
    }

    /**
     * Coloca, y vuelve a colocar cuando las fuentes entran.
     *
     * Colocar UNA vez bastaba mientras los destinos tenían poco por encima. En
     * cuanto /eficiencia dejó de ser seis pestañas y pasó a ser una página
     * larga, `#sec-declaracion` quedó con la tabla de quince servicios delante
     * — y ahí se vio: se colocaba con las métricas de la fuente de reserva,
     * Outfit y DM Mono entraban después, todo lo de arriba encogía unos 80 px y
     * el destino se iba ARRIBA del borde de la ventana. Medido: aterrizaba en
     * y = -17,6 con la topbar tapando 52. El fragmento decía una cosa y la
     * pantalla enseñaba otra, que es el defecto que este hook existe para no
     * tener.
     *
     * La segunda pasada NO le quita el control al lector: los oyentes de rueda,
     * touch y teclado siguen vivos durante la espera, así que quien haya
     * empezado a leer marca `done` y la recolocación no llega a ejecutarse.
     * Yankear la ventana a alguien que ya está leyendo es peor que aterrizar
     * torcido, y eso no cambia.
     */
    const attempt = () => {
      if (done) return true
      if (!colocar()) return false
      // El destino ya existe: deja de vigilar el DOM y espera sólo a las fuentes.
      observer?.disconnect()
      if (timer) clearTimeout(timer)
      const fuentes = typeof document !== 'undefined' && document.fonts?.ready
      if (!fuentes) {
        stop()
        return true
      }
      fuentes.then(() => {
        if (!done) colocar()
        stop()
      })
      return true
    }

    if (attempt()) return stop

    window.addEventListener('wheel', takeOver, { passive: true })
    window.addEventListener('touchmove', takeOver, { passive: true })
    window.addEventListener('keydown', takeOver)

    observer = new MutationObserver(() => attempt())
    observer.observe(document.body, { childList: true, subtree: true })
    timer = setTimeout(stop, GIVE_UP_MS)

    return stop
    // `key` is in the deps so re-navigating to the SAME hash (a second click on
    // the same permalink) scrolls again instead of being a no-op.
  }, [hash, key])
}

export default useHashScroll
