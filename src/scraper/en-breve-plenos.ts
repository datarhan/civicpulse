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
