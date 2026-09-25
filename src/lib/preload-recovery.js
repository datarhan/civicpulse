// @ts-check
/**
 * Tras un despliegue, recargar UNA vez la pestaña que se quedó atrás.
 *
 * Cada build nombra sus trozos de JS por su contenido, y el despliegue nuevo
 * ya no sirve los del anterior. Una pestaña abierta antes del despliegue pide
 * `/assets/Hallazgos-<hash viejo>.js`, el `rewrite` de Vercel le contesta con
 * `index.html` —200, pero HTML—, el `import()` falla y la página se queda en
 * blanco. Con unos diez despliegues al día no es un caso raro: es lo que le
 * pasa a quien deja la web abierta en el móvil y vuelve por la tarde.
 *
 * Vite avisa con `vite:preloadError`, y su propia documentación recomienda
 * recargar. Se hace una vez por minuto como mucho: si el trozo falla por otra
 * razón, recargar en bucle sería peor que el fallo, así que la segunda vez no
 * se toca el evento, el error sigue su curso y lo recoge `ErrorBoundary`.
 */

export const CLAVE = 'cp:recarga-tras-despliegue'
const MARGEN_MS = 60_000

/**
 * @param {Pick<Window, 'addEventListener' | 'sessionStorage' | 'location'>} [ventana]
 * @param {() => number} [ahora]
 */
export function recuperarTrasDespliegue(ventana = window, ahora = () => Date.now()) {
  ventana.addEventListener('vite:preloadError', (evento) => {
    let ultima = 0
    try {
      ultima = Number(ventana.sessionStorage.getItem(CLAVE) ?? 0)
    } catch {
      // Sin sessionStorage (modo privado estricto) no se puede evitar el bucle:
      // no se recarga y el error llega al límite de error.
      return
    }
    if (ahora() - ultima < MARGEN_MS) return
    try {
      ventana.sessionStorage.setItem(CLAVE, String(ahora()))
    } catch {
      return
    }
    evento.preventDefault()
    ventana.location.reload()
  })
}
