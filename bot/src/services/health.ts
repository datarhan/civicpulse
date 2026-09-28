/**
 * What this bot can actually DO right now.
 *
 * `/health` used to answer with the literal string `ok`, which is why Docker
 * reported the container "healthy (3 days)" while it had been running in dev
 * mode since at least 1 July: no `CHANNEL_ID` means the public `[SILENCIO]`
 * broadcasts never fire, and no `ADMIN_USER_IDS` means `/batch`,
 * `/batch_register` and `/escalar` are all refused. Capture worked; the entire
 * accountability half of the product — registering complaints with the
 * ayuntamiento and escalating silence to the Síndic — was switched off, and
 * nothing outside the container's own startup log said so.
 *
 * A health check that cannot fail is not a health check. This one still returns
 * 200 when the process is alive (that is what a container probe is asking), but
 * says plainly which capabilities are missing so an operator, or a monitor,
 * sees the difference.
 */

export interface BotCapabilities {
  /** Citizens can file a queja. Requires only BOT_TOKEN. */
  capture: boolean
  /** Public `[SILENCIO]` broadcasts to the channel. Requires CHANNEL_ID. */
  broadcasts: boolean
  /** /batch, /batch_register, /escalar. Requires ADMIN_USER_IDS. */
  adminCommands: boolean
}

/**
 * La variable con la que el despliegue le dice a la máquina qué commit lleva
 * (`flyctl deploy --env GIT_SHA=…` en `.github/workflows/bot-deploy.yml`, que
 * después compara `/health.version` con el commit fusionado).
 * `tests/bot-despliegue.test.js` lee este nombre de aquí.
 */
export const VARIABLE_VERSION = 'GIT_SHA'

/**
 * La cola de la revisión antes de publicar, como la cuenta `estadoModeracion`
 * (services/avisos-admin.ts). Vive aquí y no allí porque health.ts no importa
 * nada: la raíz lo lee (tests/bot-despliegue.test.js), y su typecheck, que corre
 * sin las dependencias del bot, seguiría el import hasta grammy.
 */
export interface EstadoModeracion {
  pendientes: number
  /** Las que ningún administrador actual tiene en una tarjeta entregada. */
  sinTarjeta: number
  /** Horas que lleva esperando la más antigua, o null si no espera ninguna. */
  masAntiguaHoras: number | null
  /**
   * Las tarjetas que esperan a perder el texto de una queja retirada o destruida,
   * y desde hace cuánto la más antigua: la promesa de /aviso-legal depende de que
   * esa cola se vacíe.
   */
  porVaciar?: { total: number; masAntiguaHoras: number | null }
  /** La revisión automática antes de publicar (services/moderacion.ts), como la cuenta `estadoRevision`. */
  revision?: EstadoRevision
}

/**
 * La revisión automática: si puede correr, y cómo va. Apagada no es un fallo
 * —sin `GEMINI_NIVEL=pago` cada queja la decide una persona, como antes—; una
 * revisión que falla una y otra vez, sí.
 */
export interface EstadoRevision {
  disponible: boolean
  /** Lo que falta para que corra, si no puede. */
  falta?: string
  /** Las quejas pendientes sin una revisión válida. */
  porRevisar: number
  /** Las que llevan tantos fallos, o tanto tiempo fallando, que ya se avisó a quien modera. */
  atascadas: number
  /**
   * Las que ni siquiera dejan anotado su fallo —la base no acepta la escritura— y
   * esperan una hora sin preguntar al modelo: sin fila no cuentan fallos ni avisan.
   */
  enfriadas?: number
}

export interface BotHealth {
  status: 'ok' | 'degraded'
  mode: string
  uptimeSec: number
  pid: number
  /**
   * El commit que el despliegue dijo que corre, o null si no dijo ninguno. «Flyctl
   * deploy» en verde no lo prueba: el 9-09-2026 la máquina servía la versión de
   * las 08:16Z con cuatro commits encima, y nada fuera de ella lo decía.
   */
  version: string | null
  capabilities: BotCapabilities
  /** Human-readable list of what is off, empty when fully operational. */
  degraded: string[]
  /**
   * Webhook mode only: whether Telegram was registered with the `secret_token` the
   * handler requires (src/services/webhook-telegram.ts). Until 2026-09-17 it was not,
   * and the webhook accepted forged updates from anyone; nothing outside the machine
   * could tell. A boolean, never the secret.
   */
  webhookAuthenticated?: boolean
  /** La cola de la revisión antes de publicar, cuando quien llama la pasa. */
  moderacion?: EstadoModeracion
}

