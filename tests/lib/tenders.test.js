import { describe, it, expect } from 'vitest'
import { PROCESS_TYPE_LABEL, CONTRACT_TYPE_LABEL, bajaPct } from '../../src/lib/tenders'

describe('lib/tenders — label maps', () => {
  it('labels every process_type enum value seen in the data', () => {
    for (const k of [
      'restricted',
      'minor_contract',
      'open',
      'open_simplified',
      'negotiated_without_publicity',
      'based_on_agreement',
    ]) {
      expect(typeof PROCESS_TYPE_LABEL[k]).toBe('string')
      expect(PROCESS_TYPE_LABEL[k].length).toBeGreaterThan(3)
    }
  })

  it('labels every contract_type enum value seen in the data', () => {
    for (const k of [
      'services',
      'construction',
      'supplies',
      'other',
      'patrimonial',
      'public_services_management',
    ]) {
      expect(typeof CONTRACT_TYPE_LABEL[k]).toBe('string')
      expect(CONTRACT_TYPE_LABEL[k].length).toBeGreaterThan(3)
    }
  })
})

describe('lib/tenders — bajaPct (savings vs budget)', () => {
  it('computes the sin-IVA baja when both figures are present', () => {
    expect(bajaPct({ initialAmountNoTaxes: 100, finalAmountNoTaxes: 80 })).toBe(20)
  })

  it('falls back to tax-included amounts when sin-IVA is missing', () => {
    expect(bajaPct({ initialAmount: 100, finalAmount: 75 })).toBe(25)
  })

  it('rounds to one decimal', () => {
    expect(bajaPct({ initialAmountNoTaxes: 3, finalAmountNoTaxes: 2 })).toBe(33.3)
  })

  it('returns null when the initial (budget) amount is missing', () => {
    expect(bajaPct({ initialAmountNoTaxes: 0, finalAmountNoTaxes: 80 })).toBeNull()
  })

  it('returns null when there is no award amount', () => {
    expect(bajaPct({ initialAmountNoTaxes: 100, finalAmountNoTaxes: 0 })).toBeNull()
  })

  it('is empty-safe', () => {
    expect(bajaPct({})).toBeNull()
    expect(bajaPct(null)).toBeNull()
  })
})
