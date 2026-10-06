/**
 * Corregir el rótulo de una retractación del motor con lo que prueba la caché.
 *
 * El 02-08-2026 el motor de veredictos corrió con claude-code de primario y el
 * `.env` cargado; cada fallo de `claude -p` lo contestó gpt-4o-mini, el respaldo
 * de pago de la cadena, y el guion rotulaba con lo configurado. Medido el
 * 05-10-2026 contra una copia de la caché, sin llamadas: 457 retractaciones
 * publicadas como `verdict-engine:claude-code` las había escrito gpt-4o-mini
 * (456 entera; una la razonó claude-code y la decidió gpt-4o-mini). La causa la
 * cerró la PR #248 (procedencia-del-motor.ts); esto corrige lo publicado.
 *
 * Qué se corrige y qué no:
 *
 *   · Sólo a nombre de quién está: `editor` y el prefijo del motivo, que lo
 *     copia («verdict-engine (claude-code) re-judged…»). El veredicto, la
 *     explicación, la evidencia y la fecha de la decisión no se tocan: nada
 *     automático reescribe prosa publicada (DATA_INTEGRITY, regla 4), y esto no
 *     re-juzga nada.
 *   · Sólo con prueba. La pasada guardó cada paso bajo la clave del primario que
 *     dice el rótulo, con su procedencia dentro (`llmCacheEntrada`); el
 *     razonamiento que cuenta es el que PRODUJO lo publicado —su corte es el
 *     resumen, letra a letra—, y con él, su extracción. Lo que no se prueba se
 *     queda como está.
 *   · Con registro: cada corrección se queda en la entrada (`labelCorrections`,
 *     que valida `validateOverlay`): el rótulo anterior, qué paso hizo cada
 *     modelo, el porqué, quién firma y cuándo.
 *
 * Puro: la caché llega como función (`LectorDeCache`), sin fs ni red.
 */
import { z, type ZodTypeAny } from 'zod'
import type { Backend } from '../llm/client'
import { recortarResumen, RESUMEN_MAX } from './claim-verifier-engine'
import { rechazoDeMarcador } from './firma-de-persona'
import { rotuloDeModelo } from './procedencia-del-motor'
import {
  validateOverlay,
  type CorreccionDeRotulo,
  type Overlay,
  type OverlayEntry,
} from './verified-merge'

const PREFIJO = 'verdict-engine:'

/**
 * Las claves con que guardaron cada paso las pasadas que escribieron las
 * retractaciones que hay en el overlay —junio, agosto y el 04-10-2026—, FIJADAS.
 *
 * La clave del motor cambia con el motor: versión del prompt, esquema y forma de
 * la entrada. La PR #249 metió la huella de los candidatos en la entrada
 * (`{ claimId, candidatos }`), y una CLI que derivara la clave del motor de hoy
 * no encontraría ninguna de estas entradas: las daría todas por «sin
 * procedencia», sin avisar. Lo que se fija aquí es un hecho de entonces, no una
 * copia de lo de ahora, y no cambia: la medición del 05-10-2026 encontró con
 * estas claves 1.248 de las 1.249 entradas del motor
 * (tests/scraper/correccion-de-rotulo.test.ts guarda el JSON de cada esquema).
 */
export const CLAVES_DE_LAS_PASADAS = Object.freeze({
  razonar: Object.freeze({
    /** De la más nueva a la más vieja: v2 (re-derivación del 04-10), v1 (junio y agosto). */
    versiones: Object.freeze(['engine-reason-v2', 'engine-reason-v1'] as const),
    schema: z.object({ reasoning: z.string().min(1).max(2000) }),
    entrada: (claimId: string) => ({ claimId }),
  }),
  extraer: Object.freeze({
    version: 'engine-extract-v1',
    schema: z.object({
      verdict: z.enum(['verificado', 'parcial', 'sin-datos']),
      cites: z.array(z.object({ candidateIndex: z.number().int(), snippet: z.string() })).max(5),
    }),
    entrada: (claimId: string, reasoning: string) => ({ claimId, reasoning }),
  }),
})

/** El primario de una pasada: bajo su clave guardó lo que contestó cada paso. */
export interface PrimarioDelRotulo {
  backend: Backend
  claudeCodeModel?: string
  openaiModel?: string
}

/** Lo que hay bajo la clave de una pregunta para `primario`, con quién lo escribió. */
export type LectorDeCache = (
  primario: PrimarioDelRotulo,
  pregunta: { promptVersion: string; schema: ZodTypeAny; input: unknown },
) => { backend: Backend; model: string; result: unknown } | null

