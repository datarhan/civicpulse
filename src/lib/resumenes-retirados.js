// @ts-check
/**
 * Los resúmenes del verificador que la tarjeta de declaraciones ya no imprime,
 * porque hablan de la tarea del modelo y no de la declaración.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * `ClaimLedger` pinta `verification.summary` bajo la cita de cada concejal en
 * /plenos/:id y /departamentos/:slug. En las retractaciones del motor de
 * veredictos ese texto es `reasoning.slice(0, 300)` (claim-verifier-engine.ts),
 * y el paso que lo produce pide «RAZONA en texto libre» dentro de un esquema
 * JSON de un solo campo. En la corrida del 02-08-2026 con claude-code el modelo
 * escribió muchas veces su análisis como respuesta y dejó en ese campo un parte
 * de su encargo; lo dicen los propios textos: «Análisis completado en el texto
 * de respuesta.», «ya proporcioné el análisis textual completo en la respuesta
 * al usuario». Con él iba lo que el SessionStart de superpowers metía en cada
 * llamada hasta #147: «no aplica ningún skill de "superpowers"».
 *
 * Medido el 29-09-2026 sobre los 4.964 trozos servidos: 878 llevan resumen del
 * motor y 101 hablan de la tarea. Se leyeron a mano. Una expresión regular de
 * palabras clave encontraba 67 y, ensanchada, se llevaba resúmenes de verdad
 * («la respuesta del Ayuntamiento», «esta tarea en particular»).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE, Y QUÉ NO
 *
 *   · Es una retirada, el nivel A de `decideAutomation`: la tarjeta deja de
 *     imprimir el texto y dice que lo retiró. No escribe otra explicación en su
 *     lugar: la de verdad se quedó en la respuesta del modelo, que no se guardó.
 *   · Cada entrada fija el COMIENZO del texto retirado, no sólo la fila. Cuando
 *     el overlay se corrija con `downgrade-verdict`, el texto nuevo se imprime
 *     solo, y tests/claim-ledger-resumen.test.jsx pide quitar la entrada.
 *   · Un comienzo y no una huella: `fnv32` vive en src/scraper/hash.ts, que
 *     importa node:crypto y no puede ir al navegador, y no se copia. Cuarenta
 *     caracteres bastan para saber si el texto cambió, y quien revise la lista
 *     lee qué se retira. Donde la nota va después, lo dice un comentario.
 *   · No toca los datos. El texto sigue en public/data/pleno-claims-overlay.json
 *     (curado: sólo lo cambia su CLI) y en el trozo servido de cada pleno, que
 *     se descarga por su URL. Esto deja de PINTARLO.
 *   · /declaraciones no imprime el resumen, así que no le hace falta.
 */

/** Lo que la tarjeta dice donde iba la explicación retirada. */
export const ROTULO_RESUMEN_RETIRADO =
  'Explicación retirada: el verificador LLM guardó aquí una nota sobre su propia tarea.'

