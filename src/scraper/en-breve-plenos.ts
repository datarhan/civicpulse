/**
 * «El último pleno»: la lectura vecinal de /plenos (auditoría de las dos
 * lecturas, 25-10-2026, §9).
 *
 * Un vecino llega al índice de plenos preguntando qué se trató en el último y
 * qué se votó; la página le contestaba con una tabla de 63 filas de recuentos
 * de lo que hemos procesado. Esto deriva la respuesta, y el JSX sólo la pinta.
 *
 * - **La sesión es la de la portada.** Se elige con `ultimoPleno`, sobre las
 *   mismas filas de `summarizeSessions`: la última celebrada ANTES de hoy en
 *   Riba-roja. Las dos páginas no pueden hablar de sesiones distintas.
 * - **«Para decidir» no es «se decidió».** La parte resolutiva del orden del
 *   día es lo que se llevó a votar, no lo que se aprobó: un punto se puede
 *   retirar, aplazar o rechazar. El resultado de cada punto que publica regmeet
 *   no se usa: en `1sqj7is-09` decía aprobada una moción que la transcripción
 *   recoge con «tretze vots en contra i huit a favor», y el registro se
 *   retractó. Lo único que se cuenta como votado es lo transcrito y curado de
 *   pleno-votes.json.
 * - **Cada punto, con su etiqueta llana** (`etiquetaDelPunto`): el título sin
 *   área, expediente ni fórmula, en la lengua en que se convocó.
 * - **Lo que no consta es `null`**, nunca un cero: sin orden del día recogido,
 *   `ordenDelDia` es null; sin ninguna votación transcrita, `votos` es null.
 */
import { ultimoPleno, type FilaSesion } from './en-breve-portada'
import { etiquetaDelPunto } from './etiqueta-llana'
import type { PlenoAgendaItem } from './pleno-agenda'
import type { VoteOutcome, VoteSourceKind } from './pleno-votes'

export interface PuntoEnBreve {
  numero: number
  /** La etiqueta llana del punto. */
  texto: string
  /** El título tal cual, para quien quiera leerlo entero. */
  titulo: string
  urgente: boolean
}

export interface OrdenDelDiaEnBreve {
  /** Puntos del orden del día, ruegos y preguntas incluidos. */
  total: number
  /** La parte resolutiva: lo que se llevó a votar. */
  decidir: PuntoEnBreve[]
  /** La parte informativa: lo que se da a conocer y no se vota. */
  informes: PuntoEnBreve[]
  /** Puntos sin ninguna de las tres partes (la sede vieja marcaba «apertura»). */
  otros: PuntoEnBreve[]
  ruegos: boolean
}

export interface VotosEnBreve {
  /** Votaciones transcritas y publicadas de la sesión; nunca 0 (entonces `votos` es null). */
  transcritas: number
  aprobadas: number
  rechazadas: number
  /** Retiradas o aplazadas. */
  otras: number
  /** Cuántas reparten el voto por grupos según la transcripción automática del vídeo. */
  repartoDeTranscripcion: number
}

export interface UltimoPlenoEnBreve {
  id: string
  /** «AAAA-MM-DD». */
  fecha: string
  /** El tipo de sesión del índice («ordinario», «extraordinario», «urgente»). */
  tipo: string | null
  /** null si no hemos recogido su orden del día. */
  ordenDelDia: OrdenDelDiaEnBreve | null
  /** null si no hay ninguna votación transcrita publicada. */
  votos: VotosEnBreve | null
}

/** Una fila de `summarizeSessions`, con lo que aquí se lee además de `FilaSesion`. */
export interface FilaSesionPlenos extends FilaSesion {
  kind?: string | null
}

export interface VotoPublicado {
  plenoId: string
  outcome: VoteOutcome
  provenance?: { breakdown?: { kind?: VoteSourceKind } }
}

function puntoEnBreve(item: PlenoAgendaItem): PuntoEnBreve {
  const { texto, urgente } = etiquetaDelPunto(item.title)
  return { numero: item.number, texto, titulo: item.title, urgente }
}

