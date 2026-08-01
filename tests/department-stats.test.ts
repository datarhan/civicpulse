import { describe, it, expect } from 'vitest'
import { computeDepartmentStats } from '../src/lib/department-stats'
import { promiseDeptSlug } from '../src/lib/department-claim-topics'

const NOW = new Date('2026-04-21T00:00:00Z')

const officials = {
  officials: [
    { slug: 'ana', name: 'Ana', portfolios: ['Urbanismo', 'Vivienda'], party: 'PSOE' },
    { slug: 'beto', name: 'Beto', portfolios: ['Emergencia climática'], party: 'Compromís' },
  ],
}

const promises = {
  items: [
    {
      id: 'p1',
      party: 'PSOE',
      title: 'Construir viviendas',
      quote: 'We will build 500 social homes by 2026',
      source: { url: 'https://x.test', publisher: 'T' },
      madeAt: '2024-01-01',
      topic: 'vivienda',
      kind: 'programa-electoral',
      status: 'documentada',
      evidence: [],
      createdAt: '2024-01-01',
      departmentSlug: 'vivienda',
      dueBy: '2025-12-31', // overdue as of 2026-04-21
    },
    {
      id: 'p2',
      party: 'PSOE',
      title: 'Transparencia total',
      quote: 'We will publish every contract in real time',
      source: { url: 'https://x.test', publisher: 'T' },
      madeAt: '2024-01-01',
      topic: 'transparencia',
      kind: 'programa-electoral',
      status: 'en-verificacion',
      evidence: [],
      createdAt: '2024-01-01',
      departmentSlug: 'transparencia',
      // no dueBy
    },
  ],
}

const agendas = {
  plenos: [
    {
      id: 'k4olcs',
      date: '2026-03-01',
      agenda: [
        {
          number: 1,
          title: 'Presupuesto',
          section: 'resolutiva',
          department: 'INTERVENCIÓN',
          departmentSlug: 'hacienda',
          expediente: '1/2026',
        },
        {
          number: 2,
          title: 'Carta servicios',
          section: 'resolutiva',
          department: 'TRANSPARENCIA',
          departmentSlug: 'transparencia',
          expediente: '2/2026',
        },
        {
          number: 3,
          title: 'Sin voto',
          section: 'resolutiva',
          department: 'URBANISMO',
          departmentSlug: 'urbanismo',
          expediente: '3/2026',
        },
      ],
    },
  ],
}

const votes = {
  items: [
    {
      id: 'k4olcs-01',
      plenoId: 'k4olcs',
      plenoDate: '2026-03-01',
      itemNumber: 1,
      title: 'Aprobación inicial del presupuesto municipal para 2026',
      outcome: 'aprobado',
      votes: [{ bloc: 'PSOE', direction: 'a_favor' }],
      department: 'Intervención',
      sourceUrl: 'https://x.test/acta.pdf',
      sourcePublisher: 'Ayto',
      retrievedAt: '2026-03-02',
      dueBy: '2026-01-15', // overdue
      dueBySource: 'con plazo de ejecución de 6 meses desde la aprobación',
    },
    {
      id: 'k4olcs-02',
      plenoId: 'k4olcs',
      plenoDate: '2026-03-01',
      itemNumber: 2,
      title: 'Aprobación de la carta de servicios 2026',
      outcome: 'aprobado',
      votes: [{ bloc: 'PSOE', direction: 'a_favor' }],
      department: 'Transparencia',
      sourceUrl: 'https://x.test/acta.pdf',
      sourcePublisher: 'Ayto',
      retrievedAt: '2026-03-02',
      // No dueBy — aprobado but not overdue
    },
  ],
}

// Open311 field names, exactly as bot/src/services/snapshot.ts emits them into
// public/data/quejas.json. The previous fixture used {category, state}, which
// no real snapshot has ever carried — so this suite passed while production
// bucketed every queja into nothing.
const quejas = {
  items: [
    { service_request_id: 'q1', service_code: 'urbanismo', status: 'en_tramite' },
    { service_request_id: 'q2', service_code: 'urbanismo', status: 'silencio_negativo' },
    { service_request_id: 'q3', service_code: 'medio_ambiente', status: 'resuelta' },
  ],
}

