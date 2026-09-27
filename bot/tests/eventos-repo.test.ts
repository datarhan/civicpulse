import { describe, it, expect } from 'vitest'
import {
  eventosDe,
  nuevos,
  formatear,
  runEventosOnce,
  MAX_MENSAJE,
  type Evento,
} from '../src/services/eventos-repo.ts'

/**
 * Avisos de lo que pasa en el repositorio, por DM a los administradores.
 *
 * POR QUÉ POR SONDEO Y NO POR WEBHOOK. La casa ya tiene el patrón contrario
 * —`batch-reminder.yml` llama a la API de Telegram desde Actions— y ese patrón
 * acaba de enseñar su defecto: depende de `vars` y `secrets` del repositorio, y
 * el 8-09-2026 hubo que BORRAR Y RECREAR el repositorio, con lo que las
 * variables se perdieron. El 9-09 se comprobó: `pull-quejas.yml` se ejecutó y
 * salió «skipped» porque `vars.BOT_EXPORT_URL` ya no existe. Las quejas
 * llevaban desde entonces sin bajar al sitio y nada lo dijo, porque un trabajo
 * saltado se lee casi igual que uno correcto.
 *
 * Sondear desde el bot no necesita ni variable ni secreto —el repositorio es
 * público— así que no hay nada que se pueda perder en una recreación. Y no abre
 * un endpoint de entrada, que sería superficie nueva para un aviso interno.
 *
 * QUÉ SE AVISA, y el orden importa:
 *
 *   · `derecho-replica` es lo ÚNICO urgente. Es una obligación legal con plazo:
 *     una persona nombrada en una superficie legalmente material ha respondido y
 *     hay que atenderla. Enterarse tarde de esto no es una molestia, es el
 *     incumplimiento del contrato editorial que el sitio publica.
 *   · Las PR abiertas y fusionadas, porque aquí las fusiona quien las escribe.
 *   · Y los workflows FALLIDOS **y SALTADOS**. Lo segundo no es celo: un
 *     trabajo saltado por una variable que ya no existe es exactamente lo que
 *     dejó las quejas sin bajar, y en la lista de ejecuciones no se ve como un
 *     fallo.
 *
 * Un éxito no avisa. El ruido es lo que enseña a ignorar los avisos.
 */

const PR_ABIERTA = {
  number: 12,
  title: 'Arreglar el denominador',
  html_url: 'https://github.com/o/r/pull/12',
  state: 'open',
  merged_at: null,
  created_at: '2026-09-09T10:00:00Z',
}

const PR_FUSIONADA = {
  number: 11,
  title: 'El calendario avisa solo',
  html_url: 'https://github.com/o/r/pull/11',
  state: 'closed',
  merged_at: '2026-09-09T09:00:00Z',
  created_at: '2026-09-08T10:00:00Z',
}

const ISSUE_REPLICA = {
  number: 7,
  title: 'Derecho de réplica — hallazgo sobre el PMP',
  html_url: 'https://github.com/o/r/issues/7',
  labels: [{ name: 'derecho-replica' }],
  created_at: '2026-09-09T11:00:00Z',
}

const ISSUE_NORMAL = {
  number: 8,
  title: 'Typo en la portada',
  html_url: 'https://github.com/o/r/issues/8',
  labels: [{ name: 'chore' }],
  created_at: '2026-09-09T11:30:00Z',
}

const RUN = (over: Record<string, unknown>) => ({
  id: 100,
  name: 'pull-quejas',
  conclusion: 'success',
  event: 'schedule',
  html_url: 'https://github.com/o/r/actions/runs/100',
  created_at: '2026-09-09T08:32:00Z',
  ...over,
})

const datos = (o: Partial<Parameters<typeof eventosDe>[0]> = {}) =>
  eventosDe({ prs: [], issues: [], runs: [], ...o })

