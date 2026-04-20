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
import { registerBatchCommand } from './commands/batch.ts'
import { registerEscalar } from './commands/escalar.ts'
import { makeChannel } from './services/channel.ts'
import { buildSnapshot } from './services/snapshot.ts'
import { buildBatch, renderBatchHtml, renderBatchMarkdown } from './services/batch.ts'
import { buildSindicTemplate, renderSindicHtml, renderSindicMarkdown } from './services/sindic.ts'
import { startSilencioCron } from './services/cron.ts'
import { getQueja } from './db/queries.ts'
import { routeUsingLocalOfficials } from './services/router.ts'

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
  registerBatchCommand(bot, db, channel)
  registerEscalar(bot, db, channel)

  // Silencio cron — hourly tick that auto-transitions aged registered
  // quejas to silencio_negativo. Paused during LOREG freeze.
  startSilencioCron(db, channel)

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
      { command: 'batch', description: 'Lote semanal (admin)' },
      { command: 'batch_register', description: 'Registrar lote tras firmar (admin)' },
      { command: 'escalar', description: 'Escalar al Síndic (admin)' },
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

      // Per-queja Síndic de Greuges escalation template (md + html).
      // Path: /sindic/q-abc12301.md | /sindic/q-abc12301.html
      const sindicMatch = url.pathname.match(/^\/sindic\/(q-[a-z0-9]+)\.(md|html)$/)
      if (req.method === 'GET' && sindicMatch) {
        if (exportToken) {
          const auth = req.headers.authorization ?? ''
          const qp = url.searchParams.get('token') ?? ''
          if (auth !== `Bearer ${exportToken}` && qp !== exportToken) {
            res.statusCode = 401
            res.end('unauthorized')
            return
          }
        }
        const quejaId = sindicMatch[1].toUpperCase()
        const q = getQueja(db, quejaId)
        if (!q) {
          res.statusCode = 404
          res.end('not found')
          return
        }
        const routing = routeUsingLocalOfficials({
          title: q.title,
          detail: q.detail,
          category: q.category as never,
        })
        const template = buildSindicTemplate(q, routing)
        if (sindicMatch[2] === 'md') {
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(renderSindicMarkdown(template))
        } else {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(renderSindicHtml(template))
        }
        return
      }

      // Public (read-only) batch document. Renders the current top-10
      // verified quejas as markdown / HTML. Protected by EXPORT_TOKEN if
      // set — same auth as /export/quejas.json.
      if (
        req.method === 'GET' &&
        (url.pathname === '/batch/current.md' || url.pathname === '/batch/current.html')
      ) {
        if (exportToken) {
          const auth = req.headers.authorization ?? ''
          const qp = url.searchParams.get('token') ?? ''
          if (auth !== `Bearer ${exportToken}` && qp !== exportToken) {
            res.statusCode = 401
            res.end('unauthorized')
            return
          }
        }
        const moderator = process.env.MODERATOR_NAME ?? 'Vecino/a de Riba-roja'
        const batch = buildBatch(db, moderator)
        if (url.pathname === '/batch/current.md') {
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(renderBatchMarkdown(batch))
        } else {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(renderBatchHtml(batch))
        }
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
    // Resilient start — transient 409 Conflict (another getUpdates
    // caller) is common in dev; we back off and retry rather than die.
    while (true) {
      try {
        await bot.start({ drop_pending_updates: true })
        break
      } catch (err: any) {
        const code = err?.error_code
        if (code === 409) {
          console.warn('[bot] getUpdates conflict, retrying in 5s…')
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }
        throw err
      }
    }
  }
}

main().catch((err) => {
  console.error('[bot] fatal:', err)
  process.exit(1)
})
