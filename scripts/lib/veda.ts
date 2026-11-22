/**
 * ¿Hay veda electoral (LOREG) ahora mismo? Lo pregunta cada script que escribe
 * a qué grupo municipal se atribuye una cita (`speakerGroup`) o el mapa de
 * voces del que sale.
 *
 * Hasta el 22-11-2026 sólo `relabel-attribution.ts`, `extract-speaker-map-texto.ts`
 * y el auto-curador (con su copia local) miraban `frozenUntil`. El mapa de voces
 * por audio, la extracción de declaraciones, el arrastre de atribución, la
 * reconciliación con `--apply` y la tubería nocturna no lo miraban, aunque
 * /metodologia ya prometía que en veda no se retira nada automáticamente. En
 * veda, una pasada nocturna podía volver a atribuir grupos a citas de
 * candidatos sin que nadie lo viera.
 *
 * Usa el `isFrozen` de promises.ts, el mismo que lee /promesas: dos copias de la
 * regla acaban discrepando en un borde (la del auto-curador comparaba cadenas
 * de fecha; ésta, instantes).
 *
 * Falla CERRADO: si `promises.json` no se puede leer, no se sabe si hay veda, y
 * «no lo sé» no es «no hay» (regla 3 de DATA_INTEGRITY). Lanza, y el script se
 * para sin escribir nada.
 *
 * Una prueba (`tests/veda-escritores-atribucion.test.ts`) falla si un script
 * escribe `speakerGroup` sin pasar por aquí o por `isFrozen`, salvo que figure
 * en su lista de exentos con el motivo.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isFrozen } from '../../src/scraper/promises'

export const PROMESAS = 'public/data/promises.json'

/** La fecha de fin de la veda si está activa; `null` si no la hay. */
export function vedaActiva(ruta: string = resolve(PROMESAS), ahora = new Date()): string | null {
  let crudo: { frozenUntil?: string | null }
  try {
    crudo = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (err) {
    throw new Error(
      `no se pudo leer ${ruta} para saber si hay veda electoral (${(err as Error).message}); ` +
        'sin saberlo no se escribe ninguna atribución',
    )
  }
  const frozenUntil = crudo?.frozenUntil ?? null
  return isFrozen({ frozenUntil }, ahora) ? frozenUntil : null
}
