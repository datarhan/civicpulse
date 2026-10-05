/**
 * Con qué corre el motor de veredictos y a nombre de quién escribe.
 *
 * El 02-08-2026 el motor corrió con `LLM_BACKEND=claude-code` y el `.env`
 * cargado. La cadena del cliente ponía openai detrás de claude-code (sin
 * OPENAI_MODEL, gpt-4o-mini), cada fallo de `claude -p` lo contestaba
 * gpt-4o-mini, y el guion rotulaba con lo CONFIGURADO
 * (`OPENAI_MODEL || LLM_BACKEND`). Medido el 05-10-2026 contra una copia de la
 * caché: 457 retractaciones publicadas como `verdict-engine:claude-code` las
 * había escrito gpt-4o-mini. La misma línea rotula al revés en cuanto el `.env`
 * trae OPENAI_MODEL: lo que escribe Claude saldría firmado por un modelo de
 * OpenAI.
 *
 * Aquí, tres decisiones que el guion no toma por su cuenta:
 *
 *   · el motor corre SIN respaldo de pago, diga lo que diga el entorno
 *     (`configDelMotor`);
 *   · el rótulo sale del backend configurado, nunca de OPENAI_MODEL
 *     (`primarioDelMotor`);
 *   · se escribe a nombre de quien CONTESTÓ cada paso, y si no fue el primario
 *     no se escribe (`rotuloDelMotor`).
 *
 * Puro: sin fs, sin red.
 */
import { backendModel, type Backend, type ClientConfig, type Procedencia } from '../llm/client'
import type { SinDatosPorque } from './claim-verifier-engine'

/** Un paso del motor que preguntó al modelo, y quién lo contestó. */
export type PasoDelMotor = Procedencia & { paso: 'razonar' | 'extraer' | 'contrastar' }

/**
 * La configuración del cliente para el motor: la del entorno, sin backends de
 * pago en la cadena (`zeroCostOnly`). Un primario de pago elegido a propósito
 * (`LLM_BACKEND=openai`) sigue siéndolo; lo que desaparece es el respaldo
 * medido detrás de uno gratuito, que es lo que escribió las 457.
 */
export function configDelMotor(config: ClientConfig): ClientConfig {
  return { ...config, zeroCostOnly: true }
}

/**
 * Cómo se nombra un modelo en el rótulo `verdict-engine:<esto>`: la forma que ya
 * tiene lo publicado. claude-code se nombra por el backend, como las retractaciones
 * de agosto; el resto, por el modelo como lo nombra la caché (`gpt-5.4-mini`,
 * como las de junio).
 */
export function rotuloDeModelo(p: { backend: Backend; model: string }): string {
  return p.backend === 'claude-code' ? 'claude-code' : p.model
}

export interface PrimarioDelMotor {
  backend: Backend
  /** Como lo nombra la caché (`backendModel`). */
  model: string
  rotulo: string
}

/** El primario configurado y su rótulo, sacados de la configuración, no del entorno suelto. */
export function primarioDelMotor(config: ClientConfig): PrimarioDelMotor {
  const model = backendModel(config)
  return {
    backend: config.backend,
    model,
    rotulo: rotuloDeModelo({ backend: config.backend, model }),
  }
}

/**
 * Los pasos que el motor preguntó al modelo para juzgar una declaración.
 *
 * Razonar, siempre. Extraer, salvo cuando el razonamiento concluye que ningún
 * candidato la respalda (`sinDatosPorque === 'razonamiento'`): eso es el
 * veredicto, y la extracción no se pide (claim-verifier-engine.ts). Sin
 * `sinDatosPorque` se cuentan los dos: no se sabe qué salida tomó el motor, y
 * pedir de más deja sin escribir, nunca escribe a ciegas.
 */
export function pasosPreguntados(
  sinDatosPorque: SinDatosPorque | undefined,
): ('razonar' | 'extraer')[] {
  return sinDatosPorque === 'razonamiento' ? ['razonar'] : ['razonar', 'extraer']
}

export type RotuloDelMotor =
  | { accion: 'escribir'; rotulo: string }
  | { accion: 'dejar'; porque: 'sin-procedencia' }
  | { accion: 'dejar'; porque: 'otro-backend'; quien: string }

/**
 * A nombre de quién se escribe una declaración que el motor juzgó, o por qué no
 * se escribe.
 *
 *   · Sin la procedencia de cada paso que el motor preguntó (`preguntados`;
 *     por defecto razonar Y extraer) no se sabe quién juzgó: no se escribe. Si
 *     falta una, el cableado se rompió, y escribir sería volver a rotular a
 *     ciegas. Desde el 05-10-2026 el motor no pide la extracción cuando el
 *     razonamiento concluye «sin respaldo» (`pasosPreguntados`).
 *   · Si algún paso lo contestó otro que el primario, no se escribe: se cuenta
 *     y se reintenta en la siguiente pasada. Rotularlo con quien contestó
 *     dejaría salir una pasada de dos modelos sin que nadie lo decidiera.
 *   · Si todos los contestó el primario —de la caché o en vivo—, su rótulo.
 */
export function rotuloDelMotor(a: {
  primario: PrimarioDelMotor
  pasos: readonly PasoDelMotor[]
  /** Los pasos que el motor preguntó (`pasosPreguntados`). Por defecto, razonar y extraer. */
  preguntados?: readonly ('razonar' | 'extraer')[]
}): RotuloDelMotor {
  const tiene = (paso: PasoDelMotor['paso']) => a.pasos.some((p) => p.paso === paso)
  const preguntados = a.preguntados ?? ['razonar', 'extraer']
  if (!preguntados.every(tiene)) return { accion: 'dejar', porque: 'sin-procedencia' }
  const ajeno = a.pasos.find(
    (p) => p.backend !== a.primario.backend || p.model !== a.primario.model,
  )
  if (ajeno) {
    return {
      accion: 'dejar',
      porque: 'otro-backend',
      quien: `${ajeno.paso}: ${rotuloDeModelo(ajeno)}`,
    }
  }
  return { accion: 'escribir', rotulo: a.primario.rotulo }
}
