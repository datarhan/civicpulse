import { describe, it, expect } from 'vitest'
import {
  archiveTargets,
  applyArchiveUrls,
  archiveReportSources,
  makeArchiveOne,
  redirectTargetStandsIn,
} from '../scripts/journalist-archive-sources'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type SourceCitation,
} from '../src/scraper/journalist'

/**
 * /laboratorio/agentes prometía «las fuentes citadas se archivan en Wayback»
 * y ninguna de las 380 fuentes publicadas llevaba archiveUrl: el fetch del
 * agente sólo consulta si existe una copia, nunca la guarda. Este CLI hace
 * verdad la promesa informe a informe y demuestra lo que hizo: cada fuente
 * termina en existente / archivada / fallida, y las llamadas a Save Page Now
 * van espaciadas porque el Wayback anónimo admite unas seis por minuto.
 */
const src = (over: Partial<SourceCitation> & { id: string }): SourceCitation => ({
  kind: 'web',
  title: `Fuente ${over.id}`,
  retrievedAt: '2026-07-31T10:00:00.000Z',
  trust: 'medium',
  url: `https://example.org/${over.id}`,
  ...over,
})

function report(sources: SourceCitation[]): JournalistReport {
  return {
    id: 'r-sample-2026-07-31',
    assignmentId: 'a-sample-bio',
    generatedAt: '2026-07-31T09:00:00.000Z',
    agentVersion: 'journalist-v1',
    promptVersion: 'journalist-draft-v1',
    budgetTokens: 0,
    costUSD: 0,
    sections: [
      {
        kind: 'narrative',
        payload: {
          heading: 'Trayectoria política',
          bodyMarkdown:
            'El sujeto preside el pleno municipal desde 2023. Su grupo ostenta once escaños en la corporación actual.',
          sourceIds: sources.map((s) => s.id),
        },
      },
    ],
    sources,
    warnings: [],
    legalSensitivity: 'low',
    promotedBy: 'curator-0',
    promotedAt: '2026-07-31T10:00:00.000Z',
    corrections: [],
    response: null,
  }
}

const SOURCES: SourceCitation[] = [
  src({ id: 'src-web' }),
  src({ id: 'src-doc', kind: 'official-doc', trust: 'high', url: 'https://bop.dival.es/x.pdf' }),
  src({
    id: 'src-boe',
    kind: 'boe',
    trust: 'high',
    url: 'https://www.boe.es/y',
    archiveUrl: 'https://web.archive.org/web/20260101000000/https://www.boe.es/y',
  }),
  src({
    id: 'src-local',
    kind: 'local-snapshot',
    trust: 'high',
    url: undefined,
    localPath: 'public/data/officials.json',
  }),
]

describe('archiveTargets', () => {
  it('sólo las fuentes con URL de web/official-doc/boe que aún no tienen copia', () => {
    expect(archiveTargets(report(SOURCES)).map((s) => s.id)).toEqual(['src-web', 'src-doc'])
  })
})

describe('applyArchiveUrls', () => {
  it('pone archiveUrl sólo en los ids dados, ignora los desconocidos y no toca la entrada', () => {
    const r = report(SOURCES)
    const before = JSON.parse(JSON.stringify(r))
    const out = applyArchiveUrls(r, [
      {
        id: 'src-web',
        archiveUrl: 'https://web.archive.org/web/20260906000000/https://example.org/src-web',
      },
      { id: 'src-nope', archiveUrl: 'https://web.archive.org/web/1/x' },
    ])
    expect(out.sources.find((s) => s.id === 'src-web')?.archiveUrl).toMatch(/web\.archive\.org/)
    expect(out.sources.find((s) => s.id === 'src-doc')?.archiveUrl).toBeUndefined()
    expect(out.sources.find((s) => s.id === 'src-boe')?.archiveUrl).toBe(SOURCES[2].archiveUrl)
    expect(r).toEqual(before)
    // sigue siendo un informe publicable
    const snap = {
      version: '1.0',
      generatedAt: '2026-09-06T00:00:00.000Z',
      legalNotice:
        'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [out],
    }
    expect(() => validateReportsSnapshot(JSON.stringify(snap))).not.toThrow()
  })
})

