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
 * Since 2026-09-29 the bot publishes to no channel: the milestones of each
 * queja go to whoever moderates (services/avisos-hitos.ts), so `CHANNEL_ID` is
 * no longer a capability, and its absence is no longer degraded.
 *
 * A health check that cannot fail is not a health check. This one still returns
 * 200 when the process is alive (that is what a container probe is asking), but
 * says plainly which capabilities are missing so an operator, or a monitor,
 * sees the difference.
 */

export interface BotCapabilities {
  /** Citizens can file a queja. Requires only BOT_TOKEN. */
  capture: boolean
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

/**
 * Los plazos de resolución que el bot no puede decidir: los de las quejas
 * registradas que acaban en un año sin calendario de días inhábiles
 * (`FESTIVOS_DE_LA_SEDE`, src/scraper/queja-router.ts), como los cuenta
 * `plazosSinCalendario` (services/cron.ts). Pasado su día nominal, el cron no las
 * pasa a silencio: no sabe si el último día se prorrogó (art. 30.5 LPACAP).
 */
export interface PlazosSinCalendario {
  /** Las registradas con el plazo en un año sin calendario. */
  quejas: number
  /** Los años que faltan, de menor a mayor. */
  anios: number[]
  /** El día nominal (art. 30.4) más próximo de todas ellas, «AAAA-MM-DD»; null si no hay ninguna. */
  primerNominal: string | null
  /** Días del día de hoy en la sede a ese día nominal: negativo si ya pasó; null si no hay ninguna. */
  quedanAlPrimero: number | null
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
  /**
   * Los plazos que acaban en un año sin calendario de días inhábiles, cuando quien
   * llama los pasa; null si no los pudo contar.
   */
  plazosSinCalendario?: PlazosSinCalendario | null
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

/**
 * Días antes del día nominal de un plazo sin calendario en que /health lo dice.
 *
 * Lo arregla añadir el año a `FESTIVOS_DE_LA_SEDE`, y un año va entero, así que
 * sólo se puede cuando el DOGV publica sus fiestas locales, lo último en salir:
 * las de 2025 el 18-11-2024 (DOGV núm. 9986), las de 2026 el 14-11-2025 (núm.
 * 10238). Y el primer plazo que acaba en un año nuevo es el del 1 de enero: tres
 * meses desde el 1 de octubre, uno desde el 1 de diciembre.
 *
 * Con 30 días, el primer aviso de un año sale como pronto el 2 de diciembre, dos
 * semanas después de esas publicaciones: el día que se pone en rojo ya hay qué
 * copiar. Con 45 o 60 saldría en noviembre, antes que la fuente, y ops-alarm
 * estaría en rojo cada día sin nada que hacer: el rojo que se aprende a no mirar,
 * y que esconde lo que caiga en el mismo aviso. Con una o dos semanas, el arreglo
 * —catorce días con su disposición, la CI, la fusión y el redespliegue del bot—
 * competiría con la Navidad. Un mes cabe.
 */
export const AVISO_SIN_CALENDARIO_DIAS = 30

/** La línea de `degraded` de unos plazos sin calendario con el primero ya a la vista. */
function lineaSinCalendario(p: PlazosSinCalendario, primerNominal: string, quedan: number) {
  const anios = p.anios.join(', ')
  const cuando =
    quedan > 0
      ? `el primer día nominal es el ${primerNominal}, dentro de ${quedan} día(s), y desde el siguiente el bot no podrá decidir su silencio`
      : quedan === 0
        ? `el primer día nominal es hoy, ${primerNominal}, y desde mañana el bot no podrá decidir su silencio`
        : `el primer día nominal fue el ${primerNominal}, hace ${-quedan} día(s), y el bot no puede decidir su silencio`
  return (
    `plazos: ${p.quejas} queja(s) registrada(s) acaban su plazo en un año sin calendario de días inhábiles (${anios}); ` +
    `${cuando} — añade ${anios} a FESTIVOS_DE_LA_SEDE (src/scraper/queja-router.ts): el año entero, del BOE y del DOGV`
  )
}

export function buildHealth(
  env: NodeJS.ProcessEnv,
  opts: {
    mode: string
    uptimeSec: number
    pid: number
    webhookAuthenticated?: boolean
    moderacion?: EstadoModeracion
    plazosSinCalendario?: PlazosSinCalendario | null
  },
): BotHealth {
  const capabilities: BotCapabilities = {
    capture: Boolean(env.BOT_TOKEN),
    adminCommands: Boolean(env.ADMIN_USER_IDS),
  }
  const degraded: string[] = []
  if (!capabilities.capture) degraded.push('BOT_TOKEN missing — cannot receive quejas')
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
  // Un plazo sin calendario, sólo cuando ya hay algo que hacer: lejos del día
  // nominal se cuenta en `plazosSinCalendario` y no avisa. No haberlo podido
  // contar sí avisa: callarlo daría por hecho que no hay ninguno.
  const plazos = opts.plazosSinCalendario
  if (plazos === null) {
    degraded.push(
      'plazos: el bot no pudo contar los plazos de las quejas registradas, así que no sabe si alguno acaba en un año sin calendario de días inhábiles — mira `fly logs`',
    )
  } else if (
    plazos?.primerNominal &&
    plazos.quedanAlPrimero !== null &&
    plazos.quedanAlPrimero <= AVISO_SIN_CALENDARIO_DIAS
  ) {
    degraded.push(lineaSinCalendario(plazos, plazos.primerNominal, plazos.quedanAlPrimero))
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
    ...(plazos === undefined ? {} : { plazosSinCalendario: plazos }),
  }
}
