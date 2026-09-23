/**
 * Las solicitudes de acceso que salieron POR CORREO, contadas en el reportaje.
 *
 * POR QUÉ NO VAN AL REGISTRO CURADO. `solicitud-acceso.ts` sostiene otra cosa:
 * la cobertura del corpus —«tenemos 67 afirmaciones que citan informes técnicos
 * y nunca los hemos pedido»—, casa UNA fila por clase documental y exige número
 * de registro de la sede, con el motivo escrito en su propio error: «sin él no
 * consta que se presentara». Estas solicitudes no tienen número porque salieron
 * por correo, piden a la vez un informe, un asiento de registro y una
 * información del art. 13, y dos de las tres no van al Ayuntamiento — cuya
 * `frasePublica` nombra literalmente. Meterlas en aquel molde no las registra:
 * las deforma, y publicaría «El Ayuntamiento tiene de plazo…» bajo una carta al
 * Ministerio.
 *
 * LA REGLA DE DERECHO QUE GOBIERNA LA FRASE. Son dos artículos, y dicen cosas
 * distintas:
 *
 * - **Art. 17.2 de la Ley 19/2013**: la solicitud «podrá presentarse por
 *   cualquier medio que permita tener constancia de» la identidad, lo que se
 *   pide y una dirección de contacto. Un correo con esos tres elementos es una
 *   vía válida; no hay que disculparse por ella.
 * - **Art. 20.1**: el mes corre «desde la recepción de la solicitud por el
 *   órgano competente para resolver». De un correo tenemos constancia del
 *   ENVÍO, no de esa recepción.
 *
 * Así que la frase publicada dice las dos: la fecha que sí probamos, y que el
 * cómputo arranca en una que no. Escribir «vence el 9 de octubre» a secas sería
 * firmar un plazo que no podemos acreditar, en una página cuyo trato con el
 * lector es una cita por afirmación.
 */
import { QUE_HICIERON, venceEl, type SentidoRespuesta } from './solicitud-acceso'

export const ESTADOS_ENVIO = ['en-plazo', 'vencida-sin-respuesta', 'respondida'] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

/** Cómo se llama cada estado en la página. */
export const ESTADO_ENVIO_ETIQUETA: Record<EstadoEnvio, string> = {
  'en-plazo': 'en plazo',
  'vencida-sin-respuesta': 'sin respuesta',
  respondida: 'respondida',
}

/**
 * El color de cada estado, en el vocabulario de tonos del sitio.
 *
 * Son los mismos que `/laboratorio/cobertura` da a estos tres estados, y a
 * propósito: dos superficies que cuentan el mismo reloj con colores distintos
 * son una de las dos mintiendo, y desde fuera no se sabe cuál.
 */
export const ESTADO_ENVIO_TONO: Record<EstadoEnvio, string> = {
  'en-plazo': 'civic',
  'vencida-sin-respuesta': 'warn',
  respondida: 'ok',
}

