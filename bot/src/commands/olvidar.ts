import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { softDeleteQueja } from '../db/queries.ts'
import { pedirRepublicacion, type PeticionRepublicar } from '../services/republicar.ts'
import type { MyContext } from '../types.ts'

/**
 * /olvidar Q-XXXX — derecho al olvido (RGPD art. 17).
 *
 * `softDeleteQueja` la saca de todo listado y export y, en la misma transacción,
 * borra del registro interno la identidad de Telegram, las coordenadas y la
 * referencia a la foto; el texto queda como rastro de auditoría durante el plazo de
 * conservación. Después el bot pide a GitHub que republique (`republicar.ts`): si
 * GitHub acepta la petición, la web la retira en minutos; si no, en su
 * actualización diaria. Esa misma actualización poda la foto publicada
 * (`scripts/fotos-quejas.mjs`). La respuesta cuenta lo que de verdad pasó, sin
 * prometer que ya no queda rastro en ninguna parte ni invitar a comprobarlo en
 * /mis, donde una queja sin autor ya no puede salir.
 *
 * No confirma ids ajenos: el de otra persona y uno que no existe contestan igual.
 */
export function registerOlvidar(bot: Bot<MyContext>, db: Db) {
  bot.command('olvidar', async (ctx) => {
    const raw = (ctx.match as string | undefined)?.trim()
    if (!raw) {
      await ctx.reply(
        'Usa: /olvidar Q-XXXXXXXX\n\n' +
          'Retira tu queja de las listas públicas y del snapshot abierto, y borra del registro ' +
          'interno tu identidad de Telegram, la ubicación y la referencia a la foto ' +
          '(derecho al olvido, RGPD art. 17).',
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
          `puede ejercer el derecho al olvido sobre su propia queja, y una queja que ya retiraste ` +
          `deja de constar como tuya. Si crees que es un error, puedes consultar tus quejas con /mis.`,
        { parse_mode: 'Markdown' },
      )
      return
    }
    const peticion = await pedirRepublicacion()
    await ctx.reply(mensajeRetirada(id, peticion), { parse_mode: 'Markdown' })
  })
}

/**
 * Lo que el bot contesta al retirar una queja. «Unos minutos» sólo cuando GitHub
 * aceptó la petición de republicar; sin token o con la petición fallida, el plazo
 * es la actualización diaria, y eso es lo único que se promete.
 */
export function mensajeRetirada(id: string, peticion: PeticionRepublicar): string {
  const cuando =
    peticion === 'pedida'
      ? `La web la quita del feed, del heatmap, del dashboard y del snapshot abierto en cuanto ` +
        `termine la actualización que el bot acaba de pedir, que suele tardar unos minutos (si ` +
        `fallara, en la siguiente actualización diaria), y en esa misma actualización borra su ` +
        `foto si se había publicado.`
      : `La web la quita del feed, del heatmap, del dashboard y del snapshot abierto en su ` +
        `siguiente actualización, que es diaria, y en esa misma actualización borra su foto si ` +
        `se había publicado.`
  return (
    `✅ Queja \`${id}\` retirada.\n\n` +
    `Ya no sale en el listado que exporta el bot, y el registro interno ya no guarda quién la ` +
    `escribió. ${cuando}\n\n` +
    `Quedan el texto y las fechas, sin tu identidad, durante el plazo legal de conservación ` +
    `(5 años, Art. 55 LOPD-GDD), y después se destruyen. Por eso ya no aparecerá en /mis.`
  )
}
