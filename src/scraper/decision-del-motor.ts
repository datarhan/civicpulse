/**
 * Qué escribe el motor de veredictos con lo que devuelve, fuera del bucle del
 * script para que se pueda probar sin red ni ficheros.
 *
 * `scripts/verify-pleno-claims-engine.ts` decide y cuenta aquí; el script lee,
 * llama al modelo y escribe.
 */
import type { ClaimVerdict } from './claim-verifier'
import type { RunRecorder } from './run-manifest'
import type { ApplyEntry, OverlayEntry } from './verified-merge'
import { recortarResumen, RESUMEN_MAX, type SinDatosPorque } from './claim-verifier-engine'
import { charlaDeTarea } from './charla-de-tarea'

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
  | { accion: 'retractar' }
  | { accion: 'mantener' }
  | { accion: 'dejar'; porque: MotivoSinJuicio }
  | { accion: 'apartar' }

/**
 * ¿Pone este `sin-datos` la regla del título, y no el modelo?
 *
 * El 05-10-2026 el motor dejó de anclar un respaldo en el título del registro
 * (claim-verifier-engine.ts, `dondeAncla`): la extracción lo daba por bueno y
 * ahora sale `sin-datos`. Pero el modelo sigue viendo respaldo, y su
 * razonamiento —que es lo que se escribiría de explicación— lo defiende
 * («El respaldo es por tanto parcial/débil-moderado», 1sqj7is-081-cit-50c5bb).
 * Retractar o reescribir con él pondría bajo «Sin datos» un texto que dice lo
 * contrario. Se aparta, con su id, para un curador; ni se escribe ni se cuenta
 * como «sin cambios» (DATA_INTEGRITY, regla 2).
 */
