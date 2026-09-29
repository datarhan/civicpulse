/**
 * Qué escribe el motor de veredictos con lo que devuelve, fuera del bucle del
 * script para que se pueda probar sin red ni ficheros.
 *
 * `scripts/verify-pleno-claims-engine.ts` decide y cuenta aquí; el script lee,
 * llama al modelo y escribe.
 */
import type { ClaimVerdict } from './claim-verifier'
import type { RunRecorder } from './run-manifest'

/**
 * Por qué el verificador del motor devolvió una declaración SIN consultar al
 * modelo (`onSkip` en verifier-runner.ts). Lo que devuelve entonces es el
 * veredicto del determinista, y no dice nada del modelo.
 *
 *   · `sin-candidatos` — la recuperación no encontró nada que enseñarle. Es un
 *     hueco, siempre: nunca se intentó.
 *   · `decidio-el-determinista` — el determinista ya sostiene la declaración y
 *     la pasada normal no necesita al modelo. Es una decisión, no un hueco.
 *   · `fuera-de-la-politica` — una declaración que la vía LLM no juzga por
 *     norma (la opinión, `shouldSkipLlmVerification`). También una decisión.
 */
export type MotivoSinJuicio = 'sin-candidatos' | 'decidio-el-determinista' | 'fuera-de-la-politica'

/** Lo que hace la pasada normal (y `--base`) con una declaración verificada. */
export type Retractacion =
  { accion: 'retractar' } | { accion: 'mantener' } | { accion: 'dejar'; porque: MotivoSinJuicio }

/**
 * La pasada normal retracta a `sin-datos` lo que el modelo juzga sin respaldo,
 * y sólo eso: es el único veredicto del motor que se ha medido fiable (~92 %).
 *
 * El 24-06-2026 escribió como «verdict-engine re-judged verificado→sin-datos»
 * declaraciones que el modelo nunca vio. Sin candidatos, el verificador devuelve
 * el veredicto del determinista —para ellas, `sin-datos`— y el guion miraba ese
 * veredicto antes de mirar si hubo juicio. La tarjeta dice desde entonces
 * «Veredicto: verificador LLM» de algo que ningún modelo leyó (DATA_INTEGRITY,
 * regla 2). Aquí el salto se mira primero, y sin juicio el veredicto que vuelve
 * ni se lee.
 */
export function decidirRetractacion(r: {
  /** Por qué no se consultó al modelo, o `undefined` si se le consultó. */
  salto: MotivoSinJuicio | undefined
  /** Lo que devolvió el verificador. */
  veredicto: ClaimVerdict
  /** Lo que se publica ahora. */
  publicado: ClaimVerdict
}): Retractacion {
  if (r.salto) return { accion: 'dejar', porque: r.salto }
  const fuerte = r.publicado === 'verificado' || r.publicado === 'parcial'
  if (r.veredicto === 'sin-datos' && fuerte) return { accion: 'retractar' }
  return { accion: 'mantener' }
}

/** Cómo se llama en el parte cada salto que es una decisión y no un hueco. */
const MOTIVO_EN_EL_PARTE: Record<Exclude<MotivoSinJuicio, 'sin-candidatos'>, string> = {
  'decidio-el-determinista': 'el determinista ya decidió',
  'fuera-de-la-politica': 'fuera de la política del LLM',
}

/**
 * El cubo del parte en que cae una declaración que llegó al verificador:
 * juzgada, nunca intentada (sin candidatos) o saltada con su motivo. Uno solo.
 *
 * Sumar «no se le preguntó» a «juzgada» es lo que dejó firmar al motor lo que no
 * había visto; sumarlo a «sin cambios», lo que ocultó el no-op de 1.017. Las
 * dos vías del guion, la normal y `--ids`, cuentan aquí para no separarse.
 */
export function anotarEnElParte(
  run: Pick<RunRecorder, 'judge' | 'neverAttempt' | 'skip'>,
  salto: MotivoSinJuicio | undefined,
): void {
  if (!salto) run.judge()
  else if (salto === 'sin-candidatos') run.neverAttempt()
  else run.skip(MOTIVO_EN_EL_PARTE[salto])
}

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
