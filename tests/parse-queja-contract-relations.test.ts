import { describe, it, expect } from 'vitest'
import {
  placeSignal,
  departmentSignal,
  temporalModifier,
  scoreRelation,
  buildRelations,
} from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'
import { normalizeQueja, buildRelContracts } from '../scripts/scrape-queja-contract-relations'

const q = (o: Partial<RelQueja> = {}): RelQueja => ({
  id: 'Q-1',
  serviceCode: 'via_publica',
  department: 'movilidad',
  placeSlug: 'valencia-la-vella',
  description: '',
  createdAt: '2025-01-01',
  ...o,
})
const c = (o: Partial<RelContract> = {}): RelContract => ({
  id: 'c1',
  permalink: 'p',
  title: 't',
  department: 'movilidad',
  cpvs: [],
  places: [],
  zones: [],
  awardDate: '2025-03-01',
  amount: 1,
  assignee: null,
  expediente: null,
  ...o,
})

describe('placeSignal', () => {
  it('matches an exact situated place (diacritics/ca-es folded)', () => {
    expect(
      placeSignal(q({ placeSlug: 'valencia-la-vella' }), c({ places: ['valència-la-vella'] })),
    ).toEqual({ granularity: 'exact', slug: 'valencia-la-vella' })
  })
  it('matches a barrio (zone) when the exact place does not', () => {
    expect(
      placeSignal(q({ placeSlug: 'barri-masia' }), c({ places: ['x'], zones: ['barri-masia'] })),
    ).toEqual({ granularity: 'barrio', slug: 'barri-masia' })
  })
  it('returns null when the queja has no place', () => {
    expect(placeSignal(q({ placeSlug: null }), c({ places: ['valencia-la-vella'] }))).toBeNull()
  })
  it('returns null when nothing co-locates', () => {
    expect(placeSignal(q({ placeSlug: 'a' }), c({ places: ['b'], zones: ['c'] }))).toBeNull()
  })
})

describe('departmentSignal', () => {
  it('matches on canonical department equality', () => {
    expect(
      departmentSignal(q({ department: 'urbanismo' }), c({ department: 'urbanismo' })),
    ).toEqual({ slug: 'urbanismo' })
  })
  it('matches on CPV theme even when departments differ/null', () => {
    // via_publica → construction div 45; contract carries a paving CPV
    expect(
      departmentSignal(
        q({ serviceCode: 'via_publica', department: null }),
        c({ department: null, cpvs: ['45233222'] }),
      ),
    ).toEqual({ slug: 'movilidad' })
  })
  it('returns null when neither dept nor theme align', () => {
    expect(
      departmentSignal(
        q({ serviceCode: 'cultura', department: 'cultura' }),
        c({ department: 'medio-ambiente', cpvs: ['90000000'] }),
      ),
    ).toBeNull()
  })
})

describe('temporalModifier', () => {
  it('fires for an award within +18 months after the queja', () => {
    expect(
      temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2025-05-01' }))?.monthsAfter,
    ).toBeCloseTo(4, 0)
  })
  it('is null for an award long before the queja', () => {
    expect(
      temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2020-01-01' })),
    ).toBeNull()
  })
})

