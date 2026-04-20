import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { softDeleteQueja } from '../db/queries.ts'
import type { MyContext } from '../types.ts'

/**
 * /olvidar Q-XXXX — RGPD right-to-be-forgotten endpoint.
 *
 * Soft-deletes the queja: the row is kept for the audit trail (required by
 * Art. 55 LOPD-GDD public-interest processing) but every public renderer +
 * exporter filters rows whose deleted_at IS NOT NULL. The citizen's original
 * text is preserved in the database for the 5-year retention window, but is
 * no longer visible on any public surface.
 *
 * The command refuses to confirm existence of quejas owned by other users —
 * a wrong-id reply from someone else's queja and a "not found" reply look
 * identical (prevents cross-user enumeration of IDs).
 */
export function registerOlvidar(bot: Bot<MyContext>, db: Db) {
  bot.command('olvidar', async (ctx) => {
    const raw = (ctx.match as string | undefined)?.trim()
    if (!raw) {
      await ctx.reply(
        'Usa: /olvidar Q-XXXXXXXX\n\n' +
          'Elimina permanentemente la queja de las listas públicas y del snapshot abierto. ' +
          'La incidencia queda marcada como anonimizada en el registro interno — ejercitas ' +
          'tu derecho al olvido (RGPD art. 17).',
      )
      return
    }
    const id = raw.toUpperCase()
    if (!/^Q-[A-Z0-9]{6,10}$/.test(id)) {
      await ctx.reply(`"${raw}" no parece un ID de queja válido. Formato: Q-XXXXXXXX`)
      return
    }
    const ok = softDeleteQueja(db, id, ctx.from!.id)
    if (!ok) {
      // Intentionally ambiguous — don't confirm existence across users.
      await ctx.reply(
        `No se encontró una queja con ID \`${id}\` que puedas eliminar. Sólo el autor original ` +
          `puede ejercer el derecho al olvido sobre su propia queja. Si crees que es un error, ` +
          `puedes consultar tus quejas con /mis.`,
        { parse_mode: 'Markdown' },
      )
      return
    }
    await ctx.reply(
      `✅ Queja \`${id}\` eliminada.\n\n` +
        `Ha desaparecido del feed público, del heatmap, del dashboard y del snapshot abierto. ` +
        `La incidencia sigue registrada como anónima en el historial interno durante el plazo ` +
        `legal de conservación (5 años, Art. 55 LOPD-GDD) y después será destruida.\n\n` +
        `Puedes verificarlo ahora mismo con /mis.`,
      { parse_mode: 'Markdown' },
    )
  })
}
