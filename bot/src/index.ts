import 'dotenv/config'
import { Bot } from 'grammy'
import { openDb } from './db/client.ts'
import type { MyContext } from './types.ts'
import { registrarComandos } from './commands/registrar.ts'
import { avisosHitos } from './services/avisos-hitos.ts'
import { buildSnapshot, directorioFotos } from './services/snapshot.ts'
import { buildBatch, renderBatchHtml, renderBatchMarkdown } from './services/batch.ts'
import { sirveSindic } from './services/sindic.ts'
import { plazosSinCalendario, startSilencioCron } from './services/cron.ts'
import { startDigestCron } from './services/digest.ts'
import { startConvocatoriasCron } from './services/convocatorias.ts'
import { startEventosRepoCron } from './services/eventos-repo.ts'
import { startFotosCron } from './services/fotos-cron.ts'
import { startRetencionCron } from './services/retencion.ts'
import { envioDesdeApi, estadoModeracion, startReenvioTarjetas } from './services/avisos-admin.ts'
import { estadoRevision, startRevisionCron } from './services/moderacion.ts'
import { sirveFotoExportada } from './services/foto-exportada.ts'
import { webhookTelegram } from './services/webhook-telegram.ts'
import { parseAdminIds } from './util/admins.ts'
import {
  eventosRepoVistos,
  marcarEventoRepoVisto,
  podarEventosRepo,
  reconcileApoyadas,
} from './db/queries.ts'
import { logger } from './util/log.ts'
import { buildHealth } from './services/health'
import { handleCurationRequest } from './services/curation-http.ts'
import { pendingApplications } from './services/curation.ts'

