/**
 * Recalcula el barrio de las quejas guardadas con la regla de hoy
 * (src/scraper/situar-barrio.ts), y sólo lo cambia si una persona lo pide.
 *
 * Hasta el 2026-09-27 el bot guardaba el centroide más cercano a menos de 2 km,
 * y el Ajuntament era Entrevías. El barrio de una queja publicada es un dato
 * publicado: recalcularlo en silencio sería reescribirlo sin registro. Así que
 * primero se enseña el plan (`scripts/rebarrio.ts`, en seco por defecto) y cada
 * cambio aplicado deja un evento con el antes y el después, que /estado rotula
 * «📍 Barrio corregido» (sin repetir los valores: el evento los guarda).
 */
import type { Db } from '../db/client.ts'
import { situar, type Situacion, type Situado } from './neighborhoods.ts'

/** El evento de una corrección. Exportado: /estado le pone rótulo y las pruebas lo leen. */
export const EVENTO_BARRIO_CORREGIDO = 'barrio_corregido'

export interface CambioDeBarrio {
  id: string
  antes: string | null
  despues: string | null
  situacion: Situacion
  /** El estado de la queja: quien aplica el plan ve si ya salió hacia el Registro. */
  state: string
  /** El asiento en el Registro municipal, si ya lo tiene. */
  asiento: string | null
}

export interface PlanDeRebarrio {
  /** Quejas vivas con ubicación: las únicas que se pueden recalcular. */
  revisadas: number
  /** Quejas vivas sin ubicación: se saltan, y se dice cuántas. */
  sinUbicacion: number
  cambios: CambioDeBarrio[]
}

export function planearRebarrio(
  db: Db,
  situarPunto: (lat: number, lng: number) => Situado = situar,
): PlanDeRebarrio {
  const filas = db
    .prepare(
      `SELECT id, lat, lng, neighborhood, state, registro_entry_number
         FROM quejas WHERE deleted_at IS NULL ORDER BY rowid`,
    )
    .all() as Array<{
    id: string
    lat: number | null
    lng: number | null
    neighborhood: string | null
    state: string
    registro_entry_number: string | null
  }>
  const plan: PlanDeRebarrio = { revisadas: 0, sinUbicacion: 0, cambios: [] }
  for (const f of filas) {
    if (f.lat === null || f.lng === null) {
      plan.sinUbicacion += 1
      continue
    }
    const s = situarPunto(f.lat, f.lng)
    // Sin geo.json no hay regla contra la que recalcular: un plan que dijera
    // «nada que cambiar» sería el cero que no es un dato.
    if (s.situacion === 'sin-geo') throw new Error('no se pudo leer geo.json: no hay plan')
    plan.revisadas += 1
    const despues = s.situacion === 'barrio' ? s.slug : null
    if (despues !== f.neighborhood) {
      plan.cambios.push({
        id: f.id,
        antes: f.neighborhood,
        despues,
        situacion: s.situacion,
        state: f.state,
        asiento: f.registro_entry_number,
      })
    }
  }
  return plan
}

/**
 * Aplica un plan. Cada cambio sólo se escribe si el barrio sigue siendo el que
 * leyó el plan: lo que cambió entre medias no se pisa, y se cuenta aparte.
 */
export function aplicarRebarrio(
  db: Db,
  cambios: CambioDeBarrio[],
): { intentados: number; aplicados: number; yaCambiados: number } {
  const actualiza = db.prepare(
    'UPDATE quejas SET neighborhood = ? WHERE id = ? AND deleted_at IS NULL AND neighborhood IS ?',
  )
  const evento = db.prepare('INSERT INTO events (queja_id, kind, payload) VALUES (?, ?, ?)')
  let aplicados = 0
  db.transaction(() => {
    for (const c of cambios) {
      if (actualiza.run(c.despues, c.id, c.antes).changes === 0) continue
      evento.run(
        c.id,
        EVENTO_BARRIO_CORREGIDO,
        JSON.stringify({ antes: c.antes, despues: c.despues, situacion: c.situacion }),
      )
      aplicados += 1
    }
  })()
  return { intentados: cambios.length, aplicados, yaCambiados: cambios.length - aplicados }
}