/**
 * El primario con que corrió la pasada que escribió un rótulo, o `null` si no
 * se sabe leer. claude-code corría con sonnet —el defecto del cliente, y lo que
 * nombran las entradas de agosto (`claude-code:sonnet`)—; un modelo de OpenAI se
 * nombra a sí mismo. Con cualquier otro rótulo no se sabe bajo qué clave buscar.
 */
export function primarioDelRotulo(editor: string | undefined): PrimarioDelRotulo | null {
  if (!editor?.startsWith(PREFIJO)) return null
  const quien = editor.slice(PREFIJO.length)
  if (quien === 'claude-code') return { backend: 'claude-code', claudeCodeModel: 'sonnet' }
  if (/^gpt-[\w.-]+$/.test(quien)) return { backend: 'openai', openaiModel: quien }
  return null
}

/** Un paso que la caché prueba: quién lo contestó y con qué versión del prompt. */
export interface PasoProbado {
  backend: Backend
  model: string
  version: string
}

export type MotivoParaDejarElRotulo =
  /** No hay entrada, o no es una retractación del motor. */
  | 'no-es-del-motor'
  /** Su rótulo no dice bajo qué clave buscar. */
  | 'rotulo-desconocido'
  /** La caché no prueba qué razonamiento la produjo, o quién lo decidió. */
  | 'sin-procedencia'
  /** El rótulo ya nombra a quien contestó. */
  | 'ya-es-ese'

/** Cómo se dice en la salida cada fila que se deja. */
export const MOTIVO_PARA_DEJAR_EL_ROTULO: Readonly<Record<MotivoParaDejarElRotulo, string>> = {
  'no-es-del-motor': 'no es una retractación del motor',
  'rotulo-desconocido': 'su rótulo no dice bajo qué clave buscar',
  'sin-procedencia': 'la caché no prueba quién la escribió',
  'ya-es-ese': 'el rótulo ya nombra a quien contestó',
}

export type DecisionDeRotulo =
  | {
      accion: 'corregir'
      claimId: string
      antes: string
      rotulo: string
      razonar: PasoProbado
      extraer: PasoProbado
    }
  | { accion: 'dejar'; porque: MotivoParaDejarElRotulo }

/**
 * El rótulo de quien contestó: uno si los dos pasos los contestó el mismo, los
 * dos si no, el que razonó primero (`verdict-engine:claude-code+gpt-4o-mini`).
 */
export function rotuloDeLosPasos(
  razonar: { backend: Backend; model: string },
  extraer: { backend: Backend; model: string },
): string {
  const a = rotuloDeModelo(razonar)
  const b = rotuloDeModelo(extraer)
  return `${PREFIJO}${a === b ? a : `${a}+${b}`}`
}

/**
 * Qué rótulo prueba la caché para una retractación del motor, o por qué se deja.
 *
 * Busca bajo la clave del primario del rótulo ORIGINAL —el de antes de cualquier
 * corrección: ahí guardó la pasada—, prueba las versiones del prompt de razonar
 * de la más nueva a la más vieja y se queda con la que PRODUJO lo publicado; con
 * ella, su extracción. Sin las dos no hay prueba.
 */
export function decidirCorreccionDeRotulo(a: {
  claimId: string
  entrada: OverlayEntry | undefined
  leer: LectorDeCache
}): DecisionDeRotulo {
  const e = a.entrada
  if (!e || e.source !== 'verdict-engine') return { accion: 'dejar', porque: 'no-es-del-motor' }
  const original = e.labelCorrections?.[0]?.previous ?? e.editor
  const primario = primarioDelRotulo(original)
  if (!primario || !e.editor) return { accion: 'dejar', porque: 'rotulo-desconocido' }
  const publicado = e.verification.summary
  if (!publicado) return { accion: 'dejar', porque: 'sin-procedencia' }
  const { razonar: paso1, extraer: paso2 } = CLAVES_DE_LAS_PASADAS
  for (const version of paso1.versiones) {
    const r = a.leer(primario, {
      promptVersion: version,
      schema: paso1.schema,
      input: paso1.entrada(a.claimId),
    })
    const reasoning = (r?.result as { reasoning?: unknown } | null | undefined)?.reasoning
    if (!r || typeof reasoning !== 'string') continue
    const loProdujo =
      reasoning.slice(0, RESUMEN_MAX) === publicado || recortarResumen(reasoning) === publicado
    if (!loProdujo) continue
    const x = a.leer(primario, {
      promptVersion: paso2.version,
      schema: paso2.schema,
      input: paso2.entrada(a.claimId, reasoning),
    })
    if (!x) return { accion: 'dejar', porque: 'sin-procedencia' }
    const razonar = { backend: r.backend, model: r.model, version }
    const extraer = { backend: x.backend, model: x.model, version: paso2.version }
    const rotulo = rotuloDeLosPasos(razonar, extraer)
    if (rotulo === e.editor) return { accion: 'dejar', porque: 'ya-es-ese' }
    return { accion: 'corregir', claimId: a.claimId, antes: e.editor, rotulo, razonar, extraer }
  }
  return { accion: 'dejar', porque: 'sin-procedencia' }
}