function makeBot() {
  const token = process.env.BOT_TOKEN
  if (!token) throw new Error('BOT_TOKEN missing — set it in .env or the environment')

  const bot = new Bot<MyContext>(token)
  const db = openDb()

  // Las que reunieron sus apoyos mientras la promoción estaba rota: nadie va a
  // volver a apoyarlas para que `addApoyo` las empuje ahora. Idempotente, y se
  // informa de lo intentado y de lo promovido por separado — «0 de 0» y «0 de 7»
  // dicen cosas muy distintas y con un solo número se leen igual.
  const reconciliadas = reconcileApoyadas(db)
  console.log(
    `[arranque] apoyos al día: ${reconciliadas.promovidas} promovida(s) de ${reconciliadas.intentadas} con umbral alcanzado`,
  )

  // Los hitos de cada queja, a quien modera por privado (services/avisos-hitos.ts):
  // desde el 2026-09-29 el bot no publica en ningún canal.
  const hitos = avisosHitos({
    admins: () => parseAdminIds(),
    mensaje: (chat, texto) => envioDesdeApi(bot.api).mensaje(chat, texto),
  })

  // Todos los comandos, detrás de dos middlewares: el que atiende cada update una vez
  // y los de un chat de uno en uno, y el que no deja contestar fuera de un chat privado
  // más que lo público (commands/registrar.ts). Aquí no se registra ningún manejador
  // más: uno puesto antes que éstos se saltaría las guardas.
  registrarComandos(bot, db, hitos)

  // Silencio cron — hourly tick that auto-transitions aged registered
  // quejas to silencio_negativo and tells whoever moderates. Paused during
  // LOREG freeze.
  startSilencioCron(db, hitos)

  // Weekly-digest cron — hourly tick that fires exactly once at Monday
  // 09:00 local. DMs each subscribed user with the past-7-days quejas
  // matching their filters. Paused during LOREG freeze.
  startDigestCron(bot, db)

  // Convocatorias cron — tic horario que emite una vez al día y sólo cuando un
  // plazo cruza un hito. DM a ADMIN_USER_IDS; los vecinos no ven nada de esto.
  //
  // NO se pausa con el bloqueo LOREG, a diferencia de los dos de arriba, y es
  // a propósito: aquéllos publican o escriben sobre cargos electos y por eso se
  // paran. Éste es un recordatorio interno del plazo de un tercero. Pararlo en
  // campaña sólo perdería una convocatoria, que es anual.
  startConvocatoriasCron(bot)

  // Y lo que pasa en el REPOSITORIO, sondeado cada hora.
  //
  // Lo urgente aquí es el derecho de réplica: es una obligación legal con plazo
  // y enterarse tarde incumple el contrato editorial que el sitio publica. Van
  // también las PR y —esto es la cicatriz del 9-09-2026— los workflows
  // FALLIDOS y SALTADOS. `pull-quejas.yml` llevaba saltando desde que se recreó
  // el repositorio, porque su `vars.BOT_EXPORT_URL` se perdió con él, y en la
  // lista de ejecuciones un salto no se distingue de un día tranquilo.
  //
  // Por sondeo y no desde Actions justamente por eso: el repositorio es público,
  // así que esto no depende de ninguna variable ni secreto que se pueda perder.
  // En HTML, con lo que viene de GitHub escapado (eventos-repo.ts): en Markdown un
  // `_` sin cerrar en un título hacía que Telegram rechazara el aviso entero.
  const dmAdministrador = async (id: number, textoHtml: string) => {
    await bot.api.sendMessage(id, textoHtml, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  }

  startEventosRepoCron({
    admins: () => parseAdminIds(),
    sendDm: dmAdministrador,
    yaVistos: () => eventosRepoVistos(db),
    recordar: (id) => marcarEventoRepoVisto(db, id),
    podar: () => podarEventosRepo(db),
  })

  // Y las fotos de las quejas, anonimizadas AQUÍ cada hora, contra la base de
  // producción y sobre el volumen (`QUEJAS_PHOTOS_DIR`). Hasta ahora la pasada sólo
  // se lanzaba a mano, desde un portátil con una copia vieja de la base, y no la
  // lanzaba nadie. Sin la variable no se arma; sin GEMINI_API_KEY, o sin
  // GEMINI_NIVEL=pago, retiene cada foto.
  // No se pausa con el bloqueo LOREG: no publica nada sobre cargos electos.
  // Lo que lleva un día retenido se avisa a los administradores, una vez.
  startFotosCron({ db, token, admins: () => parseAdminIds(), sendDm: dmAdministrador })

  // Las tarjetas de revisión que no llegaron a ningún administrador, otra vez: al
  // arrancar y cada hora. Una queja que nadie ha visto no se publica nunca sola,
  // así que sin esto se quedaría esperando (services/avisos-admin.ts).
  startReenvioTarjetas({ db, admins: () => parseAdminIds(), envio: envioDesdeApi(bot.api) })

  // Y la revisión automática (services/moderacion.ts), cada minuto: un modelo lee
  // cada queja pendiente, le quita los nombres de otras personas y dice si tiene
  // que verla una persona. Publica sola sólo lo que `decideAutomation` permite
  // con lo medido, y nada en periodo electoral. Sin GEMINI_NIVEL=pago no corre, y
  // cada queja la decide una persona, como hasta ahora.
  startRevisionCron({
    db,
    env: process.env,
    envio: envioDesdeApi(bot.api),
    admins: () => parseAdminIds(),
  })

  // Y el plazo de conservación, cumplido: al arrancar y cada día se destruyen las
  // quejas que lo pasaron, las copias de la base que pasaron el suyo y la copia de
  // un ensayo de migración interrumpido (services/retencion.ts).
  startRetencionCron({
    db,
    photosDir: directorioFotos(),
    dbPath: process.env.DB_PATH ?? './data/bot.db',
    // El texto de una queja destruida tampoco se queda en las tarjetas de revisión.
    envio: envioDesdeApi(bot.api),
  })

  bot.catch((err) => {
    console.error('[bot] error:', err)
  })

  bot.api
    .setMyCommands([
      { command: 'queja', description: 'Presentar una nueva queja' },
      { command: 'estado', description: 'Ver el estado de una queja' },
      { command: 'apoyar', description: 'Apoyar una queja existente' },
      { command: 'mis', description: 'Mis quejas' },
      { command: 'olvidar', description: 'Eliminar una queja mía (RGPD art. 17)' },
      { command: 'borrar_mis_datos', description: 'Borrar todo lo que el bot guarda de mí' },
      {
        command: 'subscribe',
        description: 'Suscribirse a resumen semanal (barrio/concejalía/categoría)',
      },
      { command: 'unsubscribe', description: 'Cancelar una suscripción' },
      { command: 'subscriptions', description: 'Ver mis suscripciones activas' },
      { command: 'barrio', description: 'Quejas por barrio' },
      { command: 'ranking', description: 'Ranking de barrios (60 días)' },
      { command: 'digest', description: 'Resumen (últimos N días)' },
      { command: 'batch', description: 'Lote semanal (admin)' },
      { command: 'batch_register', description: 'Registrar lote tras firmar (admin)' },
      { command: 'escalar', description: 'Escalar al Síndic (admin)' },
      { command: 'help', description: 'Cómo funciona' },
    ])
    .catch(() => undefined)

  return { bot, db, token }
}

async function main() {
  const { bot, db, token } = makeBot()

  const webhook = process.env.WEBHOOK_URL
  const port = Number(process.env.PORT ?? 3000)
  const exportToken = process.env.EXPORT_TOKEN ?? ''

  if (webhook) {
    // Production: webhook mode + export endpoint on one HTTP server.
    const http = await import('node:http')
    // Sólo Telegram entra por el webhook: el secreto se registra y se exige en el
    // mismo módulo (webhook-telegram.ts). Hasta que el alta termina, /health dice que
    // no está autenticado; si el alta falla, `main` revienta y Fly reinicia la máquina.
    const telegram = webhookTelegram(bot, { url: webhook, token })
    let webhookAutenticado = false

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      // Curation loop for a REMOTE bot. Mounted in BOTH branches: production on
      // Fly runs webhook mode, and mounting it only on the long-polling server
      // meant the endpoints 404'd in the only place they are actually needed.
      if (
        await handleCurationRequest(req, res, {
          listPending: () => pendingApplications(db as never),
          markApplied: (refs) => {
            const stmt = db.prepare(
              "UPDATE curation_decisions SET applied_at = datetime('now') WHERE ref = ? AND applied_at IS NULL",
            )
            let n = 0
            for (const r of refs) n += (stmt.run(r) as { changes: number }).changes
            return n
          },
        })
      ) {
        return
      }

      // Las fotos anonimizadas del volumen, para que pull-quejas.yml las publique:
      // sólo con el token en la cabecera y sólo de quejas vivas (foto-exportada.ts).
      if (sirveFotoExportada(req, res, { db, photosDir: directorioFotos(), exportToken })) {
        return
      }

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
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify(
            buildHealth(process.env, {
              mode: 'webhook',
              uptimeSec: Math.round(process.uptime()),
              pid: process.pid,
              webhookAuthenticated: webhookAutenticado,
              moderacion: {
                ...estadoModeracion(db, parseAdminIds()),
                revision: estadoRevision(db, process.env),
              },
              // Los plazos que acaban en un año sin calendario de días inhábiles:
              // el cron no los decide, y sólo lo decía su log (services/cron.ts).
              plazosSinCalendario: plazosSinCalendario(db),
            }),
          ),
        )
        return
      }

      // Per-queja Síndic de Greuges escalation template (md + html):
      // /sindic/q-abc12301.md | /sindic/q-abc12301.html (services/sindic.ts).
      if (sirveSindic(req, res, { db, exportToken })) return

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

      // Lo que queda sólo puede ser Telegram: POST a la ruta del webhook y con el
      // secreto. Todo lo demás, 404 o 401 sin llegar al bot.
      await telegram.atender(req, res)
    })

    server.listen(port)
    await telegram.registrar()
    webhookAutenticado = true
    console.log(`[bot] webhook mode · ${webhook} · :${port} · secret_token registrado`)
  } else {
    logger.info('bot.started', { mode: 'long-polling', pid: process.pid })

    // Standalone /health HTTP endpoint alongside long-polling so uptime-kuma
    // or any pinger can detect silent crashes. Binds to the same PORT as
    // webhook mode (3000 by default); doesn't conflict because this branch
    // never enters webhook mode.
    const http = await import('node:http')
    const healthServer = http.createServer(async (req, res) => {
      // Curation loop for a REMOTE bot: the queue is produced on the host and
      // pushed here, decisions are pulled back. Without this the /curar command
      // would always report an empty queue on Fly.
      const handled = await handleCurationRequest(req, res, {
        listPending: () => pendingApplications(db as never),
        markApplied: (refs) => {
          const stmt = db.prepare(
            "UPDATE curation_decisions SET applied_at = datetime('now') WHERE ref = ? AND applied_at IS NULL",
          )
          let n = 0
          for (const r of refs) n += (stmt.run(r) as { changes: number }).changes
          return n
        },
      })
      if (handled) return
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify(
            buildHealth(process.env, {
              mode: 'long-polling',
              uptimeSec: Math.round(process.uptime()),
              pid: process.pid,
              moderacion: {
                ...estadoModeracion(db, parseAdminIds()),
                revision: estadoRevision(db, process.env),
              },
              plazosSinCalendario: plazosSinCalendario(db),
            }),
          ),
        )
        return
      }
      res.statusCode = 404
      res.end('not found')
    })
    healthServer.on('error', (err) => logger.error('health.server', { err: String(err) }))
    healthServer.listen(port, () => logger.info('health.listening', { port }))

    // Resilient start — transient 409 Conflict (another getUpdates
    // caller) is common in dev; we back off and retry rather than die.
    while (true) {
      try {
        await bot.start({ drop_pending_updates: true })
        break
      } catch (err: any) {
        const code = err?.error_code
        if (code === 409) {
          logger.warn('getUpdates.conflict', { backoffSec: 5 })
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }
        throw err
      }
    }
  }
}

main().catch((err) => {
  logger.error('bot.fatal', {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  process.exit(1)
})