export interface EnvioSolicitud {
  /** A quién. Se imprime tal cual: aquí no hay organismo por defecto. */
  organismo: string
  enviadaEl: string
  /** Por dónde salió. Importa para el art. 17.2 y para lo que se puede probar. */
  via: string
  /**
   * El asiento, cuando se presentó por un registro.
   *
   * Es lo que separa «consta el envío» de «consta la entrada»: con número, el
   * mes del art. 20.1 ya no se cuenta desde el envío por cautela, se cuenta
   * desde el registro y el vencimiento se puede afirmar. Sin número no se
   * inventa: una solicitud presentada por sede cuyo asiento no tengamos apuntado
   * sigue publicándose con la cautela, que es verdadera aunque se quede corta.
   */
  registro?: string
  respuesta: {
    fecha: string
    sentido: SentidoRespuesta
    url?: string
    /**
     * Lo que dijeron, en hechos y a mano. El sentido sólo clasifica; una
     * respuesta que no entrega documentos pero afirma cosas —«el plazo se
     * amplió», «se ha ejecutado»— necesita que esas cosas consten, atribuidas.
     */
    resumen?: string
  } | null
  /**
   * Lo que contestaron SIN resolver: acuses, traslados internos, o —el caso que
   * estrenó el campo— «por esta vía no podemos atenderla, preséntela por el
   * trámite electrónico» (Turisme Comunitat Valenciana, 21-09-2026).
   *
   * No cabe en `respuesta`. Los cuatro sentidos del enum dicen qué se resolvió
   * —conceder, conceder en parte, denegar, decir que no corresponde— y ninguno
   * describe una contestación que deja la solicitud donde estaba. Forzar una
   * publicaría «respondida» sobre algo sin contestar, y además pararía el reloj
   * del artículo 20 por un escrito que no lo agota. Así que se publica al lado, y
   * el estado lo siguen mandando `respuesta` y la fecha.
   */
  incidencias?: { fecha: string; texto: string }[]
  /**
   * Quien la recibió la REMITIÓ a otro órgano por considerarlo competente
   * (art. 19.1 de la Ley 19/2013; en la Generalitat, art. 33.1 de la Ley 1/2022
   * y art. 50.1 del Decreto 105/2017, que dan diez días hábiles para hacerlo).
   *
   * Va en un campo y no sólo en una incidencia porque MUEVE EL RELOJ: el
   * art. 20.1 cuenta el mes «desde la recepción de la solicitud por el órgano
   * competente para resolver», y un asiento acredita la entrada donde se
   * presentó, no la recepción por el órgano al que después se remitió. Lo
   * estrenó el escrito a Turisme Comunitat Valenciana del 21-09-2026: presentado
   * con asiento, su fila afirmaba un vencimiento, y el 23-09 la Generalitat
   * comunicó que lo había remitido (expediente GVAGIP/2026/774). Lo que dijeron
   * al comunicarlo se publica, además, como incidencia con esta misma fecha.
   *
   * Qué fecha manda después de una remisión no lo zanja ningún texto: la ley
   * valenciana (art. 34.1 de la Ley 1/2022) cuenta desde la entrada «en el
   * registro de la administración u organismo competente», y Turisme CV es un
   * ente con personalidad jurídica propia. Por eso no se afirma nada hasta que el
   * órgano diga cuándo la recibió, que es lo que le obliga a hacer el art. 55.1
   * del Decreto 105/2017.
   */
  remitida?: {
    /** La fecha de la comunicación que da cuenta de la remisión. */
    fecha: string
    /** El órgano al que se remitió, como lo nombra esa comunicación. */
    a: string
    /**
     * Cuándo lo recibió ese órgano, si consta: su propio acuse, que el art. 55.1
     * del Decreto 105/2017 le obliga a enviar en diez días hábiles «a efectos del
     * transcurso del plazo». Con ella el vencimiento vuelve a afirmarse; sin ella
     * se cuenta desde la comunicación de la remisión.
     */
    recibidaEl?: string
  }
}

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

/**
 * `2026-10-09` → `9 de octubre de 2026`.
 *
 * Con una tabla de meses y no con `toLocaleDateString`: ése depende del ICU que
 * traiga el Node de turno y de la zona horaria del proceso, así que la misma
 * fecha puede salir con otro mes —o con el día anterior— según dónde corra. Una
 * fecha publicada no puede depender de eso.
 *
 * Las comparaciones de estado siguen haciéndose sobre el ISO, que ordena solo.
 * Esto es únicamente para leer.
 */
