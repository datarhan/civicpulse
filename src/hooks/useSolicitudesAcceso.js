// @ts-check
import { useJsonFetch } from './useJsonFetch'

const VACIO = { version: 1, items: [] }

/**
 * El registro CURADO de solicitudes de acceso a la información.
 *
 * Vacío no significa «no hay nada que pedir»: significa que aún no se ha
 * pedido. La página lo pinta como `sin-solicitar`, que es un estado propio y no
 * un «esperando respuesta».
 */
export function useSolicitudesAcceso() {
  return useJsonFetch('/data/solicitudes-acceso.json', VACIO)
}