describe('archiveReportSources', () => {
  const saved = (url: string) => ({
    archiveUrl: `https://web.archive.org/web/20260906000000/${url}`,
    via: 'saved' as const,
  })
  const existing = (url: string) => ({
    archiveUrl: `https://web.archive.org/web/20250101000000/${url}`,
    via: 'existing' as const,
  })

  it('duerme entre dos guardados pero no tras una copia ya existente', async () => {
    const log: string[] = []
    const r = await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => {
        log.push(`archive ${url}`)
        return url.includes('src-web') ? existing(url) : saved(url)
      },
      sleep: async (ms) => {
        log.push(`sleep ${ms}`)
      },
      minGapMs: 10_000,
    })
    expect(log).toEqual([
      'archive https://example.org/src-web',
      'archive https://bop.dival.es/x.pdf',
    ])
    expect(r.outcomes.map((o) => o.status)).toEqual(['existing', 'archived'])
    expect(r.report.sources.find((s) => s.id === 'src-doc')?.archiveUrl).toMatch(/20260906/)
  })

  it('espaciado: dos guardados seguidos llevan un sleep entre medias', async () => {
    const log: string[] = []
    await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => {
        log.push(`archive ${url}`)
        return saved(url)
      },
      sleep: async (ms) => {
        log.push(`sleep ${ms}`)
      },
      minGapMs: 10_000,
    })
    expect(log).toEqual([
      'archive https://example.org/src-web',
      'sleep 10000',
      'archive https://bop.dival.es/x.pdf',
    ])
  })

  it('un fallo se anota y no detiene a los demás', async () => {
    const r = await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => (url.includes('src-web') ? { error: 'HTTP 429' } : saved(url)),
      sleep: async () => {},
      minGapMs: 0,
    })
    expect(r.outcomes).toEqual([
      { id: 'src-web', url: 'https://example.org/src-web', status: 'failed', detail: 'HTTP 429' },
      {
        id: 'src-doc',
        url: 'https://bop.dival.es/x.pdf',
        status: 'archived',
        detail: 'https://web.archive.org/web/20260906000000/https://bop.dival.es/x.pdf',
      },
    ])
    expect(r.report.sources.find((s) => s.id === 'src-web')?.archiveUrl).toBeUndefined()
  })

  it('respeta --max y no muta el informe de entrada', async () => {
    const input = report(SOURCES)
    const before = JSON.parse(JSON.stringify(input))
    const r = await archiveReportSources(input, {
      archiveOne: async (url) => saved(url),
      sleep: async () => {},
      minGapMs: 0,
      max: 1,
    })
    expect(r.outcomes).toHaveLength(1)
    expect(input).toEqual(before)
  })
})

/**
 * Lo que pasó el 20-09-2026: Wayback contestaba 429 a TODO. La consulta de
 * disponibilidad fallaba, el CLI la leía como «sin copia» y gastaba un guardado
 * por fuente — 23 en una pasada, 23 en la siguiente, todos rechazados, y cada
 * rechazo alargaba el bloqueo. Dos reglas:
 *   1. si no se pudo MIRAR, no se guarda a ciegas;
 *   2. tras el primer 429 de Save Page Now, el resto de guardados de esa pasada
 *      no se intenta, y se cuenta aparte de los fallos (regla 2 de
 *      DATA_INTEGRITY: «nunca intentado» no es «falló»).
 */
const encontrada = (url: string) => ({
  ok: true,
  lookup: 'found' as const,
  archivedUrl: `https://web.archive.org/web/20250101000000/${url}`,
  timestamp: '20250101000000',
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: null,
})
const ninguna = () => ({
  ok: false,
  lookup: 'none' as const,
  archivedUrl: null,
  timestamp: null,
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: 'no snapshot available',
})
const noSePudoMirar = () => ({
  ok: false,
  lookup: 'failed' as const,
  archivedUrl: null,
  timestamp: null,
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: 'HTTP 429',
  cdxError: 'HTTP 504',
})
const guardada = (url: string) => ({
  ok: true,
  archivedUrl: `https://web.archive.org/web/20260920000000/${url}`,
  timestamp: '20260920000000',
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: null,
})
const rechazada = (codigo: number) => ({
  ok: false,
  archivedUrl: null,
  timestamp: null,
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: `HTTP ${codigo}`,
})

