/**
 * ¿Habla este texto de la tarea del modelo, en vez de la declaración?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * El motor de veredictos guarda como resumen el razonamiento del modelo
 * (`recortarResumen(reasoning)`, claim-verifier-engine.ts; hasta el 04-10-2026, `reasoning.slice(0, 300)`), y la tarjeta de
 * declaraciones lo pinta bajo la cita del concejal. En la corrida del
 * 02-08-2026 con claude-code, el campo `reasoning` recogió muchas veces el
 * parte del modelo sobre su encargo: «Task completed: reasoned in Spanish
 * about candidate support…», «Se solicitó razonar (no emitir veredicto)…»,
 * «Análisis completado en el texto de respuesta.», «no aplica ningún skill de
 * "superpowers"». Medido el 29-09-2026: 101 de los 878 resúmenes del motor que
 * se sirven, leídos uno a uno (src/lib/resumenes-retirados.js, #180).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE MIDE
 *
 * tests/scraper/charla-de-tarea.test.ts contra lo servido: reconoce los 101 y
 * ningún otro resumen. Las clases llevan nombre para que un rechazo diga cuál
 * saltó, y cada una tiene que reconocer al menos uno de la lista: una clase
 * que no caza nada es una regla sin medir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ NO ES
 *
 *   · No es un filtro de calidad. «Análisis completado: ningún candidato
 *     respalda…» o «Analicé los 8 candidatos…» se quedan: hablan de la
 *     declaración, aunque sea en primera persona.
 *   · Una palabra suelta no basta. «tarea», «solicitud», «respuesta» o
 *     «herramienta» salen en resúmenes de verdad («la respuesta del
 *     Ayuntamiento», «esta tarea en particular»): cada clase pide la
 *     construcción entera.
 *   · El `\b` de JavaScript sólo conoce [A-Za-z0-9_], así que «Expliqué\b» o
 *     «Respondí\b» no casan nunca. Los bordes de palabra se escriben `<` y `>`
 *     y se traducen a miradas alrededor de `\p{L}`.
 */

const INICIO = '(?<![\\p{L}\\p{N}])'
const FIN = '(?![\\p{L}\\p{N}])'

/** `<` abre y `>` cierra una palabra, con tildes. */
function patron(fuente: string): RegExp {
  return new RegExp(fuente.replaceAll('<', INICIO).replaceAll('>', FIN), 'iu')
}

export interface ClaseDeCharla {
  nombre: string
  patron: RegExp
}

export const CLASES_DE_CHARLA: readonly ClaseDeCharla[] = [
  {
    // «Task completed: …», «Task was a Spanish fact-checking…», «Se trata de
    // una tarea de verificación de hechos…», «Tarea de fact-checking en…».
    nombre: 'parte de la tarea',
    patron: patron(
      '<(task (completed|was)|fact-checking task)>|<tarea de (fact-checking|verificación|razonamiento)>',
    ),
  },
  {
    // «…en el cuerpo de la respuesta», «…en el texto de respuesta.», «…en la
    // respuesta al usuario», «…ya fueron expuestas en la respuesta.». No «la
    // respuesta del Ayuntamiento»: sólo la respuesta como objeto que se cierra.
    nombre: 'la respuesta como objeto',
    patron: patron(
      '<(texto|cuerpo) de (la )?respuesta>|<respuesta (de texto|al usuario)>|<en la respuesta(?=\\s*[.,;:)]|\\s*$)|<response (text|body)>|<in the response>',
    ),
  },
  {
    // «Se solicitó razonar (no emitir veredicto)…», «…el razonamiento
    // escéptico solicitado…», «as requested», «without issuing a verdict».
    nombre: 'las instrucciones',
    patron: patron(
      "<se (solicitó|pidió|ha solicitado|ha pedido) (únicamente |sólo |solo )?razona|<(razonamiento|análisis|verificación)>[^.]{0,40}<solicitad[oa]>|<(no|sin) emitir (un |el )?veredicto>|<no verificar con veredicto>|<no se emitió veredicto>|<(as requested|as instructed|per (the )?(user'?s )?(explicit )?instructions|the requested|without issuing)>",
    ),
  },
  {
    // «no aplica ningún skill de "superpowers"», «No coding/skill workflow
    // applicable», «sin necesidad de herramientas de código».
    nombre: 'herramientas o código',
    patron: patron(
      '<skills?>|<superpowers>|<coding>|<codificación>|<herramientas? de código>|<desarrollo de software>|<ingeniería de software>|<software engineering>|<tool calls?>',
    ),
  },
  {
    // «Se proporcionó el razonamiento en español…», «Expliqué en español…»,
    // «Reasoned in Spanish…». Ningún resumen de una declaración dice en qué
    // idioma se escribió.
    nombre: 'el idioma de la respuesta',
    patron: patron(
      '<(razon(é|ado|ó|amiento)|respond(í|ió)|expliqué|proporcion(é|ó)|reasoned|reasoning|responded|provided)>[^.]{0,60}<en (español|castellano)>|<in spanish>|<spanish-language>',
    ),
  },
  {
    // «Respondí directamente en texto (2-4 frases)…», «(2-4 sentences)».
    nombre: 'la extensión pedida',
    patron: patron('<\\d\\s?-\\s?\\d (frases|oraciones|sentences)>'),
  },
  {
    // «…Concluí que no hay respaldo genuino, solo he razonado», «Respondí con
    // el razonamiento escéptico…».
    nombre: 'el propio proceso',
    patron: patron('<(s[oó]lo )?he razonado>|<(respondí|he respondido)>'),
  },
]

/**
 * El nombre de la primera clase de charla que reconoce el texto, o `null`.
 *
 * @param texto el resumen o el razonamiento, tal cual se guardaría.
 */
export function charlaDeTarea(texto: string | null | undefined): string | null {
  if (!texto) return null
  for (const { nombre, patron } of CLASES_DE_CHARLA) {
    if (patron.test(texto)) return nombre
  }
  return null
}
