// @ts-check
/**
 * Resueltas, pendientes y silencios de UN cargo, sólo cuando significan algo.
 *
 * Los tres cuentan respuestas del ayuntamiento, y el ayuntamiento sólo puede
 * contestar —o callar— a lo que le ha llegado: el plazo de la LPACAP corre desde
 * el REGISTRO de la queja. Mientras ninguna queja del área de un cargo esté
 * registrada, «0 silencios» junto a su nombre se lee como un aprobado que nadie
 * se ha ganado, y «pendientes 1» como una deuda que el ayuntamiento no tiene.
 *
 * Hay cifras cuando:
 *   - el listado publicado está entero. El bot exporta como mucho mil quejas
 *     (`buildSnapshot`, bot/src/services/snapshot.ts) mientras `stats` las
 *     cuenta todas, así que con el listado truncado no se puede saber cuáles se
 *     registraron;
 *   - y al menos una queja de ESE cargo tiene fecha de registro.
 *
 * Si no, las tres son null y `motivo` dice por qué. Cada motivo tiene su texto
 * en el catálogo: `quejas.reloj.<motivo>` y `quejas.reloj.<motivo>.corto`.
 *
 * El total de quejas asignadas se da siempre: es un hecho del canal, no una nota
 * sobre las respuestas del ayuntamiento. Un cargo sin fila en `byConcejal` tiene
 * cero —el recuento cubre todas las quejas—, y eso es un dato, no una ausencia.
 */

/** Por qué un cargo se queda sin cifras. */
export const MOTIVOS_SIN_CIFRA = ['sinDatos', 'exportIncompleto', 'sinRegistro']

/**
 * @typedef {{ total: number, resueltas: number, pendientes: number, silencios: number }} FilaCargo
 * @typedef {{ concejal_slug?: string | null, registered_at?: string | null }} QuejaPublicada
 * @typedef {{ stats?: { total?: number, byConcejal?: Record<string, FilaCargo> },
 *   items?: QuejaPublicada[] }} InstantaneaQuejas
 */

/**
 * @param {InstantaneaQuejas | null | undefined} instantanea  public/data/quejas.json
 * @param {string} slug
 */
export function contadoresDeCargo(instantanea, slug) {
  const stats = instantanea?.stats
  const fila = stats?.byConcejal?.[slug]
  const total = fila?.total ?? 0
  /** @param {string} motivo */
  const sinCifras = (motivo) => ({
    total,
    medible: false,
    motivo,
    resueltas: null,
    pendientes: null,
    silencios: null,
  })

  if (!stats || typeof stats.total !== 'number') return sinCifras('sinDatos')
  const items = instantanea?.items ?? []
  if (items.length !== stats.total) return sinCifras('exportIncompleto')
  if (!fila || !items.some((q) => q.concejal_slug === slug && q.registered_at)) {
    return sinCifras('sinRegistro')
  }
  return {
    total,
    medible: true,
    motivo: null,
    resueltas: fila.resueltas,
    pendientes: fila.pendientes,
    silencios: fila.silencios,
  }
}