describe('scoreRelation — tiering + honesty gates', () => {
  it('Tier A: place + department → publishable "misma zona y materia"', () => {
    const r = scoreRelation(
      q({ placeSlug: 'valencia-la-vella', department: 'movilidad' }),
      c({ places: ['valencia-la-vella'], department: 'movilidad' }),
    )!
    expect(r.tier).toBe('A')
    expect(r.relationLabel).toBe('misma zona y materia')
  })
  it('Tier B: department + temporal proximity → requiresHumanApproval', () => {
    const r = scoreRelation(
      q({ placeSlug: null, department: 'urbanismo' }),
      c({ department: 'urbanismo' }),
    )!
    expect(r.tier).toBe('B')
    expect(r.requiresHumanApproval).toBe(true)
    expect(r.relationLabel).toBe('misma materia y fechas próximas')
  })

  it('GATE: department alone, with no shared moment, does NOT link', () => {
    // This is the gate that makes the queue usable. Department alone linked one
    // real queja to 259 of 698 contracts — 37% of everything the town has
    // signed — because `urbanismo` covers most municipal work. A reviewer given
    // 259 "possibly related" contracts for one complaint cannot review at all.
    const r = scoreRelation(
      q({ placeSlug: null, department: 'urbanismo', createdAt: '2025-01-01' }),
      // Awarded five years before the complaint: same subject, unrelated moment.
      c({ department: 'urbanismo', awardDate: '2020-01-01' }),
    )
    expect(r).toBeNull()
  })
  it('GATE: department/theme alone never becomes Tier A', () => {
    const r = scoreRelation(q({ placeSlug: null }), c({ department: q().department }))
    expect(r?.tier).not.toBe('A')
  })
  it('GATE: temporal alone → no link', () => {
    expect(
      scoreRelation(
        q({ placeSlug: null, department: null, serviceCode: 'x' }),
        c({ department: 'z', cpvs: [], places: [], zones: [], awardDate: '2025-02-01' }),
      ),
    ).toBeNull()
  })
  it('place only (no dept) → Tier B "misma zona"', () => {
    const r = scoreRelation(
      q({ placeSlug: 'valencia-la-vella', department: null, serviceCode: 'x' }),
      c({ places: ['valencia-la-vella'], department: 'z', cpvs: [] }),
    )!
    expect(r.tier).toBe('B')
    expect(r.relationLabel).toBe('misma zona')
  })
})

describe('buildRelations', () => {
  it('emits one link per matching pair and counts tiers', () => {
    const res = buildRelations(
      [q({ id: 'Q-1', placeSlug: 'valencia-la-vella', department: 'movilidad' })],
      [
        c({ id: 'c1', places: ['valencia-la-vella'], department: 'movilidad' }),
        c({ id: 'c2', places: ['elsewhere'], department: 'cultura', cpvs: ['92000000'] }),
      ],
    )
    expect(res.links).toHaveLength(1)
    expect(res.stats).toMatchObject({ quejasScanned: 1, contractsScanned: 2, tierA: 1, tierB: 0 })
  })
  it('returns empty under LOREG freeze', () => {
    const res = buildRelations([q()], [c({ places: ['valencia-la-vella'] })], { frozen: true })
    expect(res.links).toEqual([])
    expect(res.stats.frozen).toBe(true)
    expect(res.stats.reason).toBe('frozen')
  })
})

describe('normalizeQueja (current bot snapshot schema)', () => {
  it('maps service_code/address_string/requested_datetime/concejalia_area', () => {
    const r = normalizeQueja({
      service_request_id: 'Q-KJY6XSVG',
      service_code: 'urbanismo',
      concejalia_area: 'Urbanismo',
      address_string: 'urbanitzacio-valencia-la-vella',
      description: 'x',
      requested_datetime: '2026-07-02 10:48:16',
    })!
    expect(r).toMatchObject({
      id: 'Q-KJY6XSVG',
      serviceCode: 'urbanismo',
      department: 'urbanismo',
      placeSlug: 'urbanitzacio-valencia-la-vella',
    })
    expect(r.createdAt).toMatch(/^2026-07-02/)
  })
  it('drops rows without an id or timestamp', () => {
    expect(normalizeQueja({ service_code: 'x' })).toBeNull()
  })
})

describe('buildRelContracts (tender-geo place.sourceId + expediente join, awarded only)', () => {
  it('extracts situated place slugs + zones and joins expediente by id', () => {
    const contracts = [
      {
        id: '4379456',
        permalink: 'p',
        title: 't',
        status: 'awarded',
        categoryTitle: 'construction',
        cpvs: ['45233222'],
        awardDate: '2023-12-27',
        finalAmount: 100,
        assignee: 'X',
      },
      { id: 'draft1', status: 'open' },
    ]
    const geo = {
      assignments: [
        {
          id: '4379456',
          place: { name: 'Urbanització La Reva', sourceId: 'urbanitzacio-la-reva' },
          zones: ['urbanitzacio-la-reva', 'l-oliveral'],
        },
      ],
    }
    const tenders = [{ id: '4379456', documentNumber: '251/2023 BSDA' }]
    const out = buildRelContracts(contracts, geo, tenders)
    expect(out).toHaveLength(1) // non-awarded dropped
    expect(out[0]).toMatchObject({ id: '4379456', expediente: '251/2023 BSDA' })
    expect(out[0].zones).toContain('l-oliveral')
    expect(out[0].places).toEqual(expect.arrayContaining(['urbanitzacio-la-reva']))
  })
})

