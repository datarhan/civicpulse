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
 *   - la fila del cargo trae las tres cifras y son enteros no negativos;
 *   - y al menos una queja de ESE cargo tiene fecha de registro utilizable.
 *
 * Si no, las tres son null y `motivo` dice por qué. Cada motivo tiene su texto
 * en el catálogo: `quejas.reloj.<motivo>` y `quejas.reloj.<motivo>.corto`.
 *
 * `total` —cuántas quejas se asignaron a esa área— es un hecho del canal y no
 * una nota sobre el ayuntamiento, así que se da SIEMPRE que la instantánea se
 * pueda leer. Cuando no se puede, es **null y no cero**: un cero se publicaba
 * como «sin quejas asignadas», que es convertir una ausencia en un dato — la
 * regla 3 de DATA_INTEGRITY, y justo lo que este módulo existe para no hacer.
 * Un cargo sin fila con la instantánea leída sí tiene cero de verdad.
 *
 * Pendiente para el día que `cerrada_no_registrada` tenga quien lo escriba
 * (hoy está en el enum y nadie lo pone): una queja que el ayuntamiento cierra
 * SIN registrar es una respuesta suya, y entonces el criterio querrá ser
 * «registrada O en un estado terminal de respuesta».
 */

/** Por qué un cargo se queda sin cifras. */
export const MOTIVOS_SIN_CIFRA = ['sinDatos', 'exportIncompleto', 'sinRegistro']

/** Un recuento publicable: entero y no negativo. */
function esRecuento(n) {
  return Number.isInteger(n) && n >= 0
}

/** Una fecha de registro utilizable, con el mismo criterio que usa el panel
 *  para contar días («ReadyToEscalate» hace `new Date(...).getTime()`). */
function registroUtilizable(valor) {
  return typeof valor === 'string' && Number.isFinite(Date.parse(valor))
}

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
  /** @param {string} motivo @param {number | null} total */
  const sinCifras = (motivo, total) => ({
    total,
    medible: false,
    motivo,
    resueltas: null,
    pendientes: null,
    silencios: null,
  })

  // La instantánea no se puede leer: ni el total es un dato todavía.
  if (!stats || !esRecuento(stats.total)) return sinCifras('sinDatos', null)

  const total = esRecuento(fila?.total) ? fila.total : 0
  const items = instantanea?.items ?? []
  if (items.length !== stats.total) return sinCifras('exportIncompleto', total)
  // Una fila A MEDIAS no se publica tal cual: `✓ undefined` es lo que sale de
  // confiar en que el productor siempre manda las cuatro cifras. Ojo a la
  // distinción: que no haya fila NO es un dato a medias —es un cargo con cero
  // quejas asignadas, y ahí lo que falta es el registro, no el dato—, así que
  // ese caso sigue su camino hasta `sinRegistro`.
  if (fila && ![fila.resueltas, fila.pendientes, fila.silencios].every(esRecuento)) {
    return sinCifras('sinDatos', total)
  }
  if (!items.some((q) => q.concejal_slug === slug && registroUtilizable(q.registered_at))) {
    return sinCifras('sinRegistro', total)
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
