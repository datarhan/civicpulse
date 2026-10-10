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
 * veredictos ese texto era `reasoning.slice(0, 300)` (hoy `recortarResumen`, claim-verifier-engine.ts),
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
 *     El 04-10-2026 la vía `--ids` de #185 re-derivó las 101: 81 salieron de la
 *     lista con su explicación nueva; quedaron las 20 en las que el modelo veía
 *     respaldo. El 05-10-2026 tres salieron por la subida firmada (#241); el
 *     06-10-2026, cinco con su explicación nueva, cuando el motor dejó de leer
 *     «ningún candidato la respalda» como `parcial` (conclusion-sin-respaldo.ts).
 *     Siguen aquí las que el modelo ve respaldadas sólo por el título del
 *     registro (para un curador) y cuatro cuya explicación nueva no hacía más
 *     que repetir la afirmación (c8kr44-088, -089, -114 y -117): lo decidió el
 *     coordinador, porque en la tarjeta podía leerse como si el motor la
 *     afirmara.
 *   · Cada entrada fija el COMIENZO del texto retirado, no sólo la fila. Cuando
 *     el overlay se corrija con `downgrade-verdict` —desde el 10-10-2026, la
 *     explicación firmada de una persona: `--amend-reason` sobre la retractación
 *     del motor—, el texto nuevo se imprime solo, y
 *     tests/claim-ledger-resumen.test.jsx pide quitar la entrada.
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
  '1qi8axv-023-cit-3e6224': 'Task completed: provided skeptical fact-',
  '1sqj7is-081-cit-50c5bb': 'Task completed: provided the requested 2',
  'c8kr44-088-cit-d63a7d': 'Tarea de razonamiento (fact-checking en ',
  'c8kr44-089-cit-712906': 'Tarea de fact-checking en español sobre ',
  'c8kr44-114-cit-054e8e': 'Se ha razonado en español sobre la afirm',
  'c8kr44-117-cit-d6cf5b': 'Task completed: provided skeptical fact-',
  'k4olcs-176-cit-225080': 'Task completed: provided the requested 2',
  'otxq2c-209-cit-7741cf': 'Task was a direct fact-checking reasonin',
  'qz6weg-184-cit-8629f9': 'Task was a Spanish-language fact-checkin',
  'qz6weg-246-cit-98306f': 'Task completed: provided skeptical Spani',
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
