/**
 * ¿Concluye el razonamiento del motor que ningún candidato respalda la
 * declaración?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * El motor de veredictos razona en texto y luego un segundo paso, la
 * extracción, lo convierte en un veredicto con citas (claim-verifier-engine.ts).
 * El prompt de razonar dice que una coincidencia de tema NO es respaldo; el de
 * extraer llama `parcial` a lo «relacionado temáticamente». Así que un
 * razonamiento que acaba «ningún candidato respalda genuinamente la
 * afirmación; como mucho hay contexto» salía `parcial`.
 *
 * Medido sobre las 52 retractaciones que la re-derivación del 04-10-2026 (#233)
 * dejó como «ya no la retractaría», leídas a mano
 * (editorial/rederivacion-0410-52/INFORME.md): en 36, el razonamiento entero
 * concluye que no hay respaldo, y la extracción devolvió `parcial` o
 * `verificado`. El motor sólo retracta y nada de eso se publicó, pero
 * «ya no la retractaría» medía la extracción, no el respaldo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE MIDE
 *
 * tests/scraper/conclusion-sin-respaldo.test.ts contra esas 52
 * (tests/fixtures/motor-sin-respaldo_2026-10-04.json): reconoce 35 de las 36, y
 * la que no («respaldo muy débil como mucho: … no verifica la afirmación») va
 * nombrada; ninguna de las 16 que ven algún respaldo. Cada clase reconoce al
 * menos una de ellas: una clase que no caza nada es una regla sin medir.
 *
 * Y sobre la caché del 05-10-2026 (1.569 pares razonamiento/extracción del
 * motor, 226 de ellos charla de la tarea, que el motor ya salta): entre los
 * 1.343 restantes, 198 extracciones dijeron `parcial` o `verificado`, y estas
 * clases reconocen 92. Las 92 se leyeron a mano: todas concluyen que no hay
 * respaldo. De las 1.279 frases que casan en toda la caché, 2 nombran a «los
 * demás» o «el resto», y las dos son de extracciones `sin-datos`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ NO ES
 *
 *   · No es un detector de respaldo débil. «Respaldo débil/parcial: el lugar y
 *     el tipo de obra coinciden» o «respaldo como mucho débil/parcial en [1]»
 *     ven algo, y se quedan: lo que digan lo decide la extracción.
 *   · Una negación acotada no basta: «no hay respaldo genuino fuerte» (dicho de
 *     los demás candidatos) o «insuficiente para verificar la afirmación
 *     completa» son un `parcial`, y cada clase lo excluye.
 *   · Se queda corto a propósito: un razonamiento negativo que no reconoce
 *     sigue a la extracción, como antes. Lo que no puede hacer es lo contrario:
 *     un falso positivo retractaría algo que el modelo sí ve respaldado.
 */
import { patron } from './charla-de-tarea'

export interface ClaseSinRespaldo {
  nombre: string
  patron: RegExp
}

export const CLASES_SIN_RESPALDO: readonly ClaseSinRespaldo[] = [
  {
    // «Ningún candidato respalda genuinamente la afirmación», «ninguno de los
    // candidatos respalda de forma genuina la promesa», «ningún candidato
    // respalda con valores concretos». No «ningún otro candidato».
    nombre: 'ningún candidato la respalda',
    patron: patron(
      '<(ningún|ninguno de los) (candidatos?|registros?)>(?: \\p{L}+){0,1} (?:la |lo )?<(respalda|confirma|verifica|corrobora|acredita|sostiene)> (genuinamente|de verdad|realmente|de forma genuina|con valores concretos|la afirmación|la cita|la promesa)>',
    ),
  },
  {
    // «Ninguno respalda genuinamente la afirmación», «Respaldo: ninguno
    // genuino», «ninguno confirma genuinamente la afirmación».
    nombre: 'ninguno la respalda de verdad',
    patron: patron(
      '<ninguno> (?:de ellos )?(?:la |lo )?<(respalda|confirma|verifica|corrobora)> (genuinamente|de verdad|realmente)>|<ninguno genuino>',
    ),
  },
  {
    // «No hay respaldo genuino», «no veo un respaldo genuino», «no una
    // verificación genuina de la promesa». No «…genuino fuerte»: dicho de los
    // demás candidatos, deja en pie el respaldo de uno (19gax3o-124-cit-452536).
    nombre: 'no hay respaldo genuino',
    patron: patron(
      '<no (hay|existe|veo) (un )?(respaldo|confirmación|verificación|corroboración) (genuin[oa]|real)>(?! fuerte)|<no una verificación genuina>',
    ),
  },
  {
    // «Respaldo nulo o muy débil», «el respaldo es muy débil o nulo», «la
    // fuerza del respaldo es nula».
    nombre: 'respaldo nulo',
    patron: patron('<respaldo>[^.;:]{0,30}<nul[oa]>|<fuerza del respaldo es nul[oa]>'),
  },
  {
    // «Lo prudente es no considerarla verificada», «no es suficiente para
    // considerarlo verificado», «no se puede considerar verificada de forma
    // genuina».
    nombre: 'no se puede dar por verificada',
    patron: patron(
      '<no se puede considerar verificada>|<lo prudente es no considerarla verificada>|<no es suficiente para considerarlo verificado>',
    ),
  },
  {
    // «…insuficiente para verificar la afirmación», «insuficiente para
    // confirmarla». No «…la afirmación completa»: eso es un `parcial`.
    nombre: 'insuficiente para verificarla',
    patron: patron(
      '<insuficientes? para (verificar|confirmar|validar)(la|lo)>|<insuficientes? para (verificar|confirmar|validar) (la afirmación|la cita|la acusación|la promesa)>(?! complet| en su totalidad)',
    ),
  },
  {
    // «Respaldo como mucho débil y sólo contextual por [0]», «el respaldo es como
    // mucho débil y circunstancial», «Respaldo, como mucho, contextual y débil».
    // No «respaldo como mucho débil/parcial en [1]»: ése ve algo (otxq2c-209).
    nombre: 'como mucho contexto',
    patron: patron(
      '<respaldo,?(?: es,?)? como mucho,? (?:muy )?(?:débil,? y (?:(?:sól?o|meramente|puramente) )?(?:contextual|temático|circunstancial|tangencial)|contextual,? y (?:muy )?débil)>',
    ),
  },
]

/**
 * El nombre de la primera clase que reconoce una conclusión «sin respaldo» en
 * el razonamiento, o `null`.
 */
export function conclusionSinRespaldo(razonamiento: string | null | undefined): string | null {
  if (!razonamiento) return null
  for (const { nombre, patron } of CLASES_SIN_RESPALDO) {
    if (patron.test(razonamiento)) return nombre
  }
  return null
}
