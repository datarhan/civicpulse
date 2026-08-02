/**
 * Admin commands for reviewing auto-curated findings the automation policy
 * refused to publish.
 *
 *   /curar                    next draft awaiting review, with its checks
 *   /curar_ok  <ref> [nota]   approve — queued for host-side publication
 *   /curar_no  <ref> <motivo> reject — motivo required, it goes in the log
 *   /curar_estado             how many are pending
 *
 * The bot records a decision; it never writes pleno-findings.json. The host's
 * `npm run apply-curation` publishes approved drafts through the validated CLI,
 * so the schema validator runs and the commit is the audit trail.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { MyContext } from '../types.ts'
import {
  renderCard,
  nextForReview,
  summarise,
  recordDecision,
  decidedRefs,
  type CurationQueue,
} from '../services/curation.ts'

/**
 * Where the queue lives.
 *
 * Deployed (Fly): the host PUSHES it to POST /curation/queue and it lands on
 * the volume — the container has no view of the host filesystem, so a path into
 * ../editorial would silently always be empty.
 * Local dev: fall back to the host path the auto-curate run writes directly.
 */
function queuePath(): string {
  if (process.env.CURATION_QUEUE_PATH) return process.env.CURATION_QUEUE_PATH
  const onVolume = resolve(dirname(process.env.DB_PATH ?? './data/bot.db'), 'curation-queue.json')
  if (existsSync(onVolume)) return onVolume
  return resolve(process.cwd(), '..', 'editorial', 'auto-curation-queue-pending-measurement.json')
}

/**
 * Rejecting DISCARDS a machine draft: nobody is harmed and nothing is
 * published, so the friction should be near zero. Approving is the direction
 * that needs justification, and it has its own, longer requirement. Three
 * characters only excludes an accidental keystroke.
 */
const MIN_REJECT_REASON = 3

function parseAdmins(): Set<number> {
  const ids = new Set<number>()
  for (const s of (process.env.ADMIN_USER_IDS ?? '').split(',')) {
    const n = Number(s.trim())
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  return ids
}

function loadQueue(): CurationQueue | null {
  const QUEUE_PATH = queuePath()
  if (!existsSync(QUEUE_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'))
    return Array.isArray(raw.items) ? (raw as CurationQueue) : null
  } catch {
    return null
  }
}

export function registerCurarCommand(bot: Bot<MyContext>, db: Db) {
  const admins = parseAdmins()
  // Log on BOTH paths. A component that only speaks when it is broken cannot be
  // confirmed working, and "started fine" then looks identical to "never
  // registered" in the logs.
  if (admins.size === 0) {
    console.log('[curar] ADMIN_USER_IDS not set — curation commands disabled')
  } else {
    console.log(
      `[curar] curation enabled for ${admins.size} admin(s): ${[...admins].join(', ')} · queue ${queuePath()}`,
    )
  }
  const isAdmin = (ctx: MyContext) => !!ctx.from?.id && admins.has(ctx.from.id)
  const denied = 'Comando reservado a la curaduría editorial.'

  bot.command('curar', async (ctx) => {
    if (!isAdmin(ctx)) return void (await ctx.reply(denied))
    const queue = loadQueue()
    if (!queue) {
      await ctx.reply(
        'No hay cola de curación en disco. Se genera cuando `auto-curate` compone ' +
          'borradores que la política de automatización no publica sola.',
      )
      return
    }
    const decided = decidedRefs(db as unknown as never, ctx.from!.id)
    const next = nextForReview(queue, decided)
    if (!next) {
      await ctx.reply(`Nada pendiente. ${summarise(queue, decided)}`)
      return
    }
    await ctx.reply(renderCard(next.item, { index: next.index, total: next.total }), {
      parse_mode: 'HTML',
    })
  })

  bot.command('curar_estado', async (ctx) => {
    if (!isAdmin(ctx)) return void (await ctx.reply(denied))
    const queue = loadQueue()
    if (!queue) return void (await ctx.reply('No hay cola de curación en disco.'))
    await ctx.reply(summarise(queue, decidedRefs(db as unknown as never, ctx.from!.id)))
  })

  bot.command('curar_ok', async (ctx) => {
    if (!isAdmin(ctx)) return void (await ctx.reply(denied))
    const [ref, ...rest] = (ctx.match ?? '').toString().trim().split(/\s+/)
    if (!ref) return void (await ctx.reply('Uso: /curar_ok <ref> [nota]'))
    const queue = loadQueue()
    const item = queue?.items.find((i) => i.ref === ref)
    if (!item)
      return void (await ctx.reply(`No encuentro el borrador <code>${ref}</code>.`, {
        parse_mode: 'HTML',
      }))

    // A blocker means the machine found something that needs the source data to
    // resolve. Approving anyway is allowed — the curator may have checked — but
    // it must be deliberate and it must say so in the log.
    const blockers = item.checks.filter((c) => c.level === 'blocker')
    const note = rest.join(' ').trim()
    if (blockers.length > 0 && note.length < 10) {
      await ctx.reply(
        `⛔ Ese borrador tiene ${blockers.length} aviso(s) bloqueante(s). Para aprobarlo hay que ` +
          `dejar constancia de qué comprobaste:\n<code>/curar_ok ${ref} comprobado contra …</code>`,
        { parse_mode: 'HTML' },
      )
      return
    }
    recordDecision(db as unknown as never, {
      ref,
      userId: ctx.from!.id,
      decision: 'approve',
      note: note || null,
    })
    await ctx.reply(
      `✅ Aprobado <code>${ref}</code>. Se publicará en la próxima pasada de ` +
        `<code>apply-curation</code> del anfitrión, con tu firma en el commit.`,
      { parse_mode: 'HTML' },
    )
  })

  bot.command('curar_no', async (ctx) => {
    if (!isAdmin(ctx)) return void (await ctx.reply(denied))
    const [ref, ...rest] = (ctx.match ?? '').toString().trim().split(/\s+/)
    const motivo = rest.join(' ').trim()
    // Two DIFFERENT failures used to print one message, so a too-short reason
    // read as a syntax error and the curator retyped the command instead of
    // lengthening the reason. Say which one it is.
    if (!ref) {
      await ctx.reply('Falta la referencia.\nUso: /curar_no <ref> <motivo>')
      return
    }
    if (motivo.length < MIN_REJECT_REASON) {
      await ctx.reply(
        `Falta el motivo (tiene ${motivo.length} carácter(es), hacen falta ${MIN_REJECT_REASON}).\n` +
          `Uso: /curar_no ${ref} <motivo>`,
      )
      return
    }
    recordDecision(db as unknown as never, {
      ref,
      userId: ctx.from!.id,
      decision: 'reject',
      note: motivo,
    })
    await ctx.reply(`🗑 Rechazado <code>${ref}</code>. Motivo registrado.`, { parse_mode: 'HTML' })
  })
}