export function enCastellano(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

/**
 * Desde qué fecha corre el mes, y si esa fecha ACREDITA la recepción por el
 * órgano competente para resolver —lo único que permite afirmar el vencimiento
 * en vez de decir desde dónde se cuenta—.
 *
 * - Por correo: desde el envío, sin acreditar (consta el envío, no la entrada).
 * - Con asiento: desde el envío, acreditado (el asiento es la entrada).
 * - Remitida: desde que la recibió el órgano al que se remitió, si consta; si
 *   no, desde la comunicación de la remisión, sin acreditar. Es la primera
 *   fecha en que consta que se le había remitido — no que la tuviera.
 */
export function arranqueDelPlazo(e: EnvioSolicitud): { desde: string; acreditado: boolean } {
  if (e.remitida) {
    return e.remitida.recibidaEl
      ? { desde: e.remitida.recibidaEl, acreditado: true }
      : { desde: e.remitida.fecha, acreditado: false }
  }
  return { desde: e.enviadaEl, acreditado: Boolean(e.registro) }
}

export function estadoDeEnvio(e: EnvioSolicitud, hoy: string): EstadoEnvio {
  if (e.respuesta) return 'respondida'
  return hoy > venceEl(arranqueDelPlazo(e).desde) ? 'vencida-sin-respuesta' : 'en-plazo'
}

/**
 * Lo que la página dice de un envío. En hechos, no en calificaciones.
 *
 * La cabeza abre con el organismo y un punto medio en vez de «enviada a X»
 * para no tener que resolver la contracción castellana: «a el Ayuntamiento» es
 * incorrecto, «al Ayuntamiento» exige saber el género y el artículo de cada
 * nombre, y adivinarlos a partir de la cadena es justo el tipo de regla que
 * falla con el primer organismo que no encaja.
 */
export function fraseDeEnvio(e: EnvioSolicitud, hoy: string): string {
  const cabeza =
    `${e.organismo} · enviada el ${enCastellano(e.enviadaEl)} por ${e.via}` +
    (e.registro ? `, con registro ${e.registro}.` : '.')
  const estado = estadoDeEnvio(e, hoy)
  const vence = enCastellano(venceEl(arranqueDelPlazo(e).desde))

  if (estado === 'respondida' && e.respuesta) {
    return `${cabeza} El ${enCastellano(e.respuesta.fecha)} ${QUE_HICIERON[e.respuesta.sentido]}.`
  }

  // Remitida: el asiento sigue en la cabeza porque sigue siendo cierto, pero el
  // vencimiento ya no sale de él. Se afirma sólo si consta cuándo lo recibió el
  // órgano al que se remitió; si no, se dice desde dónde se cuenta, como con un
  // correo. «Por considerarlo» atribuye la competencia a quien la remitió, que
  // es quien la afirma.
  if (e.remitida) {
    const r = e.remitida
    const remision =
      `El ${enCastellano(r.fecha)} se comunicó que se había remitido a ${r.a} por considerarlo ` +
      'el órgano competente para resolverla, ' +
      (r.recibidaEl
        ? `y consta que la recibió el ${enCastellano(r.recibidaEl)}.`
        : 'y no consta todavía cuándo la recibió.')
    if (estado === 'vencida-sin-respuesta') {
      const arranque = r.recibidaEl
        ? `El mes del artículo 20 terminó el ${vence}`
        : `Contado desde esa comunicación, el mes del artículo 20 terminó el ${vence}`
      return (
        `${cabeza} ${remision} ${arranque} y no han contestado. La ley da a ese silencio efecto ` +
        'desestimatorio, pero lo que ha ocurrido es que no hubo respuesta.'
      )
    }
    return r.recibidaEl
      ? `${cabeza} ${remision} El artículo 20 de la Ley 19/2013 da un mes desde esa recepción: vence el ${vence}.`
      : `${cabeza} ${remision} El artículo 20 de la Ley 19/2013 da un mes desde que la solicitud llega al ` +
          `órgano competente para resolver: contado desde esa comunicación, el ${vence}.`
  }

  // Con asiento, el plazo se afirma; sin él, se dice desde dónde se cuenta. La
  // diferencia no es de estilo: de un correo consta el envío y no la recepción
  // por el órgano competente, que es donde el art. 20.1 arranca el mes.
  if (estado === 'vencida-sin-respuesta') {
    const arranque = e.registro
      ? `El mes del artículo 20 terminó el ${vence}`
      : `Contado desde el envío, el mes del artículo 20 terminó el ${vence}`
    return (
      `${cabeza} ${arranque} y no han contestado. La ley da a ese silencio efecto ` +
      'desestimatorio, pero lo que ha ocurrido es que no hubo respuesta.'
    )
  }

  if (e.registro) {
    return (
      `${cabeza} El artículo 20 de la Ley 19/2013 da un mes desde su entrada en el registro del ` +
      `órgano competente para resolver: vence el ${vence}.`
    )
  }

  return (
    `${cabeza} El artículo 20 de la Ley 19/2013 da un mes desde que la solicitud llega al ` +
    `órgano competente para resolver: contado desde el envío, el ${vence}.`
  )
}

export interface ResumenEnvios {
  total: number
  porEstado: Record<EstadoEnvio, number>
  /** Una lista vacía no es «nada que contar»: es que no se ha cargado nada. */
  concluyente: boolean
}

export function resumirEnvios(items: EnvioSolicitud[], hoy: string): ResumenEnvios {
  const porEstado: Record<EstadoEnvio, number> = {
    'en-plazo': 0,
    'vencida-sin-respuesta': 0,
    respondida: 0,
  }
  for (const e of items) porEstado[estadoDeEnvio(e, hoy)] += 1
  return { total: items.length, porEstado, concluyente: items.length > 0 }
}