export function ordenDelDiaEnBreve(agenda: readonly PlenoAgendaItem[]): OrdenDelDiaEnBreve {
  const decidir: PuntoEnBreve[] = []
  const informes: PuntoEnBreve[] = []
  const otros: PuntoEnBreve[] = []
  let ruegos = false
  for (const item of [...agenda].sort((a, b) => a.number - b.number)) {
    if (item.section === 'resolutiva') decidir.push(puntoEnBreve(item))
    else if (item.section === 'informativa') informes.push(puntoEnBreve(item))
    else if (item.section === 'ruegos') ruegos = true
    else otros.push(puntoEnBreve(item))
  }
  return { total: agenda.length, decidir, informes, otros, ruegos }
}

export function votosEnBreve(votos: readonly VotoPublicado[]): VotosEnBreve | null {
  if (votos.length === 0) return null
  const cuenta = (o: VoteOutcome) => votos.filter((v) => v.outcome === o).length
  const aprobadas = cuenta('aprobado')
  const rechazadas = cuenta('rechazado')
  return {
    transcritas: votos.length,
    aprobadas,
    rechazadas,
    otras: votos.length - aprobadas - rechazadas,
    repartoDeTranscripcion: votos.filter((v) => v.provenance?.breakdown?.kind === 'transcripcion')
      .length,
  }
}

/**
 * Las palabras de la sede que el glosario explica y que no salen de la parte
 * del punto: «para decidir», «informe» y «ruegos y preguntas» ya van en la
 * frase del orden del día. Éstas van dentro del título, que es literal y no
 * admite marca, así que la página las nombra aparte. El orden es el de la
 * lista que se pinta.
 */
export const PALABRAS_DEL_PLENO = [
  'mocion',
  'reconocimientoExtrajudicial',
  'sinDictaminar',
  'urgencia',
] as const

export type PalabraDelPleno = (typeof PALABRAS_DEL_PLENO)[number]

/*
 * Sin `\b`: en JavaScript una letra con tilde no es «de palabra», y «Moció»
 * no tendría frontera detrás. Las fronteras se piden con letras Unicode.
 * «Dictamen del Consell Jurídic» no es «sin dictaminar», ni «promoción» es
 * «moción».
 */
const EN_EL_TITULO: Record<Exclude<PalabraDelPleno, 'urgencia'>, RegExp> = {
  mocion: /(?<!\p{L})moci(?:ón|on|ó|ò|o)(?!\p{L})/iu,
  reconocimientoExtrajudicial: /(?<!\p{L})(?:reconocimiento|reconeixement)\s+extrajudicial/iu,
  sinDictaminar: /(?<!\p{L})(?:sin|sense)\s+dictaminar(?!\p{L})/iu,
}

/**
 * Qué palabras del glosario salen en el orden del día de una sesión, una vez
 * cada una. La urgencia es la misma marca que pinta la etiqueta llana
 * (`etiquetaDelPunto`), para que la lista no nombre una urgencia que ningún
 * punto lleva, ni calle una que se ve.
 */
export function vocabularioDelOrdenDelDia(
  agenda: readonly Pick<PlenoAgendaItem, 'title'>[],
): PalabraDelPleno[] {
  return PALABRAS_DEL_PLENO.filter((p) =>
    agenda.some((a) =>
      p === 'urgencia' ? etiquetaDelPunto(a.title).urgente : EN_EL_TITULO[p].test(a.title),
    ),
  )
}

export interface VotoDeLaSesion {
  numero: number
  /** La etiqueta llana del punto votado. */
  texto: string
  /** El título tal cual lo publica el registro de votaciones. */
  titulo: string
  outcome: VoteOutcome
  /** El reparto por grupos se retiró; el resultado sigue publicado. */
  retirado: boolean
}

/** Las votaciones transcritas de una sesión, en el orden del día. */
export function votosDeLaSesion(
  votos: readonly (VotoPublicado & {
    itemNumber: number
    title: string
    votesRetracted?: unknown
  })[],
): VotoDeLaSesion[] {
  return [...votos]
    .sort((a, b) => a.itemNumber - b.itemNumber)
    .map((v) => ({
      numero: v.itemNumber,
      texto: etiquetaDelPunto(v.title).texto,
      titulo: v.title,
      outcome: v.outcome,
      retirado: v.votesRetracted != null,
    }))
}

/**
 * La aprobación del acta anterior: abre casi todos los ordinarios
 * («Aprobación Acta anterior de fecha…», «Aprovació Acta anterior de data…»),
 * y a veces de dos («Aprobación Actas anteriores de fecha 3 de julio… y 6 de
 * julio…»). Sin `\b`, que no ve frontera tras «Aprovació»: con letras Unicode.
 */
