import { describe, it, expect } from 'vitest'
import { computeDepartmentStats } from '../src/lib/department-stats'

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
        { number: 1, title: 'Presupuesto', section: 'resolutiva', department: 'INTERVENCIÓN', departmentSlug: 'hacienda', expediente: '1/2026' },
        { number: 2, title: 'Carta servicios', section: 'resolutiva', department: 'TRANSPARENCIA', departmentSlug: 'transparencia', expediente: '2/2026' },
        { number: 3, title: 'Sin voto', section: 'resolutiva', department: 'URBANISMO', departmentSlug: 'urbanismo', expediente: '3/2026' },
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

const quejas = {
  items: [
    { id: 'q1', category: 'urbanismo', state: 'en_tramite' },
    { id: 'q2', category: 'urbanismo', state: 'silencio_negativo' },
    { id: 'q3', category: 'medio_ambiente', state: 'resuelta' },
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
