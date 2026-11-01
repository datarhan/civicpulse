// @ts-check
/**
 * Las quejas por área municipal, para /quejas/dashboard (auditoría de las dos
 * lecturas, 25-10-2026, §19).
 *
 * El panel las contaba por CARGO —resueltas, pendientes y silencios junto al
 * nombre de cada concejal—: una tabla de personas que, con volumen, toma la
 * forma de un marcador. Ahora se agrupan por área, como /departamentos, y quien
 * tiene el área a su cargo se nombra una vez por área: para saber a quién
 * preguntar, que es lo que hacen las demás páginas.
 *
 * La regla no se reescribe aquí. Es `computeDepartmentStats`, la de
 * /departamentos: qué área es cada queja (`departamentoDeQueja`), cuántas tiene,
 * y abiertas y silencios sólo cuando alguna del área está registrada
 * (`medibilidad`, lib/reloj-lpacap). Con sólo las quejas y los cargos, lo demás
 * de cada área queda vacío y no se usa.
 *
 * - **Sin el listado entero no hay filas.** Con la instantánea ilegible o el
 *   listado truncado, ni el total de un área es un dato: se devuelve el motivo.
 * - **Lo que no cae en ningún área se cuenta aparte** (`sinArea`), para que las
 *   filas y el total publicado cuadren.
 */
import { computeDepartmentStats } from './department-stats'

/**
 * @typedef {{
 *   slug: string, labelEs: string, labelCa: string,
 *   responsable: { slug: string, name: string, party?: string } | null,
 *   total: number, abiertas: number | null, silencios: number | null,
 *   medible: boolean, motivo: string | null,
 * }} FilaDeArea
 */

/**
 * @param {{ quejas: any, officials: any }} entrada
 * @returns {{ filas: FilaDeArea[], sinArea: number | null, motivo: string | null }}
 */
export function quejasPorArea({ quejas, officials }) {
  const { list } = computeDepartmentStats({ quejas, officials })
  const ilegible = list.find((b) => b.quejas.total == null)
  if (ilegible) return { filas: [], sinArea: null, motivo: ilegible.quejas.motivo }

  const filas = list
    .filter((b) => b.quejas.total > 0)
    .map((b) => ({
      slug: b.slug,
      labelEs: b.labelEs,
      labelCa: b.labelCa,
      responsable: b.responsableOfficial ?? null,
      total: b.quejas.total,
      abiertas: b.quejas.abiertas,
      silencios: b.quejas.silencios,
      medible: b.quejas.medible,
      motivo: b.quejas.motivo,
    }))
    .sort((a, b) => b.total - a.total || a.labelEs.localeCompare(b.labelEs, 'es'))

  // Llegados aquí el listado está entero (`medibilidad`), así que `stats.total`
  // son las quejas listadas y la diferencia es lo que no cayó en ningún área.
  const publicadas = quejas?.stats?.total
  const asignadas = filas.reduce((n, f) => n + f.total, 0)
  return {
    filas,
    sinArea: Number.isInteger(publicadas) ? publicadas - asignadas : null,
    motivo: null,
  }
}
