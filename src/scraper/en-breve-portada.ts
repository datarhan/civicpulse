/**
 * «Tu ayuntamiento en 30 segundos»: la primera capa de la portada.
 *
 * La portada abría con una cabecera de periódico, una cinta de precios del
 * mercado y un mapa, y nada en la primera pantalla decía qué es este sitio ni
 * contestaba una pregunta (auditoría de las dos lecturas, 25-10-2026). Este
 * módulo deriva las respuestas a las cuatro preguntas con que llega un vecino
 * —quién manda, cuánto dinero hay y cuánto se gastó, qué se decidió en el
 * último pleno, qué pasa en su barrio— y el JSX sólo las pinta. La quinta,
 * «quiero quejarme», es la llamada al bot que ya existe.
 *
 * Las reglas son las de los otros «En breve»:
 *
 * 1. Ninguna aritmética propia. El dinero y la cobertura del barrio salen de
 *    `enBrevePresupuesto`, la misma función que /presupuesto; el pleno, de
 *    `summarizeSessions`, la de /plenos; los escaños y el partido de la
 *    alcaldía, de `corporation-seats`. Así el resumen no puede decir otra cosa
 *    que la página a la que enlaza.
 * 2. Lo que no se puede contestar es `null`, nunca un cero. Una sesión sin
 *    votaciones transcritas dice eso, no «0 votaciones».
 * 3. El nombre del alcalde sale del padrón de cargos, nunca escrito a mano: un
 *    cambio de alcalde llega solo a la portada.
 */
import { partyOfAlcaldia, seatsFromOfficials, type OfficialsDoc } from './corporation-seats'
import type {
  BarrioEnBreve,
  EnBrevePresupuesto,
  GastadoEnBreve,
  LimiteEnBreve,
} from './en-breve-presupuesto'

export interface MandaEnBreve {
  alcalde: string
  /** El slug de su ficha en /cargos. */
  slug: string
  partido: string
  /** Concejales del partido de la alcaldía. */
  escanos: number
  /** Concejales de la corporación. */
  total: number
}

export interface DineroEnBreve {
  limite: LimiteEnBreve
  /** null sin listado municipal del ejercicio: no hay «cuánto gastó». */
  gastado: GastadoEnBreve | null
}

export interface PlenoEnBreve {
  id: string
  /** «AAAA-MM-DD», la fecha de la sesión. */
  fecha: string
  /** Puntos del orden del día; null si no lo hemos recogido. */
  puntos: number | null
  /** Votaciones transcritas; null si no hay ninguna publicada. Nunca 0. */
  votos: number | null
}

export interface EnBrevePortada {
  manda: MandaEnBreve | null
  dinero: DineroEnBreve | null
  /**
   * Sin listado municipal del ejercicio no hay tope ni gasto; queda el
   * presupuesto aprobado de CONPREL, como en /presupuesto. Sólo cuando `dinero`
   * es null: las dos tarjetas no salen juntas.
   */
  aprobado: { year: number; total: number } | null
  pleno: PlenoEnBreve | null
  barrio: BarrioEnBreve | null
}

/**
 * Quién es el alcalde y cuántos concejales tiene su partido.
 *
 * Dice el partido de la alcaldía y sus escaños, no «quién gobierna»: el padrón
 * no registra pactos de gobierno, y afirmar uno sería escribir lo que el dato
 * no dice. Sin un único alcalde con partido, `null`.
 */
export function quienManda(doc: OfficialsDoc | null | undefined): MandaEnBreve | null {
  const partido = partyOfAlcaldia(doc)
  const alcaldes = (doc?.officials ?? []).filter((o) => o.role === 'alcalde')
  if (!doc || !partido || alcaldes.length !== 1 || !alcaldes[0].name) return null
  const asientos = seatsFromOfficials(doc)
  const total = asientos.reduce((s, b) => s + b.seats, 0)
  const escanos = asientos.find((b) => b.bloc === partido)?.seats
  if (!total || escanos == null) return null
  return { alcalde: alcaldes[0].name, slug: alcaldes[0].slug, partido, escanos, total }
}

/** Una fila de `summarizeSessions` (src/lib/pleno-summary.js), lo que aquí se lee. */
export interface FilaSesion {
  id: string
  date?: string
  puntos: number | null
  votos: number | null
}

/**
 * La sesión celebrada más reciente: la de fecha más alta que no pase de `hoy`.
 * Una sesión convocada para mañana no es «el último pleno».
 */
export function ultimoPleno(filas: readonly FilaSesion[], hoy: string): PlenoEnBreve | null {
  const pasadas = filas.filter((f) => f.date && f.date.slice(0, 10) <= hoy.slice(0, 10))
  if (!pasadas.length) return null
  const f = pasadas.reduce((a, b) => (b.date! > a.date! ? b : a))
  return { id: f.id, fecha: f.date!.slice(0, 10), puntos: f.puntos, votos: f.votos }
}

/** Las cuatro respuestas. Cada una es independiente: la que falta no tumba a las demás. */
export function enBrevePortada(e: {
  officials: OfficialsDoc | null | undefined
  presupuesto: EnBrevePresupuesto
  sesiones: readonly FilaSesion[]
  hoy: string
}): EnBrevePortada {
  const { limite, gastado, barrio, aprobado } = e.presupuesto
  return {
    manda: quienManda(e.officials),
    // El «cuánto gastó» sólo junto a su tope: el porcentaje de un gasto sin el
    // crédito del que es parte no dice nada.
    dinero: limite
      ? { limite, gastado: gastado && gastado.year === limite.year ? gastado : null }
      : null,
    aprobado: limite ? null : aprobado,
    pleno: ultimoPleno(e.sesiones, e.hoy),
    barrio,
  }
}
