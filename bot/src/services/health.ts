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

export interface BotHealth {
  status: 'ok' | 'degraded'
  mode: string
  uptimeSec: number
  pid: number
  capabilities: BotCapabilities
  /** Human-readable list of what is off, empty when fully operational. */
  degraded: string[]
}

export function buildHealth(
  env: NodeJS.ProcessEnv,
  opts: { mode: string; uptimeSec: number; pid: number },
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
    degraded.push('ADMIN_USER_IDS missing — /batch, /batch_register and /escalar disabled')
  return {
    status: degraded.length === 0 ? 'ok' : 'degraded',
    mode: opts.mode,
    uptimeSec: opts.uptimeSec,
    pid: opts.pid,
    capabilities,
    degraded,
  }
}
