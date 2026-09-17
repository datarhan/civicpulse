/**
 * El webhook de Telegram, que sólo atiende a Telegram.
 *
 * Hasta el 17-09-2026 el bot registraba el webhook sin `secret_token` y montaba el
 * manejador de grammy sin `secretToken`. grammy, sin token configurado, acepta
 * cualquier petición, y en este servidor toda ruta que no reclamaba otro endpoint caía
 * en ese manejador. El bot decide autoría y permisos con el `from.id` del update, y en
 * un update inventado ese número lo pone quien lo manda: los comandos de
 * administración, /mis y /olvidar de otra persona, apoyos de cuentas que no existen.
 * Lo delató el log de producción: una petición vacía pasó la comprobación y reventó al
 * leer el JSON.
 *
 * Ahora Telegram devuelve en cada update, en `X-Telegram-Bot-Api-Secret-Token`, el
 * secreto que se le registró, y lo que no lo trae se rechaza ANTES de leer el cuerpo:
 * un desconocido tampoco consigue que el bot guarde en memoria lo que quiera mandarle.
 *
 * El secreto se DERIVA del token del bot, y no es una variable aparte. No hay secreto
 * nuevo que poner en Fly ni que pueda faltar —uno que faltara haría el arreglo
 * opcional, o dejaría el bot mudo—; rota solo cuando rota el token; y quien tiene el
 * token ya manda en el bot entero, así que derivarlo no le da nada que no tuviera.
 * Registrar y exigir salen de este mismo módulo y de la misma derivación: si
 * difirieran, cada update real recibiría 401 y el bot se quedaría mudo sin que nada
 * fallara al arrancar.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { webhookCallback, type Bot, type Context } from 'grammy'

/** La cabecera en la que Telegram devuelve el `secret_token` registrado. */
const CABECERA = 'x-telegram-bot-api-secret-token'

/** Etiqueta de la derivación: cambiarla rota el secreto sin tocar el token. */
const ETIQUETA = 'civicpulse · secret_token del webhook de Telegram · v1'

/**
 * El `secret_token` del webhook, derivado del token del bot. En hexadecimal, que cabe
 * en lo que Telegram admite: de 1 a 256 caracteres de `[A-Za-z0-9_-]`.
 */
export function secretoDelWebhook(tokenDelBot: string): string {
  const token = tokenDelBot.trim()
  if (!token) throw new Error('sin BOT_TOKEN no hay secreto del webhook')
  return createHmac('sha256', token).update(ETIQUETA).digest('hex')
}

/** En tiempo constante. Una cabecera ausente o repetida no vale. */
function traeElSecreto(req: IncomingMessage, secreto: string): boolean {
  const recibido = req.headers[CABECERA]
  if (typeof recibido !== 'string') return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(secreto)
  return a.length === b.length && timingSafeEqual(a, b)
}

function leeCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = []
    req.on('data', (t: Buffer) => trozos.push(t))
    req.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')))
    req.on('error', reject)
  })
}

export interface WebhookTelegram {
  /** Da de alta el webhook en Telegram con su secreto. */
  registrar: () => Promise<void>
  /** Atiende una petición que no reclamó ningún otro endpoint del servidor. */
  atender: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

export function webhookTelegram<C extends Context>(
  bot: Bot<C>,
  o: { url: string; token: string },
): WebhookTelegram {
  const secreto = secretoDelWebhook(o.token)
  const ruta = new URL(o.url).pathname
  // grammy vuelve a comprobar el secreto: si un día desaparece la comprobación de
  // `atender`, el webhook sigue cerrado.
  const manejador = webhookCallback(bot, 'std/http', { secretToken: secreto })

  return {
    registrar: async () => {
      await bot.api.setWebhook(o.url, { secret_token: secreto })
    },

    atender: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://bot.local')
      // Telegram sólo hace POST, y sólo a la ruta registrada. Lo demás —un escáner que
      // pide /.env, un GET a la raíz— llegaba a grammy y salía como un 500 con la pila.
      if (req.method !== 'POST' || url.pathname !== ruta) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      if (!traeElSecreto(req, secreto)) {
        res.statusCode = 401
        res.end('unauthorized')
        return
      }
      try {
        const cuerpo = await leeCuerpo(req)
        const peticion = new Request(new URL(url.pathname, o.url).toString(), {
          method: 'POST',
          headers: req.headers as HeadersInit,
          body: cuerpo || undefined,
        })
        const r = await manejador(peticion)
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await r.text())
      } catch (err) {
        console.error('[http] error:', err)
        res.statusCode = 500
        res.end('error')
      }
    },
  }
}
