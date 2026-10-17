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
 * además las que ya pide el escrito de conteo-visitantes a Turisme Comunitat
 * Valenciana.
 */

/**
 * Las dos clases de motivo, que la página nombra al decir por qué faltan
 * preguntas: sólo nombra las que de verdad hay en esa pieza. Con la frase fija
 * de antes, basuras decía «o ya están pedidas en otro reportaje», y ninguna de
 * las suyas lo está.
 *
 * - `no-informativa`: valora, pide una intención, afirma o insinúa, o señala a
 *   una persona; no es información que obre en poder de nadie, o lo que
 *   afirma pasaría a ser del lector.
 * - `ya-pedida`: la pidió este proyecto en otro reportaje y la solicitud sigue
 *   viva.
 */
export const CLASES = /** @type {const} */ (['no-informativa', 'ya-pedida'])

/**
 * @typedef {{ clase: typeof CLASES[number], motivo: string }} Apartada
 * @type {Record<string, Record<string, Apartada>>}
 */
export const APARTADAS = {
  basuras: {
    '¿Sabía el Ayuntamiento, al firmar': {
      clase: 'no-informativa',
      motivo:
        'su última parte («¿cómo pudo no saberlo…?») es retórica: afirma la negligencia que pregunta',
    },
    '¿La resolución fue por incumplimiento': {
      clase: 'no-informativa',
      motivo:
        '«Las dos cosas no pueden ser verdad a la vez» es una conclusión de la pieza, no una pregunta',
    },
    '¿Cuánto cuesta el contrato de emergencia de FCC': {
      clase: 'no-informativa',
      motivo: 'pide el motivo de que no esté publicado, y da por sentado que no lo está',
    },
    'Los 685.296 €': {
      clase: 'no-informativa',
      motivo:
        'abre afirmando lo que la pieza encontró —«de su bolsillo tras la caída del servicio»—',
    },
    '¿A qué hora hay que sacar los enseres': {
      clase: 'no-informativa',
      motivo:
        'afirma que un documento está equivocado y pregunta cuándo se corregirá: una intención',
    },
    '¿Se va a aplicar la rebaja': {
      clase: 'no-informativa',
      motivo:
        'nombra al alcalde, un cargo que ocupa una persona, y pregunta una intención, no un documento',
    },
    '¿Quién es responsable de que': {
      clase: 'no-informativa',
      motivo: 'busca un culpable; lo que el escrito puede pedir es quién tiene la competencia',
    },
    '¿Consta en las actas alguna advertencia': {
      clase: 'no-informativa',
      motivo:
        'su segunda parte pide al gobierno municipal una valoración y que alguien asuma responsabilidades',
    },
  },
  'inteligencia-turistica': {
    '¿Por qué el criterio de juicio de valor': {
      clase: 'no-informativa',
      motivo:
        'su premisa —«una unidad por debajo del umbral que habría exigido un comité de expertos»— insinúa lo que pregunta',
    },
    // Se cita el escrito a Turisme Comunitat Valenciana, que es el que sigue
    // vivo: la Secretaría de Estado de Turismo contestó el 16-9-2026 que no le
    // correspondía. Sin respuesta de Turisme a 17-10-2026.
    '¿Se planteó el Ayuntamiento, tras la DANA': {
      clase: 'ya-pedida',
      motivo:
        'ya pedida en conteo-visitantes: el escrito presentado a Turisme Comunitat Valenciana por el registro electrónico de la Generalitat el 21-9-2026 (GVRTE/2026/4309357) pregunta si el Ayuntamiento pidió reprogramar tras la DANA',
    },
    '¿Cuál es el grado de ejecución final': {
      clase: 'ya-pedida',
      motivo:
        'ya pedida en conteo-visitantes: el escrito presentado a Turisme Comunitat Valenciana por el registro electrónico de la Generalitat el 21-9-2026 (GVRTE/2026/4309357) pide el grado de ejecución certificado y el acta de la Comisión de Seguimiento. Su otra mitad —qué actuaciones se quedaron sin ejecutar— no está en ese escrito, pero la pregunta se aparta entera porque el escrito del lector sólo lleva preguntas literales',
    },
    '¿Considera el Ayuntamiento publicar': {
      clase: 'no-informativa',
      motivo: 'pregunta una intención, no un documento',
    },
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

/**
 * Las clases de motivo que hay de verdad entre las preguntas apartadas de la
 * pieza, en el orden de `CLASES`. Sólo cuentan las entradas que casan con una
 * pregunta: una entrada huérfana no puede hacer que la página diga que falta
 * algo por un motivo que ya no se da.
 *
 * @param {string} slug
 * @param {string[]} preguntas
 * @returns {string[]}
 */
export function clasesApartadas(slug, preguntas) {
  const presentes = new Set(
    Object.entries(APARTADAS[slug] ?? {})
      .filter(([comienzo]) => preguntas.some((q) => q.startsWith(comienzo)))
      .map(([, { clase }]) => clase),
  )
  return CLASES.filter((c) => presentes.has(c))
}
