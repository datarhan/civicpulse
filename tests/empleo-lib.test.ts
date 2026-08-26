import { describe, it, expect } from 'vitest'
import { effectiveStatus } from '../src/hooks/useEmpleo'
import {
  normalizeJornada,
  computeEmpleoStats,
  matchesFilters,
  paginate,
  distinctMunicipios,
  distinctContracts,
  offersByMunicipioGeo,
  EMPTY_FILTERS,
} from '../src/lib/empleo'

// A deterministic "now" so deadline windows don't drift with the clock.
const NOW = Date.parse('2026-06-15T12:00:00Z')

const mk = (over: any = {}) => ({
  id: String(over.fo ?? 1),
  fo: over.fo ?? 1,
  codigo: over.codigo ?? '2026/00001',
  titulo: over.titulo ?? 'Puesto',
  publishedAt: over.publishedAt ?? '2026-05-01',
  deadline: over.deadline ?? null,
  location: over.location ?? '',
  status: over.status ?? 'Abierta',
  statusTone: over.statusTone ?? 'ok',
  url: `https://ribaocupacio.portalemp.com/ofertas.html?fo=${over.fo ?? 1}`,
  inRibaRoja: over.inRibaRoja ?? false,
  detail: over.detail ?? null,
})

const OFFERS = [
  mk({
    fo: 1,
    titulo: 'Limpiador/a',
    publishedAt: '2026-05-01',
    inRibaRoja: true,
    deadline: '2026-06-20',
    location: 'Riba-roja de Túria',
    detail: {
      numPuestos: '2',
      municipio: 'Riba-roja de Túria',
      tipoContrato: 'CONTRATO INDEFINIDO',
      jornada: 'Completa',
      vehiculo: 'Sí',
      fields: [],
      ocupaciones: [],
    },
  }),
  mk({
    fo: 2,
    titulo: 'Montador',
    publishedAt: '2026-05-15',
    inRibaRoja: false,
    deadline: '2026-07-15',
    location: 'Paterna',
    detail: {
      numPuestos: '1',
      municipio: 'Paterna',
      tipoContrato: 'CONTRATO DE OBRA O SERVICIO DETERMINADO',
      jornada: 'Parcial Turnos: Turno mañana',
      vehiculo: 'Sí',
      fields: [],
      ocupaciones: [],
    },
  }),
  mk({
    fo: 3,
    titulo: 'Peón',
    publishedAt: '2026-06-01',
    inRibaRoja: true,
    deadline: null,
    detail: {
      numPuestos: '3',
      municipio: 'Riba-roja de Túria',
      tipoContrato: 'CONTRATO INDEFINIDO',
      jornada: 'Completa Turnos: Turno partido',
      vehiculo: 'No',
      fields: [],
      ocupaciones: [],
    },
  }),
  mk({
    fo: 4,
    titulo: 'Sin ficha',
    publishedAt: '2026-06-10',
    inRibaRoja: true,
    deadline: '2026-06-17',
    detail: null,
  }),
  mk({
    fo: 5,
    titulo: 'Cerrada',
    publishedAt: '2026-06-20',
    inRibaRoja: false,
    deadline: '2026-06-14',
    location: 'Cheste',
    detail: {
      numPuestos: 'x',
      municipio: 'Cheste',
      tipoContrato: 'INDIFERENTE',
      jornada: '',
      vehiculo: 'Sí',
      fields: [],
      ocupaciones: [],
    },
  }),
]

describe('empleo/normalizeJornada', () => {
  it('collapses the Turnos suffix to Completa / Parcial / Otra', () => {
    expect(normalizeJornada('Completa')).toBe('Completa')
    expect(normalizeJornada('Completa Turnos: Turno partido')).toBe('Completa')
    expect(normalizeJornada('Parcial Turnos: Turno mañana')).toBe('Parcial')
    expect(normalizeJornada('Turnos: Turno partido')).toBe('Otra')
    expect(normalizeJornada('')).toBeNull()
    expect(normalizeJornada(undefined)).toBeNull()
  })
})

