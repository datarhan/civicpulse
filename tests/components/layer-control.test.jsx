import { describe, expect, it } from 'vitest'
import { MAP_LAYERS } from '../../src/components/LiveCity/controls/LayerControl'

// The landing map's toggleable data layers. The "Tren L9" (metro) schematic
// train was retired in favour of a citizen-quejas heat layer — this pins that
// swap so a future refactor can't silently reintroduce the metro chip or drop
// the quejas one.
describe('MAP_LAYERS — landing map layer chips', () => {
  it('offers a Quejas layer chip wired to the map.layer.quejas i18n key', () => {
    const quejas = MAP_LAYERS.find((l) => l.key === 'quejas')
    expect(quejas, 'a quejas layer entry must exist').toBeTruthy()
    expect(quejas.labelKey).toBe('map.layer.quejas')
    expect(quejas.glyph, 'the chip needs a decorative glyph').toBeTruthy()
  })

  it('no longer offers the retired Tren L9 (metro) chip', () => {
    expect(MAP_LAYERS.some((l) => l.key === 'metro')).toBe(false)
  })
})
