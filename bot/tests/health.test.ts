import { describe, it, expect } from 'vitest'
import { buildHealth, VARIABLE_VERSION } from '../src/services/health'

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

/**
 * Until 2026-09-17 the webhook accepted forged updates, and nothing outside the
 * machine could tell a protected bot from an open one. The health payload says
 * which one is running — as a boolean, never the secret.
 */
describe('buildHealth · webhook authentication', () => {
  const wired = { BOT_TOKEN: 't', CHANNEL_ID: '-100', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv
  const webhook = { mode: 'webhook', uptimeSec: 10, pid: 1 }

  it('reports degraded while the webhook is not registered with its secret', () => {
    const h = buildHealth(wired, { ...webhook, webhookAuthenticated: false })
    expect(h.webhookAuthenticated).toBe(false)
    expect(h.status).toBe('degraded')
    expect(h.degraded.join(' ')).toMatch(/secret_token/)
  })

  it('reports ok once it is (the control)', () => {
    const h = buildHealth(wired, { ...webhook, webhookAuthenticated: true })
    expect(h.webhookAuthenticated).toBe(true)
    expect(h.status).toBe('ok')
    expect(h.degraded).toEqual([])
  })

  it('treats a webhook-mode caller that says nothing as unauthenticated', () => {
    const h = buildHealth(wired, webhook)
    expect(h.webhookAuthenticated).toBe(false)
    expect(h.status).toBe('degraded')
  })

  it('has no webhook to authenticate in long-polling mode', () => {
    const h = buildHealth(wired, base)
    expect('webhookAuthenticated' in h).toBe(false)
    expect(h.status).toBe('ok')
  })
})

/**
 * `flyctl deploy` en verde no dice qué commit sirve la máquina: el 9-09-2026 la
 * de producción era de las 08:16Z con cuatro commits encima, y nada lo decía.
 * `/health` cuenta la versión que el despliegue le pasó, y el paso de después
 * del despliegue (bot-deploy.yml) la compara con el commit fusionado.
 */
describe('buildHealth · la versión que corre', () => {
  it('dice el commit que le pasó el despliegue', () => {
    const h = buildHealth(
      { BOT_TOKEN: 't', [VARIABLE_VERSION]: 'abc123' } as NodeJS.ProcessEnv,
      base,
    )
    expect(h.version).toBe('abc123')
  })

  it('sin él dice null: no se inventa una versión', () => {
    expect(buildHealth({ BOT_TOKEN: 't' } as NodeJS.ProcessEnv, base).version).toBeNull()
    expect(
      buildHealth({ BOT_TOKEN: 't', [VARIABLE_VERSION]: '  ' } as NodeJS.ProcessEnv, base).version,
    ).toBeNull()
  })
})

/**
 * Una cola de revisión atascada no se veía: con `ADMIN_USER_IDS` vacío, o con
 * cada tarjeta fallando, las quejas esperaban para siempre y `/health` sólo
 * decía que /batch estaba apagado (revisión de #137). Ahora lo dice, y
 * ops-alarm lo lee de `degraded`.
 */
describe('buildHealth · la cola de revisión', () => {
  const wired = { BOT_TOKEN: 't', CHANNEL_ID: '-100', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv
  const cola = (
    o: Partial<{ pendientes: number; sinTarjeta: number; masAntiguaHoras: number | null }>,
  ) => ({
    ...base,
    moderacion: { pendientes: 0, sinTarjeta: 0, masAntiguaHoras: null, ...o },
  })

  it('sin nada esperando, nada que decir (el control)', () => {
    const h = buildHealth(wired, cola({}))
    expect(h.status).toBe('ok')
    expect(h.moderacion).toEqual({ pendientes: 0, sinTarjeta: 0, masAntiguaHoras: null })
  })

  it('una queja esperando que no tiene tarjeta en ningún administrador actual', () => {
    const h = buildHealth(wired, cola({ pendientes: 1, sinTarjeta: 1, masAntiguaHoras: 1 }))
    expect(h.status).toBe('degraded')
    expect(h.degraded.join(' ')).toMatch(/sin tarjeta/)
  })

  it('quejas esperando y nadie que pueda publicarlas', () => {
    const h = buildHealth(
      { BOT_TOKEN: 't', CHANNEL_ID: '-100' } as NodeJS.ProcessEnv,
      cola({ pendientes: 2, sinTarjeta: 2, masAntiguaHoras: 3 }),
    )
    expect(h.degraded.join(' ')).toMatch(/nadie puede publicar/)
  })

  it('la más antigua lleva más de dos días', () => {
    const h = buildHealth(wired, cola({ pendientes: 1, masAntiguaHoras: 50 }))
    expect(h.degraded.join(' ')).toMatch(/50 h/)
    expect(buildHealth(wired, cola({ pendientes: 1, masAntiguaHoras: 47 })).status).toBe('ok')
  })

  it('tarjetas que llevan más de un día esperando a perder el texto de una queja retirada', () => {
    // La promesa de /aviso-legal —el texto sale de las tarjetas— depende de que esa
    // cola se vacíe; si Telegram falla día tras día, sólo lo decía el registro.
    const conCola = (masAntiguaHoras: number) => ({
      ...base,
      moderacion: {
        pendientes: 0,
        sinTarjeta: 0,
        masAntiguaHoras: null,
        porVaciar: { total: 2, masAntiguaHoras },
      },
    })
    const h = buildHealth(wired, conCola(30))
    expect(h.status).toBe('degraded')
    expect(h.degraded.join(' ')).toMatch(/2 tarjeta\(s\).*30 h/)
    expect(buildHealth(wired, conCola(3)).status).toBe('ok')
  })
})
