import { describe, it, expect } from 'vitest'
import {
  PROCESS_TYPE_LABEL,
  CONTRACT_TYPE_LABEL,
  bajaPct,
  isScoreArtifactAmount,
} from '../../src/lib/tenders'

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

  it('hides the baja for a PLACSP score-as-amount row instead of printing −99%', () => {
    // exp. 251/2023 BSDA (Montealcedo SDA call-off): PLACSP recorded the 0–100
    // award-criterion SCORE (100) in the importe field. The acta adjudicated
    // €14.534,31 — a ~3% baja, not 99,2%. We hide the chip rather than lie.
    expect(
      bajaPct({
        initialAmount: 14983.83,
        initialAmountNoTaxes: 12383.33,
        finalAmount: 100,
        finalAmountNoTaxes: 100,
      }),
    ).toBeNull()
  })
})

describe('lib/tenders — isScoreArtifactAmount (PLACSP score-as-amount guard)', () => {
  it('flags a tax-invariant final on a taxed budget with an absurd (≥90%) baja', () => {
    // Montealcedo SDA call-off: final 100/100 vs budget 14.983,83/12.383,33.
    expect(
      isScoreArtifactAmount({
        initialAmount: 14983.83,
        initialAmountNoTaxes: 12383.33,
        finalAmount: 100,
        finalAmountNoTaxes: 100,
      }),
    ).toBe(true)
    // Fuel-supply framework: final 2/2 vs budget 126.612,09/104.638,09.
    expect(
      isScoreArtifactAmount({
        initialAmount: 126612.09,
        initialAmountNoTaxes: 104638.09,
        finalAmount: 2,
        finalAmountNoTaxes: 2,
      }),
    ).toBe(true)
  })

  it('does NOT flag a real deep-discount award (final is properly taxed)', () => {
    // "Dos vehículos tipo moto": 88% baja but final 3650 ≠ finalNoTaxes 3016,53.
    expect(
      isScoreArtifactAmount({
        initialAmount: 30000,
        initialAmountNoTaxes: 24793.39,
        finalAmount: 3650,
        finalAmountNoTaxes: 3016.53,
      }),
    ).toBe(false)
  })

  it('does NOT flag a tax-invariant final whose baja is plausible', () => {
    // Property acquisition (IVA-invariant final) at a 0% baja — a real €180k award.
    expect(
      isScoreArtifactAmount({
        initialAmount: 198000,
        initialAmountNoTaxes: 180000,
        finalAmount: 180000,
        finalAmountNoTaxes: 180000,
      }),
    ).toBe(false)
    // Transport service: tax-invariant final 207.489,70 at a 20% baja.
    expect(
      isScoreArtifactAmount({
        initialAmount: 286192.7,
        initialAmountNoTaxes: 260175.18,
        finalAmount: 207489.7,
        finalAmountNoTaxes: 207489.7,
      }),
    ).toBe(false)
  })

  it('is empty-safe', () => {
    expect(isScoreArtifactAmount({})).toBe(false)
    expect(isScoreArtifactAmount(null)).toBe(false)
  })
})
