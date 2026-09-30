/**
 * Solicitudes de acceso a la información — el reloj y su vocabulario.
 *
 * Una queja la pone un vecino sobre un servicio: LPACAP, tres meses, escala al
 * Síndic de Greuges. Una solicitud de acceso la ponemos nosotros sobre un
 * documento: Ley 19/2013 art. 20, **un mes**, y la reclamación del art. 24 va al
 * **Consell de Transparència de la Comunitat Valenciana**, no al CTBG estatal
 * —que no lleva ayuntamientos valencianos, como dice la cabecera de
 * `consell-cv.ts` y como se ve en lo que ya raspamos: 0 de 11.003 resoluciones
 * del CTBG casan con Riba-roja, y 2 del Consell sí—. Órganos y plazos
 * distintos: no se mezclan.
 *
 * Módulo puro: sin fs, sin red, y el «hoy» lo pasa quien llama, para que el
 * estado de una página sea reproducible y comprobable.
 *
 * Dos reglas que son el motivo de que esto exista:
 *
 *   · `sin-solicitar` es un estado PROPIO. Una clase de documento que nadie ha
 *     pedido no puede pintarse como una que espera respuesta; doblar «no lo
 *     hemos pedido» dentro de «pendiente» es el defecto que este repositorio ya
 *     ha pagado tres veces (`sin-base`, `sin-indicador`, `nunca intentado`).
 *
 *   · El silencio se publica como **«no contestaron»**, jamás como «denegado».
 *     El art. 20.4 convierte el silencio en negativo a efectos legales, pero
 *     publicar «denegado» atribuiría al Ayuntamiento un acto que no realizó. La
 *     consecuencia jurídica se explica al lado; no sustituye al hecho.
 *
 * Y una tercera, desde el 29-09-2026: el mes acaba el primer día hábil si su
 * último día es inhábil (art. 30.5 LPACAP), en el calendario de quien resuelve.
 * Sin ese calendario no hay último día, y `sin-calendario` es también un estado
 * propio: pasado el día nominal no se sabe si el plazo sigue, y darlo por vencido
 * sería publicar un «no contestaron» que quizá llega antes de tiempo.
 */

import {
  FESTIVOS_DE_LA_SEDE,
  finDelPlazoEnMeses,
  type FestivosPorAnio,
  type FinDelPlazo,
} from './queja-router'

export const ESTADOS_SOLICITUD = [
  'sin-solicitar',
  'en-plazo',
  'sin-calendario',
  'vencida-sin-respuesta',
  'respondida',
  'reclamada',
] as const

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]

/**
 * Cómo se llama cada estado en /laboratorio/cobertura. Vivía en la página como
 * un literal sin tipar, y un estado nuevo sin su fila habría pintado
 * «undefined»: un `Record` tipado lo caza tsc, y la suite lo recorre en
 * ejecución.
 */
export const ESTADO_SOLICITUD_ETIQUETA: Record<EstadoSolicitud, string> = {
  'sin-solicitar': 'sin pedir',
  'en-plazo': 'en plazo',
  'sin-calendario': 'sin calendario',
  'vencida-sin-respuesta': 'sin respuesta',
  respondida: 'respondida',
  reclamada: 'reclamada',
}

/**
 * El tono de cada estado. `sin-solicitar` va en NEUTRO a propósito: que no lo
 * hayamos pedido todavía no es un fallo del Ayuntamiento, y pintarlo en ámbar le
 * atribuiría una tardanza que no ha tenido. `sin-calendario`, igual: lo que falta
 * es nuestro, no suyo (como en /quejas/dashboard).
 */
export const ESTADO_SOLICITUD_TONO: Record<EstadoSolicitud, string> = {
  'sin-solicitar': 'neutral',
  'en-plazo': 'civic',
  'sin-calendario': 'neutral',
  'vencida-sin-respuesta': 'warn',
  respondida: 'ok',
  reclamada: 'intel',
}

