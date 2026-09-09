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
import { venceEl, type SentidoRespuesta } from './solicitud-acceso'

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
  respuesta: { fecha: string; sentido: SentidoRespuesta; url?: string } | null
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

export function estadoDeEnvio(e: EnvioSolicitud, hoy: string): EstadoEnvio {
  if (e.respuesta) return 'respondida'
  return hoy > venceEl(e.enviadaEl) ? 'vencida-sin-respuesta' : 'en-plazo'
}

const QUE_HICIERON: Record<SentidoRespuesta, string> = {
  concedido: 'Lo concedieron',
  parcial: 'Lo concedieron en parte',
  denegado: 'Lo denegaron',
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
  const cabeza = `${e.organismo} · enviada el ${enCastellano(e.enviadaEl)} por ${e.via}.`
  const estado = estadoDeEnvio(e, hoy)

  if (estado === 'respondida' && e.respuesta) {
    return `${cabeza} ${QUE_HICIERON[e.respuesta.sentido]} el ${enCastellano(e.respuesta.fecha)}.`
  }

  if (estado === 'vencida-sin-respuesta') {
    return (
      `${cabeza} Contado desde el envío, el mes del artículo 20 terminó el ` +
      `${enCastellano(venceEl(e.enviadaEl))} y no han contestado. La ley da a ese silencio efecto ` +
      'desestimatorio, pero lo que ha ocurrido es que no hubo respuesta.'
    )
  }

  return (
    `${cabeza} El artículo 20 de la Ley 19/2013 da un mes desde que la solicitud llega al ` +
    `órgano competente para resolver: contado desde el envío, el ${enCastellano(venceEl(e.enviadaEl))}.`
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
