/**
 * Qué sesiones transcritas siguen sin extraer, para que una pasada fallida se
 * recupere sola (paso 0.2 del plan de plenos, 22-11-2026).
 *
 * El 19-11-2026 el sondeo de claude-code de las 09:30 pasó; al acabar la
 * transcripción de `51k7yx` (el pleno del 2-11) la sesión OAuth había caducado,
 * las 311 ventanas fallaron y la sesión más reciente se quedó con cero
 * declaraciones. Nada volvía a intentarlo: la tubería sólo extrae lo que acaba
 * de transcribir, y `51k7yx` ya no estaba en el backlog de transcripción.
 *
 * Una sesión entra en la cola si:
 *   · su transcripción es de AUDIO (`transcriptKind`). Las de acta —texto del
 *     acta con marcas `[0.0 → 0.0]`— no: una «declaración» sacada de ahí sería
 *     prosa del secretario, y /metodologia#citas-transcripcion dice que las
 *     citas salen de la transcripción automática, no del acta;
 *   · pasa la misma puerta de calidad que aplica el extractor (`assessTranscript`):
 *     una que el extractor rechazaría no gasta una pasada;
 *   · no tiene ninguna declaración en `pleno-claims-suggestions.json`, o está
 *     apuntada como extraída a medias (`RUTA_PARCIALES`);
 *   · no está apuntada como «sin declaraciones» (`RUTA_EXTRAIDAS_VACIAS`): la
 *     tubería la apunta tras varias recuperaciones fallidas con claude vivo,
 *     para que una sesión que nunca sale no bloquee la cola (~465 llamadas cada
 *     vez). Esa lista la vacía una persona.
 *
 * Más reciente primero: la sesión nueva es la que un lector echa de menos.
 */
import { transcriptKind } from '../lib/transcript-kind.js'
import { assessTranscript } from './transcript-quality'

/**
 * Las extraídas que contestaron sin ninguna declaración, una por línea. La
 * escribe hallazgos-pipeline.sh y la lee `extraccion:pendiente`; una prueba
 * comprueba que el script de shell nombra esta misma ruta.
 */
export const RUTA_EXTRAIDAS_VACIAS = '.cache/extraccion-sin-declaraciones.txt'

/**
 * Las extraídas a medias: ventanas SIN RESPUESTA porque claude se cayó a mitad de
 * la sesión. Tienen declaraciones, pero no todas, así que vuelven a la cola. La
 * escribe hallazgos-pipeline.sh, que también la vacía cuando sale completa.
 */
export const RUTA_PARCIALES = '.cache/extraccion-parcial.txt'

export type MotivoFuera = 'acta' | 'sin-marcas' | 'no-apta' | 'ya-extraida' | 'extraida-vacia'

export interface Candidata {
  id: string
  /** El texto de la transcripción. */
  texto: string
  /** Fecha del pleno (AAAA-MM-DD) si plenos.json la trae. */
  fecha: string | null
}

export interface Cola {
  pendientes: string[]
  fuera: { id: string; motivo: MotivoFuera; detalle?: string }[]
}

export function colaDeExtraccion(
  candidatas: readonly Candidata[],
  conDeclaraciones: ReadonlySet<string>,
  extraidasVacias: ReadonlySet<string>,
  parciales: ReadonlySet<string> = new Set(),
): Cola {
  const dentro: Candidata[] = []
  const fuera: Cola['fuera'] = []
  for (const c of candidatas) {
    if (conDeclaraciones.has(c.id) && !parciales.has(c.id)) {
      fuera.push({ id: c.id, motivo: 'ya-extraida' })
      continue
    }
    const tipo = transcriptKind(c.texto)
    if (tipo === 'acta') {
      fuera.push({ id: c.id, motivo: 'acta' })
      continue
    }
    if (tipo !== 'audio') {
      fuera.push({ id: c.id, motivo: 'sin-marcas' })
      continue
    }
    const calidad = assessTranscript(c.texto)
    if (!calidad.ok) {
      fuera.push({ id: c.id, motivo: 'no-apta', detalle: calidad.issues.join('; ') })
      continue
    }
    if (extraidasVacias.has(c.id)) {
      fuera.push({ id: c.id, motivo: 'extraida-vacia' })
      continue
    }
    dentro.push(c)
  }
  // Más reciente primero; sin fecha, al final, y el id desempata para que el
  // orden no dependa del sistema de ficheros.
  dentro.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.id.localeCompare(b.id))
  return { pendientes: dentro.map((c) => c.id), fuera }
}