describe('eventosDe', () => {
  it('distingue una PR abierta de una fusionada', () => {
    const e = datos({ prs: [PR_ABIERTA, PR_FUSIONADA] })
    expect(e.map((x) => x.clase).sort()).toEqual(['pr-abierta', 'pr-fusionada'])
  })

  // La misma PR da DOS eventos a lo largo de su vida, y con identidades
  // distintas: si compartieran id, fusionarla no avisaría nunca porque abrirla
  // ya habría gastado el aviso.
  it('abrir y fusionar la misma PR son eventos con identidad distinta', () => {
    const abierta = datos({ prs: [PR_ABIERTA] })[0]
    const fusionada = datos({ prs: [{ ...PR_ABIERTA, merged_at: '2026-09-09T12:00:00Z' }] })[0]
    expect(abierta.id).not.toBe(fusionada.id)
  })

  it('sólo marca derecho de réplica cuando lleva la etiqueta', () => {
    const e = datos({ issues: [ISSUE_REPLICA, ISSUE_NORMAL] })
    expect(e).toHaveLength(1)
    expect(e[0].clase).toBe('derecho-replica')
    expect(e[0].titulo).toContain('PMP')
  })

  it('avisa de un workflow fallido', () => {
    const e = datos({ runs: [RUN({ conclusion: 'failure' })] })
    expect(e.map((x) => x.clase)).toEqual(['workflow-fallido'])
  })

  // LA CICATRIZ. `pull-quejas.yml` salió «skipped» el 9-09-2026 porque su
  // `vars.BOT_EXPORT_URL` se perdió al recrear el repositorio, y en la lista de
  // ejecuciones un salto no se distingue de un día tranquilo.
  it('avisa también de un workflow SALTADO, que es el que no se ve', () => {
    const e = datos({ runs: [RUN({ conclusion: 'skipped' })] })
    expect(e.map((x) => x.clase)).toEqual(['workflow-saltado'])
    expect(e[0].titulo).toContain('pull-quejas')
  })

  // Y el que no avisa: si cada pasada correcta mandara un DM, en una semana
  // nadie los leería.
  it('un workflow correcto no avisa', () => {
    expect(datos({ runs: [RUN({ conclusion: 'success' })] })).toEqual([])
  })

  // Un salto a mano es una decisión de alguien; el que importa es el programado,
  // que nadie está mirando cuando ocurre.
  it('sólo avisa del salto de un trabajo PROGRAMADO', () => {
    expect(datos({ runs: [RUN({ conclusion: 'skipped', event: 'workflow_dispatch' })] })).toEqual(
      [],
    )
  })
})

describe('nuevos', () => {
  it('no repite lo ya avisado', () => {
    const e = datos({ prs: [PR_ABIERTA] })
    expect(nuevos(e, new Set())).toHaveLength(1)
    expect(nuevos(e, new Set([e[0].id]))).toEqual([])
  })
})

describe('formatear', () => {
  it('el derecho de réplica va marcado como urgente y lo dice', () => {
    const [e] = datos({ issues: [ISSUE_REPLICA] })
    const a = formatear(e)
    expect(a.urgente).toBe(true)
    expect(a.texto).toMatch(/r[ée]plica/i)
    expect(a.texto).toContain('https://github.com/o/r/issues/7')
  })

  it('una PR no es urgente', () => {
    expect(formatear(datos({ prs: [PR_ABIERTA] })[0]).urgente).toBe(false)
  })

  // Un aviso sin enlace obliga a ir a buscarlo, y entonces se deja para luego.
  it('todo aviso lleva su enlace', () => {
    const todos = datos({
      prs: [PR_ABIERTA, PR_FUSIONADA],
      issues: [ISSUE_REPLICA],
      runs: [RUN({ conclusion: 'failure' })],
    })
    for (const e of todos) expect(formatear(e).texto).toContain('https://')
  })
})