describe('empleo/computeEmpleoStats', () => {
  const s = computeEmpleoStats(OFFERS, NOW)

  it('counts totals + positions (numeric numPuestos only)', () => {
    expect(s.total).toBe(5)
    expect(s.positions).toBe(6) // 2 + 1 + 3 ; null-detail + non-numeric skipped
  })
  it('computes Riba-roja share', () => {
    expect(s.inRibaRoja).toBe(3)
    expect(s.inRibaRojaPct).toBe(60)
  })
  it('counts offers closing within 14 days (excludes already-closed + null)', () => {
    expect(s.closingSoon).toBe(2) // fo1 (+5d) + fo4 (+2d); fo5 closed, fo2 +30d, fo3 null
  })
  it('computes the vehicle-required share', () => {
    expect(s.vehicleRequired).toBe(3) // fo1, fo2, fo5
    expect(s.vehiclePct).toBe(60)
  })
  it('bins publications by month, ascending', () => {
    expect(s.byMonth).toEqual([
      { month: '2026-05', count: 2 },
      { month: '2026-06', count: 3 },
    ])
  })
  it('ranks contract types (short label) desc, skipping null detail', () => {
    expect(s.byContract[0]).toMatchObject({ raw: 'CONTRATO INDEFINIDO', count: 2 })
    expect(s.byContract.find((c) => c.raw === 'CONTRATO INDEFINIDO')?.label).toBe('Indefinido')
    expect(s.byContract.reduce((n, c) => n + c.count, 0)).toBe(4) // fo4 has no detail
  })
  it('ranks municipios desc', () => {
    expect(s.byMunicipio[0]).toEqual({ name: 'Riba-roja de Túria', count: 2 })
    expect(s.byMunicipio.map((m) => m.name)).toContain('Cheste')
  })
})

describe('empleo/matchesFilters', () => {
  const base = { ...EMPTY_FILTERS }
  it('passes everything under empty filters', () => {
    expect(OFFERS.every((o) => matchesFilters(o, base, NOW))).toBe(true)
  })
  it('text query matches título / código / localidad', () => {
    expect(matchesFilters(OFFERS[0], { ...base, q: 'limpia' }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[0], { ...base, q: '00001' }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[0], { ...base, q: 'paterna' }, NOW)).toBe(false)
  })
  it('ribaOnly keeps only Riba-roja offers', () => {
    expect(matchesFilters(OFFERS[0], { ...base, ribaOnly: true }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[1], { ...base, ribaOnly: true }, NOW)).toBe(false)
  })
  it('municipio + contract + jornada match on the detail', () => {
    expect(matchesFilters(OFFERS[1], { ...base, municipio: 'Paterna' }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[0], { ...base, municipio: 'Paterna' }, NOW)).toBe(false)
    expect(matchesFilters(OFFERS[0], { ...base, contract: 'CONTRATO INDEFINIDO' }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[2], { ...base, jornada: 'Completa' }, NOW)).toBe(true)
    expect(matchesFilters(OFFERS[1], { ...base, jornada: 'Completa' }, NOW)).toBe(false)
  })
  it('closing window filters by deadline proximity', () => {
    expect(matchesFilters(OFFERS[0], { ...base, closing: 'week' }, NOW)).toBe(true) // +5d
    expect(matchesFilters(OFFERS[1], { ...base, closing: 'week' }, NOW)).toBe(false) // +29.5d
    expect(matchesFilters(OFFERS[1], { ...base, closing: 'month' }, NOW)).toBe(true) // +29.5d ≤ 31
    expect(matchesFilters(OFFERS[2], { ...base, closing: 'month' }, NOW)).toBe(false) // no deadline
    expect(matchesFilters(OFFERS[4], { ...base, closing: 'week' }, NOW)).toBe(false) // closed
  })
})

describe('empleo/paginate', () => {
  const list = Array.from({ length: 25 }, (_, i) => i + 1)
  it('slices the requested page', () => {
    expect(paginate(list, 1, 10)).toMatchObject({ page: 1, totalPages: 3, total: 25 })
    expect(paginate(list, 1, 10).items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginate(list, 3, 10).items).toEqual([21, 22, 23, 24, 25])
  })
  it('clamps out-of-range pages', () => {
    expect(paginate(list, 99, 10).page).toBe(3)
    expect(paginate(list, 0, 10).page).toBe(1)
  })
  it('handles an empty list', () => {
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, totalPages: 1, total: 0 })
    expect(paginate([], 1, 10).items).toEqual([])
  })
})