describe('makeArchiveOne — consultar antes de guardar, y no guardar a ciegas', () => {
  it('una copia existente no gasta un guardado', async () => {
    let guardados = 0
    const one = makeArchiveOne({
      find: async (u) => encontrada(u),
      save: async (u) => (guardados++, guardada(u)),
    })
    const r = await one('https://example.org/a', { allowSave: true })
    expect(r).toEqual({
      archiveUrl: 'https://web.archive.org/web/20250101000000/https://example.org/a',
      via: 'existing',
    })
    expect(guardados).toBe(0)
  })

  it('«sin copia» sí guarda', async () => {
    const one = makeArchiveOne({ find: async () => ninguna(), save: async (u) => guardada(u) })
    const r = await one('https://example.org/b', { allowSave: true })
    expect(r).toEqual({
      archiveUrl: 'https://web.archive.org/web/20260920000000/https://example.org/b',
      via: 'saved',
    })
  })

  it('si no se pudo MIRAR, no guarda a ciegas: falla diciendo por qué', async () => {
    let guardados = 0
    const one = makeArchiveOne({
      find: async () => noSePudoMirar(),
      save: async (u) => (guardados++, guardada(u)),
    })
    const r = await one('https://example.org/c', { allowSave: true })
    expect(guardados).toBe(0)
    expect(r).toEqual({ error: 'consulta fallida: HTTP 429 · CDX: HTTP 504' })
  })

  it('un 429 del guardado se marca como límite de peticiones', async () => {
    const one = makeArchiveOne({ find: async () => ninguna(), save: async () => rechazada(429) })
    expect(await one('https://example.org/d', { allowSave: true })).toEqual({
      error: 'HTTP 429',
      rateLimited: true,
    })
  })

  it('un 500 del guardado es un fallo corriente, no un límite', async () => {
    const one = makeArchiveOne({ find: async () => ninguna(), save: async () => rechazada(500) })
    expect(await one('https://example.org/e', { allowSave: true })).toEqual({ error: 'HTTP 500' })
  })

  it('con los guardados cerrados sigue consultando, y «sin copia» queda sin intentar', async () => {
    let guardados = 0
    const one = makeArchiveOne({
      find: async (u) => (u.endsWith('/f') ? encontrada(u) : ninguna()),
      save: async (u) => (guardados++, guardada(u)),
    })
    expect(await one('https://example.org/f', { allowSave: false })).toEqual({
      archiveUrl: 'https://web.archive.org/web/20250101000000/https://example.org/f',
      via: 'existing',
    })
    expect(await one('https://example.org/g', { allowSave: false })).toEqual({
      notAttempted: 'Wayback limitó los guardados (429) en esta pasada',
    })
    expect(guardados).toBe(0)
  })
})

describe('archiveReportSources — tras un 429 del guardado deja de guardar', () => {
  const TRES: SourceCitation[] = [src({ id: 'src-1' }), src({ id: 'src-2' }), src({ id: 'src-3' })]

  it('el primero agota el límite; los demás se consultan pero no se guardan, y se cuentan aparte', async () => {
    const permisos: boolean[] = []
    const r = await archiveReportSources(report(TRES), {
      archiveOne: async (url, o) => {
        permisos.push(o.allowSave)
        if (url.endsWith('src-1')) return { error: 'HTTP 429', rateLimited: true }
        if (url.endsWith('src-2'))
          return {
            archiveUrl: `https://web.archive.org/web/20250101000000/${url}`,
            via: 'existing',
          }
        return { notAttempted: 'Wayback limitó los guardados (429) en esta pasada' }
      },
      sleep: async () => {},
      minGapMs: 0,
    })
    expect(permisos).toEqual([true, false, false])
    expect(r.outcomes.map((o) => o.status)).toEqual(['failed', 'existing', 'not-attempted'])
    expect(r.outcomes[2].detail).toBe('Wayback limitó los guardados (429) en esta pasada')
    expect(r.report.sources.find((s) => s.id === 'src-2')?.archiveUrl).toBeDefined()
    expect(r.report.sources.find((s) => s.id === 'src-3')?.archiveUrl).toBeUndefined()
  })

  it('un fallo que no es de límite no cierra los guardados', async () => {
    const permisos: boolean[] = []
    await archiveReportSources(report(TRES), {
      archiveOne: async (_url, o) => {
        permisos.push(o.allowSave)
        return { error: 'HTTP 500' }
      },
      sleep: async () => {},
      minGapMs: 0,
    })
    expect(permisos).toEqual([true, true, true])
  })
})