describe('computeDepartmentStats', () => {
  it('returns a bucket for every canonical slug (stable shape)', () => {
    const result = computeDepartmentStats({
      officials,
      promises,
      agendas,
      votes,
      quejas,
      now: NOW,
    })
    expect(result.list.length).toBeGreaterThanOrEqual(28)
    // Every bucket has the expected top-level shape.
    for (const b of result.list) {
      expect(b).toHaveProperty('slug')
      expect(b).toHaveProperty('labelEs')
      expect(b).toHaveProperty('labelCa')
      expect(b.plenoVotes).toHaveProperty('plazosVencidos')
      expect(b.promesas).toHaveProperty('plazosVencidos')
    }
  })

  it('attaches the responsible official when a portfolio matches', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    expect(r.bySlug.urbanismo.responsableOfficial?.slug).toBe('ana')
    expect(r.bySlug.vivienda.responsableOfficial?.slug).toBe('ana')
    expect(r.bySlug['medio-ambiente'].responsableOfficial?.slug).toBe('beto')
  })

  it('leaves responsable null when no portfolio matches (no fabrication)', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    expect(r.bySlug.turismo.responsableOfficial).toBeNull()
  })

  it('counts pleno votes per dept and flags overdue aprobados', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    expect(r.bySlug.hacienda.plenoVotes.aprobado).toBe(1)
    expect(r.bySlug.hacienda.plenoVotes.plazosVencidos).toBe(1)
    expect(r.bySlug.transparencia.plenoVotes.aprobado).toBe(1)
    expect(r.bySlug.transparencia.plenoVotes.plazosVencidos).toBe(0)
  })

  it('counts agenda items as "sinVoto" when no matching vote exists (libel rule)', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    // Urbanismo agenda item has no matching vote → sinVoto = 1
    expect(r.bySlug.urbanismo.plenoAgendas.total).toBe(1)
    expect(r.bySlug.urbanismo.plenoAgendas.sinVoto).toBe(1)
    // Hacienda / transparencia agenda items DO have votes → sinVoto = 0
    expect(r.bySlug.hacienda.plenoAgendas.sinVoto).toBe(0)
    expect(r.bySlug.transparencia.plenoAgendas.sinVoto).toBe(0)
  })

  it('counts promises per dept and flags overdue ones (soft flag only)', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    expect(r.bySlug.vivienda.promesas.total).toBe(1)
    expect(r.bySlug.vivienda.promesas.plazosVencidos).toBe(1)
    expect(r.bySlug.transparencia.promesas.total).toBe(1)
    expect(r.bySlug.transparencia.promesas.plazosVencidos).toBe(0)
  })

  it('routes a promise with no departmentSlug to its topic department (fallback)', () => {
    const base = {
      party: 'PSOE',
      quote: 'a quote long enough to satisfy the validator contract',
      source: { url: 'https://x.test', publisher: 'T' },
      madeAt: '2024-01-01',
      kind: 'programa-electoral',
      status: 'documentada',
      evidence: [],
      createdAt: '2024-01-01',
    }
    const noSlug = {
      items: [
        { ...base, id: 'pf', title: 'Fiscal', topic: 'fiscal' }, // → hacienda
        { ...base, id: 'pp', title: 'Participa', topic: 'participacion' }, // → transparencia
      ],
    }
    const r = computeDepartmentStats({
      officials,
      promises: noSlug,
      agendas,
      votes,
      quejas,
      now: NOW,
    })
    expect(r.bySlug.hacienda.promesas.total).toBe(1)
    expect(r.bySlug.transparencia.promesas.total).toBe(1)
  })

  it('counts quejas per dept (open vs silencios)', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    expect(r.bySlug.urbanismo.quejas.total).toBe(2)
    expect(r.bySlug.urbanismo.quejas.abiertas).toBe(2)
    expect(r.bySlug.urbanismo.quejas.silencios).toBe(1)
    expect(r.bySlug['medio-ambiente'].quejas.total).toBe(1)
    expect(r.bySlug['medio-ambiente'].quejas.abiertas).toBe(0)
  })

  it('computes the total plazosVencidos scalar (vote + promise flags)', () => {
    const r = computeDepartmentStats({ officials, promises, agendas, votes, quejas, now: NOW })
    // 1 overdue vote (hacienda) + 1 overdue promise (vivienda) = 2
    expect(r.plazosVencidosCount).toBe(2)
  })

  it('tolerates null / empty inputs', () => {
    const r = computeDepartmentStats({
      officials: null,
      promises: null,
      agendas: null,
      votes: null,
      quejas: null,
      now: NOW,
    })
    expect(r.plazosVencidosCount).toBe(0)
    expect(r.list.every((b) => b.plenoVotes.total === 0)).toBe(true)
  })
})

