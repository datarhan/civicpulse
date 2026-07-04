import { describe, it, expect } from 'vitest'
import { trainPositionsAt } from '../../src/lib/metro-train'

// 3 evenly-spaced collinear stations (lat fixed, lng 0→1→2).
const STATIONS = [
  { id: 'a', pos: [39.5, 0] },
  { id: 'b', pos: [39.5, 1] },
  { id: 'c', pos: [39.5, 2] },
]

describe('lib/metro-train — trainPositionsAt', () => {
  it('parks at the first station at phase 0 (also the reduced-motion frame)', () => {
    const [train] = trainPositionsAt(STATIONS, 0, 1000)
    expect(train.pos[1]).toBeCloseTo(0, 6)
    expect(train.heading).toBe('forward')
  })
  it('reaches the far station at the half-cycle', () => {
    const [train] = trainPositionsAt(STATIONS, 500, 1000)
    expect(train.pos[1]).toBeCloseTo(2, 6)
  })
  it('sits at the middle station at a quarter and three-quarter cycle', () => {
    expect(trainPositionsAt(STATIONS, 250, 1000)[0].pos[1]).toBeCloseTo(1, 6)
    const back = trainPositionsAt(STATIONS, 750, 1000)[0]
    expect(back.pos[1]).toBeCloseTo(1, 6)
    expect(back.heading).toBe('back') // returning leg
  })
  it('is deterministic and cyclic (t and t+cycle match)', () => {
    expect(trainPositionsAt(STATIONS, 300, 1000)[0].pos).toEqual(
      trainPositionsAt(STATIONS, 1300, 1000)[0].pos,
    )
  })
  it('returns no train when fewer than 2 stations have coordinates', () => {
    expect(trainPositionsAt([{ id: 'a', pos: [39.5, 0] }], 100, 1000)).toEqual([])
    expect(trainPositionsAt([], 100, 1000)).toEqual([])
  })
})
