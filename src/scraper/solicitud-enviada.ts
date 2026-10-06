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
 *
 * EL ÚLTIMO DÍA INHÁBIL. Desde el 29-09-2026 el mes acaba el primer día hábil
 * cuando su último día es inhábil (art. 30.5 LPACAP), y el calendario es el de
 * quien resuelve cada fila (`calendario`, en `calendarios-inhabiles.ts`). Aquel
 * «9 de octubre» era, además, el Día de la Comunitat Valenciana: el mes del
 * Ayuntamiento acababa el 13, y la fila habría pasado a «sin respuesta» el 10.
 */
import {
  CALENDARIOS,
  CALENDARIO_ETIQUETA,
  festivosDelCalendario,
  type Calendario,
} from './calendarios-inhabiles'
import {
  QUE_HICIERON,
  estadoDelMes,
  faltaElCalendario,
  motivoDeInhabil,
  venceEl,
  type SentidoRespuesta,
  type Vencimiento,
} from './solicitud-acceso'
import type { FestivosPorAnio } from './queja-router'

// Quien escribe una fila lee de aquí qué calendarios hay.
export { CALENDARIOS, type Calendario }

export const ESTADOS_ENVIO = [
  'en-plazo',
  'sin-calendario',
  'vencida-sin-respuesta',
  'respondida',
  'suspendida',
] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

/** Cómo se llama cada estado en la página. */
export const ESTADO_ENVIO_ETIQUETA: Record<EstadoEnvio, string> = {
  'en-plazo': 'en plazo',
  suspendida: 'plazo suspendido',
  'sin-calendario': 'sin calendario',
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
  // Lo que falta es un calendario nuestro, no una respuesta suya: neutro, como
  // en /quejas/dashboard y en /laboratorio/cobertura.
  'sin-calendario': 'neutral',
  // El reloj está parado por un trámite de la ley, no por una falta de nadie.
  suspendida: 'neutral',
  'vencida-sin-respuesta': 'warn',
  respondida: 'ok',
}