/**
 * La copia puede estar bajo OTRA URL: aquella a la que redirige la citada.
 *
 * El 21-09-2026 quedaban dos fuentes de la biografía del alcalde «sin copia»
 * tras cinco pasadas y ocho guardados. Una de ellas la tenía desde la primera
 * mañana: el enlace citado de El Periódico de Aquí
 * (`/epda-noticias/<slug>/194308`) contesta 301 a su URL canónica
 * (`/<slug>_194308_102.html`), Save Page Now siguió la redirección y archivó la
 * canónica — y todas las consultas preguntaban por la citada, que para Wayback
 * es otra clave. El par de abajo es el real.
 *
 * Como el resolvedor de lugares: mejor no encontrar que enlazar mal. Un CMS que
 * manda un artículo muerto «hacia arriba» (a la portada, a su sección) también
 * redirige, y esa copia no es la del artículo.
 */
const EPDA_CITADA =
  'https://www.elperiodicodeaqui.com/epda-noticias/robert-raga-nuevo-presidente-del-consorcio-valencia-interior/194308'
const EPDA_CANONICA =
  'https://www.elperiodicodeaqui.com/robert-raga-nuevo-presidente-del-consorcio-valencia-interior_194308_102.html'

describe('redirectTargetStandsIn — ¿vale el destino de la redirección por la URL citada?', () => {
  it('el par real: la citada redirige a su URL canónica → sí', () => {
    expect(redirectTargetStandsIn(EPDA_CITADA, EPDA_CANONICA)).toBe(true)
  })

  it('la misma URL con otro esquema, www o barra final → no: Wayback ya las trata como una', () => {
    const u = 'https://www.example.org/noticia/123'
    expect(redirectTargetStandsIn(u, 'http://example.org/noticia/123/')).toBe(false)
    expect(redirectTargetStandsIn(u, u)).toBe(false)
  })

  it('a la portada → no: es el «no encontrado» de un CMS', () => {
    expect(redirectTargetStandsIn(EPDA_CITADA, 'https://www.elperiodicodeaqui.com/')).toBe(false)
  })

  it('a la sección de la que cuelga la citada → no', () => {
    expect(
      redirectTargetStandsIn(
        'https://www.levante-emv.com/comunitat-valenciana/camp-de-turia/2018/06/26/raga-declara-11892195.html',
        'https://www.levante-emv.com/comunitat-valenciana/camp-de-turia/',
      ),
    ).toBe(false)
  })

  it('a otro sitio → no', () => {
    expect(redirectTargetStandsIn(EPDA_CITADA, 'https://dominio-aparcado.example/')).toBe(false)
    expect(
      redirectTargetStandsIn(EPDA_CITADA, EPDA_CANONICA.replace('elperiodicodeaqui', 'otro')),
    ).toBe(false)
  })

  it('a una página de error, de acceso o de suscripción → no', () => {
    for (const destino of [
      'https://www.example.org/404',
      'https://www.example.org/error/no-encontrado',
      'https://www.example.org/login?next=/noticia/123',
      'https://www.example.org/suscripcion/muro',
    ]) {
      expect(redirectTargetStandsIn('https://www.example.org/noticia/123', destino)).toBe(false)
    }
  })

  it('algo que no es una URL → no', () => {
    expect(redirectTargetStandsIn(EPDA_CITADA, 'no es una url')).toBe(false)
  })
})

