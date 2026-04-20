import 'dotenv/config'
import { Bot, session } from 'grammy'
import { conversations } from '@grammyjs/conversations'
import { openDb } from './db/client.ts'
import type { MyContext, SessionData } from './types.ts'
import { registerStart } from './commands/start.ts'
import { registerQueja } from './commands/queja.ts'
import { registerEstado } from './commands/estado.ts'
import { registerApoyar } from './commands/apoyar.ts'
import { registerMis } from './commands/mis.ts'

function makeBot(): { bot: Bot<MyContext>; db: ReturnType<typeof openDb> } {
  const token = process.env.BOT_TOKEN
  if (!token) throw new Error('BOT_TOKEN missing — set it in .env or the environment')

  const bot = new Bot<MyContext>(token)
  const db = openDb()

  bot.use(session({ initial: (): SessionData => ({}) }))
  bot.use(conversations())

  // Order matters: conversation registration goes first, then plain commands.
  registerQueja(bot, db)
  registerStart(bot)
  registerEstado(bot, db)
  registerApoyar(bot, db)
  registerMis(bot, db)

  bot.catch((err) => {
    console.error('[bot] error:', err)
  })

  // Publish the command list so Telegram's / autocomplete shows them.
  bot.api
    .setMyCommands([
      { command: 'queja', description: 'Presentar una nueva queja' },
      { command: 'estado', description: 'Ver el estado de una queja' },
      { command: 'apoyar', description: 'Apoyar una queja existente' },
      { command: 'mis', description: 'Mis quejas' },
      { command: 'help', description: 'Cómo funciona' },
    ])
    .catch(() => undefined)

  return { bot, db }
}

async function main() {
  const { bot } = makeBot()

  const webhook = process.env.WEBHOOK_URL
  if (webhook) {
    const { webhookCallback } = await import('grammy')
    const http = await import('node:http')
    const handler = webhookCallback(bot, 'std/http')
    const server = http.createServer(async (req, res) => {
      const r = await handler(new Request(new URL(req.url ?? '/', webhook), req as unknown as RequestInit))
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      const text = await r.text()
      res.end(text)
    })
    const port = Number(process.env.PORT ?? 3000)
    server.listen(port)
    await bot.api.setWebhook(webhook)
    console.log(`[bot] webhook mode · ${webhook} · :${port}`)
  } else {
    console.log('[bot] long-polling mode (dev). Press Ctrl+C to stop.')
    await bot.start()
  }
}

main().catch((err) => {
  console.error('[bot] fatal:', err)
  process.exit(1)
})
