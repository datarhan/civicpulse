import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The corporation bar must paint every seat in the snapshot.
 *
 * It used to filter through a hard-coded party list, which erased EU-Podem —
 * one real seat, one real councillor — and left 20 escaños rendered beneath a
 * label reading «Total 21». Reproduced here as a pure function so the invariant
 * is pinned independently of the JSX.
 */
function barItems(composition: Record<string, number>) {
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem', 'Otro']
  const known = order.filter((p) => composition[p])
  const rest = Object.keys(composition)
    .filter((p) => composition[p] && !order.includes(p))
    .sort((a, b) => composition[b] - composition[a])
  return [...known, ...rest].map((p) => ({ p, n: composition[p] }))
}

const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'officials.json'), 'utf8'),
) as { count: number; composition: Record<string, number> }

describe('CompositionBar — every seat is painted', () => {
  it('the published snapshot has parties to check, so this cannot pass vacuously', () => {
    expect(Object.keys(SNAP.composition).length).toBeGreaterThan(2)
    expect(SNAP.count).toBeGreaterThan(0)
  })

  it('paints exactly as many seats as the corporation has', () => {
    const painted = barItems(SNAP.composition).reduce((a, i) => a + i.n, 0)
    expect(painted).toBe(SNAP.count)
  })

  it('drops no party that holds a seat', () => {
    const painted = new Set(barItems(SNAP.composition).map((i) => i.p))
    for (const [party, seats] of Object.entries(SNAP.composition)) {
      if (seats > 0) expect(painted.has(party)).toBe(true)
    }
  })

  it('paints a party nobody listed in advance', () => {
    // The regression that mattered: a new party wins a seat and nobody edits
    // the order array. It must still appear.
    const items = barItems({ PSOE: 5, 'Partido-Que-Nadie-Previó': 2 })
    expect(items.map((i) => i.p)).toContain('Partido-Que-Nadie-Previó')
    expect(items.reduce((a, i) => a + i.n, 0)).toBe(7)
  })

  it('keeps the known parties in their reading order', () => {
    const items = barItems({ VOX: 1, PSOE: 11, PP: 7 })
    expect(items.map((i) => i.p)).toEqual(['PSOE', 'PP', 'VOX'])
  })
})