describe('promiseDeptSlug', () => {
  it('prefers a curated departmentSlug, else routes by topic, else null', () => {
    expect(promiseDeptSlug({ departmentSlug: 'cultura', topic: 'fiscal' })).toBe('cultura') // curated wins
    expect(promiseDeptSlug({ topic: 'fiscal' })).toBe('hacienda')
    expect(promiseDeptSlug({ topic: 'participacion' })).toBe('transparencia')
    expect(promiseDeptSlug({ topic: 'vivienda' })).toBe('vivienda')
    expect(promiseDeptSlug({ topic: 'other' })).toBe(null) // honest "no department"
    expect(promiseDeptSlug({})).toBe(null)
  })
})

describe('computeDepartmentStats — claims (LLM verifier-aware)', () => {
  const claims = {
    items: [
      // urbanismo topic → urbanismo + obras-publicas dept buckets
      { claim: { topic: 'urbanismo' }, verification: { verdict: 'verificado' } },
      { claim: { topic: 'urbanismo' }, verification: { verdict: 'parcial' } },
      { claim: { topic: 'urbanismo' }, verification: { verdict: 'sin-datos' } },
      // vivienda → vivienda + urbanismo
      { claim: { topic: 'vivienda' }, verification: { verdict: 'contradicho' } },
      // fiscal → hacienda + contratacion + empleo-economia + recursos-humanos
      { claim: { topic: 'fiscal' }, verification: { verdict: 'verificado' } },
      // unknown topic — should be ignored
      { claim: { topic: 'totally-not-a-topic' }, verification: { verdict: 'verificado' } },
      // missing verdict — should be ignored
      { claim: { topic: 'urbanismo' }, verification: {} },
    ],
  } as never

  const NOW = new Date('2026-04-25T12:00:00Z')

  it('aggregates claim verdicts to dept buckets via topic→dept map', () => {
    const r = computeDepartmentStats({ claims, now: NOW })
    // urbanismo gets: 1 verificado + 1 parcial + 1 sin-datos (topic=urbanismo)
    //                + 1 contradicho (topic=vivienda → urbanismo)
    expect(r.bySlug.urbanismo.declaraciones.verificado).toBe(1)
    expect(r.bySlug.urbanismo.declaraciones.parcial).toBe(1)
    expect(r.bySlug.urbanismo.declaraciones.contradicho).toBe(1)
    expect(r.bySlug.urbanismo.declaraciones.sinDatos).toBe(1)
    expect(r.bySlug.urbanismo.declaraciones.conEvidencia).toBe(3) // verif+parcial+contra
    expect(r.bySlug.urbanismo.declaraciones.total).toBe(4)
  })

  it('multi-targets a topic mapped to several depts', () => {
    const r = computeDepartmentStats({ claims, now: NOW })
    // fiscal one verificado claim should land in BOTH hacienda and
    // contratacion (and empleo-economia, recursos-humanos).
    expect(r.bySlug.hacienda.declaraciones.verificado).toBe(1)
    expect(r.bySlug.contratacion.declaraciones.verificado).toBe(1)
    expect(r.bySlug['empleo-economia'].declaraciones.verificado).toBe(1)
  })

  it('ignores claims with unknown topic or missing verdict', () => {
    const r = computeDepartmentStats({ claims, now: NOW })
    // the "totally-not-a-topic" claim shouldn't show up anywhere.
    let totalVerificado = 0
    for (const b of r.list) totalVerificado += b.declaraciones.verificado
    // Expected: 1 urbanismo claim verifies in urbanismo + obras-publicas,
    // 1 fiscal verifies in hacienda + contratacion + empleo-economia +
    // recursos-humanos. No overlap = 6 dept buckets total.
    expect(totalVerificado).toBe(6)
  })

  it('passes through when claims is null', () => {
    const r = computeDepartmentStats({ claims: null, now: NOW })
    expect(r.bySlug.urbanismo.declaraciones.total).toBe(0)
    expect(r.bySlug.urbanismo.declaraciones.conEvidencia).toBe(0)
  })
})

