import { describe, it, expect } from 'vitest'
import { alcaldeGrowth } from '../src/hooks/useIspa'

const data = {
  alcaldeTrend: [
    { year: 2020, amountEuros: 45461.94 },
    { year: 2021, amountEuros: 45916.56 },
    { year: 2022, amountEuros: 52855.48 },
    { year: 2024, amountEuros: 48647.5 },
  ],
}

describe('hooks/useIspa — alcaldeGrowth', () => {
  it('computes the % for windows whose base year exists', () => {
    const byY = Object.fromEntries(alcaldeGrowth(data, [1, 3, 5, 10]).map((w) => [w.years, w.pct]))
    // 3y: 2021 -> 2024
    expect(byY[3]).toBeCloseTo((48647.5 / 45916.56 - 1) * 100, 1)
    expect(byY[3]).toBeGreaterThan(0)
  })

  it('returns null (never an invented figure) when the base year is missing', () => {
    const byY = Object.fromEntries(alcaldeGrowth(data, [1, 3, 5, 10]).map((w) => [w.years, w.pct]))
    expect(byY[1]).toBeNull() // no clean 2023
    expect(byY[5]).toBeNull() // no 2019
    expect(byY[10]).toBeNull() // ISPA starts ~2020
  })

  it('reflects the 2023 reform as a drop from the 2022 peak', () => {
    const w2 = alcaldeGrowth(data, [2])[0]
    expect(w2.pct).toBeLessThan(0) // 2022 (52.855) -> 2024 (48.648)
  })

  it('returns an empty list when there is no usable series', () => {
    expect(alcaldeGrowth({ alcaldeTrend: [] })).toEqual([])
    expect(alcaldeGrowth(null)).toEqual([])
  })
})
