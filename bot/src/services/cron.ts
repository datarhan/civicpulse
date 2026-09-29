/**
 * Background worker — checks registered quejas for silencio negativo.
 *
 *   For each queja in state='registrada' (or 'notificada_10d'),
 *   compute the legal plazo from queja-router. If
 *   (now - registered_at) > plazo days AND no resolution has landed,
 *   auto-transition to 'silencio_negativo' and tell whoever moderates
 *   (services/avisos-hitos.ts). Until 2026-09-29 it went to the public
 *   Telegram channel instead, with the title.
 *
 * Paused while LOREG freeze is active.
 *
 * Pure-ish: takes (db, hitos, now) so it's trivially testable.
 */

import type { Db } from '../db/client.ts'
import type { QuejaRow } from '../db/queries.ts'
import { setState } from '../db/queries.ts'
import { routeUsingLocalOfficials } from './router.ts'
import { diasDePlazo } from '../../../src/scraper/queja-router.ts'
import { isLoregFrozen } from './freeze.ts'
import type { AvisosHitos } from './avisos-hitos.ts'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // every hour

export interface SilencioResult {
  transitioned: QuejaRow[]
  skippedFrozen: boolean
  checked: number
  /**
   * El aviso a quien modera, aparte: las transiciones son síncronas y no esperan
   * a Telegram, pero quien llama —y el log— puede esperar esto para saber
   * cuántos avisos llegaron. Uno perdido no deja otro rastro: la queja pasa a
   * silencio y nadie lo sabe.
   */
  avisos: Promise<{ avisadas: number; fallidas: number }>
}

/**
 * Un reintento tras una espera corta: un 429 de Telegram se pasa en segundos. El
 * aviso falla si no le llega a ningún administrador (avisos-hitos.ts); con el
 * canal, que se tragaba sus errores, este reintento no se ejecutaba nunca.
 */
async function avisarSilencioConReintento(
  hitos: AvisosHitos,
  q: QuejaRow,
  plazoDias: number,
  retryDelayMs: number,
): Promise<boolean> {
  try {
    await hitos.avisar('silencio', q.id, { plazoDias })
    return true
  } catch {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    try {
      await hitos.avisar('silencio', q.id, { plazoDias })
      return true
    } catch (err) {
      console.error(`[cron] el aviso de silencio de ${q.id} falló dos veces:`, err)
      return false
    }
  }
}

export function checkSilencio(
  db: Db,
  hitos: AvisosHitos,
  now: Date = new Date(),
  retryDelayMs = 5_000,
): SilencioResult {
  if (isLoregFrozen(now)) {
    return {
      transitioned: [],
      skippedFrozen: true,
      checked: 0,
      avisos: Promise.resolve({ avisadas: 0, fallidas: 0 }),
    }
  }
  const rows = db
    .prepare(
      // El plazo legal corre sobre lo que se PRESENTÓ en la sede, esté publicado
      // o no: una queja registrada que luego se retira de la publicación sigue su
      // curso con el ayuntamiento, y su silencio también, y quien modera tiene que
      // saber que venció. Una retirada con `/olvidar` sale
      // también de aquí (`deleted_at`): su autor pidió que dejara de tramitarse,
      // y la fila sólo se conserva para auditoría (`CONSERVACION_QUEJAS_ANIOS`,
      // art. 55 LOPD-GDD).
      `SELECT * FROM quejas
       WHERE state IN ('registrada','notificada_10d')
         AND registered_at IS NOT NULL
         AND deleted_at IS NULL`,
    )
    .all() as QuejaRow[]

  const transitioned: QuejaRow[] = []
  // El plazo de cada una viaja con ella hasta el aviso: el aviso no lo recalcula.
  const avisos: Array<{ queja: QuejaRow; plazoDias: number }> = []
  for (const r of rows) {
    const routing = routeUsingLocalOfficials({
      title: r.title,
      detail: r.detail,
      category: r.category as never,
    })
    const limite = routing.timeLimits.find((t) => t.kind === 'resolucion')
    if (!limite) {
      // No se inventa un plazo. El `?? 90` que había aquí convertía «no sé
      // cuánto» en tres meses y pico, y esto es lo que decide que una queja
      // pase a silencio administrativo: un valor por defecto lo haría callando.
      console.error(`[cron] ${r.id} sin plazo de resolución en la ruta: no se evalúa`)
      continue
    }
    // Silencio negativo only — positive silencio means the queja is
    // presumed granted by operation of law; we don't flag that as a
    // failure.
    if (routing.silencio !== 'negativo') continue
    const registered = new Date(r.registered_at!)
    // Los días QUE DURA ESE plazo desde ESA fecha: el art. 21.3 lo fija en
    // meses y el art. 30.4 manda contarlos de fecha a fecha, así que tres meses
    // son 90 o 91 días según cuándo se registrara. Con el 90 fijo, una queja
    // registrada en enero de un año bisiesto pasaba a silencio un día antes de
    // que el plazo hubiera vencido de verdad.
    const plazoDays = diasDePlazo(limite, registered)
    const ageDays = (now.getTime() - registered.getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < plazoDays) continue

    const updated = setState(db, r.id, 'silencio_negativo')
    if (updated) {
      transitioned.push(updated)
      // A quien modera, de todas: el aviso lleva el id y no el texto, así que no
      // publica nada, y lo presentado en sede vence esté publicado o no.
      avisos.push({ queja: updated, plazoDias: plazoDays })
    }
  }

  // Los avisos, aparte (la transición no los espera), con un reintento cada uno y
  // la cuenta de los que no llegaron, para que un aviso perdido deje rastro.
  const avisados = Promise.all(
    avisos.map(({ queja, plazoDias }) =>
      avisarSilencioConReintento(hitos, queja, plazoDias, retryDelayMs),
    ),
  ).then((oks) => {
    const avisadas = oks.filter(Boolean).length
    const fallidas = oks.length - avisadas
    if (fallidas > 0) {
      console.error(`[cron] ${fallidas}/${oks.length} avisos de silencio no llegaron a nadie`)
    }
    return { avisadas, fallidas }
  })
  return { transitioned, skippedFrozen: false, checked: rows.length, avisos: avisados }
}

export function startSilencioCron(db: Db, hitos: AvisosHitos): () => void {
  const tick = () => {
    try {
      const r = checkSilencio(db, hitos)
      if (r.skippedFrozen) {
        console.log('[cron] silencio check paused — LOREG freeze active')
      } else if (r.transitioned.length > 0) {
        console.log(
          `[cron] silencio check: ${r.transitioned.length} transitioned · ${r.checked} checked`,
        )
      }
    } catch (err) {
      console.error('[cron] silencio tick error:', err)
    }
  }
  tick()
  const handle = setInterval(tick, CHECK_INTERVAL_MS)
  return () => clearInterval(handle)
}
