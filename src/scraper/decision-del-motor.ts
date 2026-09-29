/**
 * Qué escribe el motor de veredictos con lo que devuelve, fuera del bucle del
 * script para que se pueda probar sin red ni ficheros.
 *
 * `scripts/verify-pleno-claims-engine.ts` decide aquí; el script lee, llama al
 * modelo, cuenta y escribe.
 */
import type { ClaimVerdict } from './claim-verifier'

/** Lo que hace la re-derivación (`--ids`) con una retractación publicada. */
export type Rederivacion =
  { accion: 'reescribir' } | { accion: 'dejar'; motivo: 'ya-no-la-retractaria' | 'no-la-juzgo' }

/**
 * Re-derivar vuelve a juzgar una retractación del motor que ya está publicada,
 * para cambiar un resumen que no explicaba el veredicto (el caso que la trajo:
 * src/lib/resumenes-retirados.js).
 *
 *   · Sólo se reescribe la explicación de una retractación que el modelo
 *     SOSTIENE: juzgó, y sigue sin ver respaldo.
 *   · Si ahora ve respaldo, no sube nada: una vía automática sólo baja
 *     (DATA_INTEGRITY, regla 4). La retractación se queda como está y el
 *     script la nombra para un curador.
 *   · Si no juzgó —sin candidatos, fuera de la política del LLM—, el veredicto
 *     que vuelve es el determinista y no dice nada del modelo (regla 2).
 */
export function decidirRederivacion(r: {
  juzgada: boolean
  veredicto: ClaimVerdict
}): Rederivacion {
  if (!r.juzgada) return { accion: 'dejar', motivo: 'no-la-juzgo' }
  if (r.veredicto === 'sin-datos') return { accion: 'reescribir' }
  return { accion: 'dejar', motivo: 'ya-no-la-retractaria' }
}
