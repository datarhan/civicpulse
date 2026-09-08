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
 * Tres reglas, y las tres tienen su motivo:
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
 */
export function debeVolverArriba({ tipo, hash, pathnameCambio }) {
  if (!pathnameCambio) return false
  if (hash) return false
  return tipo !== 'POP'
}

export function useScrollAlNavegar() {
  const { pathname, hash } = useLocation()
  const tipo = useNavigationType()
  const anterior = useRef(pathname)

  useEffect(() => {
    const pathnameCambio = anterior.current !== pathname
    anterior.current = pathname
    if (!debeVolverArriba({ tipo, hash, pathnameCambio })) return
    // `auto`, no `smooth`: un desplazamiento animado de nueve mil píxeles se ve
    // como un fallo y además tarda, y quien acaba de pulsar un enlace ya ha
    // decidido irse de donde estaba.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash, tipo])
}
