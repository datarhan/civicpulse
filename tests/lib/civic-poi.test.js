import { describe, it, expect } from 'vitest'
import { groupPoiByCategory, POI_CATEGORIES } from '../../src/lib/civic-poi'

describe('lib/civic-poi', () => {
  it('POI_CATEGORIES defines a label + colour for every category', () => {
    for (const key of ['educacion', 'salud', 'verde', 'deporte', 'cultura', 'civico']) {
      expect(POI_CATEGORIES[key]).toBeDefined()
      expect(typeof POI_CATEGORIES[key].label).toBe('string')
      expect(POI_CATEGORIES[key].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('groupPoiByCategory buckets pois and omits empty categories', () => {
    const pois = [
      { id: 'a', name: 'CEIP', category: 'educacion', lat: 39.5, lng: -0.5 },
      { id: 'b', name: 'Parc', category: 'verde', lat: 39.5, lng: -0.5 },
      { id: 'c', name: 'IES', category: 'educacion', lat: 39.5, lng: -0.5 },
    ]
    const grouped = groupPoiByCategory(pois)
    expect(grouped.get('educacion').items).toHaveLength(2)
    expect(grouped.get('educacion').label).toBe(POI_CATEGORIES.educacion.label)
    expect(grouped.get('verde').items).toHaveLength(1)
    expect(grouped.has('salud')).toBe(false) // no salud pois → omitted
  })

  it('groupPoiByCategory returns an empty map for no pois', () => {
    expect(groupPoiByCategory([]).size).toBe(0)
    expect(groupPoiByCategory(undefined).size).toBe(0)
  })
})