export interface EnvioSolicitud {
  /** A quién. Se imprime tal cual: aquí no hay organismo por defecto. */
  organismo: string
  /**
   * Con qué calendario de días inhábiles se cuenta el último día (art. 30.5
   * LPACAP): el de la administración que la resuelve, en el territorio de la
   * sede de su órgano. Se escribe a mano porque se decide leyendo quién resuelve,
   * no se deduce del nombre; una fila sin él, o con uno que no existe, no hereda
   * el de la sede: falla cerrado y nunca vence.
   */
  calendario: Calendario
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
  /**
   * La fecha de registro que da el recibo, cuando no es la de presentación: lo
   * que se presenta un día inhábil entra el primer hábil siguiente. Lo estrenaron
   * las dos solicitudes al Ayuntamiento presentadas el domingo 27-09-2026, cuyos
   * recibos dicen «Fecha de Registro 28/09/2026». El mes corre desde aquí; sin
   * ella se contaría desde el envío y el vencimiento afirmado saldría un día
   * antes del real. Sólo tiene sentido con `registro`.
   */
  entradaEl?: string
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
  /**
   * El órgano comunicó que el plazo para resolver queda SUSPENDIDO (art. 19.3
   * de la Ley 19/2013; en la Generalitat, art. 33.6 de la Ley 1/2022 y art. 52
   * del Decreto 105/2017: traslado a terceros afectados, quince días hábiles
   * para alegar, y el plazo parado hasta que alegan o pasa ese plazo).
   *
   * Lo estrenó la Comisión de Precios el 29-09-2026 (GVAGIP/2026/757). Va en un
   * campo porque, como la remisión, MUEVE EL RELOJ: mientras dure no hay último
   * día, y la fila no puede ni afirmar el que tenía ni pasar a «sin respuesta».
   * Un día nuevo no se calcula: la suspensión corre desde que se notifica a los
   * terceros, que la comunicación no fecha, y acaba en una fecha que nadie
   * conoce todavía. Lo que dijo quien la comunicó va, además, en una incidencia
   * con esta misma fecha.
   */
  suspendida?: {
    /** La fecha de la comunicación de la suspensión. */
    fecha: string
    /** Hasta qué, con las palabras de la comunicación: «hasta que …». */
    hasta: string
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
 * - Con asiento: desde el envío, acreditado (el asiento es la entrada); o desde
 *   la fecha de registro del recibo, si es otra (`entradaEl`).
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
  if (e.registro) return { desde: e.entradaEl ?? e.enviadaEl, acreditado: true }
  return { desde: e.enviadaEl, acreditado: false }
}

/**
 * ¿Se puede afirmar el ÚLTIMO día? Hace falta el arranque acreditado y que el
 * plazo no esté suspendido: suspendido, el arranque sigue siendo cierto pero no
 * hay final que contar. Es lo que promete la nota del pie con «se puede afirmar».
 */
export function vencimientoAfirmable(e: EnvioSolicitud): boolean {
  return arranqueDelPlazo(e).acreditado && !e.suspendida
}

/**
 * El último día del mes de una fila: desde su arranque, con el calendario de
 * quien la resuelve.
 */
function vencimientoDe(e: EnvioSolicitud): { v: Vencimiento; festivos: FestivosPorAnio } {
  const festivos = festivosDelCalendario(e.calendario)
  return { v: venceEl(arranqueDelPlazo(e).desde, festivos), festivos }
}

export function estadoDeEnvio(e: EnvioSolicitud, hoy: string): EstadoEnvio {
  if (e.respuesta) return 'respondida'
  if (e.suspendida) return 'suspendida'
  return estadoDelMes(vencimientoDe(e).v, hoy)
}

/** «9 de octubre», o con el año si no es el del último día. */
function diaDelNominal(nominal: string, ultimoDia: string): string {
  const largo = enCastellano(nominal)
  return nominal.slice(0, 4) === ultimoDia.slice(0, 4) ? largo.replace(/ de \d{4}$/, '') : largo
}

/**
 * El último día, dicho para leer. Si se prorrogó, con el día que era y por qué
 * es inhábil: quien cuente un mes desde el arranque tiene que poder reconciliar
 * la fecha. Sin calendario, el día nominal y la regla, sin decidir.
 */
function diaDelPlazo(v: Vencimiento, festivos: FestivosPorAnio): string {
  if (v.cuenta === 'sin-calendario') {
    return `${enCastellano(v.nominal)} o, si ese día es inhábil, el primer día hábil siguiente`
  }
  if (v.ultimoDia === v.nominal) return enCastellano(v.ultimoDia)
  const motivo = motivoDeInhabil(v.nominal, festivos)
  return (
    `${enCastellano(v.ultimoDia)} (prorrogado: el ${diaDelNominal(v.nominal, v.ultimoDia)}` +
    `${motivo ? `, ${motivo},` : ''} es inhábil; art. 30.5 de la Ley 39/2015)`
  )
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
    (e.registro ? `, con registro ${e.registro}` : '') +
    (e.registro && e.entradaEl && e.entradaEl !== e.enviadaEl
      ? `, que da como fecha de registro el ${enCastellano(e.entradaEl)}.`
      : '.')
  const estado = estadoDeEnvio(e, hoy)
  const { v, festivos } = vencimientoDe(e)
  const vence = diaDelPlazo(v, festivos)
  // Sin el calendario del año, se dice qué falta: la frase no da el plazo por
  // vencido, y el lector tiene que saber por qué no puede.
  const falta = v.cuenta === 'sin-calendario' ? ` ${faltaElCalendario(v.anio)}` : ''
  // Cómo acaba la frase de una vencida. Si consta que contestaron algo —una
  // incidencia—, «no han contestado» contradiría la línea de debajo: lo que
  // falta es la resolución, que es lo que mide el art. 20, y así se dice.
  const cierre = e.incidencias?.length
    ? 'sin que la hayan resuelto. La ley da a esa falta de resolución efecto desestimatorio, ' +
      'pero lo que ha ocurrido es que no hubo resolución.'
    : 'y no han contestado. La ley da a ese silencio efecto desestimatorio, pero lo que ha ' +
      'ocurrido es que no hubo respuesta.'

  if (estado === 'respondida' && e.respuesta) {
    return `${cabeza} El ${enCastellano(e.respuesta.fecha)} ${QUE_HICIERON[e.respuesta.sentido]}.`
  }

  // Suspendida: se dice desde cuándo corría —eso sigue constando—, que se
  // suspendió y hasta qué, y que no hay último día. Ninguna fecha de fin, ni la
  // que había ni una calculada: no consta cuándo empezó a correr la suspensión
  // ni cuándo acaba.
  if (e.suspendida) {
    const s = e.suspendida
    const { desde, acreditado } = arranqueDelPlazo(e)
    const corria = acreditado
      ? e.remitida
        ? `El mes del artículo 20 corría desde que la recibió, el ${enCastellano(desde)}.`
        : `El mes del artículo 20 corría desde su entrada, el ${enCastellano(desde)}.`
      : `El mes del artículo 20, contado desde ${e.remitida ? 'la comunicación de la remisión' : 'el envío'}, corría desde el ${enCastellano(desde)}.`
    return (
      `${cabeza} ${corria} El ${enCastellano(s.fecha)} se comunicó que el plazo para resolver ` +
      `quedaba suspendido ${s.hasta}. Mientras dure no hay último día que contar, y no consta ` +
      'todavía cuándo se reanuda.'
    )
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
      return `${cabeza} ${remision} ${arranque} ${cierre}`
    }
    return r.recibidaEl
      ? `${cabeza} ${remision} El artículo 20 de la Ley 19/2013 da un mes desde esa recepción: vence el ${vence}.${falta}`
      : `${cabeza} ${remision} El artículo 20 de la Ley 19/2013 da un mes desde que la solicitud llega al ` +
          `órgano competente para resolver: contado desde esa comunicación, el ${vence}.${falta}`
  }

