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
 * @typedef {{ concejal_slug?: string | null, address_string?: string | null,
 *   registered_at?: string | null }} QuejaPublicada
 * @typedef {{ stats?: { total?: number, byConcejal?: Record<string, FilaCargo> },
 *   items?: QuejaPublicada[] }} InstantaneaQuejas
 */

/**
 * ¿Se pueden leer como respuestas del ayuntamiento las cifras de un subconjunto
 * de quejas?
 *
 * El criterio vive AQUÍ y sólo aquí, porque hay dos superficies que lo
 * necesitan: los cargos (`contadoresDeCargo`, abajo) y los barrios
 * (`lib/neighborhood-aggregate`). Escribirlo dos veces sería escribir dos veces
 * la misma regla legal, y eso es exactamente cómo este defecto sobrevivió al PR
 * que arregló los cargos: se corrigió una copia y la otra siguió publicando
 * «⏳ 1» sobre el mapa.
 *
 * `pertenece` dice qué quejas son del sujeto que se está juzgando —un cargo, un
 * barrio— y es lo ÚNICO que cambia entre las dos superficies.
 *
 * @param {InstantaneaQuejas | null | undefined} instantanea  public/data/quejas.json
 * @param {(q: QuejaPublicada) => boolean} pertenece
 * @returns {{ medible: boolean, motivo: string | null }}
 */
export function medibilidad(instantanea, pertenece) {
  const stats = instantanea?.stats
  // La instantánea no se puede leer: no hay nada que juzgar todavía.
  if (!stats || !esRecuento(stats.total)) return { medible: false, motivo: 'sinDatos' }
  const items = Array.isArray(instantanea?.items) ? instantanea.items : []
  // El bot exporta como mucho mil quejas mientras `stats` las cuenta todas, así
  // que con el listado truncado no se puede saber cuáles se registraron.
  if (items.length !== stats.total) return { medible: false, motivo: 'exportIncompleto' }
  // El plazo de la LPACAP corre desde el REGISTRO: sin una sola queja registrada
  // el ayuntamiento no ha recibido nada que pudiera contestar o dejar sin
  // contestar.
  if (!items.some((q) => pertenece(q) && registroUtilizable(q.registered_at))) {
    return { medible: false, motivo: 'sinRegistro' }
  }
  return { medible: true, motivo: null }
}

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

  // El criterio compartido con los barrios. El ORDEN de lo que sigue importa y
  // se conserva: un listado truncado se reporta como tal aunque además la fila
  // venga a medias.
  const m = medibilidad(instantanea, (q) => q.concejal_slug === slug)

  // La instantánea no se puede leer: ni el total es un dato todavía.
  if (m.motivo === 'sinDatos') return sinCifras('sinDatos', null)

  const total = esRecuento(fila?.total) ? fila.total : 0
  if (m.motivo === 'exportIncompleto') return sinCifras('exportIncompleto', total)
  // Una fila A MEDIAS no se publica tal cual: `✓ undefined` es lo que sale de
  // confiar en que el productor siempre manda las cuatro cifras. Ojo a la
  // distinción: que no haya fila NO es un dato a medias —es un cargo con cero
  // quejas asignadas, y ahí lo que falta es el registro, no el dato—, así que
  // ese caso sigue su camino hasta `sinRegistro`.
  if (fila && ![fila.resueltas, fila.pendientes, fila.silencios].every(esRecuento)) {
    return sinCifras('sinDatos', total)
  }
  if (m.motivo === 'sinRegistro') return sinCifras('sinRegistro', total)
  return {
    total,
    medible: true,
    motivo: null,
    resueltas: fila.resueltas,
    pendientes: fila.pendientes,
    silencios: fila.silencios,
  }
}
