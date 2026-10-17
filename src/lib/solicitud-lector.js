// @ts-check
/**
 * El escrito de acceso a la información que cualquier lector puede presentar
 * con las preguntas con las que acaba un reportaje.
 *
 * Una pieza que termina en preguntas las deja «planteadas al Ayuntamiento», y
 * hasta ahora ahí se quedaban: el derecho a pedirlas es de todas las personas
 * (art. 12 de la Ley 19/2013), pero quien lee no tiene a mano el escrito ni sabe
 * qué artículos citar. Esto se lo da hecho, para copiar y pegar.
 *
 * **Por qué no en las piezas que ya presentaron las suyas.** Las piezas con un
 * bloque `solicitudes` —las cámaras del parque, el conteo de visitantes, el
 * coste efectivo— registraron sus preguntas y publican el asiento y el plazo
 * que corre. Ofrecer ahí la plantilla invitaría a cada lector a duplicar una
 * solicitud viva: el Ayuntamiento recibiría la misma petición una vez por
 * lector mientras resuelve la primera, cuya respuesta la pieza ya se ha
 * comprometido a publicar. Basta con que exista el bloque, aunque esté vacío: si
 * la pieza se ocupa de pedirlo, el lector no.
 *
 * **Por qué no hay dónde enviarnos nada.** Ni formulario, ni subida, ni
 * endpoint. Lo que el lector presenta es suyo y va con su DNI; recogerlo aquí
 * sería tratar datos personales sin registro de actividades ni evaluación de
 * impacto, que es justo lo que espera el canal web de quejas. Si quiere
 * compartir la resolución, la manda por correo a la dirección del aviso legal,
 * con sus datos de identificación tachados, y sólo se publica después de que
 * la revise quien mantiene el proyecto.
 *
 * **Qué no dice el escrito.** No nombra a nadie y no afirma nada: sólo pregunta.
 * El reportaje se cita como el CONTEXTO de la petición —«a raíz de la
 * información publicada en…»—, nunca como prueba de lo que pregunta, porque lo
 * firma el lector y una afirmación de la pieza, copiada en su escrito, pasaría
 * a ser suya. Qué preguntas entran lo decide la lista editorial de
 * src/lib/solicitud-apartadas.js, con el porqué de cada una que se aparta.
 *
 * El texto va en castellano en los dos idiomas de la interfaz: es un escrito
 * dirigido al Ayuntamiento, y sus preguntas son las literales de la pieza, que
 * conservan la lengua de su fuente como el resto de los datos.
 */

/**
 * La dirección de contacto que publica /aviso-legal, adonde el lector puede
 * mandar la resolución. La misma, no otra: tests/solicitud-lector.test.js lee
 * AvisoLegal.jsx y exige que la nombre.
 */
export const CORREO = 'civicpulse_es@proton.me'

/** Quien recibe: el Área que tramita las de transparencia en el Ayuntamiento. */
export const DESTINATARIO = 'Ayuntamiento de Riba-roja de Túria — Área de Transparencia'

/**
 * Las dos leyes, con la forma en que las cita el resto del repositorio
 * (src/scraper/solicitud-enviada.ts): la estatal por artículos, la valenciana
 * entera, porque rige el procedimiento en la Comunitat.
 */
const LEY_ESTATAL =
  'Ley 19/2013, de 9 de diciembre, de transparencia, acceso a la información pública y buen gobierno'
const LEY_VALENCIANA =
  'Ley 1/2022, de 13 de abril, de la Generalitat, de Transparencia y Buen Gobierno de la Comunitat Valenciana'

/**
 * La fecha en castellano, «15 de julio de 2026», escrita aquí y no con
 * `toLocaleDateString`: el escrito va siempre en castellano, y el CLDR de cada
 * entorno escribe las fechas largas a su manera (tests/reportajes-fecha-iso.test.js
 * no fija la forma por eso). Un escrito que se registra no puede depender de qué
 * navegador lo copió.
 */
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
/** @param {string} iso AAAA-MM-DD */
const fechaLarga = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

/**
 * ¿Es una fecha AAAA-MM-DD? Es lo que guarda `meta.publicadoEl`
 * (tests/reportajes-fecha-iso.test.js), y sin ella el escrito no puede decir de
 * cuándo son las premisas de sus preguntas.
 *
 * @param {unknown} v
 * @returns {v is string}
 */
export const esFechaIso = (v) =>
  typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)

/**
 * Las comillas de dentro de un título que ya va entre «»: en castellano, las de
 * segundo nivel son las inglesas. El titular de inteligencia turística lleva
 * «destino inteligente», y citado tal cual salía «… el «destino inteligente»: …»,
 * con un cierre que parece cerrar la cita entera.
 *
 * @param {string} titulo
 */
const comillasInternas = (titulo) => titulo.replace(/«/g, '“').replace(/»/g, '”')