  // Con asiento, el plazo se afirma; sin él, se dice desde dónde se cuenta. La
  // diferencia no es de estilo: de un correo consta el envío y no la recepción
  // por el órgano competente, que es donde el art. 20.1 arranca el mes.
  if (estado === 'vencida-sin-respuesta') {
    const arranque = e.registro
      ? `El mes del artículo 20 terminó el ${vence}`
      : `Contado desde el envío, el mes del artículo 20 terminó el ${vence}`
    return `${cabeza} ${arranque} ${cierre}`
  }

  if (e.registro) {
    return (
      `${cabeza} El artículo 20 de la Ley 19/2013 da un mes desde su entrada en el registro del ` +
      `órgano competente para resolver: vence el ${vence}.${falta}`
    )
  }

  return (
    `${cabeza} El artículo 20 de la Ley 19/2013 da un mes desde que la solicitud llega al ` +
    `órgano competente para resolver: contado desde el envío, el ${vence}.${falta}`
  )
}

/**
 * Con qué calendario se contó el último día de cada fila, dicho una vez debajo
 * de la lista. Sale de las filas y no de una nota escrita a mano: una que
 * nombrara a la Generalitat en una pieza que no le escribe diría algo falso, y
 * una que la callara, algo incompleto. Vacía si no hay filas.
 */
export function fraseDeCalendarios(items: EnvioSolicitud[]): string {
  const usados = CALENDARIOS.filter((c) => items.some((e) => e.calendario === c))
  if (usados.length === 0) return ''
  const etiquetas = usados.map((c) => CALENDARIO_ETIQUETA[c])
  const lista =
    etiquetas.length === 1
      ? etiquetas[0]
      : `${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}`
  return (
    'Cuando el mes acaba en un día inhábil, el plazo pasa al primer día hábil siguiente ' +
    `(art. 30.5 de la Ley 39/2015), y el calendario de días inhábiles es el de quien resuelve: ${lista}.`
  )
}

export interface ResumenEnvios {
  total: number
  porEstado: Record<EstadoEnvio, number>
  /** Una lista vacía no es «nada que contar»: es que no se ha cargado nada. */
  concluyente: boolean
}

export function resumirEnvios(items: EnvioSolicitud[], hoy: string): ResumenEnvios {
  // Del enum, no a mano: un estado nuevo sin su contador sumaría NaN.
  const porEstado = Object.fromEntries(ESTADOS_ENVIO.map((s) => [s, 0])) as Record<
    EstadoEnvio,
    number
  >
  for (const e of items) porEstado[estadoDeEnvio(e, hoy)] += 1
  return { total: items.length, porEstado, concluyente: items.length > 0 }
}
