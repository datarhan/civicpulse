import { describe, it, expect } from 'vitest'
import {
  zoneAmountsAt,
  topContractors,
  filterContracts,
  moneyRadiusMeters,
  contractTypeTotals,
  obrasSharePct,
} from '../../src/lib/tender-geo'

const ASSIGN = [
  { id: 'a', zones: ['z1'], dana: false, amount: 100, date: '2024-01-01' },
  { id: 'b', zones: ['z1', 'z2'], dana: true, amount: 200, date: '2025-06-01' },
  { id: 'c', zones: ['z2'], dana: false, amount: 50, date: null },
]

describe('lib/tender-geo', () => {
  it('zoneAmountsAt accumulates cumulatively up to a timestamp', () => {
    const m = zoneAmountsAt(ASSIGN, { at: new Date('2024-12-31').getTime() })
    expect(m.get('z1')).toEqual({ amount: 100, count: 1 }) // b is after the cutoff
    expect(m.has('z2')).toBe(false)
  })
  it('zoneAmountsAt filters to DANA only', () => {
    const m = zoneAmountsAt(ASSIGN, { danaOnly: true })
    expect(m.get('z1')).toEqual({ amount: 200, count: 1 })
    expect(m.get('z2')).toEqual({ amount: 200, count: 1 })
  })
  it('topContractors ranks awarded amounts sin IVA (finalAmountNoTaxes) and ignores non-awarded', () => {
    // PLACSP headlines the tax-excluded figure; the tax-included finalAmount
    // (~×1.21) must NOT be what we sum.
    const top = topContractors(
      [
        { assignee: 'ACME', status: 'awarded', finalAmount: 121, finalAmountNoTaxes: 100 },
        { assignee: 'ACME', status: 'awarded', finalAmount: 48.4, finalAmountNoTaxes: 40 },
        { assignee: 'ACME', status: 'open', finalAmount: 0, initialAmount: 999 },
        { assignee: 'BETA', status: 'awarded', finalAmount: 108.9, finalAmountNoTaxes: 90 },
      ],
      10,
    )
    expect(top[0]).toEqual({ assignee: 'ACME', amount: 140, count: 2, variantCount: 1 }) // 100 + 40, sin IVA
    expect(top[1].assignee).toBe('BETA')
  })
  it('topContractors falls back to the tax-included amount when no sin-IVA figure exists', () => {
    const top = topContractors([{ assignee: 'GAMMA', status: 'awarded', finalAmount: 200 }], 10)
    expect(top[0]).toEqual({ assignee: 'GAMMA', amount: 200, count: 1, variantCount: 1 })
  })
  it('topContractors merges razón-social variants when an entity resolver is provided', () => {
    const contracts = [
      { status: 'awarded', assignee: 'VARESER 96, S.L.', finalAmountNoTaxes: 1000 },
      { status: 'awarded', assignee: 'VARESER 96 SL', finalAmountNoTaxes: 500 },
      { status: 'awarded', assignee: 'INSDAGAR SL', finalAmountNoTaxes: 700 },
      // `open`, not the invented `in-tender` this used to say — Gobierto's
      // vocabulary has no hyphenated statuses, so the row was testing a shape
      // that cannot occur.
      { status: 'open', assignee: 'VARESER 96 SL', finalAmountNoTaxes: 9999 },
    ]
    const resolver = (raw: string) =>
      raw.startsWith('VARESER') ? { key: 'vareser 96 sl', canonicalName: 'VARESER 96, S.L.' } : null
    const top = topContractors(contracts, 15, resolver)
    const vareser = top.find((t) => t.assignee === 'VARESER 96, S.L.')
    expect(vareser).toEqual({
      assignee: 'VARESER 96, S.L.',
      amount: 1500,
      count: 2,
      variantCount: 2,
    })
    expect(top.some((t) => t.assignee === 'VARESER 96 SL')).toBe(false)
    // unresolved names keep raw grouping
    expect(top.find((t) => t.assignee === 'INSDAGAR SL')?.variantCount).toBe(1)
  })
  it('moneyRadiusMeters reproduces the GastoMap scale and floors non-positive to 0', () => {
    // The single source of truth for the money-bubble radius: 150 + √amount/6
    // (identical to the legacy GastoMap inline formula). sqrt(90000)=300 → 200.
    expect(moneyRadiusMeters(90000)).toBeCloseTo(200, 6)
    expect(moneyRadiusMeters(0)).toBe(0)
    expect(moneyRadiusMeters(-500)).toBe(0)
    expect(moneyRadiusMeters(undefined)).toBe(0)
    // Monotonic: more money → a bigger bubble.
    expect(moneyRadiusMeters(1_000_000)).toBeGreaterThan(moneyRadiusMeters(90000))
  })
  it('filterContracts narrows by text, zone, and dana', () => {
    const contracts = [
      {
        id: 'a',
        title: 'Obra en Molinet',
        assignee: 'ACME',
        awardDate: '2024-01-01',
        categoryTitle: 'construction',
        contractType: 'construction',
      },
      {
        id: 'b',
        title: 'Obra DANA La Reva',
        assignee: 'ACME',
        awardDate: '2025-06-01',
        categoryTitle: 'construction',
        contractType: 'construction',
      },
      {
        id: 'c',
        title: 'Servicio limpieza',
        assignee: 'BETA',
        awardDate: '2024-01-01',
        categoryTitle: 'other',
        contractType: 'services',
      },
    ]
    const byId = new Map(ASSIGN.map((x) => [x.id, x]))
    expect(filterContracts(contracts, { text: 'molinet' }, byId).map((c) => c.id)).toEqual(['a'])
    expect(
      filterContracts(contracts, { zoneSlug: 'z2' }, byId)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['b', 'c'])
    expect(filterContracts(contracts, { dana: true }, byId).map((c) => c.id)).toEqual(['b'])
  })

  describe('contractTypeTotals / obrasSharePct', () => {
    // The number these back is published in a sentence about named public
    // money, so the failure mode that matters is over-claiming obras.
    const CONTRACTS = [
      { assignee: 'A', status: 'awarded', finalAmountNoTaxes: 100, contractType: 'construction' },
      { assignee: 'B', status: 'formalized', finalAmountNoTaxes: 300, contractType: 'services' },
      { assignee: 'C', status: 'awarded', finalAmountNoTaxes: 100, contractType: 'supplies' },
      // Cancelled and in-flight rows are not committed money, in either total.
      { assignee: 'D', status: 'void', finalAmountNoTaxes: 900, contractType: 'construction' },
      { assignee: 'E', status: 'open', finalAmountNoTaxes: 900, contractType: 'construction' },
    ]

    it('groups committed euros by type, biggest first, ignoring undone awards', () => {
      const { rows, total } = contractTypeTotals(CONTRACTS)
      expect(total).toBe(500)
      expect(rows.map((r) => r.type)).toEqual(['services', 'construction', 'supplies'])
      expect(rows[0]).toEqual({ type: 'services', amount: 300, count: 1 })
    })

    it('files a missing contractType under `other` instead of dropping it', () => {
      // A dropped row would shrink the denominator and INFLATE the obras share
      // — the exact direction the published sentence must not err in.
      const { rows, total } = contractTypeTotals([
        { assignee: 'A', status: 'awarded', finalAmountNoTaxes: 100, contractType: 'construction' },
        { assignee: 'B', status: 'awarded', finalAmountNoTaxes: 100 },
      ])
      expect(total).toBe(200)
      expect(rows.find((r) => r.type === 'other')?.amount).toBe(100)
      expect(obrasSharePct({ rows, total })).toBe(50)
    })

    it('reports the obras share of the whole, not of the biggest row', () => {
      expect(obrasSharePct(contractTypeTotals(CONTRACTS))).toBe(20)
    })

    it('returns null rather than 0 % when there is nothing to take a share of', () => {
      // «0 % obras» and «no hay contratos» are different claims; a caller has to
      // be able to tell them apart and say nothing in the second case.
      expect(obrasSharePct(contractTypeTotals([]))).toBeNull()
      expect(obrasSharePct(contractTypeTotals([{ status: 'void', finalAmount: 10 }]))).toBeNull()
    })

    it('reports 0 when there are contracts but none of them are obras', () => {
      const totals = contractTypeTotals([
        { assignee: 'B', status: 'awarded', finalAmountNoTaxes: 300, contractType: 'services' },
      ])
      expect(obrasSharePct(totals)).toBe(0)
    })
  })
})
