import { describe, it, expect } from 'vitest'
import { buildHealth } from '../src/services/health'

const base = { mode: 'long-polling', uptimeSec: 10, pid: 1 }

/**
 * The container reported "healthy (3 days)" while the accountability half of
 * the product was switched off, because /health answered with the string 'ok'.
 */
describe('buildHealth', () => {
  it('reports degraded when the escalation credentials are missing', () => {
    const h = buildHealth({ BOT_TOKEN: 't' } as NodeJS.ProcessEnv, base)
    expect(h.status).toBe('degraded')
    expect(h.capabilities).toEqual({ capture: true, broadcasts: false, adminCommands: false })
    expect(h.degraded).toHaveLength(2)
    expect(h.degraded.join(' ')).toMatch(/SILENCIO/)
    expect(h.degraded.join(' ')).toMatch(/escalar/)
  })

  it('reports ok only when everything is wired', () => {
    const h = buildHealth(
      { BOT_TOKEN: 't', CHANNEL_ID: '-100', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv,
      base,
    )
    expect(h.status).toBe('ok')
    expect(h.degraded).toEqual([])
  })

  it('flags a missing bot token as loss of capture', () => {
    const h = buildHealth({} as NodeJS.ProcessEnv, base)
    expect(h.capabilities.capture).toBe(false)
    expect(h.degraded.join(' ')).toMatch(/cannot receive quejas/)
  })
})
