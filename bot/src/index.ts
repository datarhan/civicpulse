import 'dotenv/config'
import { Bot, session, webhookCallback } from 'grammy'
import { conversations } from '@grammyjs/conversations'
import { openDb } from './db/client.ts'
import type { MyContext, SessionData } from './types.ts'
import { registerStart } from './commands/start.ts'
import { registerQueja } from './commands/queja.ts'
import { registerEstado } from './commands/estado.ts'
import { registerApoyar } from './commands/apoyar.ts'
import { registerMis } from './commands/mis.ts'
import { registerBarrio } from './commands/barrio.ts'
import { registerRanking } from './commands/ranking.ts'
import { registerDigest } from './commands/digest.ts'
import { makeChannel } from './services/channel.ts'
import { buildSnapshot } from './services/snapshot.ts'

function makeBot() {
  const token = process.env.BOT_TOKEN
  if (!token) throw new Error('BOT_TOKEN missing — set it in .env or the environment')

  const bot = new Bot<MyContext>(token)
  const db = openDb()
  const channel = makeChannel(bot)

  bot.use(session({ initial: (): SessionData => ({}) }))
  bot.use(conversations())

  // Conversation handler must come before plain command handlers that
  // share trigger names.
  registerQueja(bot, db, channel)
  registerStart(bot)
  registerEstado(bot, db)
  registerApoyar(bot, db, channel)
  registerMis(bot, db)
  registerBarrio(bot, db)
  registerRanking(bot, db)
  registerDigest(bot, db)

  bot.catch((err) => {
    console.error('[bot] error:', err)
  })

  bot.api
    .setMyCommands([
      { command: 'queja', description: 'Presentar una nueva queja' },
      { command: 'estado', description: 'Ver el estado de una queja' },
      { command: 'apoyar', description: 'Apoyar una queja existente' },
      { command: 'mis', description: 'Mis quejas' },
      { command: 'barrio', description: 'Quejas por barrio' },
      { command: 'ranking', description: 'Ranking de barrios (60 días)' },
      { command: 'digest', description: 'Resumen (últimos N días)' },
      { command: 'help', description: 'Cómo funciona' },
    ])
    .catch(() => undefined)

  return { bot, db }
}

async function main() {
  const { bot, db } = makeBot()

  const webhook = process.env.WEBHOOK_URL
  const port = Number(process.env.PORT ?? 3000)
  const exportToken = process.env.EXPORT_TOKEN ?? ''

  if (webhook) {
    // Production: webhook mode + export endpoint on one HTTP server.
    const http = await import('node:http')
    const handler = webhookCallback(bot, 'std/http')

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      // Public export endpoint. Protected by an optional bearer token.
      if (req.method === 'GET' && url.pathname === '/export/quejas.json') {
        if (exportToken) {
          const auth = req.headers.authorization ?? ''
          if (auth !== `Bearer ${exportToken}`) {
            res.statusCode = 401
            res.end('unauthorized')
            return
          }
        }
        const snap = buildSnapshot(db)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(snap))
        return
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        res.statusCode = 200
        res.end('ok')
        return
      }

      try {
        const body: string = await new Promise((resolve, reject) => {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          req.on('error', reject)
        })
        const fetchReq = new Request(new URL(url.pathname, webhook).toString(), {
          method: req.method ?? 'POST',
          headers: req.headers as HeadersInit,
          body: body || undefined,
        })
        const r = await handler(fetchReq)
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await r.text())
      } catch (err) {
        console.error('[http] error:', err)
        res.statusCode = 500
        res.end('error')
      }
    })

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
