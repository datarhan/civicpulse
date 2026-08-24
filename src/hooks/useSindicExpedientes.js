// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Índice de expedientes del Síndic de Greuges CV — transcripción del registro
 * del propio organismo. Hermano de `useSindic`, que sirve las fichas FIRMADAS.
 *
 * Las dos listas del snapshot responden a preguntas distintas y no se suman:
 * `contraAyuntamiento` es rendición de cuentas del municipio;
 * `vecinosOtrasAdministraciones` son quejas de vecinos de aquí ante la
 * Generalitat u otros ayuntamientos, y su cobertura empieza en 2023 porque el
 * facet de población del buscador no llega más atrás.
 */
export function useSindicExpedientes() {
  return useJsonFetch('/data/sindic-expedientes.json')
}