describe('el resultado no depende del huso del equipo que construye el fichero', () => {
  // Medido el 28-09-2026 (PR #150): reconstruido en el Mac del curador
  // (Europe/Madrid, UTC+2), queja-contract-relations.json movía sus 30
  // `monthsAfter` dos horas respecto al que construye la CI en UTC. El bot
  // exporta `requested_datetime` sin zona («2026-07-02 10:48:16») y `new Date()`
  // lee esa forma en hora LOCAL; la fecha sola de `awardDate` la lee en UTC.
  //
  // Cambiar `process.env.TZ` en caliente vale en el pool `forks` de vitest y no
  // en `threads`, donde las dos pasadas serían la misma zona e iguales sin haber
  // probado nada. Por eso cada pasada afirma antes el desfase que midió.
  const DESFASE_EN_JULIO: Record<string, number> = { UTC: 0, 'Europe/Madrid': -120 }

  function enCadaZona<T>(f: () => T): Record<string, T> {
    const antes = process.env.TZ
    const out: Record<string, T> = {}
    try {
      for (const [zona, desfase] of Object.entries(DESFASE_EN_JULIO)) {
        process.env.TZ = zona
        expect(new Date(2026, 6, 2, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
        out[zona] = f()
      }
    } finally {
      if (antes === undefined) delete process.env.TZ
      else process.env.TZ = antes
    }
    return out
  }

  it('temporalModifier da lo mismo en UTC que en Madrid, y es lo que ya publica la CI', () => {
    // Un par real del fichero publicado: el contrato 9895895, el más cercano al
    // borde de −3 meses. El valor es el que la CI escribió construyendo en UTC.
    const r = enCadaZona(() =>
      temporalModifier(q({ createdAt: '2026-07-02 10:48:16' }), c({ awardDate: '2026-04-08' })),
    )
    expect(r['Europe/Madrid']).toEqual(r.UTC)
    expect(r.UTC).toEqual({ monthsAfter: -2.8483395061728394 })
  })

  it('temporalModifier: en el borde de la ventana, el huso no decide si hay señal', () => {
    // A la 01:00 UTC (las 03:00 en Madrid), noventa días y una hora después de la
    // adjudicación: fuera de la ventana de −3 meses. Leída en hora de Madrid la
    // queja caía dos horas antes, y el mismo par entraba en la ventana.
    const r = enCadaZona(() =>
      temporalModifier(q({ createdAt: '2026-07-02 01:00:00' }), c({ awardDate: '2026-04-03' })),
    )
    expect(r).toEqual({ UTC: null, 'Europe/Madrid': null })
  })

  it('normalizeQueja lee requested_datetime en UTC, que es como lo escribe el bot', () => {
    const r = enCadaZona(
      () =>
        normalizeQueja({ service_request_id: 'Q-1', requested_datetime: '2026-07-02 10:48:16' })
          ?.createdAt,
    )
    expect(r).toEqual({
      UTC: '2026-07-02T10:48:16.000Z',
      'Europe/Madrid': '2026-07-02T10:48:16.000Z',
    })
  })

  it('una marca que no es ISO no se lee en hora local: no es una fecha', () => {
    // V8 lee «07/02/2026» como 2 de julio y en hora local; quien lo escribió en
    // Riba-roja quería decir 7 de febrero. Mejor sin señal que con una inventada.
    const marca = '07/02/2026 10:48:16'
    expect(temporalModifier(q({ createdAt: marca }), c({ awardDate: '2026-09-01' }))).toBeNull()
    expect(normalizeQueja({ service_request_id: 'Q-1', requested_datetime: marca })).toBeNull()
  })
})