/**
 * El escrito entero, listo para pegar en el campo libre de la sede electrónica
 * o para imprimir y llevar al Registro de Entrada. Texto plano: la sede se come
 * el marcado.
 *
 * Lo que pide el art. 17.2 —identidad, información que se pide, dirección de
 * contacto y modalidad de acceso— va cada uno en su sitio; la identidad y la
 * dirección como huecos entre corchetes que rellena quien lo presenta.
 *
 * Las preguntas son las de la pieza, congeladas en la fecha en que se publicó,
 * y alguna da algo por sentado («ahora que los contratos han terminado»). Por
 * eso el escrito dice de cuándo son y pide lo que conste HOY: sin la fecha, el
 * lector firmaría como actual una premisa que puede haber cambiado.
 *
 * @param {{ titulo: string, url: string, publicadoEl: string, preguntas: string[] }} pieza
 *   `publicadoEl` es el `meta.publicadoEl` de la pieza, en AAAA-MM-DD.
 * @returns {string}
 */
export function textoSolicitudLector({ titulo, url, publicadoEl, preguntas }) {
  if (!Array.isArray(preguntas) || preguntas.length === 0) {
    // Un escrito sin nada que pedir no es una solicitud; mejor que la página
    // no pinte el botón a que copie una carta vacía.
    throw new Error('textoSolicitudLector: no hay preguntas que pedir')
  }
  if (!esFechaIso(publicadoEl)) {
    throw new Error(`textoSolicitudLector: fecha de publicación no válida: ${publicadoEl}`)
  }
  return [
    'SOLICITUD DE ACCESO A LA INFORMACIÓN PÚBLICA',
    '',
    `A: ${DESTINATARIO}`,
    '',
    'Nombre y apellidos: [Nombre y apellidos]',
    'DNI/NIE: [DNI/NIE]',
    'Dirección o correo para notificaciones: [Dirección o correo para notificaciones]',
    '',
    'EXPONE',
    '',
    `Que el artículo 12 de la ${LEY_ESTATAL}, reconoce a todas las personas el derecho a acceder a la información pública, que su artículo 13 define como los contenidos o documentos que obren en poder de la administración y que hayan sido elaborados o adquiridos en el ejercicio de sus funciones; derecho que regula también, en la Comunitat Valenciana, la ${LEY_VALENCIANA}.`,
    '',
    `Que, aunque el artículo 17.3 de la Ley 19/2013 no obliga a motivar la solicitud, esta se formula a raíz de la información publicada en «${comillasInternas(titulo)}» (${url}). Las preguntas se reproducen literalmente de ese reportaje, publicado el ${fechaLarga(publicadoEl)}, y lo que en ellas se da por sentado se refiere a esa fecha. Si algo ha cambiado desde entonces, se solicita la información que conste a la fecha de esta solicitud.`,
    '',
    'SOLICITA',
    '',
    'Al amparo del artículo 17 de la Ley 19/2013, el acceso a la información que obre en poder de ese Ayuntamiento y que responda a las siguientes preguntas:',
    '',
    ...preguntas.map((q, i) => `${i + 1}. ${q}`),
    '',
    'No se pide una valoración ni que se elabore información nueva: basta con los documentos que ya existan y contengan la respuesta. Si alguno de los límites del artículo 14 afectara sólo a una parte de lo pedido, se solicita el acceso parcial que prevé el artículo 16.',
    '',
    'Que la información se facilite en formato electrónico, preferentemente reutilizable, en la dirección de notificaciones indicada arriba (art. 17.2.d de la Ley 19/2013).',
    '',
    'Y que la resolución se notifique en el plazo máximo de un mes desde la recepción de esta solicitud por el órgano competente para resolver (art. 20.1 de la Ley 19/2013).',
    '',
    'En Riba-roja de Túria, a [fecha].',
    '',
    'Firma: [firma]',
  ].join('\n')
}

/**
 * ¿Ofrece esta pieza el escrito? Sí sólo si sus preguntas son una LISTA de
 * textos no vacía, su `meta.publicadoEl` es una fecha AAAA-MM-DD y la pieza no
 * trae un bloque `solicitudes`. Ver el porqué en la cabecera.
 *
 * No aprende formas: una pieza cuyas preguntas no son una lista de textos —las
 * de basuras, en bloques— dice que no, y es su página la que aplana las suyas y
 * se las pasa ya como lista. Enseñarle aquí cada forma sería decidir en un
 * sitio lo que sólo la página sabe.
 *
 * @param {{ meta?: unknown, preguntas?: unknown, solicitudes?: unknown }} pieza
 * @returns {boolean}
 */
export function debeOfrecerSolicitud(pieza) {
  if (pieza?.solicitudes != null) return false
  // Sin fecha de publicación el escrito no se puede redactar, y lanzar dentro
  // del render tumbaría la pieza entera por un bloque que es un añadido.
  if (!esFechaIso(/** @type {any} */ (pieza?.meta)?.publicadoEl)) return false
  const p = pieza?.preguntas
  return (
    Array.isArray(p) && p.length > 0 && p.every((q) => typeof q === 'string' && q.trim() !== '')
  )
}