describe('runEventosOnce', () => {
  const traer = async () => ({ prs: [PR_ABIERTA], issues: [ISSUE_REPLICA], runs: [] })

  it('manda un DM por administrador y recuerda lo enviado', async () => {
    const enviados: number[] = []
    const vistos = new Set<string>()
    const r = await runEventosOnce({
      admins: [1, 2],
      traer,
      sendDm: async (a) => void enviados.push(a),
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(r.consultado).toBe(true)
    expect(r.nuevos).toBe(2)
    expect(enviados).toEqual([1, 2])
    // Y a la segunda vuelta no repite.
    const r2 = await runEventosOnce({
      admins: [1],
      traer,
      sendDm: async () => {},
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(r2.nuevos).toBe(0)
  })

  // El defecto `r?.findings ?? []`: «no pude preguntar» no es «no hay nada».
  it('distingue no poder consultar GitHub de que no haya novedades', async () => {
    const r = await runEventosOnce({
      admins: [1],
      traer: async () => {
        throw new Error('502 desde GitHub')
      },
      sendDm: async () => {},
      yaVistos: new Set(),
      recordar: () => {},
    })
    expect(r.consultado).toBe(false)
    expect(r.error).toContain('502')
    expect(r.nuevos).toBe(0)
  })

  it('distingue «no hay administradores» de «no hay eventos»', async () => {
    const r = await runEventosOnce({
      admins: [],
      traer,
      sendDm: async () => {},
      yaVistos: new Set(),
      recordar: () => {},
    })
    expect(r.sinAdministradores).toBe(true)
    expect(r.nuevos).toBe(2)
    expect(r.enviados).toBe(0)
  })
})

/**
 * Hasta el 27-09-2026 se marcaba como visto TODO lo pendiente, saliera o no. Y
 * salía mal a menudo: el texto iba en Markdown de Telegram con los títulos de
 * GitHub a pelo, y una PR llamada «… (secret_token)» —un `_` sin cerrar— hacía
 * que Telegram rechazara el mensaje entero. El aviso se perdía y no volvía: el
 * comentario del código decía «sólo se marca como visto lo que de verdad salió»
 * y el código no lo hacía. El derecho de réplica, que tiene plazo, viaja por aquí.
 */
describe('runEventosOnce — sólo se da por visto lo que llegó', () => {
  const traer = async () => ({ prs: [PR_ABIERTA], issues: [ISSUE_REPLICA], runs: [] })

  it('si no le llega a ningún administrador, no lo marca: se reintentará', async () => {
    const vistos = new Set<string>()
    const r = await runEventosOnce({
      admins: [1, 2],
      traer,
      sendDm: async () => {
        throw new Error("400: Bad Request: can't parse entities")
      },
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(r.nuevos).toBe(2)
    expect(r.enviados).toBe(0)
    expect([...vistos]).toEqual([])
  })

  it('si le llega al menos a uno, sí (el control)', async () => {
    const vistos = new Set<string>()
    await runEventosOnce({
      admins: [1, 2],
      traer,
      sendDm: async (a) => {
        if (a === 1) throw new Error('403: bot was blocked by the user')
      },
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(vistos.size).toBe(2)
  })

  // Sin nadie a quien mandarlo se guarda igual: si no, el día que se configuren
  // los administradores recibirían de golpe todo lo acumulado. El cron lo avisa
  // en el log con `sinAdministradores`.
  it('sin administradores se da por visto igual, para no acumular un aluvión', async () => {
    const vistos = new Set<string>()
    const r = await runEventosOnce({
      admins: [],
      traer,
      sendDm: async () => {},
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(r.sinAdministradores).toBe(true)
    expect(vistos.size).toBe(2)
  })
})

describe('formato — HTML, con lo que viene de GitHub escapado', () => {
  it('escapa el título: un «<», un «&» o un «_» no tumban el mensaje', () => {
    const [e] = datos({
      prs: [{ ...PR_ABIERTA, title: 'El webhook exige el secret_token & <b>nada</b> más' }],
    })
    const t = formatear(e).texto
    expect(t).toContain('El webhook exige el secret_token &amp; &lt;b&gt;nada&lt;/b&gt; más')
    expect(t).not.toContain('<b>nada</b>')
  })

  it('la cabecera va en negrita HTML y el mensaje no usa Markdown', async () => {
    const mensajes: string[] = []
    await runEventosOnce({
      admins: [1],
      traer: async () => ({ prs: [PR_ABIERTA], issues: [], runs: [] }),
      sendDm: async (_a, t) => void mensajes.push(t),
      yaVistos: new Set(),
      recordar: () => {},
    })
    expect(mensajes[0]).toContain('<b>Repositorio</b>')
    expect(mensajes[0]).not.toContain('*Repositorio*')
  })
})

describe('un lote que no cabe en un mensaje se parte', () => {
  const muchas = Array.from({ length: 60 }, (_, i) => ({
    ...PR_ABIERTA,
    number: 100 + i,
    title: `${'Una PR con un título largo '.repeat(6)}${i}`,
    html_url: `https://github.com/o/r/pull/${100 + i}`,
  }))
  const traer = async () => ({ prs: muchas, issues: [], runs: [] })

  it('ningún mensaje pasa del límite de Telegram, y salen todos los eventos', async () => {
    const mensajes: string[] = []
    const vistos = new Set<string>()
    await runEventosOnce({
      admins: [1],
      traer,
      sendDm: async (_a, t) => void mensajes.push(t),
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(MAX_MENSAJE).toBeLessThanOrEqual(4096)
    expect(mensajes.length, 'no hizo falta partir: la prueba no mide nada').toBeGreaterThan(1)
    for (const m of mensajes) expect(m.length).toBeLessThanOrEqual(MAX_MENSAJE)
    expect(vistos.size).toBe(60)
  })

  it('un trozo que no sale no marca sus eventos, y los demás sí', async () => {
    let n = 0
    const vistos = new Set<string>()
    await runEventosOnce({
      admins: [1],
      traer,
      sendDm: async () => {
        n++
        if (n === 2) throw new Error('500')
      },
      yaVistos: vistos,
      recordar: (id) => vistos.add(id),
    })
    expect(vistos.size).toBeGreaterThan(0)
    expect(vistos.size).toBeLessThan(60)
  })
})
