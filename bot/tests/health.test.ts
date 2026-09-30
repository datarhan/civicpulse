import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AVISO_SIN_CALENDARIO_DIAS,
  buildHealth,
  VARIABLE_VERSION,
  type PlazosSinCalendario,
} from '../src/services/health'

const base = { mode: 'long-polling', uptimeSec: 10, pid: 1 }

/**
 * The container reported "healthy (3 days)" while the accountability half of
 * the product was switched off, because /health answered with the string 'ok'.
 */
describe('buildHealth', () => {
  it('reports degraded when the escalation credentials are missing', () => {
    const h = buildHealth({ BOT_TOKEN: 't' } as NodeJS.ProcessEnv, base)
    expect(h.status).toBe('degraded')
    expect(h.capabilities).toEqual({ capture: true, adminCommands: false })
    expect(h.degraded).toHaveLength(1)
    expect(h.degraded.join(' ')).toMatch(/escalar/)
  })

  it('reports ok only when everything is wired', () => {
    const h = buildHealth({ BOT_TOKEN: 't', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv, base)
    expect(h.status).toBe('ok')
    expect(h.degraded).toEqual([])
  })

  // Desde el 2026-09-29 el bot no publica en ningún canal: los hitos de cada queja
  // se avisan a quien modera (services/avisos-hitos.ts). Sin `CHANNEL_ID` no falta
  // nada, y con él tampoco se usa.
  it('CHANNEL_ID ya no es una capacidad', () => {
    const sin = buildHealth({ BOT_TOKEN: 't', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv, base)
    expect(sin.status).toBe('ok')
    expect(Object.keys(sin.capabilities)).not.toContain('broadcasts')
    expect(JSON.stringify(sin)).not.toMatch(/CHANNEL_ID|SILENCIO/)
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

/**
 * Un plazo que acaba en un año sin calendario de días inhábiles no lo decide
 * nadie (#182): la ficha da el día nominal «o el primer día hábil siguiente», el
 * panel dice «Sin calendario» y el cron no pasa la queja a silencio. Pasado ese
 * día lo decía sólo el log de Fly, que no mira nadie, y las quejas de tres meses
 * registradas desde el 1-10-2026 acaban en 2027, cuyas fiestas locales publica el
 * DOGV hacia noviembre. /health lo dice a AVISO_SIN_CALENDARIO_DIAS del día
 * nominal, y ops-alarm lo pone en rojo.
 */
describe('buildHealth · un plazo en un año sin calendario', () => {
  const wired = { BOT_TOKEN: 't', ADMIN_USER_IDS: '42' } as NodeJS.ProcessEnv
  const ninguno: PlazosSinCalendario = {
    quejas: 0,
    anios: [],
    primerNominal: null,
    quedanAlPrimero: null,
  }
  const en2027 = (quedanAlPrimero: number): PlazosSinCalendario => ({
    quejas: 2,
    anios: [2027],
    primerNominal: '2027-01-01',
    quedanAlPrimero,
  })
  const salud = (plazosSinCalendario: PlazosSinCalendario | null) =>
    buildHealth(wired, { ...base, plazosSinCalendario })

  it('sin ninguno, nada que decir (el control)', () => {
    const h = salud(ninguno)
    expect(h.status).toBe('ok')
    expect(h.plazosSinCalendario).toEqual(ninguno)
  })

  it('lejos del día nominal lo cuenta, pero no avisa: todavía no hay nada que hacer', () => {
    const h = salud(en2027(AVISO_SIN_CALENDARIO_DIAS + 1))
    expect(h.status).toBe('ok')
    expect(h.degraded).toEqual([])
    expect(h.plazosSinCalendario).toEqual(en2027(AVISO_SIN_CALENDARIO_DIAS + 1))
  })

  it('a AVISO_SIN_CALENDARIO_DIAS del día nominal, degradado: cuántas, el día y qué hacer', () => {
    const h = salud(en2027(AVISO_SIN_CALENDARIO_DIAS))
    expect(h.status).toBe('degraded')
    expect(h.degraded).toHaveLength(1)
    const [linea] = h.degraded
    expect(linea).toMatch(/2 queja\(s\) registrada\(s\)/)
    expect(linea).toMatch(new RegExp(`2027-01-01, dentro de ${AVISO_SIN_CALENDARIO_DIAS} día`))
    // El remedio entero: un aviso que no dice qué hacer manda a buscar.
    expect(linea).toMatch(/añade 2027 a FESTIVOS_DE_LA_SEDE \(src\/scraper\/queja-router\.ts\)/)
  })

  it('el día nominal es hoy: desde mañana no se decide', () => {
    expect(salud(en2027(0)).degraded.join(' ')).toMatch(/es hoy, 2027-01-01/)
  })

  it('pasado el día nominal, degradado: el bot ya no puede decidir el silencio', () => {
    const h = salud(en2027(-3))
    expect(h.status).toBe('degraded')
    expect(h.degraded.join(' ')).toMatch(/fue el 2027-01-01, hace 3 día/)
    expect(h.degraded.join(' ')).toMatch(/no puede decidir/)
  })

  it('si no se pudieron contar, lo dice: no saber no es «ninguno»', () => {
    const h = salud(null)
    expect(h.status).toBe('degraded')
    expect(h.plazosSinCalendario).toBeNull()
    expect(h.degraded.join(' ')).toMatch(/no pudo contar/)
  })

  it('avisa después de que el DOGV publique las fiestas locales, no antes', () => {
    // Un año se añade entero, y lo último que sale son sus fiestas locales: las de
    // 2025, en el DOGV núm. 9986 (18-11-2024); las de 2026, en el núm. 10238
    // (14-11-2025). El primer plazo de un año acaba el 1 de enero, así que su
    // primer aviso llega AVISO_SIN_CALENDARIO_DIAS antes. Si llegara antes que la
    // fuente, ops-alarm saldría en rojo cada día sin nada que hacer.
    for (const [anio, publicadas] of [
      [2025, '2024-11-18'],
      [2026, '2025-11-14'],
    ] as const) {
      const primerAviso = Date.UTC(anio, 0, 1) - AVISO_SIN_CALENDARIO_DIAS * 86_400_000
      expect(primerAviso, `el aviso de ${anio}, antes que su DOGV`).toBeGreaterThan(
        Date.parse(publicadas),
      )
    }
  })
})

/**
 * Lo de arriba no sirve si /health no lo recibe. index.ts monta /health en sus dos
 * ramas —webhook, la de producción, y long-polling— y cada una compone su
 * respuesta: las dos tienen que contar los plazos.
 */
describe('index.ts cuenta los plazos en cada /health', () => {
  /** El texto entre los paréntesis de cada llamada a `llamada`. */
  function argumentosDe(fuente: string, llamada: string): string[] {
    const args: string[] = []
    for (let i = fuente.indexOf(llamada); i >= 0; i = fuente.indexOf(llamada, i + 1)) {
      let profundidad = 0
      let j = i + llamada.length - 1
      for (; j < fuente.length; j++) {
        if (fuente[j] === '(') profundidad++
        else if (fuente[j] === ')' && --profundidad === 0) break
      }
      args.push(fuente.slice(i + llamada.length, j))
    }
    return args
  }

  it('cada llamada a buildHealth lleva plazosSinCalendario(db)', () => {
    const sinComentarios = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const indice = sinComentarios(readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8'))
    const llamadas = argumentosDe(indice, 'buildHealth(')
    expect(llamadas, 'las dos ramas de /health').toHaveLength(2)
    for (const args of llamadas) {
      expect(args).toMatch(/plazosSinCalendario:\s*plazosSinCalendario\(db\)/)
    }
  })
})

/**
 * health.ts lo importa también la raíz (tests/bot-despliegue.test.js, por
 * `VARIABLE_VERSION`), y el typecheck de la raíz sigue sus imports. La CI de la
 * raíz no instala las dependencias del bot: un import de health.ts —aunque sea
 * sólo de un tipo— que arrastre grammy o better-sqlite3 pone la CI en rojo, y en
 * el portátil, con las dependencias del bot instaladas, no se ve. Pasó en #137.
 */
describe('health.ts se lee desde la raíz', () => {
  it('no importa nada', () => {
    const fuente = readFileSync(join(__dirname, '..', 'src', 'services', 'health.ts'), 'utf8')
    expect(fuente.length).toBeGreaterThan(0)
    expect(fuente.match(/^\s*(import|export .* from)\b.*$/gm) ?? []).toEqual([])
  })
})