describe('claimsSummary cross-tab path', () => {
  it('produces identical declaraciones to the items path', () => {
    const items = [
      { claim: { topic: 'urbanismo' }, verification: { verdict: 'verificado' } },
      { claim: { topic: 'urbanismo' }, verification: { verdict: 'contradicho' } },
      { claim: { topic: 'fiscal' }, verification: { verdict: 'sin-datos' } },
      { claim: { topic: 'fiscal' }, verification: { verdict: 'promesa-repetida' } },
      { claim: { topic: 'servicios' }, verification: { verdict: 'parcial' } },
    ]
    const summary = {
      urbanismo: { verificado: 1, contradicho: 1 },
      fiscal: { 'sin-datos': 1, 'promesa-repetida': 1 },
      servicios: { parcial: 1 },
    }
    const viaItems = computeDepartmentStats({ claims: { items } })
    const viaSummary = computeDepartmentStats({ claimsSummary: summary })
    for (const slug of Object.keys(viaItems.bySlug)) {
      expect(viaSummary.bySlug[slug].declaraciones).toEqual(viaItems.bySlug[slug].declaraciones)
    }
  })

  it('claimsSummary takes precedence over claims when both are present', () => {
    const viaBoth = computeDepartmentStats({
      claims: {
        items: [{ claim: { topic: 'urbanismo' }, verification: { verdict: 'verificado' } }],
      },
      claimsSummary: {},
    })
    const anyDecl = Object.values(viaBoth.bySlug).some((b) => b.declaraciones.total > 0)
    expect(anyDecl).toBe(false)
  })
})

describe('computeDepartmentStats — contratación por concejalía', () => {
  // A contract counts as spent money when it names a WINNER and has not been
  // revoked. Gobierto leaves `status` as "unknown" on 413 of 804 real rows —
  // complete with assignee, awardDate and amount — so trusting that field
  // discarded most of the money (€138M of mapped spend collapsed to €15M).
  const tenders = {
    contracts: [
      { id: 'c1', categoryTitle: 'construction', assignee: 'ACME SL', finalAmount: 100000 },
      {
        id: 'c2',
        categoryTitle: 'construction',
        assignee: 'ACME SL',
        status: 'unknown',
        initialAmount: 50000,
      },
      {
        id: 'c3',
        categoryTitle: 'environment',
        assignee: 'ECO SA',
        status: 'awarded',
        finalAmount: 25000,
      },
      // ambiguous category — must reach no department rather than guess an owner
      { id: 'c4', categoryTitle: 'other', assignee: 'X SL', finalAmount: 999999 },
      { id: 'c5', categoryTitle: 'legal', assignee: 'Y SL', finalAmount: 888888 },
      // revoked — the award was undone, so it is not spend
      {
        id: 'c6',
        categoryTitle: 'construction',
        assignee: 'Z SL',
        status: 'revoked',
        finalAmount: 777777,
      },
      // no winner named — nothing has been awarded yet
      { id: 'c7', categoryTitle: 'construction', finalAmount: 666666 },
    ],
  }

  it('attributes awarded spend to the department that owns the category', () => {
    const { bySlug } = computeDepartmentStats({
      officials,
      promises,
      agendas,
      votes,
      quejas,
      tenders,
    })
    expect(bySlug['obras-publicas'].contratacion).toEqual({ contratos: 2, importeEur: 150000 })
    expect(bySlug['medio-ambiente'].contratacion).toEqual({ contratos: 1, importeEur: 25000 })
  })

  it('leaves ambiguous categories unattributed rather than guessing', () => {
    const { list } = computeDepartmentStats({
      officials,
      promises,
      agendas,
      votes,
      quejas,
      tenders,
    })
    const total = list.reduce((s, d) => s + d.contratacion.contratos, 0)
    expect(total).toBe(3) // c1, c2, c3 — never c4/c5 (ambiguous), c6 (revoked) or c7 (no winner)
  })

  it('reports zero contratación when no tenders snapshot is supplied', () => {
    const { bySlug } = computeDepartmentStats({ officials, promises, agendas, votes, quejas })
    expect(bySlug['obras-publicas'].contratacion).toEqual({ contratos: 0, importeEur: 0 })
  })
})

describe('department-stats — overdue votes without a department', () => {
  it('counts an overdue commitment that belongs to no bucket', () => {
    // 16 of 19 curated votes carry no `department`, and the only record with a
    // `dueBy` is one of them. Summing over buckets alone made the landing
    // page's "plazos vencidos" KPI structurally 0.
    const votes = {
      items: [
        {
          plenoId: 'p1',
          itemNumber: 11,
          outcome: 'aprobado',
          dueBy: '2020-01-01',
          dueBySource: 'en el plazo de tres meses desde la aprobación',
          blocs: [],
        },
      ],
    }
    const out = computeDepartmentStats({ votes, now: new Date('2026-08-01') })
    expect(out.unbucketedOverdueVotes).toBe(1)
    expect(out.plazosVencidosCount).toBe(1)
  })

  it('does not count one that is not yet due', () => {
    const votes = {
      items: [
        { plenoId: 'p1', itemNumber: 11, outcome: 'aprobado', dueBy: '2030-01-01', blocs: [] },
      ],
    }
    const out = computeDepartmentStats({ votes, now: new Date('2026-08-01') })
    expect(out.plazosVencidosCount).toBe(0)
  })
})
