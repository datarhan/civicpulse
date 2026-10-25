// @ts-check
import { useEffect } from 'react'

/**
 * El título de la pestaña: «<página> · CivicPulse · Riba-roja de Túria».
 *
 * Es la misma forma que escribe `prerender-meta` en el HTML de cada ruta
 * (`<etiqueta> · <título del sitio>`). Hasta el 25-10-2026 sólo cinco páginas
 * lo ponían, con otra forma («X · CivicPulse»), y el resto heredaba el de la
 * página por la que se había entrado: nada lo cambiaba al navegar dentro de la
 * aplicación, así que /gestion se titulaba «Novedades» si se llegaba desde
 * /cambios.
 *
 * Dos capas:
 *
 * - la de RUTA, que pone el armazón (App.jsx) con la etiqueta de navegación de
 *   la ruta activa (`useTituloDeRuta`);
 * - la de PÁGINA, que pone una ficha con su propio dato, como el nombre de un
 *   cargo o la fecha de un pleno (`useDocumentTitle`).
 *
 * Gana la de página mientras está montada. No basta con que cada hook escriba
 * `document.title` en su efecto: React ejecuta los efectos de los hijos ANTES
 * que los del padre, así que el armazón pisaría el título de la ficha en cada
 * navegación. Por eso las dos capas escriben aquí y `aplicar` decide.
 */
export const TITULO_SITIO = 'CivicPulse · Riba-roja de Túria'

/** «Presupuesto» → «Presupuesto · CivicPulse · Riba-roja de Túria». */
export function conSitio(titulo) {
  return titulo ? `${titulo} · ${TITULO_SITIO}` : TITULO_SITIO
}

let deRuta = TITULO_SITIO
/** Las fichas montadas, la última encima: dos a la vez sólo en una transición. */
const dePagina = /** @type {{ titulo: string }[]} */ ([])

function aplicar() {
  const arriba = dePagina[dePagina.length - 1]
  document.title = arriba ? conSitio(arriba.titulo) : deRuta
}

/**
 * La capa de ruta. `null` o vacío deja el título del sitio a secas (la portada).
 *
 * @param {string | null | undefined} titulo
 */
export function useTituloDeRuta(titulo) {
  useEffect(() => {
    deRuta = conSitio(titulo)
    aplicar()
  }, [titulo])
}

/**
 * La capa de página. Sin título (el dato aún no ha llegado) no se apila nada y
 * manda el de la ruta, que ya es propio de la sección.
 *
 * @param {string | null | undefined} titulo
 */
export function useDocumentTitle(titulo) {
  useEffect(() => {
    if (!titulo) return undefined
    const entrada = { titulo }
    dePagina.push(entrada)
    aplicar()
    return () => {
      const i = dePagina.indexOf(entrada)
      if (i >= 0) dePagina.splice(i, 1)
      aplicar()
    }
  }, [titulo])
}
