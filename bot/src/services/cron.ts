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
import { getQueja, setState } from '../db/queries.ts'
import { routeUsingLocalOfficials } from './router.ts'
import { isLoregFrozen } from './freeze.ts'
import type { Channel } from './channel.ts'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // every hour

export interface SilencioResult {
  transitioned: QuejaRow[]
  skippedFrozen: boolean
  checked: number
}

export function checkSilencio(
  db: Db,
  channel: Channel,
  now: Date = new Date()
): SilencioResult {
  if (isLoregFrozen(now)) {
    return { transitioned: [], skippedFrozen: true, checked: 0 }
  }
  const rows = db
    .prepare(
      `SELECT * FROM quejas
       WHERE state IN ('registrada','notificada_10d')
         AND registered_at IS NOT NULL`
    )
    .all() as QuejaRow[]

  const transitioned: QuejaRow[] = []
  for (const r of rows) {
    const routing = routeUsingLocalOfficials({
      title: r.title,
      detail: r.detail,
      category: r.category as never,
    })
    const plazoDays = routing.timeLimits.find((t) => t.kind === 'resolucion')?.days ?? 90
    // Silencio negativo only — positive silencio means the queja is
    // presumed granted by operation of law; we don't flag that as a
    // failure.
    if (routing.silencio !== 'negativo') continue
    const registered = new Date(r.registered_at!)
    const ageDays = (now.getTime() - registered.getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < plazoDays) continue

    const updated = setState(db, r.id, 'silencio_negativo')
    if (updated) {
      transitioned.push(updated)
    }
  }

  // Fire-and-forget broadcasts (non-blocking).
  for (const q of transitioned) {
    channel.postSilencio(q).catch((e) => console.error('[cron] broadcast:', e))
  }
  return { transitioned, skippedFrozen: false, checked: rows.length }
}

export function startSilencioCron(db: Db, channel: Channel): () => void {
  const tick = () => {
    try {
      const r = checkSilencio(db, channel)
      if (r.skippedFrozen) {
        console.log('[cron] silencio check paused — LOREG freeze active')
      } else if (r.transitioned.length > 0) {
        console.log(
          `[cron] silencio check: ${r.transitioned.length} transitioned · ${r.checked} checked`
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
