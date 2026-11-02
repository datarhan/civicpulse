import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Al cambiar de página, el lector empieza por arriba.
 *
 * Una SPA no recarga el documento, así que el navegador no toca el scroll: al
 * pasar de una ruta a otra la posición se queda donde estaba. En un sitio de
 * páginas cortas no se nota; aquí sí. Medido el 8-09-2026 en producción:
 * pulsando «Biografía →» en /cargos con la página a 3.000 px, la biografía
 * —9.272 px— abría también a 3.000 px, o sea en mitad del apartado de bienes,
 * sin el nombre de la persona a la vista y con el índice lateral marcando una
 * sección que el lector no había elegido. Es peor que un descuadre visual: son
 * las declaraciones patrimoniales de una persona viva leídas sin su encabezado.
 *
 * Cuatro reglas, y las cuatro tienen su motivo:
 *
 *   · Sólo cuando cambia el PATHNAME. Cambiar un filtro (`?q=…`) no es cambiar
 *     de página, y devolver al lector arriba cada vez que ajusta un filtro es
 *     de las cosas más molestas que puede hacer una web.
 *   · Nunca si hay HASH. `useHashScroll` es el dueño de los fragmentos y lleva
 *     su propio desplazamiento con el offset de la barra pegajosa; pisarlo
 *     dejaría todo permalink aterrizando arriba, que es justo el defecto que
 *     ese hook vino a arreglar.
 *   · Nunca al ir ATRÁS o adelante (`POP`). Quien vuelve espera encontrar la
 *     lista donde la dejó; ahí el navegador restaura la posición y nosotros no
 *     tenemos nada que aportar.
 *   · Nunca por una entrada que el navegador ya ha DEJADO. React Router pinta
 *     cada navegación dentro de una transición, así que la página de destino
 *     puede llegar al DOM después de que el lector haya vuelto atrás. Medido el
 *     2-11-2026 contra un build de producción: atrás mientras se pintaba la
 *     biografía, la biografía se pintaba tras el `popstate`, este hook la
 *     tomaba por una llegada y mandaba arriba, y el POP de /cargos que venía
 *     detrás —fiel a la regla anterior— ya no devolvía al lector a su sitio.
 *     Con la CPU seis veces más lenta bastaba volver en los primeros 100 ms; el
 *     e2e lo pisaba en 6 de cada 20 pasadas. La restauración del navegador, en
 *     cambio, no falló en ninguna medida, ni pasando por una ficha de 1.498 px
 *     con la lista a 4.000: no hay que sustituirla, sólo no deshacerla.
 */
export function debeVolverArriba({ tipo, hash, pathnameCambio, entradaVigente = true }) {
  if (!pathnameCambio) return false
  if (hash) return false
  if (!entradaVigente) return false
  return tipo !== 'POP'
}

export function useScrollAlNavegar() {
  const { pathname, hash, key } = useLocation()
  const tipo = useNavigationType()
  const anterior = useRef(pathname)

  useEffect(() => {
    const pathnameCambio = anterior.current !== pathname
    anterior.current = pathname
    // `history.state` es la entrada en la que está el navegador AHORA, no la
    // que React acaba de pintar. React Router guarda ahí la clave de cada
    // entrada; la primera no la lleva, y su `location.key` vale 'default'.
    const entradaVigente = (window.history.state?.key ?? 'default') === key
    if (!debeVolverArriba({ tipo, hash, pathnameCambio, entradaVigente })) return
    // `auto`, no `smooth`: un desplazamiento animado de nueve mil píxeles se ve
    // como un fallo y además tarda, y quien acaba de pulsar un enlace ya ha
    // decidido irse de donde estaba.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash, tipo, key])
}