/** Quién firma y por qué: lo mismo para todas las filas de una corrida. */
export interface FirmaDeCorreccion {
  /** El porqué, ≥20 caracteres. Se añade tras la procedencia de cada fila. */
  motivo: string
  /** Una persona o la cuenta de rol; nunca el hueco de una orden. */
  editor: string
  stamp: string
}

export interface FilaCorregida {
  claimId: string
  antes: { editor: string; reason: string }
  despues: { editor: string; reason: string; correccion: CorreccionDeRotulo }
}

/** Qué paso contestó cada modelo, en palabras, y de dónde se sabe. */
function pasosEnPalabras(c: { razonar: PasoProbado; extraer: PasoProbado }): string {
  const a = rotuloDeModelo(c.razonar)
  const b = rotuloDeModelo(c.extraer)
  const quien = a === b ? `Razonó y decidió ${a}` : `Razonó ${a} y decidió ${b}`
  return `${quien}, según .llm-cache (${c.razonar.version} y ${c.extraer.version}).`
}

/**
 * El overlay con los rótulos corregidos, y el antes y el después de cada fila.
 * Puro: devuelve uno nuevo, validado; el de entrada no se toca.
 *
 * Cada corrección se aplica sólo si la entrada sigue diciendo lo que decía
 * cuando se decidió, y si su motivo empieza por el rótulo de antes: el prefijo
 * es lo único del motivo que cambia.
 */
export function corregirRotulos(
  overlay: Overlay,
  correcciones: readonly Extract<DecisionDeRotulo, { accion: 'corregir' }>[],
  firma: FirmaDeCorreccion,
): { overlay: Overlay; filas: FilaCorregida[] } {
  const hueco = rechazoDeMarcador(firma.editor)
  if (hueco) throw new Error(`[rotulo] --editor: ${hueco}`)
  const motivo = (firma.motivo ?? '').trim()
  if (motivo.length < 20) {
    throw new Error('[rotulo] --reason tiene que decir el porqué en ≥20 caracteres')
  }
  const editor = firma.editor.normalize('NFC').replace(/\s+/g, ' ').trim()
  const entries: Record<string, OverlayEntry> = { ...overlay.entries }
  const filas: FilaCorregida[] = []
  for (const c of correcciones) {
    const e = entries[c.claimId]
    if (!e || e.source !== 'verdict-engine' || e.editor !== c.antes) {
      throw new Error(
        `[rotulo] ${c.claimId}: la entrada ya no dice ${c.antes}; la corrección se decidió para otro estado`,
      )
    }
    const prefijoAntes = `verdict-engine (${c.antes.slice(PREFIJO.length)}) `
    if (!(e.reason ?? '').startsWith(prefijoAntes)) {
      throw new Error(
        `[rotulo] ${c.claimId}: el motivo no empieza por «${prefijoAntes.trim()}», y no se sabe qué cambiar en él`,
      )
    }
    const reason = `verdict-engine (${c.rotulo.slice(PREFIJO.length)}) ${e.reason!.slice(prefijoAntes.length)}`
    const correccion: CorreccionDeRotulo = {
      previous: c.antes,
      reason: `${pasosEnPalabras(c)} ${motivo}`,
      editor,
      correctedAt: firma.stamp,
    }
    entries[c.claimId] = {
      ...e,
      editor: c.rotulo,
      reason,
      labelCorrections: [...(e.labelCorrections ?? []), correccion],
    }
    filas.push({
      claimId: c.claimId,
      antes: { editor: c.antes, reason: e.reason! },
      despues: { editor: c.rotulo, reason, correccion },
    })
  }
  const next: Overlay = { version: overlay.version, generatedAt: firma.stamp, entries }
  validateOverlay(next)
  return { overlay: next, filas }
}
