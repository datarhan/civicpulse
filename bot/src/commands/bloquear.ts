import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { AccionBloqueo } from '../db/migraciones.ts'
import { bloqueosActivos, decidirBloqueo, estaBloqueado } from '../db/bloqueos.ts'
import {
  autorTelegram,
  cupoDeQuejas,
  autorDeQueja,
  idCiudadano,
  LIMITE_QUEJAS_DIA,
  VENTANA_LIMITE_HORAS,
} from '../db/queries.ts'
import { CONTACTO } from '../services/contacto.ts'
import type { MyContext } from '../types.ts'
import { parseAdminIds } from '../util/admins.ts'

/**
 * Las dos salvaguardas de lo que entra por el bot: la lista de bloqueo y el
 * límite diario por cuenta.
 *
 * Una cuenta bloqueada no puede enviar quejas (`/queja`, y con ella adjuntar una
 * foto, que sólo se adjunta dentro de `/queja`) ni apoyarlas (`/apoyar`). Todo lo
 * demás le sigue funcionando —`/mis`, `/estado`, `/olvidar`, `/borrar_mis_datos`,
 * las suscripciones—: bloquear nunca quita los derechos sobre los datos propios.
 * Y no despublica nada de lo que ya escribió: retirar una queja es otra decisión
 * de moderación, con su tarjeta.
 *
 * Lo deciden `/bloquear` y `/desbloquear`, sólo un administrador y sólo en su chat
 * privado (`soloEnPrivado` deja fuera de los grupos todo lo que no es público).
 * Quien modera ve ids de queja, no de Telegram, así que el camino útil es el id de
 * una queja: bloquea a quien la escribió, sin descubrirle a quien modera de qué
 * cuenta se trata. Cada decisión queda en `bloqueos` (db/bloqueos.ts), append-only.
 *
 * El límite: `LIMITE_QUEJAS_DIA` quejas en `VENTANA_LIMITE_HORAS` horas móviles
 * (`cupoDeQuejas`, db/queries.ts). Quien modera no tiene límite.
 */

/** Lo que oye una cuenta bloqueada al intentar enviar o apoyar una queja: una frase neutra. */
export const BLOQUEADA = `Esta cuenta no puede enviar quejas. Si crees que es un error, escribe a ${CONTACTO}.`

const SOLO_ADMIN = 'Sólo un administrador puede bloquear o desbloquear cuentas.'

const NO_ACTIVO =
  'El bloqueo aún no está activo en este despliegue: su tabla llega con la migración 4, que ' +
  'está en ensayo (bot/DEPLOY.md). Hasta que se active, nadie está bloqueado.'

const esAdminId = (id: number | undefined) => id !== undefined && parseAdminIds().includes(id)

const MADRID = 'Europe/Madrid'

/**
 * Lo que oye quien llega al límite: cuántas, en cuánto tiempo, y desde cuándo
 * podrá enviar otra, en hora peninsular y redondeando al minuto siguiente —a las
 * 14:04:30 no se puede todavía, así que se dice 14:05—.
 */