/**
 * Horas que puede esperar una queja en revisión antes de que la cola cuente
 * como atascada: dos días, que cubren un fin de semana sin nadie mirando.
 */
export const ESPERA_MAXIMA_REVISION_H = 48

/**
 * Horas que puede esperar una tarjeta a perder el texto de una queja retirada o
 * destruida: la pasada horaria lo reintenta, así que un día entero es Telegram
 * fallando día tras día, o un chat que nadie ha visto que ya no se puede editar.
 */
export const ESPERA_MAXIMA_VACIADO_H = 24

export function buildHealth(
  env: NodeJS.ProcessEnv,
  opts: {
    mode: string
    uptimeSec: number
    pid: number
    webhookAuthenticated?: boolean
    moderacion?: EstadoModeracion
  },
): BotHealth {
  const capabilities: BotCapabilities = {
    capture: Boolean(env.BOT_TOKEN),
    broadcasts: Boolean(env.CHANNEL_ID),
    adminCommands: Boolean(env.ADMIN_USER_IDS),
  }
  const degraded: string[] = []
  if (!capabilities.capture) degraded.push('BOT_TOKEN missing — cannot receive quejas')
  if (!capabilities.broadcasts)
    degraded.push('CHANNEL_ID missing — public [SILENCIO] broadcasts disabled')
  if (!capabilities.adminCommands)
    degraded.push(
      'ADMIN_USER_IDS missing — nobody can review a queja, so none gets published; /batch, /batch_register and /escalar disabled',
    )
  // A webhook-mode caller that does not say is read as unauthenticated: silence
  // here would print the all-clear this field exists to withhold.
  const webhookAuthenticated =
    opts.mode === 'webhook' ? opts.webhookAuthenticated === true : undefined
  if (webhookAuthenticated === false)
    degraded.push('webhook not registered with its secret_token — updates are not authenticated')
  // La revisión antes de publicar falla cerrada: una cola atascada no publica
  // nada mal, pero tampoco nada, y sin esto no lo decía nadie (revisión de #137).
  const m = opts.moderacion
  if (m && m.pendientes > 0) {
    if (!capabilities.adminCommands) {
      degraded.push(
        `moderación: ${m.pendientes} queja(s) en revisión y nadie puede publicarlas (ADMIN_USER_IDS vacío)`,
      )
    } else if (m.sinTarjeta > 0) {
      degraded.push(
        `moderación: ${m.sinTarjeta} queja(s) en revisión sin tarjeta entregada a ningún administrador actual`,
      )
    }
    if (m.masAntiguaHoras !== null && m.masAntiguaHoras > ESPERA_MAXIMA_REVISION_H) {
      degraded.push(
        `moderación: la queja en revisión más antigua lleva ${m.masAntiguaHoras} h esperando`,
      )
    }
  }
  if (m?.revision && m.revision.atascadas > 0) {
    degraded.push(
      `moderación: la revisión automática no avanza en ${m.revision.atascadas} queja(s): siguen sin publicar y las decide una persona`,
    )
  }
  if (m?.revision?.enfriadas) {
    degraded.push(
      `moderación: el bot no puede anotar la revisión de ${m.revision.enfriadas} queja(s) (la base no acepta la escritura): mira el log`,
    )
  }
  const cola = m?.porVaciar
  if (cola && cola.masAntiguaHoras !== null && cola.masAntiguaHoras > ESPERA_MAXIMA_VACIADO_H) {
    degraded.push(
      `moderación: ${cola.total} tarjeta(s) esperan desde hace ${cola.masAntiguaHoras} h a perder el texto de una queja retirada o destruida`,
    )
  }
  return {
    status: degraded.length === 0 ? 'ok' : 'degraded',
    mode: opts.mode,
    uptimeSec: opts.uptimeSec,
    pid: opts.pid,
    version: env[VARIABLE_VERSION]?.trim() || null,
    capabilities,
    degraded,
    ...(webhookAuthenticated === undefined ? {} : { webhookAuthenticated }),
    ...(opts.moderacion ? { moderacion: opts.moderacion } : {}),
  }
}
