/**
 * The prompt that recovers a pleno's speaker map from audio.
 *
 * Lives outside `src/llm/prompts.ts` because it is not a text prompt: it goes
 * to a multimodal model with an audio part attached, and it does not travel
 * through `src/llm/client.ts` at all (that client is text-only — `claude -p`
 * takes no attachments, and a text model handed an audio job with no audio
 * would invent the answer).
 *
 * Every rule below is here because the measured output was wrong without it.
 * Do not "tidy" one away.
 *
 * ## What actually checks this
 *
 * This used to say «sin re-ejecutar `eval:speaker-map`». **That script has
 * never existed** — `package.json` has `eval:extractor` and nothing else — so
 * the instruction named a gate nobody could run, which is the same class of
 * problem as a test that measures nothing. The real gates, both cheap:
 *
 *   · `tests/speaker-map-mmss.test.ts` replays two REAL captured responses
 *     (`tests/fixtures/gemini-speaker-map-{mmss,clean}_2026-08-11.txt`) through
 *     the shipped parser. Verified by ablation: strip `decodeElapsed` and 8 of
 *     its 16 assertions fail.
 *   · `tests/speaker-map-coverage.test.ts` pins the coverage gate and the
 *     resume/budget planners against the measured `15uvjew` numbers.
 *
 * Neither can tell you whether a WORDING change moves the model, because both
 * replay fixed responses. That question needs a live run against known-bad
 * chunks and costs quota (~20 requests/day, free tier). The v2 timestamp rule
 * below is **unmeasured on that axis** — `decodeElapsed` is what makes the
 * pipeline correct regardless, and the prompt is defence in depth. Each map
 * records `promptVersion`, so a run's `failedChunks` can be attributed to a
 * wording after the fact.
 */

/**
 * Bump when the prompt changes. Recorded in each map as provenance: it is what
 * tells you which wording produced a given session's segments.
 *
 * It is NOT a cache key, whatever it used to say — `extract-speaker-map.ts`
 * caches nothing, every chunk is a fresh request. Nothing read this constant at
 * all until the map started carrying it, which is why the claim went unnoticed.
 *
 * v2 (2026-08-11): the timestamp rule now forbids minutes with a worked
 * counter-example. v1 already said «Nunca mm:ss» and the model wrote `1.19` for
 * 79 s anyway, so the wording alone is not load-bearing — `decodeElapsed`
 * absorbs the slip on the way in, and this is defence in depth. Whether it
 * lowers the rate is UNMEASURED; see the note at the top of this file for why
 * no offline gate can answer that, and what a live run would have to do.
 */
export const SPEAKER_MAP_PROMPT_VERSION = 'speaker-map-v2'

/**
 * Chunk length in seconds.
 *
 * Measured 2026-08-10 on `10yl550`: at 1200 s with this segmentation the model
 * returned 948 s — 79% — and reported `finishReason: STOP`. Not a token cap; it
 * believed it had finished, having silently dropped 50 lines of debate. It
 * spent 26 k thinking tokens against 8 k of output, so the fine segmentation is
 * what exhausts it. 600 s leaves a wide margin, and the coverage floor catches
 * the rest.
 */
export const SPEAKER_MAP_CHUNK_SECONDS = 600

/**
 * Minimum share of a chunk's duration the transcript must span before the
 * result is written. Same floor `transcribe-pleno.sh` already applies to the
 * OpenAI path, for the same reason: a partial transcript that lands on disk is
 * indistinguishable downstream from a session where nobody spoke.
 */
export const SPEAKER_MAP_COVERAGE_FLOOR = 0.85

