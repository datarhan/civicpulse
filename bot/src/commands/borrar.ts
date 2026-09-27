import { InlineKeyboard, type Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { autorTelegram } from '../db/queries.ts'
import { olvidarTodo, type ResultadoOlvido } from '../services/ciudadano.ts'
import { pedirRepublicacion, type PeticionRepublicar } from '../services/republicar.ts'
import { directorioFotos } from '../services/snapshot.ts'
import type { MyContext } from '../types.ts'
import { CONSERVACION_QUEJAS_ANIOS } from '../../../src/scraper/plazos-retencion.ts'

/**
 * /borrar_mis_datos — el derecho de supresión entero (RGPD art. 17): todo lo que
 * el bot guarda de quien lo pide (`olvidarTodo`, services/ciudadano.ts).
 *
 * Pregunta antes, con un botón: no se puede deshacer, y una orden tecleada por
 * error no debería llevarse las quejas de nadie. El botón actúa sobre quien lo
 * pulsa, así que un mensaje reenviado no borra los datos de otro.
 */
export const BORRAR_SI = 'borrar_mis_datos:si'
export const BORRAR_NO = 'borrar_mis_datos:no'

export function registerBorrarMisDatos(bot: Bot<MyContext>, db: Db, photosDir = directorioFotos()) {
  bot.command('borrar_mis_datos', async (ctx) => {
    await ctx.reply(
      'Esto retira todas tus quejas, como /olvidar una a una; borra tus apoyos y tus ' +
        'suscripciones, y al final tu identidad del registro del bot. No se puede deshacer.\n\n' +
        '¿Lo borro todo?',
      {
        reply_markup: new InlineKeyboard()
          .text('Sí, borrar todo', BORRAR_SI)
          .text('Cancelar', BORRAR_NO),
      },
    )
  })

  bot.callbackQuery(BORRAR_SI, async (ctx) => {
    await ctx.answerCallbackQuery()
    const r = olvidarTodo(db, autorTelegram(ctx.from.id), photosDir)
    const peticion = r.quejas.retiradas > 0 ? await pedirRepublicacion() : null
    await ctx.reply(mensajeBorrado(r, peticion))
  })

  bot.callbackQuery(BORRAR_NO, async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.reply('No he borrado nada.')
  })
}

/**
 * Lo que se borró, contado: lo intentado y lo hecho por separado, y ceros que se
 * han mirado. «Unos minutos» sólo si GitHub aceptó la petición de republicar.
 */
export function mensajeBorrado(r: ResultadoOlvido, peticion: PeticionRepublicar | null): string {
  const lineas = [
    `• Quejas retiradas: ${r.quejas.retiradas} de ${r.quejas.intentadas}.`,
    `• Apoyos borrados: ${r.apoyos}.`,
    `• Suscripciones borradas: ${r.suscripciones}.`,
    r.ciudadano
      ? '• Tu identidad ya no está en el registro del bot.'
      : '• No había ninguna identidad tuya en el registro del bot.',
  ]
  const web =
    r.quejas.retiradas === 0
      ? ''
      : peticion === 'pedida'
        ? '\n\nLa web retira tus quejas en cuanto termine la actualización que el bot acaba de ' +
          'pedir, que suele tardar unos minutos (si fallara, en la siguiente actualización diaria).'
        : '\n\nLa web retira tus quejas en su siguiente actualización, que es diaria.'
  const conservacion =
    r.quejas.retiradas === 0
      ? ''
      : '\n\nDe las quejas quedan el texto y las fechas, sin tu identidad, durante el plazo legal ' +
        `de conservación (${CONSERVACION_QUEJAS_ANIOS} años, Art. 55 LOPD-GDD), y después se destruyen.`
  return `✅ Hecho.\n\n${lineas.join('\n')}${web}${conservacion}`
}
