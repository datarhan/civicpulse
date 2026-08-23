/**
 * Plenos que el nocturno NO intenta transcribir, y por qué.
 *
 * Existe como módulo —y no sólo como el valor por defecto en
 * `hallazgos-pipeline.sh`— porque una lista negra que sólo conoce el shell
 * produce un aviso que nadie puede apagar.
 *
 * Lo que pasó: del 12 al 23-ago-2026 el parte repitió cada dos días
 * «Transcripción sin avanzar · 1 pendiente(s) · ↳ OpenAI sin saldo, añade
 * fondos». Las dos mitades eran ciertas por separado —OpenAI devuelve 429
 * `credit_balance_exhausted`, y la última transcripción es del 12— pero juntas
 * mienten: la única sesión pendiente es `1l7hhu7`, que está aquí a propósito.
 * Pagar la factura no habría cambiado nada. El nocturno lo sabía y lo decía en
 * su log («no transcribable backlog»); el parte no, porque contaba pendientes
 * sin conocer esta lista.
 *
 * Un centinela que no se puede apagar deja de ser información. Peor: el día que
 * la transcripción se pare de verdad, dirá exactamente lo mismo que lleva once
 * días diciendo.
 *
 * `tests/transcribe-blocklist.test.ts` compara esta lista con el valor por
 * defecto del shell y falla si se separan. El shell conserva SU literal a
 * propósito: derivarlo de aquí en tiempo de ejecución añadiría un modo de fallo
 * —una llamada que devuelve vacío deja la lista negra vacía y publica el
 * fragmento que existe para evitar— y eso es peor que la deriva que el test ya
 * impide.
 */

export interface BlockedPleno {
  id: string
  /** Fecha de la sesión, para poder buscarla si aparece una grabación entera. */
  since: string
  why: string
}

export const TRANSCRIBE_BLOCKLIST: readonly BlockedPleno[] = [
  {
    id: '1l7hhu7',
    since: '2023-02-13',
    why:
      'El único vídeo publicado en el canal es un «Part I» de 22:36 cuyo audio no ' +
      'lleva habla inteligible (whisper devuelve todo puntos; volumedetect da casi ' +
      'silencio). Aun con una transcripción limpia, un Part-I suelto representaría ' +
      'mal la sesión entera, así que este pleno se queda honestamente vacío hasta ' +
      'que aparezca una grabación completa.',
  },
]

export const TRANSCRIBE_BLOCKLIST_IDS: readonly string[] = TRANSCRIBE_BLOCKLIST.map((b) => b.id)

/**
 * Sesiones que de verdad esperan transcripción.
 *
 * «Pendiente» tiene que significar «alguien puede hacer algo con esto». Una
 * sesión bloqueada no está pendiente: está decidida.
 */
export function transcriptionPending(
  transcribable: readonly string[],
  transcripts: ReadonlySet<string>,
): number {
  const blocked = new Set(TRANSCRIBE_BLOCKLIST_IDS)
  return transcribable.filter((id) => !transcripts.has(id) && !blocked.has(id)).length
}