/**
 * `no-les-corresponde` entró el 2026-09-17 con la primera respuesta real: la
 * Secretaría de Estado de Turismo no concedió acceso a nada ni lo denegó, dijo
 * que no le correspondía y señaló a quién preguntar. Forzarla a `parcial` habría
 * publicado un acceso que no hubo. No se llama «remitida»: en la Ley 19/2013
 * remitir es reenviar la solicitud al competente (art. 19.1), y precisamente eso
 * es lo que un organismo puede no hacer al contestar así.
 */
export const SENTIDOS_RESPUESTA = [
  'concedido',
  'parcial',
  'denegado',
  'no-les-corresponde',
] as const
export type SentidoRespuesta = (typeof SENTIDOS_RESPUESTA)[number]

/**
 * Qué hicieron, por sentido. UNA tabla para las dos superficies que lo dicen
 * —`frasePublica` aquí y `fraseDeEnvio` en `solicitud-enviada.ts`—: el día que
 * entró `no-les-corresponde` había dos copias, una sin tipar, y con
 * `"strict": false` la sin tipar habría impreso «undefined» sin que tsc dijera
 * nada.
 *
 * En minúscula porque van DETRÁS de la fecha: «El 16 de septiembre contestaron
 * que no les corresponde». Con la fecha al final, «no les corresponde el 16» se
 * lee como si dejara de corresponderles ese día.
 */
export const QUE_HICIERON: Record<SentidoRespuesta, string> = {
  concedido: 'lo concedieron',
  parcial: 'lo concedieron en parte',
  denegado: 'lo denegaron',
  'no-les-corresponde': 'contestaron que no les corresponde',
}

/** El competente para un ayuntamiento valenciano es el Consell. */
export const ORGANOS_RECLAMACION = ['consell-cv', 'ctbg'] as const
export type OrganoReclamacion = (typeof ORGANOS_RECLAMACION)[number]

export const ORGANO_ETIQUETA: Record<OrganoReclamacion, string> = {
  'consell-cv': 'Consell de Transparència de la Comunitat Valenciana',
  ctbg: 'Consejo de Transparencia y Buen Gobierno',
}

export interface SolicitudAcceso {
  id: string
  /** La clase de documento pedida. Sólo las pedibles. */
  clase: string
  titulo: string
  presentadaEl: string
  registro: string
  respuesta: { fecha: string; sentido: SentidoRespuesta; url?: string } | null
  reclamacion: {
    fecha: string
    organo: OrganoReclamacion
    expediente?: string
    resolucion?: string
  } | null
  notas?: string
}

export interface RegistroSolicitudes {
  version: number
  generatedAt?: string
  items: SolicitudAcceso[]
}

/**
 * El último día del mes del art. 20: el nominal y, si es inhábil, el primer día
 * hábil siguiente (art. 30.5 LPACAP). O `sin-calendario`, si acaba en un año que
 * `festivos` no tiene entero: entonces sólo se sabe el nominal.
 *
 * Mes NATURAL, no 30 días, y sin inventar un 31 de febrero: si el día no existe
 * en el mes siguiente, cae al último que sí existe (art. 30.4). Hasta el
 * 29-09-2026 se paraba ahí y devolvía el nominal, así que un mes que acababa en
 * sábado o en festivo se daba por vencido ese mismo día. Ahora es la cuenta de
 * las quejas (`finDelPlazoEnMeses`), con el calendario de quien resuelve: el de
 * la sede para el registro curado, que es del Ayuntamiento, y el de cada fila en
 * los reportajes (`calendarios-inhabiles.ts`).
 */
export type Vencimiento = Exclude<FinDelPlazo, { cuenta: 'sin-fecha' }>

export function venceEl(
  presentadaEl: string,
  festivos: FestivosPorAnio = FESTIVOS_DE_LA_SEDE,
): Vencimiento {
  const fin = finDelPlazoEnMeses(presentadaEl, 1, festivos)
  // Las fechas de una solicitud las valida quien las escribe. Una ilegible aquí
  // es un fallo, y callarla como «sin plazo» lo escondería.
  if (fin.cuenta === 'sin-fecha') throw new TypeError(`venceEl: «${presentadaEl}» no es una fecha`)
  return fin
}