function loPoneElTitulo(r: {
  veredicto: ClaimVerdict
  sinDatosPorque: SinDatosPorque | undefined
}) {
  if (r.veredicto !== 'sin-datos') return false
  // Un `sin-datos` juzgado lleva siempre su porqué: sin él, el cableado falló y
  // no se sabe si lo concluyó el modelo.
  if (!r.sinDatosPorque) throw new Error('un sin-datos juzgado llegó sin su porqué')
  return r.sinDatosPorque === 'solo-el-titulo'
}

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
  /** Con `sin-datos`, de qué salida del motor viene (`onSinDatos`). */
  sinDatosPorque: SinDatosPorque | undefined
}): Retractacion {
  if (r.salto) return { accion: 'dejar', porque: r.salto }
  const deLaRegla = loPoneElTitulo(r)
  const fuerte = r.publicado === 'verificado' || r.publicado === 'parcial'
  if (r.veredicto === 'sin-datos' && fuerte) {
    return deLaRegla ? { accion: 'apartar' } : { accion: 'retractar' }
  }
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
  | { accion: 'reescribir' }
  | { accion: 'dejar'; motivo: 'ya-no-la-retractaria' | 'no-la-juzgo' }
  | { accion: 'apartar' }

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
 *   · Si el `sin-datos` lo pone la regla del título, el razonamiento defiende un
 *     respaldo y no puede ser la explicación de la retractación: se aparta.
 */
export function decidirRederivacion(r: {
  juzgada: boolean
  veredicto: ClaimVerdict
  /** Con `sin-datos`, de qué salida del motor viene (`onSinDatos`). */
  sinDatosPorque: SinDatosPorque | undefined
}): Rederivacion {
  if (!r.juzgada) return { accion: 'dejar', motivo: 'no-la-juzgo' }
  if (r.veredicto === 'sin-datos') {
    return loPoneElTitulo(r) ? { accion: 'apartar' } : { accion: 'reescribir' }
  }
  return { accion: 'dejar', motivo: 'ya-no-la-retractaria' }
}

/** Lo que hace `retirar-pasada -- --sin-juicio` con una retractación declarada. */
export type Devolucion =
  | { accion: 'devolver' }
  | { accion: 'dejar'; porque: 'ya-no-esta' | 'otra-entrada' | 'sin-base' | 'la-base-subiria' }

/**
 * Devolver al determinista una retractación que el motor escribió sin que el
 * modelo viera la declaración (retractaciones-sin-juicio.ts): se quita la
 * entrada del overlay y aflora el veredicto de la base.
 *
 * Es lo que habría pasado si el motor la hubiera saltado bien: la dejaba como
 * entrada `llm`, y la pasada LLM está retirada (`TRINQUETE.llm`), así que
 * `retirar-pasada` la habría quitado igual. No se inventa ningún veredicto.
 *
 *   · Sólo la entrada MEDIDA: si su fecha, su editor o su canal cambiaron,
 *     alguien la escribió después —una re-derivación con `--ids`, un curador—
 *     y esa decisión es suya.
 *   · Nunca sube: si la base dice algo más que `sin-datos`, devolverla
 *     publicaría una subida automática (DATA_INTEGRITY, regla 4). Se queda, y
 *     la mira una persona.
 *   · Sin la declaración en la base no se sabe qué afloraría.
 */
export function decidirDevolucion(r: {
  medida: { editor: string; appliedAt: string }
  entrada: { source: string; editor?: string; appliedAt: string } | undefined
  veredictoBase: ClaimVerdict | undefined
}): Devolucion {
  if (!r.entrada) return { accion: 'dejar', porque: 'ya-no-esta' }
  const esLaMedida =
    r.entrada.source === 'verdict-engine' &&
    r.entrada.editor === r.medida.editor &&
    r.entrada.appliedAt === r.medida.appliedAt
  if (!esLaMedida) return { accion: 'dejar', porque: 'otra-entrada' }
  if (r.veredictoBase === undefined) return { accion: 'dejar', porque: 'sin-base' }
  if (r.veredictoBase !== 'sin-datos') return { accion: 'dejar', porque: 'la-base-subiria' }
  return { accion: 'devolver' }
}

// ─── El recorte (`--ids <fichero> --recortar`) ──────────────────────────────

/** Por qué `--recortar` deja una explicación del motor como está. */
export type MotivoSinRecorte =
  /** No hay entrada, o no es una retractación del motor. */
  | 'no-es-del-motor'
  /** La caché no guarda ningún razonamiento de la declaración. */
  | 'sin-razonamiento'
  /** Guarda alguno, pero ninguno es el que produjo lo publicado. */
  | 'no-coincide'
  /** El razonamiento cupo entero: lo publicado no está cortado. */
  | 'nada-que-recortar'
  /** Lo recortado no es un prefijo estricto de lo publicado: sería escribir prosa. */
  | 'no-es-un-recorte'
  /** El motivo no acaba en el resumen publicado, y no se sabe qué cambiar en él. */
  | 'motivo-sin-el-resumen'
  /** Lo recortado sigue hablando de la tarea del modelo. */
  | 'charla'

export type Recorte =
  | { accion: 'recortar'; entrada: ApplyEntry; resumen: string }
  | { accion: 'dejar'; porque: MotivoSinRecorte }

/**
 * Cómo se llama en el parte cada explicación que se deja. Un cubo por motivo, y
 * ninguno es «hecha»: la charla, sobre todo, se cuenta aparte (regla 2).
 */
export const MOTIVO_SIN_RECORTE_EN_EL_PARTE: Readonly<Record<MotivoSinRecorte, string>> = {
  'no-es-del-motor': 'no es una retractación del motor',
  'sin-razonamiento': 'sin razonamiento en la caché',
  'no-coincide': 'lo publicado no es el corte de ningún razonamiento en caché',
  'nada-que-recortar': 'nada que recortar',
  'no-es-un-recorte': 'el recorte no es un prefijo de lo publicado',
  'motivo-sin-el-resumen': 'el motivo no acaba en el resumen',
  charla: 'charla, no se recorta',
}

const normalizarEspacios = (t: string) => t.replace(/\s+/g, ' ').trim()

/**
 * ¿Es `nuevo` el texto `viejo` con algo quitado del final, y nada más?
 *
 * La guarda de la regla 4 para el recorte: una escritura automática de prosa
 * publicada sólo puede QUITAR. Compara con los espacios de `viejo` normalizados,
 * como los normaliza `recortarResumen`, y la marca «…» del final no cuenta como
 * texto: dice que se cortó, no afirma nada. Estricto: lo igual no es un recorte.
 */
export function esRecorteDe(nuevo: string, viejo: string): boolean {
  const cuerpo = nuevo.endsWith('…') ? nuevo.slice(0, -1) : nuevo
  const antes = normalizarEspacios(viejo)
  return cuerpo.length > 0 && cuerpo.length < antes.length && antes.startsWith(cuerpo)
}

/**
 * Recortar una explicación del motor publicada a media frase, desde el
 * razonamiento que la produjo.
 *
 * Hasta el 04-10-2026 el motor guardaba `reasoning.slice(0, 300)`, y la tarjeta
 * lo pinta tal cual: 858 retractaciones quedaron publicadas a media frase. Su
 * razonamiento entero sigue en `.llm-cache`, bajo la clave del prompt de
 * entonces (ENGINE_REASON_VERSIONES_ANTERIORES en src/llm/prompts.ts), y aquí se
 * corta como corta hoy el motor, con `recortarResumen`, sin preguntar a nadie.
 *
 *   · El razonamiento tiene que PROBAR que es el que se publicó: sus
 *     `RESUMEN_MAX` primeros caracteres son lo publicado, letra a letra. No basta
 *     con que sea de la misma declaración: de una explicación que re-derivó #233
 *     la caché guarda también el razonamiento de agosto, y volver a él sería
 *     deshacer la re-derivación.
 *   · Lo nuevo es un prefijo estricto de lo publicado (`esRecorteDe`): sólo QUITA
 *     el trozo colgante. Es una escritura automática de prosa publicada
 *     (DATA_INTEGRITY, regla 4), y sólo así se admite.
 *   · Cambian el resumen y la cola del motivo, que lo lleva copiado
 *     (`entradaDelMotor`); el veredicto, la evidencia, los corpus, la pasada, la
 *     confianza y el rótulo se quedan como estaban.
 *   · La charla de la tarea no se recorta: el overlay no la deja escribir
 *     (`applyOverlayEntries`), y donde se sirve la tarjeta ya la retira
 *     (src/lib/resumenes-retirados.js).
 */
export function decidirRecorte(a: {
  claimId: string
  entrada: OverlayEntry | undefined
  /** Lo que la caché guarda de su razonamiento, en cualquier versión del prompt. */
  razonamientos: readonly string[]
}): Recorte {
  const e = a.entrada
  if (!e || e.source !== 'verdict-engine') return { accion: 'dejar', porque: 'no-es-del-motor' }
  if (a.razonamientos.length === 0) return { accion: 'dejar', porque: 'sin-razonamiento' }
  const publicado = e.verification.summary
  const razonamiento = a.razonamientos.find((r) => r.slice(0, RESUMEN_MAX) === publicado)
  if (razonamiento === undefined) return { accion: 'dejar', porque: 'no-coincide' }
  const resumen = recortarResumen(razonamiento)
  if (resumen === normalizarEspacios(publicado)) {
    return { accion: 'dejar', porque: 'nada-que-recortar' }
  }
  if (!esRecorteDe(resumen, publicado)) return { accion: 'dejar', porque: 'no-es-un-recorte' }
  const motivo = e.reason ?? ''
  if (!motivo.endsWith(publicado)) return { accion: 'dejar', porque: 'motivo-sin-el-resumen' }
  if (charlaDeTarea(resumen)) return { accion: 'dejar', porque: 'charla' }
  return {
    accion: 'recortar',
    resumen,
    entrada: {
      claimId: a.claimId,
      verification: { ...e.verification, summary: resumen },
      source: e.source,
      reason: motivo.slice(0, motivo.length - publicado.length) + resumen,
      ...(e.editor ? { editor: e.editor } : {}),
    },
  }
}