describe('makeArchiveOne — la copia puede estar bajo la URL a la que redirige la citada', () => {
  /** `find` contesta «ninguna» para la citada y lo que se le diga para la canónica. */
  const montaje = (
    deLaCanonica: () => ReturnType<typeof ninguna> | ReturnType<typeof encontrada>,
  ) => {
    const consultadas: string[] = []
    const cuenta = { guardados: 0 }
    const one = makeArchiveOne({
      find: async (u) => {
        consultadas.push(u)
        return u === EPDA_CANONICA ? deLaCanonica() : ninguna()
      },
      save: async (u) => (cuenta.guardados++, guardada(u)),
      resolve: async () => EPDA_CANONICA,
    })
    return { one, consultadas, cuenta }
  }

  it('«ninguna» para la citada, copia bajo la canónica → existing, sin gastar un guardado, y lo dice', async () => {
    const m = montaje(() => encontrada(EPDA_CANONICA))
    const r = await m.one(EPDA_CITADA, { allowSave: true })
    expect(m.consultadas).toEqual([EPDA_CITADA, EPDA_CANONICA])
    expect(m.cuenta.guardados).toBe(0)
    expect(r).toEqual({
      archiveUrl: `https://web.archive.org/web/20250101000000/${EPDA_CANONICA}`,
      via: 'existing',
      redirectedTo: EPDA_CANONICA,
    })
  })

  it('tampoco hay copia bajo la canónica → se guarda la CITADA, como siempre', async () => {
    const m = montaje(() => ninguna())
    const r = await m.one(EPDA_CITADA, { allowSave: true })
    expect(m.cuenta.guardados).toBe(1)
    expect(r).toEqual({
      archiveUrl: `https://web.archive.org/web/20260920000000/${EPDA_CITADA}`,
      via: 'saved',
    })
  })

  it('si no se pudo MIRAR la canónica, no se guarda a ciegas', async () => {
    const m = montaje(() => noSePudoMirar())
    const r = await m.one(EPDA_CITADA, { allowSave: true })
    expect(m.cuenta.guardados).toBe(0)
    expect(r).toEqual({
      error: `consulta fallida (destino de la redirección, ${EPDA_CANONICA}): HTTP 429 · CDX: HTTP 504`,
    })
  })

  it('un destino que no vale por la citada ni se consulta', async () => {
    const consultadas: string[] = []
    const one = makeArchiveOne({
      find: async (u) => (consultadas.push(u), ninguna()),
      save: async (u) => guardada(u),
      resolve: async () => 'https://www.elperiodicodeaqui.com/',
    })
    await one(EPDA_CITADA, { allowSave: true })
    expect(consultadas).toEqual([EPDA_CITADA])
  })

  it('una URL que no redirige (resolve → null) sigue el camino de siempre', async () => {
    const consultadas: string[] = []
    const one = makeArchiveOne({
      find: async (u) => (consultadas.push(u), ninguna()),
      save: async (u) => guardada(u),
      resolve: async () => null,
    })
    const r = await one(EPDA_CITADA, { allowSave: true })
    expect(consultadas).toEqual([EPDA_CITADA])
    expect(r).toEqual({
      archiveUrl: `https://web.archive.org/web/20260920000000/${EPDA_CITADA}`,
      via: 'saved',
    })
  })

  it('con copia de la citada no se resuelve nada: es una petición al medio que sobra', async () => {
    let resueltas = 0
    const one = makeArchiveOne({
      find: async (u) => encontrada(u),
      save: async (u) => guardada(u),
      resolve: async () => (resueltas++, EPDA_CANONICA),
    })
    await one(EPDA_CITADA, { allowSave: true })
    expect(resueltas).toBe(0)
  })
})

describe('archiveReportSources — una copia hallada bajo el destino de la redirección lo dice en el parte', () => {
  it('el detalle nombra la URL de la que es copia', async () => {
    const r = await archiveReportSources(report([src({ id: 'src-1', url: EPDA_CITADA })]), {
      archiveOne: async () => ({
        archiveUrl: `https://web.archive.org/web/20260920063817/${EPDA_CANONICA}`,
        via: 'existing',
        redirectedTo: EPDA_CANONICA,
      }),
      sleep: async () => {},
      minGapMs: 0,
    })
    expect(r.outcomes[0].status).toBe('existing')
    expect(r.outcomes[0].detail).toBe(
      `https://web.archive.org/web/20260920063817/${EPDA_CANONICA} (copia de ${EPDA_CANONICA}, adonde redirige la citada)`,
    )
    expect(r.report.sources[0].archiveUrl).toBe(
      `https://web.archive.org/web/20260920063817/${EPDA_CANONICA}`,
    )
  })
})
