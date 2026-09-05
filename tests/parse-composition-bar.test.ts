import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The corporation bar must paint every seat in the snapshot.
 *
 * It used to filter through a hard-coded party list, which erased EU-Podem —
 * one real seat, one real councillor — and left 20 escaños rendered beneath a
 * label reading «Total 21». The ordering and the painter are IMPORTED from the
 * module the component uses: a copy of the order kept here stayed green while
 * it could drift from the JSX (DATA_INTEGRITY rule 1).
 */
import { barItems, PARTY_ORDER } from '../src/lib/party-order'

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
    expect(PARTY_ORDER.indexOf('PSOE')).toBeLessThan(PARTY_ORDER.indexOf('VOX'))
  })
})
