/**
 * Fuera de un chat privado, el bot sólo contesta lo que la web ya publica.
 *
 * Ningún comando miraba el tipo de chat, y `ctx.reply` contesta donde se escribió el
 * comando. Medido el 17-09-2026 con los manejadores de verdad: en un grupo, `/curar`
 * pintaba la ficha entera de un borrador sin revisar —título, resumen de máquina y la
 * cita del pleno—, `/batch` el lote y `/mis` las quejas de quien lo escribiera, a la
 * vista de todo el grupo. Después se apagaron los grupos en BotFather; esto hace que no
 * dependa de un ajuste que se puede volver a encender, y cubre los grupos en los que el
 * bot ya estuviera.
 *
 * Es una lista de lo que SÍ se puede, no de lo que no: un comando nuevo nace privado.
 * Lo demás que llega de un grupo —texto, ediciones, botones, altas del bot— se ignora
 * sin contestar, y lo que llega de un canal también.
 */
import type { Context, MiddlewareFn } from 'grammy'

/** Los comandos que contestan en un grupo: sólo enseñan lo que la web ya publica. */
export const COMANDOS_PUBLICOS: ReadonlySet<string> = new Set([
  'start',
  'help',
  'estado',
  'apoyar',
  'barrio',
  'ranking',
  'digest',
])

/** Los atajos que imprimen el canal y el bot: «/apoyar_abc123», «/estado_abc123». */
const ATAJO_PUBLICO = /^(apoyar|estado)_[a-z0-9]+$/

export function esPublico(comando: string): boolean {
  return COMANDOS_PUBLICOS.has(comando) || ATAJO_PUBLICO.test(comando)
}

export function avisoPrivado(usuarioDelBot: string): string {
  return `Este comando sólo funciona en un chat privado conmigo. Escríbeme aquí: @${usuarioDelBot}`
}

/**
 * El comando con el que empieza un mensaje nuevo, en minúsculas y sin la mención, si
 * va dirigido a ESTE bot; `null` para cualquier otra cosa.
 */
export function comandoDe(ctx: Context): string | null {
  const m = ctx.message
  if (!m) return null
  const texto = m.text ?? m.caption
  const entidades = m.text !== undefined ? m.entities : m.caption_entities
  const e = entidades?.find((x) => x.type === 'bot_command' && x.offset === 0)
  if (!texto || !e) return null
  const [nombre, destinatario] = texto.slice(1, e.length).split('@')
  if (destinatario !== undefined && destinatario.toLowerCase() !== ctx.me.username.toLowerCase())
    return null
  return nombre.toLowerCase()
}

/** El primer middleware del bot: nada de un grupo llega a un manejador si no es público. */
export function soloEnPrivado<C extends Context>(): MiddlewareFn<C> {
  return async (ctx, next) => {
    const chat = ctx.chat
    if (!chat || chat.type === 'private') return next()
    const comando = comandoDe(ctx)
    if (comando === null) return
    if (esPublico(comando)) return next()
    await ctx.reply(avisoPrivado(ctx.me.username))
  }
}
