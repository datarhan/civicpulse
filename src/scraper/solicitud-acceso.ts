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
 */

export const ESTADOS_SOLICITUD = [
  'sin-solicitar',
  'en-plazo',
  'vencida-sin-respuesta',
  'respondida',
  'reclamada',
] as const

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]

export const SENTIDOS_RESPUESTA = ['concedido', 'parcial', 'denegado'] as const
export type SentidoRespuesta = (typeof SENTIDOS_RESPUESTA)[number]

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
 * La fecha en que vence el mes del art. 20.
 *
 * Mes NATURAL, no 30 días. Y sin inventar un 31 de febrero: si el día no existe
 * en el mes siguiente, cae al último que sí existe, que es como cuenta un plazo
 * administrativo.
 */
export function venceEl(presentadaEl: string): string {
  const [a, m, d] = presentadaEl.split('-').map(Number)
  const mesSiguiente = m === 12 ? 1 : m + 1
  const anio = m === 12 ? a + 1 : a
  // Día 0 del mes posterior = último día del mes que nos interesa.
  const ultimoDia = new Date(Date.UTC(anio, mesSiguiente, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${anio}-${String(mesSiguiente).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** El estado de UNA clase: su solicitud, o la ausencia de ella. */
export function estadoDeSolicitud(s: SolicitudAcceso | null, hoy: string): EstadoSolicitud {
  if (!s) return 'sin-solicitar'
  // La reclamación manda: es el escalón más avanzado del procedimiento.
  if (s.reclamacion) return 'reclamada'
  if (s.respuesta) return 'respondida'
  return hoy > venceEl(s.presentadaEl) ? 'vencida-sin-respuesta' : 'en-plazo'
}

/**
 * Lo que la página dice de una clase. En hechos, no en calificaciones.
 */
export function frasePublica(s: SolicitudAcceso | null, hoy: string): string {
  const estado = estadoDeSolicitud(s, hoy)
  if (estado === 'sin-solicitar' || !s) {
    return 'Todavía no lo hemos pedido.'
  }
  if (estado === 'en-plazo') {
    return `Solicitado el ${s.presentadaEl}. El Ayuntamiento tiene de plazo hasta el ${venceEl(s.presentadaEl)} (art. 20 de la Ley 19/2013).`
  }
  if (estado === 'vencida-sin-respuesta') {
    return (
      `Solicitado el ${s.presentadaEl}. Venció el plazo el ${venceEl(s.presentadaEl)} y no han ` +
      'contestado. La ley da a ese silencio efecto desestimatorio, pero lo que ha ocurrido es ' +
      'que no hubo respuesta.'
    )
  }
  if (estado === 'respondida' && s.respuesta) {
    const q = {
      concedido: 'Lo concedieron',
      parcial: 'Lo concedieron en parte',
      denegado: 'Lo denegaron',
    }[s.respuesta.sentido]
    return `Solicitado el ${s.presentadaEl}. ${q} el ${s.respuesta.fecha}.`
  }
  if (s.reclamacion) {
    return (
      `Solicitado el ${s.presentadaEl}. Reclamado el ${s.reclamacion.fecha} ante el ` +
      `${ORGANO_ETIQUETA[s.reclamacion.organo]} (art. 24).`
    )
  }
  return 'Todavía no lo hemos pedido.'
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