/**
 * Por qué un día es inhábil, para decirlo: «sábado», «domingo» o el nombre del
 * festivo en `festivos`; null si no consta.
 */
export function motivoDeInhabil(dia: string, festivos: FestivosPorAnio): string | null {
  const semana = new Date(Date.parse(dia)).getUTCDay()
  if (semana === 6) return 'sábado'
  if (semana === 0) return 'domingo'
  return festivos[Number(dia.slice(0, 4))]?.find((f) => f.fecha === dia)?.nombre ?? null
}

/**
 * Lo que se dice cuando falta el calendario del año en que acaba el mes: el
 * mismo fallo cerrado que la ficha de una queja.
 */
export function faltaElCalendario(anio: number): string {
  return (
    `Falta aquí el calendario de días inhábiles de ${anio} de quien la resuelve, y sin él no ` +
    'se sabe si ese día se prorroga (art. 30.5 de la Ley 39/2015): hasta que se añada, el ' +
    'plazo no se da por vencido.'
  )
}

/**
 * El estado del reloj de un mes que no ha tenido respuesta. Hasta el día nominal
 * está en plazo seguro —la prórroga sólo alarga—; sin calendario, después de él
 * no se sabe, y no se da por vencido.
 */
export function estadoDelMes(
  v: Vencimiento,
  hoy: string,
): 'en-plazo' | 'sin-calendario' | 'vencida-sin-respuesta' {
  if (v.cuenta === 'sin-calendario') return hoy > v.nominal ? 'sin-calendario' : 'en-plazo'
  return hoy > v.ultimoDia ? 'vencida-sin-respuesta' : 'en-plazo'
}

/** El estado de UNA clase: su solicitud, o la ausencia de ella. */
export function estadoDeSolicitud(s: SolicitudAcceso | null, hoy: string): EstadoSolicitud {
  if (!s) return 'sin-solicitar'
  // La reclamación manda: es el escalón más avanzado del procedimiento.
  if (s.reclamacion) return 'reclamada'
  if (s.respuesta) return 'respondida'
  return estadoDelMes(venceEl(s.presentadaEl), hoy)
}

/**
 * Lo que la página dice de una clase. En hechos, no en calificaciones.
 */
