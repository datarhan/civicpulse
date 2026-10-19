/**
 * Las fechas de las sesiones cuya acta publicamos (public/data/pleno-actas.json).
 *
 * Las leen el manifiesto de declaraciones (scripts/chunk-pleno-claims.ts) y la
 * carta de solicitud (scripts/lib/solicitud-borrador.ts) para no contar como
 * pendiente el acta de un pleno que ya está en el sitio. Un solo lector, para
 * que la columna de /laboratorio/cobertura y la carta no puedan discrepar.
 *
 * `null` si el fichero no está o no se entiende: no poder leer el registro no
 * es saber que están todas, y quien lo recibe no aparta ninguna por publicada
 * (`clasesQueCuentan`, src/scraper/clase-documental.ts).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const PLENO_ACTAS = resolve('public/data/pleno-actas.json')

export function sesionesConActaEnDisco(ruta: string = PLENO_ACTAS): Set<string> | null {
  if (!existsSync(ruta)) return null
  try {
    const items = (JSON.parse(readFileSync(ruta, 'utf8')) as { items?: unknown }).items
    if (!Array.isArray(items)) return null
    const fechas = items
      .map((x) => (x as { fecha?: unknown })?.fecha)
      .filter((f): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f))
    return fechas.length > 0 ? new Set(fechas) : null
  } catch {
    return null
  }
}
