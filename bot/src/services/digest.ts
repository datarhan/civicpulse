/**
 * Weekly digest — every Monday morning, DM each subscribed user the matching
 * quejas from the past 7 days.
 *
 * Deliberately scope-limited: this is ONLY about citizen quejas, not tenders
 * or plenos or press. Users care about neighbours' complaints in their barrio
 * or concejalía; everything else lives on /cambios in the web UI.
 *
 * Paused during LOREG freeze (same rule as the silencio cron and the LLM
 * advisory layer).
 */

import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import {
  findMatchingQuejas,
  listAllSubscriptions,
  type FilterKind,
  type QuejaRow,
  type SubscriptionRow,
} from '../db/queries.ts'
import { isLoregFrozen } from './freeze.ts'
import { logger } from '../util/log.ts'
import type { MyContext } from '../types.ts'

const DIGEST_WINDOW_DAYS = 7
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly tick, emits only on Monday 09:00

interface DigestRun {
  skippedFrozen: boolean
  usersDigested: number
  totalMatches: number
}

/** Run the digest unconditionally — used in tests with injected `now`. */
export function runDigestOnce(
  db: Db,
  sendDm: (userId: number, text: string) => Promise<void>,
  now: Date = new Date(),
): DigestRun {
  if (isLoregFrozen(now)) {
    return { skippedFrozen: true, usersDigested: 0, totalMatches: 0 }
  }
  const subs = listAllSubscriptions(db)
  const byUser = new Map<number, SubscriptionRow[]>()
  for (const s of subs) {
    const arr = byUser.get(s.telegram_user_id) || []
    arr.push(s)
    byUser.set(s.telegram_user_id, arr)
  }

  let usersDigested = 0
  let totalMatches = 0

  for (const [userId, userSubs] of byUser.entries()) {
    // Dedup matching quejas: a single queja can match multiple of a user's
    // subscriptions (e.g. both "barrio=la reva" and "categoria=via_publica").
    // Show once per digest, note the matched filters underneath.
    const seen = new Map<string, { q: QuejaRow; matched: SubscriptionRow[] }>()
    for (const sub of userSubs) {
      const matches = findMatchingQuejas(
        db,
        sub.filter_kind as FilterKind,
        sub.filter_value,
        DIGEST_WINDOW_DAYS,
        now.toISOString(),
      )
      for (const q of matches) {
        const entry = seen.get(q.id) || { q, matched: [] }
        entry.matched.push(sub)
        seen.set(q.id, entry)
      }
    }

    if (seen.size === 0) continue
    totalMatches += seen.size

    const text = buildDigestText(Array.from(seen.values()), userSubs)
    sendDm(userId, text).catch((err) =>
      logger.error('digest.send_failed', {
        userId,
        err: err instanceof Error ? err.message : String(err),
      }),
    )
    usersDigested += 1
  }

  return { skippedFrozen: false, usersDigested, totalMatches }
}

function buildDigestText(
  matches: { q: QuejaRow; matched: SubscriptionRow[] }[],
  allSubs: SubscriptionRow[],
): string {
  const header =
    `📬 *Resumen semanal CivicPulse*\n\n` +
    `Estas son las ${matches.length} quejas nuevas de los últimos ${DIGEST_WINDOW_DAYS} días ` +
    `que encajan con tus suscripciones.\n\n`
  const body = matches
    .slice(0, 15)
    .map(({ q, matched }) => {
      const firstLine = (q.detail || '').split('\n')[0].slice(0, 120)
      const tags = matched.map((m) => `${m.filter_kind}=${m.filter_value}`).join(' · ')
      return (
        `*${q.id}* · ${q.state}\n` +
        `${firstLine}\n` +
        `_${tags}_`
      )
    })
    .join('\n\n')
  const footer =
    `\n\n_Filtros activos:_ ` +
    allSubs.map((s) => `${s.filter_kind}=${s.filter_value}`).join(', ') +
    `\n_Cambiarlos: /subscribe, /unsubscribe, /subscriptions_\n` +
    `_Ver todo en https://civicpulse-virid.vercel.app/cambios_`
  return header + body + footer
}

/**
 * Schedule the Monday-09:00 digest. Tick every hour; emit only when the
 * current local time matches Monday (getDay === 1) and hour === 9. Skips
 * if the bot restarted mid-window (avoid duplicate sends — we could persist
 * a "last_run" marker but the single-process launchd setup makes that
 * unnecessary in practice).
 */
export function startDigestCron(bot: Bot<MyContext>, db: Db): () => void {
  let lastSendKey = ''
  const tick = () => {
    const now = new Date()
    const isMondayMorning = now.getDay() === 1 && now.getHours() === 9
    if (!isMondayMorning) return
    const key = now.toISOString().slice(0, 13) // Monday + hour
    if (lastSendKey === key) return
    lastSendKey = key

    const sendDm = async (userId: number, text: string) => {
      await bot.api.sendMessage(userId, text, { parse_mode: 'Markdown' })
    }

    try {
      const r = runDigestOnce(db, sendDm, now)
      logger.info('digest.run', r)
    } catch (err) {
      logger.error('digest.tick_error', { err: err instanceof Error ? err.message : String(err) })
    }
  }

  tick()
  const handle = setInterval(tick, CHECK_INTERVAL_MS)
  return () => clearInterval(handle)
}