export function frasePublica(s: SolicitudAcceso | null, hoy: string): string {
  const estado = estadoDeSolicitud(s, hoy)
  if (estado === 'sin-solicitar' || !s) {
    return 'Todavía no lo hemos pedido.'
  }
  if (estado === 'respondida' && s.respuesta) {
    return `Solicitado el ${s.presentadaEl}. El ${s.respuesta.fecha} ${QUE_HICIERON[s.respuesta.sentido]}.`
  }
  if (estado === 'reclamada' && s.reclamacion) {
    return (
      `Solicitado el ${s.presentadaEl}. Reclamado el ${s.reclamacion.fecha} ante el ` +
      `${ORGANO_ETIQUETA[s.reclamacion.organo]} (art. 24).`
    )
  }

  const v = venceEl(s.presentadaEl)
  if (v.cuenta === 'sin-calendario') {
    return (
      `Solicitado el ${s.presentadaEl}. El Ayuntamiento tiene de plazo hasta el ${v.nominal} o, ` +
      'si ese día es inhábil, el primer día hábil siguiente (art. 20 de la Ley 19/2013). ' +
      faltaElCalendario(v.anio)
    )
  }
  // Si el mes acaba en inhábil, el último día no es el que sale de sumarlo, y
  // quien cuente desde el día de la solicitud tiene que poder reconciliarlo.
  const motivo = motivoDeInhabil(v.nominal, FESTIVOS_DE_LA_SEDE)
  const prorroga =
    v.ultimoDia === v.nominal
      ? ''
      : ` Prorrogado: el ${v.nominal}${motivo ? `, ${motivo},` : ''} es inhábil (art. 30.5 de la Ley 39/2015).`
  if (estado === 'vencida-sin-respuesta') {
    return (
      `Solicitado el ${s.presentadaEl}. Venció el plazo el ${v.ultimoDia} y no han ` +
      'contestado. La ley da a ese silencio efecto desestimatorio, pero lo que ha ocurrido es ' +
      `que no hubo respuesta.${prorroga}`
    )
  }
  return `Solicitado el ${s.presentadaEl}. El Ayuntamiento tiene de plazo hasta el ${v.ultimoDia} (art. 20 de la Ley 19/2013).${prorroga}`
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida el registro curado. Se llama en cada escritura Y en cada lectura:
 * defensa en profundidad, como `validateOverlay`.
 */
export function validarRegistroSolicitudes(
  r: RegistroSolicitudes,
  pedibles: readonly string[] = ['informe-tecnico', 'expediente', 'plan-interno', 'acta'],
): void {
  if (!r || typeof r.version !== 'number' || !Array.isArray(r.items)) {
    throw new Error('[solicitudes] registro malformado: falta version o items')
  }
  const vistos = new Set<string>()
  for (const s of r.items) {
    if (!s?.id) throw new Error('[solicitudes] una fila sin id')
    if (vistos.has(s.id)) throw new Error(`[solicitudes] ${s.id}: id repetido`)
    vistos.add(s.id)
    if (!pedibles.includes(s.clase)) {
      throw new Error(
        `[solicitudes] ${s.id}: «${s.clase}» no es una clase pedible. De contrato y presupuesto ` +
          'ya tenemos corpus: ahí el hueco es de emparejamiento, no de publicación.',
      )
    }
    if (!FECHA.test(s.presentadaEl ?? '')) {
      throw new Error(`[solicitudes] ${s.id}: presentadaEl debe ser YYYY-MM-DD`)
    }
    if (!s.registro?.trim()) {
      throw new Error(
        `[solicitudes] ${s.id}: falta el nº de registro. Sin él no consta que se presentara.`,
      )
    }
    if (!s.titulo || s.titulo.trim().length < 20) {
      throw new Error(`[solicitudes] ${s.id}: el título tiene que decir qué se pidió (≥20 car.)`)
    }
    if (s.respuesta) {
      if (!FECHA.test(s.respuesta.fecha ?? '')) {
        throw new Error(`[solicitudes] ${s.id}: respuesta.fecha debe ser YYYY-MM-DD`)
      }
      if (!SENTIDOS_RESPUESTA.includes(s.respuesta.sentido)) {
        throw new Error(`[solicitudes] ${s.id}: sentido «${s.respuesta.sentido}» no existe`)
      }
    }
    if (s.reclamacion) {
      if (!FECHA.test(s.reclamacion.fecha ?? '')) {
        throw new Error(`[solicitudes] ${s.id}: reclamacion.fecha debe ser YYYY-MM-DD`)
      }
      if (!ORGANOS_RECLAMACION.includes(s.reclamacion.organo)) {
        throw new Error(
          `[solicitudes] ${s.id}: órgano «${s.reclamacion.organo}» no existe. Para un ` +
            'ayuntamiento valenciano es consell-cv.',
        )
      }
    }
  }
}

/**
 * El título de la tabla de solicitudes de /laboratorio/cobertura, sacado de los
 * mismos estados que pinta la tabla.
 *
 * Decía siempre «Lo que hemos pedido, y lo que han contestado», y el 15-09-2026 el
 * registro estaba vacío: todas las filas decían «Todavía no lo hemos pedido» debajo
 * de un título que afirmaba lo contrario. Sin ninguna solicitud presentada, el título
 * dice lo que la tabla es.
 */
export function tituloSolicitudes(estados: readonly EstadoSolicitud[]): string {
  return estados.some((e) => e !== 'sin-solicitar')
    ? 'Lo que hemos pedido, y lo que han contestado'
    : 'Lo que habría que pedir'
}
