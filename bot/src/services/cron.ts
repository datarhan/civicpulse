/**
 * Background worker — checks registered quejas for silencio negativo.
 *
 *   For each queja in state='registrada' (or 'notificada_10d'),
 *   compute the legal plazo from queja-router. If
 *   (now - registered_at) > plazo days AND no resolution has landed,
 *   auto-transition to 'silencio_negativo' and emit the channel
 *   broadcast.
 *
 * Paused while LOREG freeze is active.
 *
 * Pure-ish: takes (db, channel, now) so it's trivially testable.
 */

import type { Db } from '../db/client.ts'
import type { QuejaRow } from '../db/queries.ts'
import { setState } from '../db/queries.ts'
import { routeUsingLocalOfficials } from './router.ts'
import { diasDePlazo } from '../../../src/scraper/queja-router.ts'
import { isLoregFrozen } from './freeze.ts'
import type { Channel } from './channel.ts'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // every hour

export interface SilencioResult {
  transitioned: QuejaRow[]
  skippedFrozen: boolean
  checked: number
  /**
   * Detached broadcast outcome — the state transitions themselves are
   * synchronous and never blocked on Telegram, but callers (and the cron
   * log) can await this to learn how many [SILENCIO] posts actually
   * landed. A failed broadcast is otherwise invisible: the transition
   * succeeds while citizens never see the notification.
   */
  broadcasts: Promise<{ sent: number; failed: number }>
}

/** One retry after a short backoff — Telegram 429s clear in seconds. */
async function postSilencioWithRetry(
  channel: Channel,
  q: QuejaRow,
  plazoDias: number,
  retryDelayMs: number,
): Promise<boolean> {
  try {
    await channel.postSilencio(q, plazoDias)
    return true
  } catch {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    try {
      await channel.postSilencio(q, plazoDias)
      return true
    } catch (err) {
      console.error(`[cron] broadcast failed twice for ${q.id}:`, err)
      return false
    }
  }
}

export function checkSilencio(
  db: Db,
  channel: Channel,
  now: Date = new Date(),
  retryDelayMs = 5_000,
): SilencioResult {
  if (isLoregFrozen(now)) {
    return {
      transitioned: [],
      skippedFrozen: true,
      checked: 0,
      broadcasts: Promise.resolve({ sent: 0, failed: 0 }),
    }
  }
  const rows = db
    .prepare(
      // `deleted_at IS NULL` no es una optimización: es el derecho al olvido.
      // `postSilencio` publica en el canal el id y el TÍTULO literal de la
      // queja, así que una retirada con `/olvidar` que siguiera entrando aquí
      // volvía a publicarse meses después de que su autor la borrara. La fila se
      // conserva para auditoría (cinco años, art. 55 LOPD-GDD); lo que no se
      // conserva es el derecho a seguir publicándola.
      `SELECT * FROM quejas
       WHERE state IN ('registrada','notificada_10d')
         AND registered_at IS NOT NULL
         AND deleted_at IS NULL`,
    )
    .all() as QuejaRow[]

  const transitioned: QuejaRow[] = []
  // El plazo de cada una viaja con ella hasta el aviso: el canal no lo recalcula.
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
      avisos.push({ queja: updated, plazoDias: plazoDays })
    }
  }

  // Detached broadcasts (non-blocking for the transition path) with one
  // retry each + an aggregate count so missed notifications leave a trace.
  const broadcasts = Promise.all(
    avisos.map(({ queja, plazoDias }) =>
      postSilencioWithRetry(channel, queja, plazoDias, retryDelayMs),
    ),
  ).then((oks) => {
    const sent = oks.filter(Boolean).length
    const failed = oks.length - sent
    if (failed > 0) {
      console.error(`[cron] ${failed}/${oks.length} silencio broadcasts failed permanently`)
    }
    return { sent, failed }
  })
  return { transitioned, skippedFrozen: false, checked: rows.length, broadcasts }
}

export function startSilencioCron(db: Db, channel: Channel): () => void {
  const tick = () => {
    try {
      const r = checkSilencio(db, channel)
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
