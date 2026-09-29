/**
 * Background worker — checks registered quejas for silencio negativo.
 *
 *   For each queja in state='registrada' (or 'notificada_10d'),
 *   compute the legal plazo from queja-router (`relojDelPlazo`). Once the
 *   sede's calendar day (Europe/Madrid) is past the plazo's LAST day — moved
 *   to the first working day when it falls on a día inhábil (art. 30.5
 *   LPACAP) — and no resolution has landed, auto-transition to
 *   'silencio_negativo' and tell whoever moderates
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
import { relojDelPlazo } from '../../../src/scraper/queja-router.ts'
import { isLoregFrozen } from './freeze.ts'
import type { AvisosHitos } from './avisos-hitos.ts'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // every hour

export interface SilencioResult {
  transitioned: QuejaRow[]
  skippedFrozen: boolean
  checked: number
  /**
   * Registradas cuya fecha de registro no se puede leer: no se evalúan —ni en
   * plazo ni vencidas— y se dicen. Callarlas las contaría como «en plazo»; y el
   * código de antes, con `NaN < plazo` falso, las pasaba a silencio.
   */
  sinFechaLegible: string[]
  /**
   * Registradas cuyo día nominal ya pasó y cuyo plazo acaba en un año sin
   * calendario de inhábiles (`FESTIVOS_DE_LA_SEDE`): no se sabe si el último día
   * se prorrogó (art. 30.5), así que no pasan a silencio, y se dice qué año falta.
   * Un año sin calendario no es un año sin festivos. Antes del día nominal no
   * salen aquí: la prórroga sólo alarga, y el plazo sigue abierto seguro.
   */
  sinCalendario: Array<{ id: string; anio: number }>
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
      sinFechaLegible: [],
      sinCalendario: [],
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
  const sinFechaLegible: string[] = []
  const sinCalendario: Array<{ id: string; anio: number }> = []
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
    // Los días QUE DURA ESE plazo desde ESA fecha: el art. 21.3 lo fija en
    // meses y el art. 30.4 manda contarlos de fecha a fecha, así que tres meses
    // son 90 o 91 días según cuándo se registrara. Con el 90 fijo, una queja
    // registrada en enero de un año bisiesto pasaba a silencio un día antes de
    // que el plazo hubiera vencido de verdad.
    //
    // Y el silencio no llega a la hora del registro del último día: ese día
    // entero es plazo («concluirá el mismo día», art. 30.4), contado en el
    // calendario de la sede (art. 31.2). Hasta el 28-09-2026 esto comparaba los
    // días del plazo con las horas transcurridas desde la marca, y una queja
    // registrada a las 11:00 pasaba a silencio a las 12:00 de su último día.
    //
    // Y si ese último día es inhábil, el plazo sigue hasta el primer hábil
    // siguiente (art. 30.5): hasta el 29-09-2026 esto no se aplicaba, y un plazo
    // que acababa en sábado pasaba a silencio el domingo.
    const reloj = relojDelPlazo(limite, r.registered_at, now)
    if (reloj.cuenta === 'sin-fecha') {
      sinFechaLegible.push(r.id)
      continue
    }
    if (reloj.cuenta === 'sin-calendario') {
      // Hasta el día nominal sigue en plazo seguro; después no se sabe, y no se
      // decide: se dice qué año de calendario falta.
      if (reloj.quedanAlNominal < 0) sinCalendario.push({ id: r.id, anio: reloj.anio })
      continue
    }
    if (reloj.cuenta !== 'calculada') {
      console.error(`[cron] ${r.id}: el plazo de resolución no va en meses; no se evalúa`)
      continue
    }
    if (reloj.quedan >= 0) continue

    const updated = setState(db, r.id, 'silencio_negativo')
    if (updated) {
      transitioned.push(updated)
      // A quien modera, de todas: el aviso lleva el id y no el texto, así que no
      // publica nada, y lo presentado en sede vence esté publicado o no.
      avisos.push({ queja: updated, plazoDias: reloj.dias })
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
  return {
    transitioned,
    skippedFrozen: false,
    checked: rows.length,
    sinFechaLegible,
    sinCalendario,
    avisos: avisados,
  }
}

export function startSilencioCron(db: Db, hitos: AvisosHitos): () => void {
  const tick = () => {
    try {
      const r = checkSilencio(db, hitos)
      if (r.sinFechaLegible.length > 0) {
        console.error(
          `[cron] ${r.sinFechaLegible.length} registrada(s) sin fecha de registro legible, sin evaluar: ${r.sinFechaLegible.join(', ')}`,
        )
      }
      if (r.sinCalendario.length > 0) {
        const anios = [...new Set(r.sinCalendario.map((s) => s.anio))].join(', ')
        console.error(
          `[cron] ${r.sinCalendario.length} registrada(s) con el día nominal pasado y el plazo en un año sin calendario de inhábiles (${anios}), sin evaluar: ${r.sinCalendario.map((s) => s.id).join(', ')} — añade el año a FESTIVOS_DE_LA_SEDE (src/scraper/queja-router.ts)`,
        )
      }
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
