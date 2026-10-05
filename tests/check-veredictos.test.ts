import { describe, it, expect, vi } from 'vitest'
import { cotejarVeredicto, cotejarConBase, ESTADOS_VEREDICTO } from '../scripts/check-veredictos'
import type { Overlay, VerifiedItem } from '../src/scraper/verified-merge'

/**
 * Cinco desenlaces, y el reparto es lo que hace la guarda usable.
 *
 * Con las 76 filas de una pasada retirada y una rotura nueva en el mismo saco,
 * esto saldría rojo todas las noches hasta la fase 6 — y nadie miraría el día
 * que importara. Es la lección de `check:verified-compose`, y antes la de
 * `check:eficiencia-findings`.
 */
const it_ = (verdict: string, checkedAgainst: string[], evidence = 1) => ({
  claim: { id: `c-${verdict}-${checkedAgainst.join('+') || 'vacio'}` },
  verification: {
    verdict,
    checkedAgainst,
    evidence: Array.from({ length: evidence }, () => ({ kind: 'tender', ref: 'r', snippet: 's' })),
  },
})

describe('cotejarVeredicto · qué sostiene un veredicto ya publicado', () => {
  it('un veredicto débil no tiene nada que sostener', () => {
    expect(cotejarVeredicto(it_('sin-datos', [])).estado).toBe('fundado')
  })

  it('fundado: nombra corpus y trae evidencia', () => {
    expect(cotejarVeredicto(it_('verificado', ['tenders'])).estado).toBe('fundado')
  })

  it('curado: entró por la vía del curador, que sólo baja, y eso pasa', () => {
    expect(cotejarVeredicto(it_('parcial', ['curator-downgrade'])).estado).toBe('curado')
  })

  it('el detalle dice quién decidió la bajada, según el sello y no según la marca', () => {
    // 47 de las 69 bajadas de curador no las firma una persona (30-09-2026): la
    // revisión de oro con un modelo, sesiones de Claude, una firma «sergei».
    const bajada = (downgradedBy?: string) => ({
      claim: { id: `c-bajada-${downgradedBy ?? 'sin-sello'}` },
      verification: {
        verdict: 'parcial',
        checkedAgainst: ['curator-downgrade'],
        evidence: [{ kind: 'tender', ref: 'r', snippet: 's' }],
        ...(downgradedBy ? { source: 'curator-downgrade', downgradedBy } : {}),
      },
    })
    expect(cotejarVeredicto(bajada('persona')).detalle).toMatch(/^lo bajó una persona/)
    const automatica = cotejarVeredicto(bajada('automatica')).detalle
    expect(automatica).toMatch(/^lo bajó una revisión automática/)
    const sinSello = cotejarVeredicto(bajada()).detalle
    expect(sinSello).toMatch(/no consta quién/)
    expect(sinSello).not.toMatch(/persona|automática/)
  })

  it('procedencia-retirada: se apoya en una pasada que ya no corre', () => {
    const f = cotejarVeredicto(it_('parcial', ['llm-second-pass']))
    expect(f.estado).toBe('procedencia-retirada')
    expect(f.detalle).toMatch(/ya no está en la tubería/i)
  })

  it('sin-corpus: pasada VIVA y nada que lo sostenga — esto sí es de hoy', () => {
    expect(cotejarVeredicto(it_('verificado', ['nli-grounding'])).estado).toBe('sin-corpus')
    expect(cotejarVeredicto(it_('parcial', [])).estado).toBe('sin-corpus')
  })

  it('sin evidencia tampoco se sostiene, aunque nombre corpus', () => {
    expect(cotejarVeredicto(it_('verificado', ['tenders'], 0)).estado).toBe('sin-corpus')
  })

  it('el curador manda sobre la pasada retirada cuando están los dos', () => {
    // Si una fila lleva las dos marcas, responde la persona: es la vía
    // sancionada y no debe caer en la cola de re-fundamentación.
    expect(cotejarVeredicto(it_('parcial', ['llm-second-pass', 'curator-downgrade'])).estado).toBe(
      'curado',
    )
  })

  it('el enum se exporta, no se recita', () => {
    expect([...ESTADOS_VEREDICTO].sort()).toEqual(
      [
        'curado',
        'fundado',
        'procedencia-retirada',
        'sin-corpus',
        'sin-firma',
        'sin-publicar',
        'subido',
      ].sort(),
    )
  })
})