const APROBACION_DE_ACTA =
  /^(?:aprobaci[oó]n|aprovaci[oó])(?!\p{L})[^.]{0,40}(?<!\p{L})act(?:a|as|es)(?!\p{L})[^.]{0,40}(?<!\p{L})anterior(?:s|es)?(?!\p{L})/iu

export function esAprobacionDeActa(titulo: string): boolean {
  return APROBACION_DE_ACTA.test(titulo)
}

export interface SesionDelAnio {
  id: string
  /** «AAAA-MM-DD». */
  fecha: string
  tipo: string | null
  /** null si no hemos recogido su orden del día. */
  ordenDelDia: {
    /** Los primeros puntos para decidir, sin la aprobación del acta. */
    destacados: PuntoEnBreve[]
    /** Los demás puntos para decidir, la aprobación del acta incluida. */
    masDecidir: number
    informes: number
  } | null
}

/**
 * Las sesiones del último año antes de hoy, de la más nueva a la más vieja, sin
 * la última —que ya tiene su tarjeta, «El último pleno»—: la fecha, el tipo y
 * lo primero que se llevó a votar (auditoría de las dos lecturas, §9). La lista
 * entera, con sus recuentos, es la tabla de sesiones.
 *
 * La aprobación del acta no se enseña entre los destacados: pondría la misma
 * línea en cada ordinario. Cuenta en `masDecidir`, porque se vota.
 */
export function sesionesDelUltimoAnio(e: {
  /** Las del índice: sólo se leen el id, la fecha y el tipo. */
  sesiones: readonly { id: string; date?: string; kind?: string | null }[]
  agendas: readonly { id: string; agenda?: PlenoAgendaItem[] }[]
  hoy: string
  /** Cuántos puntos para decidir se enseñan de cada sesión. */
  cuantos?: number
}): SesionDelAnio[] {
  const hoy = e.hoy.slice(0, 10)
  const desde = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`
  // La misma que «El último pleno» y la portada: `ultimoPleno` elige por fecha, y
  // lo que cuenta de cada fila no hace falta aquí.
  const ultima = ultimoPleno(
    e.sesiones.map((s) => ({ id: s.id, date: s.date, puntos: null, votos: null })),
    hoy,
  )?.id
  const cuantos = e.cuantos ?? 2
  return e.sesiones
    .filter((s): s is typeof s & { date: string } => Boolean(s.date))
    .filter((s) => s.id !== ultima && s.date.slice(0, 10) < hoy && s.date.slice(0, 10) >= desde)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => {
      const agenda = e.agendas.find((a) => a.id === s.id)?.agenda
      if (!agenda || agenda.length === 0) {
        return { id: s.id, fecha: s.date.slice(0, 10), tipo: s.kind ?? null, ordenDelDia: null }
      }
      const o = ordenDelDiaEnBreve(agenda)
      const destacados = o.decidir.filter((p) => !esAprobacionDeActa(p.titulo)).slice(0, cuantos)
      return {
        id: s.id,
        fecha: s.date.slice(0, 10),
        tipo: s.kind ?? null,
        ordenDelDia: {
          destacados,
          masDecidir: o.decidir.length - destacados.length,
          informes: o.informes.length,
        },
      }
    })
}

export function ultimoPlenoEnBreve(e: {
  sesiones: readonly FilaSesionPlenos[]
  agendas: readonly { id: string; agenda?: PlenoAgendaItem[] }[]
  votos: readonly VotoPublicado[]
  hoy: string
}): UltimoPlenoEnBreve | null {
  const ultimo = ultimoPleno(e.sesiones, e.hoy)
  if (!ultimo) return null
  const fila = e.sesiones.find((s) => s.id === ultimo.id)
  const agenda = e.agendas.find((a) => a.id === ultimo.id)?.agenda
  return {
    id: ultimo.id,
    fecha: ultimo.fecha,
    tipo: fila?.kind ?? null,
    ordenDelDia: agenda && agenda.length > 0 ? ordenDelDiaEnBreve(agenda) : null,
    votos: votosEnBreve(e.votos.filter((v) => v.plenoId === ultimo.id)),
  }
}
