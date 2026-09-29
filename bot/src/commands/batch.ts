/**
 * Admin commands for the weekly batch registrar.
 *
 * Gating: any user id listed in ADMIN_USER_IDS (comma-separated env var)
 * can preview and register a batch. Everyone else gets a polite no-op.
 *
 *   /batch              preview the next batch (top 10 verified quejas)
 *   /batch_link         returns the public URLs (md + html) of the batch
 *                       so the moderator can download and upload to sede
 *   /batch_register <entry_number> <csv> <dd/mm/aaaa> <h:mm:ss> [ids...]
 *                       after the moderator signed at sede, records the
 *                       asiento with the receipt's «Fecha de Registro», from
 *                       which the legal plazo runs. If [ids] is omitted, uses
 *                       the same batch we previewed most recently (top 10
 *                       verified).
 */

import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { MyContext } from '../types.ts'
import type { AvisosHitos } from '../services/avisos-hitos.ts'
import { registerBatch, selectBatch } from '../services/batch.ts'
import { fechaHoraDeLaSede, leerBatchRegister } from '../services/recibo-sede.ts'

function parseAdmins(): Set<number> {
  const raw = process.env.ADMIN_USER_IDS ?? ''
  const ids = new Set<number>()
  for (const s of raw.split(',')) {
    const n = Number(s.trim())
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  return ids
}

function isAdmin(ctx: MyContext, admins: Set<number>): boolean {
  const id = ctx.from?.id
  return !!id && admins.has(id)
}

function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'https://civicpulse.es'
}

function botBaseUrl(): string | null {
  return process.env.WEBHOOK_URL ?? null
}

export function registerBatchCommand(bot: Bot<MyContext>, db: Db, hitos: AvisosHitos) {
  const admins = parseAdmins()
  if (admins.size === 0) {
    console.log('[batch] ADMIN_USER_IDS not set — batch commands disabled')
  } else {
    console.log(`[batch] admin user ids: ${Array.from(admins).join(', ')}`)
  }

  bot.command('batch', async (ctx) => {
    if (!isAdmin(ctx, admins)) {
      await ctx.reply('Comando reservado al moderador del lote semanal.')
      return
    }
    const items = selectBatch(db)
    if (items.length === 0) {
      await ctx.reply(
        '📭 Sin quejas verificadas (≥10 apoyos) ahora mismo. Avisa a vecinos que apoyen las quejas pendientes.',
      )
      return
    }
    const body = items
      .map((it, i) => {
        const q = it.queja
        const title = q.title.length > 70 ? q.title.slice(0, 70) + '…' : q.title
        return `${i + 1}. \`${q.id}\` · 👍${it.apoyos} · ${it.area}\n   ${title}`
      })
      .join('\n\n')
    const total = items.reduce((s, it) => s + it.apoyos, 0)
    const host = botBaseUrl()
    const extra = host
      ? `\n\nDocumento firmable:\n  Markdown: ${host}/batch/current.md\n  HTML: ${host}/batch/current.html`
      : '\n\n_Para obtener el documento firmable, despliega el bot con WEBHOOK_URL + EXPORT_TOKEN y /batch\\_link._'
    await ctx.reply(
      `🗂 *Lote listo · ${items.length} quejas · ${total} apoyos totales*\n\n${body}${extra}\n\n` +
        `Para registrar tras firmar en sede:\n` +
        `\`/batch_register <nº de registro> <CSV> <fecha> <hora>\`\n` +
        `con la «Fecha de Registro» del recibo, tal cual: \`28/09/2026 0:00:01\`.`,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } },
    )
  })

  bot.command('batch_link', async (ctx) => {
    if (!isAdmin(ctx, admins)) return
    const host = botBaseUrl()
    if (!host) {
      await ctx.reply('Bot no tiene WEBHOOK_URL configurado — no hay endpoint público.')
      return
    }
    await ctx.reply(
      `📎 Documento del lote actual:\n• Markdown: ${host}/batch/current.md\n• HTML (imprimible): ${host}/batch/current.html\n\nCopia el contenido al formulario de solicitud genérica en sede.ribarroja.es y firma con Cl@ve.`,
      { link_preview_options: { is_disabled: true } },
    )
  })

  bot.command('batch_register', async (ctx) => {
    if (!isAdmin(ctx, admins)) {
      await ctx.reply('Comando reservado al moderador.')
      return
    }
    // El recibo de la sede, leído por la forma de cada parte y no por su posición
    // (`recibo-sede.ts`): el CSV lleva espacios, y la fecha de registro es de la
    // que corre el plazo. Sin ella no se registra nada.
    const lectura = leerBatchRegister((ctx.match as string | undefined) ?? '')
    if (!lectura.ok) {
      await ctx.reply(lectura.motivo, { parse_mode: 'Markdown' })
      return
    }
    const { entry_number: entryNumber, csv, registered_at, ids } = lectura
    const selectedIds = ids.length > 0 ? ids : selectBatch(db).map((it) => it.queja.id)

    if (selectedIds.length === 0) {
      await ctx.reply('No hay quejas verificadas que registrar.')
      return
    }

    const result = registerBatch(db, {
      ids: selectedIds,
      entry_number: entryNumber,
      csv,
      registered_at,
      moderator_user_id: ctx.from!.id,
    })

    const okIds = result.registered.map((q) => q.id)
    const failIds = result.failed.map((f) => `${f.id} (${f.reason})`)

    // Cada registrada, a los demás administradores: quien la registró lo ve abajo.
    // El registro ya está hecho: un aviso que no llega queda en el log.
    for (const q of result.registered) {
      await hitos
        .avisar('registrada', q.id, { asiento: q.registro_entry_number, csv: q.registro_csv })
        .catch((err) => console.error(`[batch] el aviso de ${q.id} no llegó:`, err))
    }

    const body = [
      `🗃 *Lote registrado · nº ${entryNumber} · CSV ${csv}*`,
      `Fecha de Registro: ${fechaHoraDeLaSede(registered_at)} (hora de la sede). El plazo corre desde ese día.`,
      '',
      `✅ Registradas: ${okIds.length}`,
      okIds.map((id) => `  • \`${id}\``).join('\n'),
      ...(failIds.length > 0
        ? ['', `⚠️ No registradas: ${failIds.length}`, failIds.map((s) => `  • ${s}`).join('\n')]
        : []),
      '',
      `Dashboard: ${publicBaseUrl()}/quejas`,
    ].join('\n')
    await ctx.reply(body, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } })
  })
}