export function mensajeLimite(libreDesde: Date): string {
  const minuto = new Date(Math.ceil(libreDesde.getTime() / 60_000) * 60_000)
  const fecha = minuto.toLocaleDateString('es-ES', {
    timeZone: MADRID,
    day: 'numeric',
    month: 'long',
  })
  const hora = minuto.toLocaleTimeString('es-ES', {
    timeZone: MADRID,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return (
    `Has enviado ${LIMITE_QUEJAS_DIA} quejas en las últimas ${VENTANA_LIMITE_HORAS} horas, que es ` +
    `el máximo por cuenta. Podrás enviar la siguiente a partir del ${fecha} a las ${hora} ` +
    `(hora peninsular). Gracias por tu paciencia.`
  )
}

/**
 * Si esta cuenta puede enviar una queja ahora: null si puede; si no, lo que hay
 * que contestarle. `/queja` lo mira al empezar y otra vez justo antes de guardarla.
 */
export function porQueNoPuedeEnviar(db: Db, telegramId: number, ahora = new Date()): string | null {
  const autor = autorTelegram(telegramId)
  if (estaBloqueado(db, autor)) return BLOQUEADA
  if (esAdminId(telegramId)) return null
  const cupo = cupoDeQuejas(db, autor, ahora)
  return cupo.libreDesde ? mensajeLimite(cupo.libreDesde) : null
}

type Objetivo =
  | { tipo: 'ciudadano'; id: number; descripcion: string }
  | { tipo: 'sin-fila'; telegramId: number }
  | { tipo: 'respuesta'; texto: string }

/**
 * A quién se refiere el argumento: un id de queja con su Q delante (`Q-…`, `q…`),
 * o un id de Telegram, sólo cifras. Un número de ocho cifras es un id de
 * Telegram: `idDeQueja` aceptaría también el sufijo de una queja sin la Q, y aquí
 * eso confundiría las dos cosas.
 */
function objetivo(db: Db, arg: string, accion: AccionBloqueo): Objetivo {
  const uso = `Uso: /${accion} <id de Telegram o Q-XXXXXXXX> [motivo]`
  if (/^\d+$/.test(arg)) {
    const telegramId = Number(arg)
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0)
      return { tipo: 'respuesta', texto: uso }
    if (esAdminId(telegramId)) {
      return { tipo: 'respuesta', texto: 'Esa cuenta es de un administrador: no se bloquea.' }
    }
    const id = idCiudadano(db, autorTelegram(telegramId))
    return id === null
      ? { tipo: 'sin-fila', telegramId }
      : { tipo: 'ciudadano', id, descripcion: `la cuenta de Telegram ${telegramId}` }
  }
  const m = /^Q[-_]?([0-9A-Z]{8})$/i.exec(arg)
  if (!m) return { tipo: 'respuesta', texto: uso }
  const qid = 'Q-' + m[1].toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
  const autor = autorDeQueja(db, qid)
  if (autor === undefined) return { tipo: 'respuesta', texto: `No encuentro la queja ${qid}.` }
  if (autor === null) {
    return {
      tipo: 'respuesta',
      texto:
        `De la queja ${qid} ya no consta quién la escribió (la retiró con /olvidar o borró ` +
        'sus datos): no sé a qué cuenta aplicarlo.',
    }
  }
  if (autor.canal === 'telegram' && esAdminId(Number(autor.ref))) {
    return { tipo: 'respuesta', texto: 'Esa cuenta es de un administrador: no se bloquea.' }
  }
  return { tipo: 'ciudadano', id: autor.id, descripcion: `la cuenta que escribió ${qid}` }
}

export function registerBloquear(bot: Bot<MyContext>, db: Db) {
  const decidir = async (ctx: MyContext, accion: AccionBloqueo) => {
    if (ctx.chat?.type !== 'private' || !esAdminId(ctx.from?.id)) {
      await ctx.reply(SOLO_ADMIN)
      return
    }
    if (!bloqueosActivos(db)) {
      await ctx.reply(NO_ACTIVO)
      return
    }
    const [arg = '', ...resto] = String(ctx.match ?? '')
      .trim()
      .split(/\s+/)
    const motivo = resto.join(' ').slice(0, 500) || null
    const o = objetivo(db, arg, accion)
    if (o.tipo === 'respuesta') {
      await ctx.reply(o.texto)
      return
    }
    let id: number
    let descripcion: string
    if (o.tipo === 'sin-fila') {
      // Desbloquear a quien nunca escribió no tiene nada que deshacer, y no se le
      // crea una fila para decirlo. Bloquearla sí: el bloqueo cuelga de su fila.
      if (accion === 'desbloquear') {
        await ctx.reply('Esa cuenta no estaba bloqueada.')
        return
      }
      id = idCiudadano(db, autorTelegram(o.telegramId), { crear: true })!
      descripcion = `la cuenta de Telegram ${o.telegramId}`
    } else {
      id = o.id
      descripcion = o.descripcion
    }
    const r = decidirBloqueo(db, id, accion, `admin:${ctx.from!.id}`, motivo)
    if (r === 'no-activo') {
      await ctx.reply(NO_ACTIVO)
    } else if (r === 'ya-estaba') {
      await ctx.reply(
        accion === 'bloquear'
          ? 'Esa cuenta ya estaba bloqueada.'
          : 'Esa cuenta no estaba bloqueada.',
      )
    } else if (accion === 'bloquear') {
      await ctx.reply(
        `🚫 Bloqueada ${descripcion}. Ya no puede enviar quejas, apoyarlas ni adjuntar fotos; ` +
          'conserva /mis, /olvidar y /borrar_mis_datos. Lo que ya escribió sigue como estaba: ' +
          'retirar una queja publicada es otra decisión, con su tarjeta (/revisar).',
      )
    } else {
      await ctx.reply(`✅ Desbloqueada ${descripcion}: puede volver a enviar y apoyar quejas.`)
    }
  }

  bot.command('bloquear', (ctx) => decidir(ctx, 'bloquear'))
  bot.command('desbloquear', (ctx) => decidir(ctx, 'desbloquear'))
}
