/**
 * Lo que la portada y /plenos derivan de los snapshots sin pintarlo: las
 * promesas por partido, el día civil de Riba-roja y la última sesión celebrada.
 *
 * Nació como la derivación de «Tu ayuntamiento en 30 segundos», la primera capa
 * de la portada (auditoría de las dos lecturas, 25-10-2026), retirada el
 * 02-11-2026. Quedan las funciones que otros bloques leían de aquí, con las
 * reglas de entonces: ninguna aritmética propia, y lo que no se puede contestar
 * es `null`, nunca un cero.
 */
import { partyOfAlcaldia, type OfficialsDoc } from './corporation-seats'

export interface PlenoEnBreve {
  id: string
  /** «AAAA-MM-DD», la fecha de la sesión. */
  fecha: string
  /** Puntos del orden del día; null si no lo hemos recogido. */
  puntos: number | null
  /** Votaciones transcritas; null si no hay ninguna publicada. Nunca 0. */
  votos: number | null
}

export interface PromesasPorPartido {
  total: number
  /** [partido, promesas], de más a menos; una promesa sin partido no entra. */
  partidos: Array<[string, number]>
  /** El partido de la alcaldía cuando TODAS las promesas son suyas; si no, `null`. */
  todasDeLaAlcaldia: string | null
}

/**
 * Las promesas del seguimiento, por partido.
 *
 * La portada decía «12 · PSOE · 12». Si todas son del partido de la alcaldía,
 * ahora lo dice con palabras; si hay más de un partido, o una promesa sin él, o
 * no hay un único alcalde con partido, no nombra la alcaldía y las reparte. De
 * la alcaldía, no «del que gobierna»: el padrón no registra pactos de gobierno,
 * y afirmar uno sería escribir lo que el dato no dice.
 */
export function promesasPorPartido(
  items: ReadonlyArray<{ party?: string | null }> | null | undefined,
  doc: OfficialsDoc | null | undefined,
): PromesasPorPartido {
  const lista = items ?? []
  const cuenta = new Map<string, number>()
  for (const p of lista) if (p.party) cuenta.set(p.party, (cuenta.get(p.party) ?? 0) + 1)
  const partidos = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  const alcaldia = partyOfAlcaldia(doc)
  const todas = lista.length > 0 && alcaldia !== null && lista.every((p) => p.party === alcaldia)
  return { total: lista.length, partidos, todasDeLaAlcaldia: todas ? alcaldia : null }
}

/** Una fila de `summarizeSessions` (src/lib/pleno-summary.js), lo que aquí se lee. */
export interface FilaSesion {
  id: string
  date?: string
  puntos: number | null
  votos: number | null
}

const CALENDARIO_DE_RIBARROJA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * El día civil de Riba-roja en un instante, «AAAA-MM-DD». Las fechas de las
 * sesiones son días de allí; el de UTC (`toISOString`) se queda en el de ayer
 * entre la medianoche y la una o las dos, según la estación.
 */
export function hoyEnRibarroja(ahora: Date = new Date()): string {
  const p = Object.fromEntries(
    CALENDARIO_DE_RIBARROJA.formatToParts(ahora).map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * La sesión celebrada más reciente: la de fecha más alta ANTERIOR a `hoy`. Una
 * convocada para mañana no es «el último pleno», y la de hoy tampoco todavía:
 * las sesiones salen en el listado antes de celebrarse, y «el último pleno» se
 * cuenta en pasado, también a las diez de la mañana de un pleno de tarde.
 */
export function ultimoPleno(filas: readonly FilaSesion[], hoy: string): PlenoEnBreve | null {
  const pasadas = filas.filter((f) => f.date && f.date.slice(0, 10) < hoy.slice(0, 10))
  if (!pasadas.length) return null
  const f = pasadas.reduce((a, b) => (b.date! > a.date! ? b : a))
  return { id: f.id, fecha: f.date!.slice(0, 10), puntos: f.puntos, votos: f.votos }
}