/**
 * La subida firmada (docs/superpowers/specs/2026-10-04-subida-firmada-design.md):
 * una persona sube un veredicto con su nombre, el registro que lo sostiene y un
 * resumen que escribe ella. La guarda tiene que reconocer esa firma —su cabecera
 * lo pedía desde #226— y no confundir una subida sin ella con una fundada.
 */
describe('cotejarVeredicto · la subida firmada', () => {
  const PERSONA = 'María de la Fuente Llorens'
  const subida = (extra: Record<string, unknown> = {}) => ({
    claim: { id: 'c-subida' },
    verification: {
      verdict: 'parcial',
      checkedAgainst: ['tenders'],
      evidence: [{ kind: 'tender', ref: 'https://contrataciondelestado.es/x', snippet: 's' }],
      derivedBy: ['curator-upgrade'],
      source: 'curator-upgrade',
      raisedBy: PERSONA,
      ...extra,
    },
  })

  it('subido: la subió una persona, nombra corpus y trae evidencia — y no imprime su nombre en el parte', () => {
    const f = cotejarVeredicto(subida())
    expect(f.estado).toBe('subido')
    expect(f.detalle).toMatch(/persona/)
    expect(f.detalle).not.toContain(PERSONA)
  })

  it('sin-firma: dice ser una subida, por su canal o por su pasada, y no la firma una persona', () => {
    expect(cotejarVeredicto(subida({ raisedBy: undefined })).estado).toBe('sin-firma')
    expect(cotejarVeredicto(subida({ raisedBy: 'civicpulse-curator' })).estado).toBe('sin-firma')
    expect(cotejarVeredicto(subida({ source: undefined, raisedBy: undefined })).estado).toBe(
      'sin-firma',
    )
  })

  it('una subida sin corpus o sin evidencia no se sostiene, la firme quien la firme', () => {
    expect(cotejarVeredicto(subida({ checkedAgainst: [] })).estado).toBe('sin-corpus')
    expect(cotejarVeredicto(subida({ evidence: [] })).estado).toBe('sin-corpus')
  })
})

/**
 * El segundo cotejo: lo que el overlay publica, contra la base de hoy.
 *
 * `curado` sale 0 porque «bajar un veredicto nunca refuerza una afirmación». Eso
 * vale mientras la entrada baje respecto de la base; si la base se movió por
 * debajo, la entrada ya no baja nada y lo publicado queda por encima de lo que
 * encuentra el verificador. El 04-10-2026 le pasaba a 1sqj7is-053-pro-68944b.
 */
