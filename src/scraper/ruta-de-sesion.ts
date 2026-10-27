/**
 * Enlaces legibles a una sesión (auditoría de las dos lecturas, §9).
 *
 * Un enlace a /plenos/zrbgic no dice nada a quien lo recibe;
 * /plenos/2026-10-05-ordinario dice qué es. El id sigue siendo el canónico: el
 * mapa del sitio, los hallazgos y las declaraciones lo usan, y la página de la
 * sesión lo declara en su `<link rel="canonical">`. El alias es otra forma de
 * llegar, y la que pintan los enlaces del índice y de la portada.
 *
 * - **Un enlace siempre lleva a su sesión.** `rutaDeSesion` sólo usa el alias si
 *   el alias, resuelto, devuelve esa misma sesión; si no —dos sesiones del
 *   mismo tipo el mismo día—, enlaza por el id.
 * - **Un alias viejo sigue valiendo.** Si se corrige el tipo de una sesión, su
 *   fecha no cambia: un alias con otro tipo, o la fecha sola, lleva a la sesión
 *   de ese día cuando es la única.
 * - Ningún id publicado empieza por una fecha (lo comprueba la prueba), así que
 *   un parámetro es una cosa o la otra.
 */

export interface SesionConFecha {
  id: string
  date: string
  kind?: string | null
}

const FECHA = /^(\d{4}-\d{2}-\d{2})(?:-([a-z]+))?$/

/** «2026-10-05-ordinario»; sin un tipo que quepa en una dirección, la fecha sola. */
export function aliasDeSesion(s: Pick<SesionConFecha, 'date' | 'kind'>): string {
  const dia = s.date.slice(0, 10)
  return s.kind && /^[a-z]+$/.test(s.kind) ? `${dia}-${s.kind}` : dia
}

/** La sesión a la que lleva un parámetro de /plenos/:id: su id, su alias o su fecha. */
export function sesionDeParametro<S extends SesionConFecha>(
  parametro: string,
  sesiones: readonly S[],
): S | undefined {
  const porId = sesiones.find((s) => s.id === parametro)
  if (porId) return porId
  const m = FECHA.exec(parametro)
  if (!m) return undefined
  const delDia = sesiones.filter((s) => s.date.slice(0, 10) === m[1])
  if (m[2]) {
    const exactas = delDia.filter((s) => aliasDeSesion(s) === parametro)
    if (exactas.length === 1) return exactas[0]
    if (exactas.length > 1) return undefined
  }
  return delDia.length === 1 ? delDia[0] : undefined
}

/** La ruta con que se enlaza una sesión: por su alias si lleva de vuelta a ella; si no, por su id. */
export function rutaDeSesion(s: SesionConFecha, sesiones: readonly SesionConFecha[]): string {
  const alias = aliasDeSesion(s)
  return sesionDeParametro(alias, sesiones) === s ? `/plenos/${alias}` : `/plenos/${s.id}`
}
