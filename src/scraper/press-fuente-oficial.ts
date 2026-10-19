/**
 * ¿Es esta «fuente» de prensa una administración y no un medio? — puro, sin E/S.
 *
 * Una regla para dos usos, que antes tenían una cada uno y no la misma:
 *
 *   · /laboratorio marcaba OFICIAL en la tabla por medio con una expresión sobre
 *     el NOMBRE (`isOfficialOutlet`, sólo «ayuntamiento|ajuntament»), y en la
 *     tarjeta con la bandera `official` de press.ts, que sólo lleva el feed del
 *     Ayuntamiento de Riba-roja.
 *   · press-analytics.ts no la usaba en absoluto, y el 19-10-2026 siete de los
 *     ocho grupos de «Cobertura comparada · 2 medios» eran una nota de prensa del
 *     Ayuntamiento y el periódico que la reproducía, publicados como dos medios
 *     que se corroboran. Una administración que cuenta lo que ella misma hizo no
 *     corrobora a nadie: es la fuente, no un testigo.
 *
 * Es oficial si lo dice el feed (`official: true`), si el host es de una
 * administración (el del Ayuntamiento, los de la Generalitat y la Diputació), o
 * si el NOMBRE con que Google News firma la pieza nombra una: los ayuntamientos
 * vecinos tienen cada uno su dominio (cheste.es), y no se pueden listar todos.
 * Se mira el nombre del medio, nunca el titular: «La Diputació refuerza la
 * seguridad en la CV-336» lo publica Actualidad Valencia, que es un periódico.
 */

/** Hosts de administraciones; un subdominio cuenta (comunica.gva.es). */
const HOSTS_OFICIALES = ['ribarroja.es', 'gva.es', 'dival.es'] as const

/** Palabras que, en el nombre de la fuente, la hacen una administración. */
const PALABRAS_OFICIALES = new Set([
  'ayuntamiento',
  'ajuntament',
  'generalitat',
  'diputación',
  'diputacion',
  'diputació',
  'conselleria',
])

export interface FuenteDePrensa {
  source?: string | null
  sourceHost?: string | null
  official?: boolean | null
}

export function esFuenteOficial(a: FuenteDePrensa): boolean {
  if (a.official === true) return true
  const host = (a.sourceHost ?? '').toLowerCase()
  if (host && HOSTS_OFICIALES.some((h) => host === h || host.endsWith(`.${h}`))) return true
  const palabras = (a.source ?? '').toLowerCase().split(/[^\p{L}]+/u)
  return palabras.some((p) => PALABRAS_OFICIALES.has(p))
}