export function buildSpeakerMapPrompt(): string {
  return `Eres un transcriptor forense de sesiones plenarias municipales españolas. Este audio es un fragmento de un pleno del Ayuntamiento de Riba-roja de Túria (Comunitat Valenciana). Los intervinientes alternan entre castellano y valencià, a veces dentro de la misma frase.

Transcribe el fragmento COMPLETO, de principio a fin. No resumas, no omitas, no corrijas el estilo de nadie.

## Salida — dos bloques, en este orden

### Bloque 1 · la transcripción

Una línea por segmento de habla. Formato EXACTO, sin desviarse ni un carácter:

[INICIO → FIN] (SPEAKER_NN) texto literal

- \`INICIO\` y \`FIN\` en **segundos totales** desde el inicio de ESTE audio, con UN decimal: \`[12.4 → 18.9]\`.
- **Nunca en minutos.** Ni \`mm:ss\` ni \`m.ss\`. A los 79 segundos se escribe \`79.0\`, jamás \`1.19\`. A los 599 se escribe \`599.0\`, jamás \`9.59\`. El número sigue creciendo después de 60: \`59.5\`, \`60.0\`, \`61.0\`… hasta ~600.
- Si el sello que vas a escribir es MENOR que el anterior, has cambiado de notación a mitad de la transcripción. Vuelve a segundos totales.
- \`FIN\` siempre mayor que \`INICIO\`. Los segmentos van en orden y no se solapan.
- Segmenta por unidades naturales de habla, de 2 a 15 segundos. Una intervención larga son muchas líneas, no una sola.
- \`SPEAKER_NN\` con dos dígitos, numerando por orden de primera aparición.
- La flecha es → (U+2192), con un espacio a cada lado.

### Bloque 2 · quién es cada SPEAKER_NN

Después de la transcripción, la línea \`=== HABLANTES ===\` y debajo una línea por etiqueta, con CINCO campos separados por \`|\`:

SPEAKER_NN | nombre o cargo | partido | QUIEN_LO_DICE @SEGUNDO "cita literal" | rel: TIPO

- \`QUIEN_LO_DICE\` es el SPEAKER_NN que PRONUNCIA la cita, que casi nunca es el mismo al que identifica. Este campo es obligatorio.
- \`@SEGUNDO\` en segundos totales, igual que el bloque 1: \`@116.0\`, jamás \`@1.56\`. Tiene que caer dentro del segmento de \`QUIEN_LO_DICE\`.
- \`TIPO\` es uno de:
  - \`turn-grant\` — la cita cede la palabra al hablante identificado, que interviene JUSTO DESPUÉS. Ej: la presidencia dice «Compromís, Rafa».
  - \`reply\` — la cita responde o agradece al hablante identificado, que ha intervenido JUSTO ANTES. Ej: «Sí, gràcies, alcalde».
  - \`back-reference\` — la cita nombra al hablante a cualquier distancia. Ej: «l'exposició de motius que ha plantejat David».
- Si no puedes acreditar el nombre, escribe \`sin identificar\` en ese campo. Igual con el partido. Una etiqueta sin ninguna acreditación se omite del bloque 2.

## Reglas, en orden de importancia

1. **VERBATIM.** Reproduce exactamente lo que se dice, con muletillas, repeticiones y frases inacabadas. No parafrasees, no limpies la gramática. Si algo es ininteligible, escribe [inaudible]. Nunca inventes contenido para rellenar un hueco.

2. **NÚMEROS TAL COMO SE PRONUNCIAN.** Si alguien dice «cuarenta por cien», escribe «cuarenta por cien», NO «40%». Si dice «mil cien euros», escribe «mil cien euros», NO «1100 €». Sólo dígitos cuando el hablante enuncia la cifra dígito a dígito. Esta regla es absoluta: el texto se coteja carácter a carácter.

3. **IDIOMA.** Cada frase en el idioma en que se pronuncia. No traduzcas del valencià al castellano ni al revés.

4. **UNA PERSONA, UNA ETIQUETA.** El mismo hablante lleva SIEMPRE el mismo SPEAKER_NN dentro de este fragmento. Personas distintas, etiquetas distintas. No reutilices una etiqueta para dos personas ni inventes variantes de una etiqueta.

5. **LA ETIQUETA NUNCA LLEVA NOMBRE.** En el bloque 1 sólo aparece SPEAKER_NN. Los nombres van únicamente en el bloque 2.

6. **NOMBRES: sólo si el audio los da.** Atribuye un nombre a un SPEAKER_NN sólo si el propio audio lo acredita, y copia la cita literal como prueba. No deduzcas la identidad por el contenido, por el partido que se menciona, ni por el tema del que se habla. Un nombre que no se ha pronunciado no puede aparecer.

7. **EL PARTIDO, IGUAL.** Sólo si el audio lo dice. «Compromís, Rafa» acredita partido y nombre. Una intervención que critica al PSOE no acredita NADA sobre quien habla: en un debate, el partido que se nombra suele ser aquel al que se ataca.
`
}
