// @ts-check
/**
 * Qué preguntas de cada pieza NO van en el escrito que puede presentar quien lee
 * (`SolicitudLector`), por su comienzo literal y con el porqué. En la pieza
 * siguen todas: aquí sólo se decide qué se pide.
 *
 * El escrito lo firma el lector con su DNI, así que sólo puede pedir
 * información que el Ayuntamiento tenga (art. 13 de la Ley 19/2013). Se aparta
 * una pregunta cuando hace otra cosa, con la misma regla en todas las piezas:
 *
 * - **valora o pide una intención** —«¿se va a…?», «¿considera…?», «¿alguien va
 *   a asumir…?»—: no es un documento que obre en poder de nadie;
 * - **afirma o insinúa** lo que pregunta —una conclusión de la pieza, una
 *   premisa cargada, una pregunta retórica—: en un escrito a nombre del lector,
 *   esa frase pasaría a ser suya;
 * - **señala a una persona**, también por un cargo que ocupa una sola;
 * - **ya la ha pedido este proyecto** en otro reportaje: el lector duplicaría una
 *   solicitud viva, que es la razón por la que `debeOfrecerSolicitud` no ofrece
 *   el escrito en esas piezas.
 *
 * Es una decisión EDITORIAL, y por eso es una lista escrita a mano y no un
 * detector: el pin por el comienzo literal es deliberado. Reordenar el JSON no
 * cambia cuáles se piden, y si se reescribe una apartada su comienzo deja de
 * casar y tests/solicitud-lector.test.js se pone rojo, para que alguien vuelva
 * a decidir en vez de que entre sola. La prueba de que ninguna afirma fuera de
 * sus «¿…?» es sólo un indicio de esta regla, no la regla.
 *
 * La primera versión apartaba sólo las de basuras que valoran o afirman; la
 * revisión del 17-10-2026 aplicó la misma regla a las dos piezas, y apartó
 * además las que ya pide la solicitud de conteo-visitantes a la Secretaría de
 * Estado de Turismo del 9-9-2026.
 */

/** @type {Record<string, Record<string, string>>} */
export const APARTADAS = {
  basuras: {
    '¿Sabía el Ayuntamiento, al firmar':
      'su última parte («¿cómo pudo no saberlo…?») es retórica: afirma la negligencia que pregunta',
    '¿La resolución fue por incumplimiento':
      '«Las dos cosas no pueden ser verdad a la vez» es una conclusión de la pieza, no una pregunta',
    '¿Cuánto cuesta el contrato de emergencia de FCC':
      'pide el motivo de que no esté publicado, y da por sentado que no lo está',
    'Los 685.296 €':
      'abre afirmando lo que la pieza encontró —«de su bolsillo tras la caída del servicio»—',
    '¿A qué hora hay que sacar los enseres':
      'afirma que un documento está equivocado y pregunta cuándo se corregirá: una intención',
    '¿Se va a aplicar la rebaja':
      'nombra al alcalde, un cargo que ocupa una persona, y pregunta una intención, no un documento',
    '¿Quién es responsable de que':
      'busca un culpable; lo que el escrito puede pedir es quién tiene la competencia',
    '¿Consta en las actas alguna advertencia':
      'su segunda parte pide al gobierno municipal una valoración y que alguien asuma responsabilidades',
  },
  'inteligencia-turistica': {
    '¿Por qué el criterio de juicio de valor':
      'su premisa —«una unidad por debajo del umbral que habría exigido un comité de expertos»— insinúa lo que pregunta',
    '¿Se planteó el Ayuntamiento, tras la DANA':
      'ya pedida en conteo-visitantes: la solicitud a la Secretaría de Estado de Turismo del 9-9-2026 pregunta si el Ayuntamiento pidió reprogramar tras la DANA',
    '¿Cuál es el grado de ejecución final':
      'ya pedida en conteo-visitantes: la solicitud a la Secretaría de Estado de Turismo del 9-9-2026 pide el grado de ejecución certificado y el acta de la Comisión de Seguimiento',
    '¿Considera el Ayuntamiento publicar': 'pregunta una intención, no un documento',
  },
}

/**
 * Todas las preguntas de una pieza, en su orden y literales. Las de basuras van
 * en bloques con su fundamento; las demás, en una lista. Vive aquí, junto a la
 * lista editorial que conoce cada pieza, y no en `debeOfrecerSolicitud`, que no
 * aprende formas.
 *
 * @param {{ preguntas?: unknown }} pieza
 * @returns {string[]}
 */
export function preguntasDe(pieza) {
  const p = /** @type {any} */ (pieza?.preguntas)
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.bloques)) {
    return p.bloques.flatMap((/** @type {any} */ b) => b.items.map((/** @type {any} */ it) => it.q))
  }
  return []
}

/**
 * Las preguntas de la pieza `slug` que van en el escrito: todas menos las
 * apartadas, en su orden.
 *
 * @param {string} slug
 * @param {string[]} preguntas
 * @returns {string[]}
 */
export function solicitables(slug, preguntas) {
  const apartadas = Object.keys(APARTADAS[slug] ?? {})
  return preguntas.filter((q) => !apartadas.some((a) => q.startsWith(a)))
}
