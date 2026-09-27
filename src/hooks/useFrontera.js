// @ts-check
import { useJsonFetch } from './useJsonFetch'

// El experimento de frontera (`npm run compute:dea`). Vive en /laboratorio
// porque es lo único de este sitio cuya cifra sale de un modelo nuestro y no de
// una fuente citable; la página lo dice antes que cualquier número.
//
// Constante a nivel de módulo, no un literal nuevo en cada render: la caché de
// instantáneas compara por referencia.
const EMPTY = { especificaciones: [], declaracion: null, modelo: null, fuente: null }

export function useFrontera() {
  return useJsonFetch('/data/dea.json', EMPTY)
}