/**
 * id de la declaración → comienzo del resumen retirado.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RESUMENES_RETIRADOS = Object.freeze({
  '10yl550-019-afi-d5abfe': 'Task was a Spanish fact-checking reasoni',
  '10yl550-023-cit-7e3daa': 'Task completed: reasoned in Spanish abou',
  // La nota va después: «…solo he razonado…».
  '10yl550-037-cit-b6051b': 'Analicé el único candidato disponible (c',
  '10yl550-158-cit-73d3cf': 'Task completed: reasoned in Spanish abou',
  '10yl550-165-cit-3bf9ea': 'Reasoned in Spanish about lack of suppor',
  '10yl550-220-acu-0101aa': 'Se solicitó razonar (no emitir veredicto',
  '10yl550-259-afi-8a2a47': 'Task completed: provided skeptical fact-',
  '10yl550-261-cit-8b0e74': 'Task completed: reasoned in Spanish abou',
  '10yl550-270-cit-bb5f00': 'Task completed: provided skeptical reaso',
  '10yl550-271-cit-156c87': 'Task completed: provided skeptical reaso',
  // La nota va después: «…las razones ya fueron expuestas en la respuesta».
  '10yl550-283-cit-abcc1c': 'Analicé la afirmación y los dos candidat',
  '10yl550-320-cit-a652c5': 'Task completed: reasoned in Spanish abou',
  '10yl550-323-cit-fb13f0': 'Se trata de una tarea de verificación de',
  '10yl550-334-cit-3efbd3': 'Task completed: reasoned in Spanish abou',
  '10yl550-340-afi-0d1d28': 'Task completed: provided skeptical reaso',
  '1237hbp-004-cit-df8455': 'Task was a Spanish fact-checking reasoni',
  '1237hbp-046-cit-df61b1': 'Se proporcionó el razonamiento en españo',
  '1237hbp-093-afi-8e84d6': 'Se proporcionó el razonamiento en españo',
  '19gax3o-006-cit-159728': 'Respondí con el razonamiento escéptico s',
  '19gax3o-016-cit-cc8758': 'Provided the requested 2-4 sentence skep',
  '19gax3o-034-afi-9cd3e8': 'Se completó el razonamiento solicitado e',
  '19gax3o-034-cit-8ae8be': 'Se proporcionó el razonamiento de verifi',
  '19gax3o-046-cit-f2cefa': 'Realicé la verificación escéptica solici',
  '19gax3o-049-cit-65389c': 'Se trata de una tarea de razonamiento so',
  '19gax3o-052-cit-ad4884': 'Análisis completado en el texto de respu',
  '19gax3o-053-cit-3fa2de': 'Respondí directamente en texto (2-4 fras',
  '19gax3o-070-cit-835912': 'Task completed: provided skeptical reaso',
  '19gax3o-073-afi-05e5d4': 'Se pidió razonar (no emitir veredicto) s',
  '19gax3o-084-afi-b23961': 'Task completed: provided skeptical fact-',
  '19gax3o-089-cit-a21e57': 'Task completed: provided the requested s',
  '19gax3o-109-cit-c0dcb2': 'Completé el análisis de razonamiento esc',
  '19gax3o-121-cit-416760': 'Task completed: provided the skeptical r',
  '19gax3o-143-cit-a3a7a1': 'Task completed: provided skeptical fact-',
  '19gax3o-145-cit-fb374e': 'Tarea de razonamiento de fact-checking c',
  '19gax3o-148-cit-db55b0': 'Task completed: reasoned in Spanish abou',
  '19gax3o-186-cit-7e4d6f': 'Se trata de una tarea de verificación de',
  '1du4rf5-068-afi-c508ad': 'Task completed: reasoned in Spanish abou',
  '1du4rf5-088-pro-3d76d6': 'Se solicitó únicamente razonamiento en e',
  '1qi8axv-015-cit-1eea04': 'Se solicitó razonar (no emitir veredicto',
  '1qi8axv-015-cit-4c14b8': 'Task completed: provided skeptical reaso',
  '1qi8axv-023-cit-3e6224': 'Task completed: provided skeptical fact-',
  '1qi8axv-052-cit-977367': 'Task completed: reasoned in Spanish (as ',
  '1sqj7is-044-cit-c2b056': 'Task completed: provided skeptical Spani',
  '1sqj7is-076-cit-64f1e9': 'Se trata de una tarea de verificación de',
  '1sqj7is-076-cit-78e78d': 'Se solicitó razonar (no emitir veredicto',
  '1sqj7is-081-cit-17253a': 'Se solicitó razonar (no verificar con ve',
  '1sqj7is-081-cit-50c5bb': 'Task completed: provided the requested 2',
  'c8kr44-065-cit-85dc84': 'Task completed: reasoned in Spanish abou',
  'c8kr44-081-cit-74fc55': 'Task completed: provided skeptical fact-',
  'c8kr44-088-cit-d63a7d': 'Tarea de razonamiento (fact-checking en ',
  'c8kr44-089-cit-528f7b': 'Task completed: reasoned in Spanish abou',
  'c8kr44-089-cit-712906': 'Tarea de fact-checking en español sobre ',
  'c8kr44-114-cit-054e8e': 'Se ha razonado en español sobre la afirm',
  'c8kr44-117-cit-d6cf5b': 'Task completed: provided skeptical fact-',
  'c8kr44-121-cit-3e50b3': 'Task was a fact-verification reasoning r',
  'c8kr44-122-cit-86e6a8': 'Task completed: provided skeptical reaso',
  'c8kr44-140-cit-bbc2ce': 'Se solicitó razonar (no emitir veredicto',
  'c8kr44-142-cit-b8c30e': 'Task completed: reasoned in Spanish abou',
  'c8kr44-144-cit-eb3ce3': 'Task completed: provided skeptical Spani',
  'c8kr44-146-cit-ccd20c': 'Task completed: provided skeptical reaso',
  // La nota va después: «…Expliqué en español, en formato de razonamiento libre…».
  'c8kr44-146-cit-f185ae': 'Analicé el único candidato disponible y ',
  'k4olcs-019-acu-940acd': 'Task was a direct fact-checking reasonin',
  'k4olcs-024-cit-d01bdc': 'Task completed: provided skeptical fact-',
  'k4olcs-027-cit-7e70d5': 'Task completed: reasoned in Spanish abou',
  'k4olcs-092-cit-d06c54': 'Task completed: provided skeptical reaso',
  'k4olcs-099-cit-cc3281': 'Se solicitó razonamiento en español sobr',
  'k4olcs-102-cit-607cff': 'Task was a direct factual-reasoning requ',
  'k4olcs-110-afi-c046e0': 'Reasoned in Spanish as requested in the ',
  'k4olcs-176-cit-225080': 'Task completed: provided the requested 2',
  'k4olcs-176-cit-470064': 'Tarea de verificación de hechos completa',
  'ma87e0-104-cit-528973': 'Task completed: provided skeptical reaso',
  'ma87e0-115-afi-25ea23': 'Task completed: reasoned in Spanish abou',
  'ma87e0-151-cit-75b31f': 'Task was a direct Spanish-language fact-',
  'ma87e0-162-cit-092d3e': 'Se solicitó razonar (no emitir veredicto',
  'ma87e0-195-cit-436a7e': 'Task completed: provided skeptical reaso',
  'ma87e0-195-cit-56214f': 'Se solicitó razonar (no veredicto) sobre',
  'otxq2c-033-cit-bfa19f': 'Tarea de verificación de hechos completa',
  'otxq2c-063-cit-d210ea': 'Se trata de una tarea de verificación de',
  'otxq2c-074-cit-07c35d': 'Task completed: provided skeptical Spani',
  'otxq2c-182-cit-24c2e1': 'Reasoned in Spanish about whether candid',
  'otxq2c-191-cit-39383e': 'Se completó el razonamiento escéptico so',
  'otxq2c-209-cit-7741cf': 'Task was a direct fact-checking reasonin',
  'otxq2c-212-cit-182551': 'Task was a Spanish-language fact-verific',
  'qz6weg-000-cit-ce337c': 'Se solicitó razonar (no emitir veredicto',
  'qz6weg-019-cit-c7d444': 'Task was a direct fact-checking reasonin',
  'qz6weg-066-cit-82f4d6': 'Task completed: provided the requested s',
  'qz6weg-162-afi-41adc7': 'Task completed: provided skeptical reaso',
  'qz6weg-184-afi-285e06': 'Tarea de fact-checking directa: analicé ',
  'qz6weg-184-cit-8629f9': 'Task was a Spanish-language fact-checkin',
  'qz6weg-191-cit-37590e': 'Fact-checking task completed via direct ',
  'qz6weg-191-cit-7c0aea': 'Se solicitó razonamiento en español sobr',
  'qz6weg-235-afi-4a748f': 'Task completed: reasoned in Spanish abou',
  'qz6weg-246-cit-98306f': 'Task completed: provided skeptical Spani',
  'qz6weg-247-cit-98a38d': 'Se completó el razonamiento solicitado e',
  'qz6weg-247-cit-a60c47': 'Tarea de fact-checking en español: evalu',
  'qz6weg-248-cit-ef3da9': 'Task completed: provided skeptical Spani',
  'qz6weg-249-cit-3e02ef': 'Provided the requested Spanish-language ',
  'qz6weg-249-cit-cef2af': 'Realicé el análisis de razonamiento soli',
  'qz6weg-250-cit-6a8694': 'Se solicitó razonar (no verificar) sobre',
  'qz6weg-271-cit-f67afa': 'Task completed: reasoned in Spanish abou',
  // La nota va después: «…Respondí en español con el razonamiento solicitado…».
  'qz6weg-276-cit-5b837f': 'Analicé el único candidato disponible (c',
})

/**
 * El resumen que la tarjeta puede imprimir, o `null` si la lista lo retira.
 *
 * Una fila de la lista cuyo texto ya no empieza por lo retirado se imprime:
 * la corrección llegó y hay que dejarla ver.
 *
 * @param {{ claimId?: string, summary?: string } | null | undefined} verification
 * @returns {string | null}
 */
export function resumenPublicable(verification) {
  const summary = verification?.summary ?? ''
  const id = verification?.claimId
  if (id && Object.prototype.hasOwnProperty.call(RESUMENES_RETIRADOS, id)) {
    if (summary.startsWith(RESUMENES_RETIRADOS[id])) return null
  }
  return summary
}