describe('empleo/offersByMunicipioGeo', () => {
  const COORDS = {
    'Riba-roja de Túria': [39.54, -0.57] as [number, number],
    Paterna: [39.5, -0.44] as [number, number],
  }
  it('aggregates offers to located municipalities, dropping the unmapped ones', () => {
    const pts = offersByMunicipioGeo(OFFERS, COORDS)
    // fo1 + fo3 → Riba-roja (2), fo2 → Paterna (1); fo5 (Cheste, no coord) + fo4 (no detail) dropped
    expect(pts.map((p) => p.name)).toEqual(['Riba-roja de Túria', 'Paterna'])
    expect(pts[0]).toMatchObject({ name: 'Riba-roja de Túria', count: 2, coord: [39.54, -0.57] })
    expect(pts.find((p) => p.name === 'Cheste')).toBeUndefined()
  })
})

describe('empleo/distinct extractors (for filter dropdowns)', () => {
  it('lists distinct municipios sorted', () => {
    expect(distinctMunicipios(OFFERS)).toEqual(['Cheste', 'Paterna', 'Riba-roja de Túria'])
  })
  it('lists distinct contract types', () => {
    const cs = distinctContracts(OFFERS).map((c) => c.raw)
    expect(cs).toContain('CONTRATO INDEFINIDO')
    expect(cs).toContain('INDIFERENTE')
    expect(new Set(cs).size).toBe(cs.length)
  })
})

// ---------------------------------------------------------------------------
// «Abierta» significaba tres cosas a la vez.
//
// El portal no mantiene su propio campo `status`: dos ofertas reales lo traen
// en «Abierta» con plazos de 2026-06-30 y 2026-01-15. `effectiveStatus` ya lo
// arreglaba EN LA TARJETA —el comentario que lo explica nombra esas dos— pero
// el CONTADOR seguía sumando la etiqueta cruda, así que /empleo publicaba «67
// ofertas abiertas» y a renglón seguido pintaba dos de ellas «Cerrada».
//
// La misma cifra la leen la portada (FeedBlocks) y /datos, así que el desajuste
// salía en tres sitios.
// ---------------------------------------------------------------------------
describe('empleo/computeEmpleoStats — abiertas de verdad', () => {
  const OFERTAS = [
    mk({ fo: 1, deadline: '2026-09-30' }), // abierta
    mk({ fo: 2, deadline: '2026-01-15' }), // «Abierta» en el portal, vencida
    mk({ fo: 3, deadline: null }), // sin plazo: no se puede decir que cerró
  ]

  it('no cuenta como abierta una que la propia página pinta «Cerrada»', () => {
    const s = computeEmpleoStats(OFERTAS, NOW)
    expect(s.total).toBe(3)
    expect(s.open).toBe(2)
  })

  it('el contador y la etiqueta de la tarjeta dicen lo mismo', () => {
    // El defecto no era una cifra mal: eran DOS nociones. Si esto se separa
    // otra vez, que falle aquí y no en la página.
    const s = computeEmpleoStats(OFERTAS, NOW)
    const pintadasAbiertas = OFERTAS.filter((o) => effectiveStatus(o, NOW).label === 'Abierta')
    expect(s.open).toBe(pintadasAbiertas.length)
  })

  it('sin plazo no se presume cerrada', () => {
    expect(computeEmpleoStats([mk({ fo: 9, deadline: null })], NOW).open).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// El gráfico de municipios va sobre MENOS filas que el KPI de al lado.
//
// «En Riba-roja 43 · 64%» sale de la marca de alias, sobre las 67 ofertas. El
// panel de municipios agrupa `detail.municipio`, y 23 filas no traen ficha: ve
// 44. El lector veía 43 arriba y 24 abajo sin nada que dijera que son
// poblaciones distintas.
// ---------------------------------------------------------------------------
describe('empleo/computeEmpleoStats — cobertura del gráfico de municipios', () => {
  it('dice sobre cuántas filas se calculó, no sobre cuántas hay', () => {
    const s = computeEmpleoStats(
      [
        mk({ fo: 1, detail: { municipio: 'Riba-roja de Túria' } }),
        mk({ fo: 2, detail: { municipio: 'Cheste' } }),
        mk({ fo: 3, detail: null }), // sin ficha: fuera del gráfico
        mk({ fo: 4, detail: {} }), // ficha sin municipio: también fuera
      ],
      NOW,
    )
    expect(s.total).toBe(4)
    expect(s.byMunicipioCoverage).toBe(2)
  })

  it('con todas las fichas completas la cobertura es el total', () => {
    const s = computeEmpleoStats(
      [
        mk({ fo: 1, detail: { municipio: 'Riba-roja de Túria' } }),
        mk({ fo: 2, detail: { municipio: 'Llíria' } }),
      ],
      NOW,
    )
    expect(s.byMunicipioCoverage).toBe(s.total)
  })
})