describe('cotejarConBase · lo que el overlay publica, contra la base de hoy', () => {
  const SELLO = '2026-10-04T07:37:32.197Z'
  const MOTIVO = 'el contrato muestra que el mecanismo se usa, no lo que se afirma de él'
  const fila = (id: string, verdict: string): VerifiedItem =>
    ({
      claim: { id },
      verification: { claimId: id, verdict, summary: 's', evidence: [], checkedAgainst: [] },
    }) as unknown as VerifiedItem
  const entrada = (id: string, verdict: string, source: string) => ({
    verification: { claimId: id, verdict, summary: MOTIVO, evidence: [], checkedAgainst: [] },
    source,
    reason: MOTIVO,
    appliedAt: '2026-06-24T07:18:12.464Z',
  })
  const overlay = {
    version: 1,
    generatedAt: SELLO,
    entries: {
      'encima-servida': entrada('encima-servida', 'parcial', 'curator-downgrade'),
      'encima-oculta': entrada('encima-oculta', 'parcial', 'curator-downgrade'),
      baja: entrada('baja', 'parcial', 'curator-downgrade'),
      igual: entrada('igual', 'sin-datos', 'verdict-engine'),
      fantasma: entrada('fantasma', 'sin-datos', 'verdict-engine'),
    },
  } as unknown as Overlay
  const base = {
    generatedAt: SELLO,
    items: [
      fila('encima-servida', 'sin-datos'),
      fila('encima-oculta', 'sin-datos'),
      fila('baja', 'verificado'),
      fila('igual', 'sin-datos'),
    ],
  }

  it('nombra cada entrada por encima de su base y cómo se sirve, también la que no se sirve', () => {
    const c = cotejarConBase({
      base,
      overlay,
      servidas: new Map([['encima-servida', 'shown']]),
      publicadoGeneratedAt: SELLO,
    })
    expect(c.estado).toBe('cotejado')
    expect(c.porEncima).toEqual([
      {
        id: 'encima-servida',
        base: 'sin-datos',
        publica: 'parcial',
        source: 'curator-downgrade',
        servida: 'shown',
      },
      {
        id: 'encima-oculta',
        base: 'sin-datos',
        publica: 'parcial',
        source: 'curator-downgrade',
        servida: 'no-servida',
      },
    ])
  })

  it('cuenta lo que cotejó, y la que no tiene claim en la base va aparte y nombrada', () => {
    const c = cotejarConBase({ base, overlay, servidas: new Map(), publicadoGeneratedAt: SELLO })
    expect(c.sinClaim).toEqual(['fantasma'])
    expect({ entradas: c.entradas, bajan: c.bajan, iguales: c.iguales }).toEqual({
      entradas: 5,
      bajan: 1,
      iguales: 1,
    })
    expect({ base: c.baseGeneratedAt, publicado: c.publicadoGeneratedAt }).toEqual({
      base: SELLO,
      publicado: SELLO,
    })
  })

  it('una subida firmada por encima de su base se lista aparte: la decidió una persona', () => {
    const PERSONA = 'María de la Fuente Llorens'
    const conSubida = {
      ...overlay,
      entries: {
        ...overlay.entries,
        subida: {
          ...entrada('subida', 'parcial', 'curator-upgrade'),
          editor: PERSONA,
          desde: 'sin-datos',
        },
      },
    } as unknown as Overlay
    const c = cotejarConBase({
      base: { ...base, items: [...base.items, fila('subida', 'sin-datos')] },
      overlay: conSubida,
      servidas: new Map([['subida', 'shown']]),
      publicadoGeneratedAt: SELLO,
    })
    expect(c.porEncima.map((p) => p.id)).not.toContain('subida')
    expect(c.subidasFirmadas).toEqual([
      {
        id: 'subida',
        base: 'sin-datos',
        publica: 'parcial',
        source: 'curator-upgrade',
        servida: 'shown',
      },
    ])
    // Y entra en la cuenta de lo cotejado: no es «no la miré».
    expect(c.entradas).toBe(6)
  })

  it('sin base en disco no coteja nada y lo dice: SALTADO, nunca «0 por encima»', () => {
    const c = cotejarConBase({
      base: null,
      overlay,
      servidas: new Map([['encima-servida', 'shown']]),
      publicadoGeneratedAt: SELLO,
    })
    expect(c.estado).toBe('sin-base')
    expect(c.entradas).toBe(0)
    expect(c.porEncima).toEqual([])
    expect(c.motivo).toMatch(/base/)
  })
})

describe('el módulo se importa sin comprobar nada', () => {
  // Las pruebas importan `cotejarVeredicto`. Si `main()` corriera al importar,
  // leería los trozos reales y, con una entrada por encima de su base en disco,
  // su `process.exit(1)` tumbaría al trabajador de vitest.
  it('importarlo no escribe el parte de la comprobación', async () => {
    vi.resetModules()
    const escrito = vi.spyOn(process.stdout, 'write')
    try {
      await import('../scripts/check-veredictos')
      const parte = escrito.mock.calls
        .map(([t]) => String(t))
        .filter((t) => t.startsWith('[check-veredictos]'))
      expect(parte).toEqual([])
    } finally {
      escrito.mockRestore()
    }
  })
})
