import { execFileSync } from 'node:child_process'

/**
 * Constantes que se resuelven en el build, en un solo sitio.
 *
 * Vive fuera de `vite.config.js` porque `vitest.config.ts` es un fichero
 * aparte y también las necesita: sin esto, la página renderiza en producción y
 * revienta en la suite —o al revés—, y el arreglo obvio sería copiar el bloque
 * a los dos ficheros. Un bloque copiado en dos configuraciones es exactamente
 * la clase de duplicado que este repositorio ya ha visto desincronizarse.
 *
 * ## Qué resuelve, y por qué
 *
 * `/metodologia` y `/aviso-legal` son el contrato editorial publicado, y los
 * dos llevaban al pie una fecha escrita a mano. La de metodología decía «14 de
 * julio» con seis ediciones posteriores encima, más una coletilla que
 * describía como «el último cambio» uno de hacía un mes. La del aviso legal
 * decía «versión vigente: 2 de julio» mientras el fichero incorporaba
 * compromisos nuevos — una fecha de vigencia que va por detrás de lo vigente
 * es lo contrario de para lo que sirve una fecha de vigencia.
 *
 * Se resuelve en el build y no en tiempo de ejecución porque el sitio es
 * estático: no hay servidor al que preguntarle a git.
 */

/** Fecha (YYYY-MM-DD) del último commit que tocó `ruta`, o null sin historial. */
function ultimoCambio(ruta) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ruta], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    // Un tarball o un contenedor sin `.git`. Devolver null hace que la página
    // no escriba fecha ninguna, que es mejor que escribir una inventada.
    return null
  }
}

export function buildDefines() {
  return {
    __REVISION_METODOLOGIA__: JSON.stringify(ultimoCambio('src/pages/Metodologia.jsx')),
    __REVISION_AVISO_LEGAL__: JSON.stringify(ultimoCambio('src/pages/AvisoLegal.jsx')),
  }
}
