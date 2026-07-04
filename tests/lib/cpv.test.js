import { describe, it, expect } from 'vitest'
import { cpvLabel, cpvDivision, uniqueCpvLabels, CPV_DIVISIONS } from '../../src/lib/cpv'

describe('lib/cpv — cpvLabel', () => {
  it('returns the exact dictionary label when the full 8-digit code is present', () => {
    const dict = { 71200000: 'Servicios de arquitectura' }
    expect(cpvLabel('71200000', dict)).toBe('Servicios de arquitectura')
  })

  it('falls back to the 2-digit division label when the full code is unknown', () => {
    expect(cpvLabel('71200000', {})).toBe(CPV_DIVISIONS['71'])
    expect(cpvLabel('45233142', {})).toBe(CPV_DIVISIONS['45'])
  })

  it('normalises a code with a check digit / dash / spaces before lookup', () => {
    expect(cpvLabel('45233142-6', {})).toBe(CPV_DIVISIONS['45'])
    expect(cpvLabel(' 90910000 ', {})).toBe(CPV_DIVISIONS['90'])
  })

  it('the full-code label wins over the division fallback', () => {
    const dict = { 45233142: 'Trabajos de reparación de carreteras' }
    expect(cpvLabel('45233142', dict)).toBe('Trabajos de reparación de carreteras')
  })

  it('returns the raw code when neither full code nor division is known', () => {
    expect(cpvLabel('99999999', {})).toBe('99999999')
  })

  it('is null/empty safe', () => {
    expect(cpvLabel('', {})).toBe('')
    expect(cpvLabel(null, {})).toBe('')
    expect(cpvLabel(undefined, {})).toBe('')
  })
})

describe('lib/cpv — cpvDivision', () => {
  it('extracts the leading 2-digit division', () => {
    expect(cpvDivision('71200000')).toBe('71')
    expect(cpvDivision('45233142-6')).toBe('45')
  })
  it('is empty-safe', () => {
    expect(cpvDivision('')).toBe('')
    expect(cpvDivision(null)).toBe('')
  })
})

describe('lib/cpv — uniqueCpvLabels', () => {
  it('maps a list of codes to de-duplicated human labels', () => {
    const dict = { 45233142: 'Reparación de carreteras', 45000000: 'Trabajos de construcción' }
    const out = uniqueCpvLabels(['45233142', '45000000'], dict)
    expect(out).toContain('Reparación de carreteras')
    expect(out).toContain('Trabajos de construcción')
    expect(out.length).toBe(2)
  })

  it('de-duplicates identical labels (two codes resolving to the same division)', () => {
    // Both unknown → same division-71 fallback → collapse to one label.
    const out = uniqueCpvLabels(['71200000', '71300000'], {})
    expect(out).toEqual([CPV_DIVISIONS['71']])
  })

  it('respects the limit and ignores blanks', () => {
    const out = uniqueCpvLabels(['45000000', '71000000', '90000000', '', null], {}, 2)
    expect(out.length).toBe(2)
  })

  it('returns an empty array for empty input', () => {
    expect(uniqueCpvLabels([], {})).toEqual([])
    expect(uniqueCpvLabels(null, {})).toEqual([])
  })
})

describe('lib/cpv — CPV_DIVISIONS', () => {
  it('covers the major divisions present in Riba-roja contracts', () => {
    // Divisions observed in tenders.json — the fallback must never miss these.
    for (const d of ['45', '71', '90', '79', '80', '85', '92', '50', '72', '30']) {
      expect(typeof CPV_DIVISIONS[d]).toBe('string')
      expect(CPV_DIVISIONS[d].length).toBeGreaterThan(4)
    }
  })
})
